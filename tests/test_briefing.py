"""관리자 브리핑 규칙: 직전 수업일, 기간 비교, 증가·감소 학생, 10줄 요약."""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.services.briefing import build_briefing, prev_school_days, semester_range

TODAY = date(2026, 10, 26)  # 월요일
STUDENTS = [
    {"학생코드": "1011", "학생이름": "김O준", "학급": "초등 1학년 1반", "Tier3": "X"},
    {"학생코드": "2022", "학생이름": "이O", "학급": "초등 2학년 2반", "Tier3": "O"},
]


def log(d, code, crisis=False, place="교실", slot="2구간: 1교시", status="Approved"):
    return {"행동발생날짜": d, "학생코드": code, "장소": place, "시간대": slot, "강도": "3(위기행동)",
            "행동유형": "신체적공격행동: 때리기", "물리적제지여부": "O(제지)" if crisis else "X(보고서 작성 불필요)",
            "Status": status, "crisis_details": {}}


def test_prev_school_days_skip_weekend_and_holiday():
    assert prev_school_days(TODAY, ["2026-10-23"]) == [date(2026, 10, 22), date(2026, 10, 21)]
    assert prev_school_days(TODAY, []) == [date(2026, 10, 23), date(2026, 10, 22)]


def test_semester():
    assert semester_range(date(2026, 4, 1))[0] == "1학기"
    assert semester_range(date(2027, 1, 10))[1:] == (date(2026, 8, 16), date(2027, 2, 28))


def test_briefing_trends_and_lines():
    recs = [log(f"2026-10-{d:02d}", "1011", crisis=(d == 23)) for d in (16, 19, 20, 21, 22, 23)]  # 증가 0→6
    recs += [log(f"2026-10-{d:02d}", "2022") for d in (1, 2, 5, 6)] + [log("2026-10-20", "2022")]  # 감소 4→1
    recs.append(log("2026-10-23", "2022", crisis=True, status="Pending"))
    b = build_briefing(recs, STUDENTS, [], TODAY)
    assert len(b["ten_lines"]) == 10
    assert b["days"]["yesterday"]["date"] == "2026-10-23" and b["days"]["yesterday"]["count"] == 2
    assert b["increasing"][0]["code"] == "1011" and b["increasing"][0]["strong"] is True
    assert "Tier3 상향" in b["increasing"][0]["actions"][0]
    assert b["decreasing"][0]["code"] == "2022" and b["decreasing"][0]["strong"] is True
    assert b["todo"][0]["href"] == "/admin/approvals"
    assert b["days"]["yesterday"]["items"][0]["missing_report"] is True
    ok = log("2026-10-23", "1011", crisis=True)
    ok["form_report_details"] = {"제지_법적의무_확인": "당일 학교장 보고, 당일 학부모 알림"}
    assert build_briefing([ok], STUDENTS, [], TODAY)["days"]["yesterday"]["items"][0]["missing_report"] is False
    assert "김O준(1011)" in b["ten_lines"][0]


def test_trend_lists_capped_at_three():
    students = [{"학생코드": str(1000 + i), "학생이름": f"학O{i}", "학급": "", "Tier3": "X"} for i in range(5)]
    recs = [log(f"2026-10-{d:02d}", str(1000 + i)) for i in range(5) for d in range(19, 19 + 3 + i)]
    recs += [log(f"2026-10-0{d}", str(2000 + i)) for i in range(5) for d in range(1, 5)]
    b = build_briefing(recs, students, [], TODAY)
    assert len(b["increasing"]) == 3 and b["increasing"][0]["code"] == "1004"
    assert len(b["decreasing"]) == 3


def test_trend_fills_up_to_three_with_weaker_changes():
    students = [{"학생코드": c, "학생이름": f"학O{c}", "학급": "", "Tier3": "X"} for c in ("1", "2", "3")]
    recs = [log(f"2026-10-{d:02d}", "1") for d in (19, 20, 21, 22)]          # 0→4 기준 충족
    recs += [log("2026-10-20", "2"), log("2026-10-21", "2")]                 # 0→2 기준 미달(관찰)
    recs += [log("2026-10-05", "3"), log("2026-10-22", "3")] + [log("2026-10-06", "3")]  # 2→1 감소(관찰)
    b = build_briefing(recs, students, [], TODAY)
    assert [(s["code"], s["strong"]) for s in b["increasing"]] == [("1", True), ("2", False)]
    assert [(s["code"], s["strong"]) for s in b["decreasing"]] == [("3", False)]


def test_pending_counts_reports_without_principal_check():
    a = log("2026-10-23", "1011", crisis=True); a["Log_ID"] = "a"
    b = log("2026-10-22", "1011", crisis=True); b["Log_ID"] = "b"
    out = build_briefing([a, b], STUDENTS, [], TODAY, signoffs={"b": {"담당자확인": {}, "교감확인": {}, "학교장확인": {}}, "a": {"학교장확인": {}}})
    assert "결재 대기 1건" in out["ten_lines"][8]
