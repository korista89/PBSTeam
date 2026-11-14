"""연간 성과(CICO·Tier3 행선지), SST 운영 기간 판정, Tier1 프로그램 검증·범위·판정."""
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))


def _st(cico=(), sst=(), t3=None):
    return {"cico": set(cico), "sst": {c: ["P"] for c in sst}, "t3": dict(t3 or {}), "ready": {"cico": True, "sst": True, "t3": True}}


def test_flows_destination_after_leaving():
    from app.services import tier_annual as ta
    months = [3, 4, 5]
    states = {3: _st(cico=["A", "B", "C"]), 4: _st(cico=["A"], t3={"B": "Tier3"}, sst=["C"]), 5: _st(cico=["A"])}
    in_months, outcome = ta._flows(states, months, "cico")
    assert in_months == {"A": [3, 4, 5], "B": [3], "C": [3]}
    assert outcome == {"A": "지원 중", "B": "Tier3 상향", "C": "SST만 지속"}
    t3_states = {3: _st(t3={"X": "Tier3", "Y": "Tier3"}), 4: _st(cico=["X"], t3={"Y": "Tier3"}), 5: _st()}
    _, out3 = ta._flows(t3_states, months, "t3")
    assert out3 == {"X": "CICO 하향", "Y": "Tier1 복귀"}


def test_sst_summary_verdicts():
    from app.services import sst
    phases = [(8, "운영 전"), (9, "운영 중"), (10, "운영 중")]
    crisis = {"A": {8: 10, 9: 4, 10: 4}, "B": {8: 0, 9: 2, 10: 0}}
    cico = {"A": {8: 50.0, 9: 70.0, 10: None}, "B": {8: None, 9: None, 10: None}}
    s = sst._summary(phases, ["A", "B"], crisis, cico)
    assert s["crisis_pre"] == 5.0 and s["crisis_during"] == 2.5 and s["crisis_change_pct"] == -50.0
    assert (s["improved"], s["worse"], s["verdict"], s["cico_change"]) == (1, 1, "효과 있음", 20.0)
    assert sst._summary([(3, "운영 전")], ["A"], {"A": {3: 1}}, {"A": {3: None}})["verdict"] == "운영 전"


def test_tier1_validate_and_scope():
    from app.services import tier1
    ok = {"name": "기대행동 교수", "start": 3, "end": 6, "scope": "전교", "scope_values": [], "goal_pct": 20}
    assert tier1.validate(ok) is None
    assert "과정" in tier1.validate({**ok, "scope": "과정"})
    assert "100" in tier1.validate({**ok, "goal_pct": 150})
    assert "앞" in tier1.validate({**ok, "start": 6, "end": 3})
    p = {"scope": "과정", "scope_values": ["초등"]}
    assert tier1._in_scope(p, "2211", "초등 2학년 1반") and not tier1._in_scope(p, "3124", "중학교 1학년 2반")
    assert tier1._in_scope({"scope": "학급", "scope_values": ["중학교 1학년 2반"]}, "3124", "중학교 1학년 2반")


def test_tier1_monitor_goal_verdict():
    from app.services import tier1
    prog = [{"id": 2, "year": 2026, "name": "P", "type": "", "start": 5, "end": 5, "scope": "전교", "scope_values": [],
             "behaviors": ["공격"], "places": [], "goal_pct": 30.0, "content": "", "staff": "", "memo": "", "deleted": False}]
    roster = {f"2{i:03d}": {"학급": "초등"} for i in range(10)}
    logs = [{"행동발생날짜": "2026-04-02", "학생코드": "2000", "행동유형": "공격"}] * 10 + \
           [{"행동발생날짜": "2026-05-02", "학생코드": "2001", "행동유형": "공격"}] * 5 + \
           [{"행동발생날짜": "2026-05-03", "학생코드": "2001", "행동유형": "방해"}] * 9  # 표적 아님
    now = mock.Mock(month=6)
    with mock.patch.object(tier1, "_rows", return_value=prog), mock.patch.object(tier1, "school_year", return_value=2026), \
         mock.patch.object(tier1, "_enrolled", return_value=roster), mock.patch.object(tier1, "now_kst", return_value=now), \
         mock.patch.object(tier1, "_tier1_only_pct", return_value=90.0), \
         mock.patch("app.services.sheets.fetch_all_records", return_value=logs):
        r = tier1.monitor_program(2)
    assert [(m["month"], m["count"]) for m in r["months"]] == [(4, 10), (5, 5), (6, 0)]
    assert r["summary"]["change_pct"] == -50.0 and r["summary"]["verdict"] == "목표 달성"


def test_tier1_fidelity_scoring_and_validation():
    from app.services import tier1
    n = len(tier1.plan()["fidelity_items"])
    assert "모두" in tier1.save_fidelity(2, "A반", [2] * (n - 1), "", "t")["error"]
    assert "모두" in tier1.save_fidelity(2, "A반", [3] * n, "", "t")["error"]
    rows = [{"학년도": "2026", "학기": "2", "학급": "A반", "점수": ",".join(["2"] * (n - 2) + ["0", "1"])},
            {"학년도": "2026", "학기": "2", "학급": "B반", "점수": ",".join(["1"] * n)}]
    with mock.patch.object(tier1.FIDELITY, "rows", return_value=rows), mock.patch.object(tier1, "school_year", return_value=2026):
        f = tier1.fidelity(2, ["A반", "B반", "C반"])
    pct = {c["class"]: (c["pct"], c["needs_support"]) for c in f["classes"]}
    assert pct["A반"] == (round((2 * (n - 2) + 1) / (2 * n) * 100, 1), False)
    assert pct["B반"] == (50.0, True) and pct["C반"] == (None, False)
    assert f["done"] == 2


def test_tier1_tokens_per_student_and_spread():
    from app.services import tier1
    rows = [{"학년도": "2026", "월": "11", "학급": "A반", "1000원토큰": "10"}, {"학년도": "2026", "월": "11", "학급": "B반", "1000원토큰": "30"}]
    with mock.patch.object(tier1.TOKENS, "rows", return_value=rows), mock.patch.object(tier1, "school_year", return_value=2026), \
         mock.patch.object(tier1, "_digital_bills", return_value={}):
        t = tier1.tokens(11, [{"class": "A반", "students": 5}, {"class": "B반", "students": 5}, {"class": "C반", "students": 4}])
    assert [c["per_student"] for c in t["classes"]] == [2.0, 6.0, None]
    assert (t["entered"], t["mean"], t["sd"]) == (2, 4.0, 2.0)
    assert tier1.save_teaching("2026-11-03", "A반", True, "", [], "", "t")["error"].startswith("주는 월요일")
