"""get_cico_report_data() must include every prior month (3월 onward) in a
student's trend, not just the last 2 months, so the client's fixed 3~12월
X축 has data for the whole semester instead of a rolling 3-month window.

Regression: the previous-months lookup required an exact "학생코드" header
match, but the sheet the app actually generates (create_monthly_cico_sheet)
only ever has the combined "학생명(코드)" column. The exact match never hit,
so prev_rates stayed empty and "월별 수행률 추이"/"월별 달성 비교" always
showed a single data point for the current month, for every student.
"""
import os
import sys
import unittest
from unittest import mock

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

HEADERS = [
    "번호", "학급", "학생명(코드)", "Tier2", "Tier3", "목표행동", "목표행동 유형",
    "척도", "입력 기준(베이스라인)", "목표 달성 기준",
    "07-01", "07-02",
    "수행/발생률", "목표 달성 여부", "교사메모", "입력자", "팀 협의 내용", "차월 대상여부",
]


def _row(rate, day_vals=("O", "O")):
    return [
        1, "초1-1", "테스트(9001)", "O", "X", "수업참여", "증가 목표행동",
        "O/X(발생)", "", "80% 이상",
        day_vals[0], day_vals[1],
        rate, "O", "", "", "", "",
    ]


SHEETS_BY_MONTH = {
    3: [HEADERS, _row("30%")],
    4: [HEADERS, _row("40%")],
    5: [HEADERS, _row("50%")],
    6: [HEADERS, _row("60%")],
    7: [HEADERS, _row("70%")],
}


class CicoTrendHistoryTests(unittest.TestCase):
    def test_report_includes_every_month_since_march(self):
        from app.services import sheets

        def fake_raw_values(month):
            return SHEETS_BY_MONTH.get(month, [])

        with mock.patch.object(sheets, "get_cached", return_value=None), \
             mock.patch.object(sheets, "get_cico_raw_sheet_values", side_effect=fake_raw_values), \
             mock.patch.object(sheets, "fetch_student_status", return_value=[]), \
             mock.patch.object(sheets, "get_beable_code_mapping", return_value={}), \
             mock.patch.object(sheets, "set_cached", return_value=None):
            result = sheets.get_cico_report_data(7)

        self.assertNotIn("error", result)
        students = result["students"]
        self.assertEqual(len(students), 1)
        trend_months = [t["month"] for t in students[0]["trend"]]
        self.assertEqual(trend_months, ["3월", "4월", "5월", "6월", "7월"])


if __name__ == "__main__":
    unittest.main()


def test_missing_month_and_other_goal_do_not_trigger_downgrade():
    from app.services import sheets
    other = _row("100%")
    other[5] = "다른 목표"
    data = {3: [HEADERS, _row("100%")], 5: [HEADERS, other], 6: [HEADERS, _row("100%")], 7: [HEADERS, _row("100%")], 8: [HEADERS, _row("100%")]}
    def report(month):
        with mock.patch.object(sheets, "get_cached", return_value=None), \
             mock.patch.object(sheets, "get_cico_raw_sheet_values", side_effect=lambda m: data.get(m, [])), \
             mock.patch.object(sheets, "fetch_student_status", return_value=[]), \
             mock.patch.object(sheets, "get_beable_code_mapping", return_value={}), \
             mock.patch.object(sheets, "set_cached", return_value=None):
            return sheets.get_cico_report_data(month)["students"][0]
    june = report(6)
    assert [x["month"] for x in june["trend"]] == ["3월", "6월"]
    assert june["decision"] != "Tier1 하향 권장"
    assert report(7)["decision"] == "Tier1 하향 권장"


def test_duplicate_goal_history_does_not_trigger_downgrade():
    from app.services import sheets
    data = {6: [HEADERS, _row("100%"), _row("100%")], 7: [HEADERS, _row("100%")]}
    with mock.patch.object(sheets, "get_cached", return_value=None), \
         mock.patch.object(sheets, "get_cico_raw_sheet_values", side_effect=lambda m: data.get(m, [])), \
         mock.patch.object(sheets, "fetch_student_status", return_value=[]), \
         mock.patch.object(sheets, "get_beable_code_mapping", return_value={}), \
         mock.patch.object(sheets, "set_cached", return_value=None):
        result = sheets.get_cico_report_data(7)["students"][0]
    assert result["decision"] != "Tier1 하향 권장"


def test_empty_daily_records_do_not_reuse_stale_rate():
    from app.services import sheets
    data = {6: [HEADERS, _row("100%", ("", ""))], 7: [HEADERS, _row("100%", ("", "")), [""]]}
    with mock.patch.object(sheets, "get_cached", return_value=None), \
         mock.patch.object(sheets, "get_cico_raw_sheet_values", side_effect=lambda m: data.get(m, [])), \
         mock.patch.object(sheets, "fetch_student_status", return_value=[]), \
         mock.patch.object(sheets, "get_beable_code_mapping", return_value={}), \
         mock.patch.object(sheets, "set_cached", return_value=None):
        result = sheets.get_cico_report_data(7)["students"][0]
    assert result["rate_num"] is None
    assert result["decision"] == "기록 부족: 판단 보류"
    assert all(t["rate"] == "-" for t in result["trend"])


def test_multi_goal_student_rows_are_distinguishable():
    """목표가 둘인 학생은 같은 코드로 두 행이 나온다. 화면은 row로 고르므로 행 번호가 실려야 한다."""
    from app.services import sheets
    second = _row("50%")
    second[5] = "타인 공격"
    data = {7: [HEADERS, _row("70%"), second]}
    with mock.patch.object(sheets, "get_cached", return_value=None), \
         mock.patch.object(sheets, "get_cico_raw_sheet_values", side_effect=lambda m: data.get(m, [])), \
         mock.patch.object(sheets, "fetch_student_status", return_value=[]), \
         mock.patch.object(sheets, "get_beable_code_mapping", return_value={}), \
         mock.patch.object(sheets, "set_cached", return_value=None):
        students = sheets.get_cico_report_data(7)["students"]
    assert [(s["row"], s["code"], s["target_behavior"]) for s in students] == [(2, "9001", "수업참여"), (3, "9001", "타인 공격")]
