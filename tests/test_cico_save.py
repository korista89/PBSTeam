"""CICO cell saves validate per cell.

Regression: a teacher entered a value, the row's 척도 was then changed, and the
stale cell failed validation. The endpoint rejected the whole batch (400) and the
client re-sent that cell with every later edit, so every save on the screen failed.
"""
import os
import sys
import unittest
from unittest import mock

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi import HTTPException  # noqa: E402

MONTHLY = {
    "month": 9,
    "day_columns": [{"index": 20, "label": "9-1"}, {"index": 21, "label": "9-2"}],
    "students": [
        {"row": 5, "학생코드": "S1", "척도": "0~5"},
        {"row": 6, "학생코드": "S2", "척도": "O/X(발생)"},
    ],
}
ADMIN = {"role": "admin", "id": "admin"}


class CicoSaveTests(unittest.TestCase):
    def _save(self, updates, user=ADMIN):
        from app.api.endpoints import cico
        req = cico.BatchUpdateRequest(month=9, updates=[cico.CellUpdate(**u) for u in updates])
        with mock.patch.object(cico, "get_monthly_cico_data", return_value=MONTHLY), \
             mock.patch.object(cico, "update_monthly_cico_cells", return_value={"updated": 1}) as write:
            try:
                return cico.update_cico_cells(req, current_user=user), write
            except HTTPException as exc:
                return exc, write

    def test_valid_cells_are_saved_and_stale_cell_is_reported(self):
        result, write = self._save([
            {"row": 5, "col": 21, "value": "3"},   # valid for 0~5
            {"row": 5, "col": 22, "value": "O"},   # entered under the old O/X scale
        ])
        write.assert_called_once_with(9, [{"row": 5, "col": 21, "value": "3"}])
        self.assertIsInstance(result, HTTPException)
        self.assertEqual(result.status_code, 422)
        self.assertEqual([c["value"] for c in result.detail["rejected"]], ["O"])
        self.assertEqual(result.detail["saved"], [{"row": 5, "col": 21, "value": "3"}])
        self.assertIn("척도", result.detail["rejected"][0]["reason"])

    def test_all_valid_batch_is_a_plain_success(self):
        result, write = self._save([{"row": 6, "col": 21, "value": "O"}])
        self.assertEqual(result, {"updated": 1})
        write.assert_called_once()

    def test_unknown_row_and_non_daily_column_are_rejected_without_write(self):
        result, write = self._save([
            {"row": 99, "col": 21, "value": "1"},
            {"row": 5, "col": 3, "value": "1"},
        ])
        write.assert_not_called()
        self.assertEqual(result.status_code, 422)
        self.assertEqual(len(result.detail["rejected"]), 2)

    def test_teacher_outside_scope_is_still_forbidden_for_whole_batch(self):
        from app.api.endpoints import cico
        teacher = {"role": "teacher", "class_id": "초5-2", "id": "초5-2"}
        with mock.patch.object(cico, "check_student_scope",
                               side_effect=HTTPException(status_code=403, detail="Forbidden")):
            result, write = self._save([{"row": 5, "col": 21, "value": "3"}], user=teacher)
        write.assert_not_called()
        self.assertEqual(result.status_code, 403)


if __name__ == "__main__":
    unittest.main()
