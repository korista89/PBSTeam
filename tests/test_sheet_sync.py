import os
import sys
import unittest
from datetime import date
from unittest import mock


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


class SheetSyncTests(unittest.TestCase):
    def test_local_credentials_path_is_workdir_independent(self):
        from app.core.config import settings

        self.assertTrue(os.path.isabs(settings.GOOGLE_CREDENTIALS_FILE))
        self.assertEqual(
            os.path.normcase(settings.GOOGLE_CREDENTIALS_FILE),
            os.path.normcase(os.path.join(BACKEND_DIR, "service_account.json")),
        )

    def test_workspace_includes_august_and_later_active_months(self):
        from app.api.endpoints.workspace import _active_cico_months

        self.assertEqual(_active_cico_months(date(2026, 8, 26)), [3, 4, 5, 6, 7, 8])
        self.assertEqual(_active_cico_months(date(2026, 2, 26)), [])

    def test_fresh_read_header_clears_instance_cache_and_disables_http_cache(self):
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        with mock.patch("app.services.sheets.clear_cache") as clear_cache, mock.patch(
            "app.services.picture_words.clear_pw_cache"
        ) as clear_pw_cache:
            response = client.get(
                "/api/v1/auth/me",
                headers={"X-PBST-Sheet-Refresh": "1"},
            )

        self.assertEqual(response.status_code, 401)
        clear_cache.assert_called_once_with()
        clear_pw_cache.assert_called_once_with()
        self.assertIn("no-store", response.headers.get("cache-control", ""))

    def test_daily_value_validation_matches_configured_scale(self):
        from app.api.endpoints.cico import _is_valid_daily_value

        self.assertTrue(_is_valid_daily_value("O/X(발생)", "O"))
        self.assertFalse(_is_valid_daily_value("O/X(발생)", "2"))
        self.assertTrue(_is_valid_daily_value("0점/1점/2점", "2점"))
        self.assertFalse(_is_valid_daily_value("0점/1점/2점", "3점"))
        self.assertTrue(_is_valid_daily_value("0~7교시", "7"))
        self.assertFalse(_is_valid_daily_value("0~7교시", "8"))

    def test_numeric_cico_write_uses_shared_rate_calculator(self):
        from app.services.sheets import update_monthly_cico_cells

        headers = [
            "번호", "학급", "학생명(코드)", "Tier2", "Tier3", "목표행동",
            "목표행동 유형", "척도", "입력 기준(베이스라인)", "목표 달성 기준",
            "08-18", "08-19", "수행/발생률", "목표 달성 여부",
        ]
        values = [
            headers,
            [1, "초1-1", "테스트(2111)", "O", "X", "수업참여", "증가 목표행동",
             "0점/1점/2점", "", "80% 이상", "2점", "", "100%", "O"],
        ]
        worksheet = mock.MagicMock()
        worksheet.row_values.return_value = headers
        sheet = mock.MagicMock()
        client = mock.MagicMock()
        client.open_by_url.return_value = sheet

        with mock.patch("app.services.sheets.get_sheets_client", return_value=client), mock.patch(
            "app.services.sheets.get_worksheet_fuzzy", return_value=worksheet
        ), mock.patch("app.services.sheets.safe_get_all_values", return_value=values):
            result = update_monthly_cico_cells(8, [{"row": 2, "col": 12, "value": "1점"}])

        self.assertNotIn("error", result)
        written = {item["range"]: item["values"][0][0] for item in worksheet.batch_update.call_args.args[0]}
        self.assertEqual(written["L2"], "1점")
        self.assertEqual(written["M2"], "75%")
        self.assertEqual(written["N2"], "X")

    def test_tier2_toggle_matches_name_code_combined_cell(self):
        from app.services.sheets import toggle_tier2_status

        worksheet = mock.MagicMock()
        sheet = mock.MagicMock()
        sheet.worksheet.return_value = worksheet
        client = mock.MagicMock()
        client.open_by_url.return_value = sheet
        values = [
            ["번호", "학급", "학생명(코드)", "Tier2"],
            [1, "초1-1", "테스트(2111)", "O"],
        ]

        with mock.patch("app.services.sheets.get_sheets_client", return_value=client), mock.patch(
            "app.services.sheets.safe_get_all_values", return_value=values
        ):
            result = toggle_tier2_status(8, "2111", "X")

        self.assertNotIn("error", result)
        worksheet.update_cell.assert_called_once_with(2, 4, "X")


if __name__ == "__main__":
    unittest.main()
