"""CICO AI 집계가 점수 척도(0점/1점/2점) 기록을 기록일로 세는지 확인."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.services.ai_insight import _build_cico_summary_payload  # noqa: E402


def _student(values, scale, behavior_type="증가 목표행동", rate=None):
    return {
        "code": "S01", "scale": scale, "behavior_type": behavior_type, "goal_criteria": "50% 이상",
        "rate": rate, "daily_data": [{"date": f"10-{i + 1:02d}", "value": v} for i, v in enumerate(values)],
    }


def test_score_scale_counts_as_recorded():
    m = _build_cico_summary_payload([_student(["1점"] * 20, "0점/1점/2점", rate="50%")], selected_month=10)["students"][0]
    assert m["metrics"]["recorded_days"] == 20
    assert m["metrics"]["overall_rate_pct"] == 50.0
    assert m["metrics"]["consec_success"] == 20
    assert "보류" not in m["decision"]["rule_result"]


def test_ox_unchanged_and_decrease_inverted():
    inc = _build_cico_summary_payload([_student(["O", "X", "", "O"], "O/X(발생)")])["students"][0]["metrics"]
    assert (inc["recorded_days"], inc["overall_rate_pct"]) == (3, 66.7)
    dec = _build_cico_summary_payload([_student(["X", "X", "O"], "O/X(발생)", "감소 목표행동")])["students"][0]["metrics"]
    assert (dec["overall_rate_pct"], dec["consec_fail"]) == (66.7, 1)


def test_ai_rule_follows_screen_decision():
    s = _student(["1점"] * 20, "0점/1점/2점", rate="50%")
    s["decision"] = "Tier1 하향 권장"
    assert _build_cico_summary_payload([s])["students"][0]["decision"]["rule_result"].startswith("Tier1 하향 권장")
    s["decision"] = "CICO 유지 (양호)"
    assert _build_cico_summary_payload([s])["students"][0]["decision"]["rule_result"].startswith("CICO 유지 (양호")
