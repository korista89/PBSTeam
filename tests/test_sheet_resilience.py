"""Quota-aware Sheets layer (backend/app/adapters/sheets/resilience.py).

Regression for the production pattern where a Sheets 429 made endpoints return
200 with empty data and a single request re-hit TierStatus ~23 times.
"""
import os
import sys
import time
import unittest
from unittest import mock

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault("AUTH_SECRET", "test-secret-for-sheet-resilience")

import gspread  # noqa: E402


def _api_error(code: int) -> gspread.exceptions.APIError:
    resp = mock.Mock()
    resp.json.return_value = {"error": {"code": code, "message": "Quota exceeded", "status": "RESOURCE_EXHAUSTED"}}
    resp.status_code = code
    return gspread.exceptions.APIError(resp)


class FakeWorksheet:
    def __init__(self, title, rows):
        self.title = title
        self.id = hash(title) & 0xFFFF
        self.spreadsheet_id = "sheet-id"
        self.rows = rows
        self.fail = False
        self.calls = 0

    def get_all_records(self):
        self.calls += 1
        if self.fail:
            raise _api_error(429)
        return [dict(r) for r in self.rows]


class FakeSpreadsheet:
    def __init__(self, sheets):
        self.id = "sheet-id"
        self._sheets = sheets
        self.lookups = 0

    def worksheet(self, title):
        self.lookups += 1
        if title not in self._sheets:
            raise gspread.WorksheetNotFound(title)
        return self._sheets[title]


class FakeClient:
    def __init__(self, ss):
        self.ss = ss
        self.opens = 0

    def open_by_key(self, key):
        self.opens += 1
        return self.ss


class ResilienceLayerTests(unittest.TestCase):
    def setUp(self):
        from app.adapters.sheets import resilience
        self.r = resilience
        resilience.reset_for_tests()
        self.ws = FakeWorksheet("TierStatus", [{"학생코드": "S1", "학급": "초1-1"}])
        self.ss = FakeSpreadsheet({"TierStatus": self.ws})
        self.raw = FakeClient(self.ss)
        self.client = resilience.ResilientClient(self.raw)
        self.sleep = mock.patch.object(resilience.time, "sleep").start()
        self.addCleanup(mock.patch.stopall)

    def _read(self):
        return self.client.open_by_url("https://docs.google.com/spreadsheets/d/sheet-id/edit").worksheet("TierStatus").get_all_records()

    def test_spreadsheet_and_worksheet_lookup_are_reused(self):
        for _ in range(5):
            self._read()
        self.assertEqual(self.raw.opens, 1)
        self.assertEqual(self.ss.lookups, 1)
        self.assertEqual(self.ws.calls, 5)

    def test_get_request_gets_last_good_copy_and_is_marked_stale(self):
        self._read()
        self.ws.fail = True
        token = self.r.begin_request(allow_stale=True)
        rows = self._read()
        stale = self.r.end_request(token)
        self.assertEqual(rows, [{"학생코드": "S1", "학급": "초1-1"}])
        self.assertEqual(stale, {"TierStatus"})

    def test_mutation_request_never_gets_stale_data(self):
        self._read()
        self.ws.fail = True
        token = self.r.begin_request(allow_stale=False)
        with self.assertRaises(self.r.SheetUnavailable):
            self._read()
        self.r.end_request(token)

    def test_failure_window_stops_retry_storm(self):
        self.ws.fail = True
        token = self.r.begin_request(allow_stale=True)
        for _ in range(23):  # e.g. get_student_class_code() once per student
            with self.assertRaises(self.r.SheetUnavailable):
                self._read()
        self.r.end_request(token)
        self.assertEqual(self.ws.calls, 2, "one attempt + one retry, then fail fast")

    def test_non_transient_errors_pass_through(self):
        with self.assertRaises(gspread.WorksheetNotFound):
            self.client.open_by_key("sheet-id").worksheet("없는시트")


class EndpointBehaviourTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from app.adapters.sheets import resilience
        from app.core.config import settings
        from app.core.security import create_access_token
        from app.main import app
        from app.services import sheets

        resilience.reset_for_tests()
        settings.AUTH_SECRET = os.environ["AUTH_SECRET"]
        sheets._cache["users"] = {"data": [], "timestamp": 0.0}
        sheets._users_last_good = [{"ID": "admin", "Role": "admin", "Active": "true", "Name": "관리자"}]
        self.client = TestClient(app)
        self.client.cookies.set(settings.AUTH_COOKIE_NAME, create_access_token({"sub": "admin", "role": "admin"}))
        self.addCleanup(setattr, sheets, "_users_last_good", None)

    def test_sheet_unavailable_maps_to_503_with_retry_after(self):
        from app.adapters.sheets.resilience import SheetUnavailable
        with mock.patch("app.api.endpoints.cico.get_holidays_from_config", side_effect=SheetUnavailable("날짜 관리")):
            res = self.client.get("/api/v1/cico/business-days?month=9&year=2026")
        self.assertEqual(res.status_code, 503, res.text)
        self.assertEqual(res.headers.get("retry-after"), "10")

    def test_stale_marks_become_response_header(self):
        from app.adapters.sheets import resilience

        def holidays():
            resilience._request_state.get().stale_sources.add("날짜 관리")
            return []
        with mock.patch("app.api.endpoints.cico.get_holidays_from_config", side_effect=holidays):
            res = self.client.get("/api/v1/cico/business-days?month=9&year=2026")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.headers.get("x-pbst-data-stale"), "%EB%82%A0%EC%A7%9C%20%EA%B4%80%EB%A6%AC")

    def test_overview_combines_three_payloads(self):
        monthly = {"month": 9, "day_columns": [], "students": []}
        report = {"month": "9", "students": [], "summary": {}}
        with mock.patch("app.api.endpoints.cico.get_monthly_cico_data", return_value=monthly), \
             mock.patch("app.api.endpoints.cico.get_cico_report_data", return_value=report), \
             mock.patch("app.api.endpoints.cico.get_holidays_from_config", return_value=[]):
            res = self.client.get("/api/v1/cico/overview?month=9&year=2026")
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(set(body), {"monthly", "business_days", "report"})
        self.assertTrue(body["business_days"]["business_days"])

    def test_poll_refresh_only_clears_old_entries(self):
        from app.adapters.sheets import client as adapter_client
        now = time.time()
        adapter_client._cache["sheet:fresh"] = {"data": [1], "timestamp": now}
        adapter_client._cache["sheet:old"] = {"data": [1], "timestamp": now - 120}
        self.client.get("/api/v1/auth/me", headers={"X-PBST-Sheet-Refresh": "poll"})
        self.assertIn("sheet:fresh", adapter_client._cache)
        self.assertNotIn("sheet:old", adapter_client._cache)


class TeacherScopingDoesNotMutateCacheTests(unittest.TestCase):
    def test_monthly_scoping_leaves_cached_object_intact(self):
        from app.api.endpoints import cico
        cached = {"month": 9, "students": [{"학생코드": "A"}, {"학생코드": "B"}]}
        teacher = {"role": "teacher", "class_id": "초1-1", "id": "초1-1"}
        with mock.patch.object(cico, "get_monthly_cico_data", return_value=cached), \
             mock.patch.object(cico, "get_student_class_code", side_effect=lambda c: "초1-1" if c == "A" else "초2-1"):
            scoped = cico.get_cico_monthly(month=9, current_user=teacher)
        self.assertEqual([s["학생코드"] for s in scoped["students"]], ["A"])
        self.assertEqual(len(cached["students"]), 2)


if __name__ == "__main__":
    unittest.main()
