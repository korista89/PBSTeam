"""Session auth must not turn a Users-sheet outage into a 401.

Regression for the CICO tab 401s seen in production: a Sheets 429 on the Users
read made get_user_by_id() return None, and deps answered "account not found".
"""
import os
import sys
import unittest
from unittest import mock

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault("AUTH_SECRET", "test-secret-for-auth-user-store")

USERS = [{"ID": "초1-1", "Password": "x", "Role": "class_teacher", "ClassID": "초1-1",
          "ClassName": "초등 1학년 1반", "Name": "담임", "Active": "true"}]


class _QuotaExceeded(Exception):
    pass


class _FailingWorksheet:
    def get_all_records(self):
        raise _QuotaExceeded("APIError: [429]: Quota exceeded for quota metric 'Read requests'")

    def get_all_values(self):
        raise _QuotaExceeded("APIError: [429]: Quota exceeded for quota metric 'Read requests'")


class _OkWorksheet:
    def get_all_records(self):
        return [dict(u) for u in USERS]


class AuthUserStoreTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from app.core.config import settings
        from app.core.security import create_access_token
        from app.services import sheets
        from app.main import app

        settings.AUTH_SECRET = os.environ["AUTH_SECRET"]
        self.sheets = sheets
        self.client = TestClient(app)
        self.cookie_name = settings.AUTH_COOKIE_NAME
        self.token = create_access_token({"sub": "초1-1", "role": "teacher", "class_id": "초1-1"})
        self._reset_user_store()

    def tearDown(self):
        self._reset_user_store()

    def _reset_user_store(self):
        self.sheets._cache["users"] = {"data": [], "timestamp": 0.0}
        self.sheets._users_last_good = None

    def _me(self, **kw):
        self.client.cookies.set(self.cookie_name, self.token)
        return self.client.get("/api/v1/auth/me", **kw)

    def test_quota_error_with_known_users_keeps_session(self):
        with mock.patch.object(self.sheets, "get_users_worksheet", return_value=_OkWorksheet()):
            self.assertEqual(self._me().status_code, 200)
        # Live-refresh / TTL expiry wipes the cache, then Sheets answers 429.
        self.sheets._cache["users"] = {"data": [], "timestamp": 0.0}
        with mock.patch.object(self.sheets, "get_users_worksheet", return_value=_FailingWorksheet()):
            res = self._me()
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["name"], "담임")

    def test_quota_error_on_cold_instance_is_503_not_401(self):
        with mock.patch.object(self.sheets, "get_users_worksheet", return_value=_FailingWorksheet()):
            res = self._me()
        self.assertEqual(res.status_code, 503, res.text)
        self.assertEqual(res.headers.get("retry-after"), "5")

    def test_cico_endpoint_same_path(self):
        with mock.patch.object(self.sheets, "get_users_worksheet", return_value=_FailingWorksheet()):
            self.client.cookies.set(self.cookie_name, self.token)
            res = self.client.get("/api/v1/cico/business-days?month=9&year=2026")
        self.assertEqual(res.status_code, 503, res.text)

    def test_unknown_user_is_still_401(self):
        from app.core.security import create_access_token
        self.token = create_access_token({"sub": "no-such-user", "role": "teacher"})
        with mock.patch.object(self.sheets, "get_users_worksheet", return_value=_OkWorksheet()):
            self.assertEqual(self._me().status_code, 401)

    def test_missing_cookie_is_401(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 401)

    def test_live_refresh_keeps_users_cache(self):
        with mock.patch.object(self.sheets, "get_users_worksheet", return_value=_OkWorksheet()) as ws:
            self.assertEqual(self._me().status_code, 200)
            self.assertEqual(self._me(headers={"X-PBST-Sheet-Refresh": "1"}).status_code, 200)
            self.assertEqual(ws.call_count, 1, "live refresh must not force a Users re-read")

    def test_login_during_outage_is_503_not_invalid_credentials(self):
        with mock.patch.object(self.sheets, "get_users_worksheet", return_value=_FailingWorksheet()):
            res = self.client.post("/api/v1/auth/login", json={"user_id": "초1-1", "password": "x"},
                                   headers={"Origin": "http://localhost:3000"})
        self.assertEqual(res.status_code, 503, res.text)


if __name__ == "__main__":
    unittest.main()
