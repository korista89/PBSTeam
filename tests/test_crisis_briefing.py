"""위기행동관리 브리핑 계산 검사(가짜 학생)."""
import sys, pathlib
from datetime import date
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "backend"))
from app.services.crisis_briefing import build, action_kind


def rec(code, d, inten=3, act="X - 보고서 작성 불필요", name=""):
    return {"학생코드": code, "학생명": name, "행동발생날짜": d, "강도": f"{inten}(위기행동)", "행동유형": "신체적공격행동: 밀치기",
            "기능": "과제 회피(사회적 부적강화)", "시간대": "2구간: 1교시", "장소": "교실", "발생횟수": "2회",
            "제지유형_원문": act, "Status": "Approved", "선행사건": "과제 제시, 특이사항 없음"}


def test_build():
    roster = {"S01": {"name": "학생A", "class": "초등 1학년 1반"}, "S02": {"name": "학생B", "class": "초등 1학년 1반"},
              "S03": {"name": "학생C", "class": "중학교 1학년 1반"}}
    recs = [rec("S01", "2026-11-10"), rec("S01", "2026-11-12", 4, "방어 및 보호를 위한 제지"),
            rec("", "2026-11-13", name="학생A"),            # 코드 없이 이름으로 연결
            rec("S01", "2026-11-02"),                        # 앞 기간
            rec("S03", "2026-11-11", 5), rec("S03", "2026-11-20")]  # 대상 밖, 강도 5 → 검토 후보
    out = build(recs, roster, {"S01": "Tier3", "S02": "Tier3+"}, date(2026, 11, 9), date(2026, 11, 22))
    s = out["summary"]
    assert (s["targets"], s["tier3plus"], s["incidents"], s["occurrences"], s["prev_incidents"]) == (2, 1, 3, 6, 1)
    assert s["restraint"] == 1 and s["high"] == 1
    a = out["students"][0]
    assert a["code"] == "S01" and a["signal"] == "증가" and a["weekly"] == [3, 0]
    assert out["students"][1]["signal"] == "무발생"
    assert [w["code"] for w in out["watch"]] == ["S03"]
    sc = out["school"]
    assert (sc["incidents"], sc["students"], sc["prev_incidents"], sc["target_share"]) == (5, 2, 1, 60)
    assert out["weekly"][0]["school"] == 4 and out["weekly"][0]["count"] == 3
    assert [x["date"] for x in a["records"]] == ["2026-11-13", "2026-11-12", "2026-11-10"]
    assert out["by_type"] == [{"name": "신체적공격행동", "value": 5}]
    assert [x["report"] for x in a["records"]] == [False, False, False]
    assert len(out["serious"]) == 1 and out["by_antecedent"] == [{"name": "과제 제시", "value": 5}]


def test_is_report():
    from app.services.crisis_briefing import is_report
    assert is_report({"물리적제지여부": "O(제지)"}) and not is_report({"물리적제지여부": "X(보고서 작성 불필요)"})


def test_action_kind():
    assert action_kind("X(보고서 작성 불필요)") == ""
    assert action_kind("O(보고서 작성 필요)") == "보고"
    assert action_kind("개별학생교육지원") == "교육지원"
    assert action_kind("본인/타인상해만 발생") == "상해"
