"""월별 Tier: 준비된 단계만 TierStatus 거울에 쓰고, 탭마다 자기 칸만 맞추며, Tier현황 편집은 각 월별 표로 간다."""
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

STATE = {"cico": {"A"}, "sst": {}, "t3": {"B": "Tier3+"}, "ready": {"cico": True, "sst": False, "t3": True}}


def test_desired_tiers_skips_unready_and_marks_tier3_for_plus():
    from app.services import tier_monthly as tm
    assert tm.desired_tiers(STATE, "A") == {"Tier2(CICO)": "O", "Tier3": "X", "Tier3+": "X"}  # SST 미준비 → 안 씀
    assert tm.desired_tiers(STATE, "B") == {"Tier2(CICO)": "X", "Tier3": "O", "Tier3+": "O"}


def test_mirror_diff_limits_to_codes_and_columns():
    from app.services import tier_monthly as tm
    records = [
        {"학생코드": "A", "Tier2(CICO)": "X", "Tier3": "O", "Tier3+": "X", "Tier2(SST)": "O"},
        {"학생코드": "B", "Tier2(CICO)": "O", "Tier3": "O", "Tier3+": "X"},
    ]
    with mock.patch.object(tm, "month_state", return_value=STATE), \
         mock.patch.object(tm, "_status_ws_and_rows", return_value=(None, records)):
        every = {(d["code"], d["col"], d["to"]) for d in tm.mirror_diff(11)}
        only_t3 = {(d["code"], d["col"]) for d in tm.mirror_diff(11, None, tm.T3_COLS)}
        only_a = {(d["code"], d["col"]) for d in tm.mirror_diff(11, ["A"])}
    assert every == {("A", "Tier2(CICO)", "O"), ("A", "Tier3", "X"), ("B", "Tier2(CICO)", "X"), ("B", "Tier3+", "O")}
    assert only_t3 == {("A", "Tier3"), ("B", "Tier3+")}   # CICO 칸은 건드리지 않음
    assert only_a == {("A", "Tier2(CICO)"), ("A", "Tier3")}  # SST는 준비 안 돼 그대로


def test_apply_mirror_only_for_current_month():
    from app.services import tier_monthly as tm
    with mock.patch.object(tm, "current_month", return_value=11), \
         mock.patch.object(tm, "mirror_diff", side_effect=AssertionError("다른 달은 읽지도 않음")):
        assert tm.apply_mirror(10) == {"changed": 0}


def test_set_student_routes_tier3_to_monthly_table():
    from app.services import tier_monthly as tm
    calls = []
    t3_rows = [{"_row": 7, "학생코드": "B", "단계": "Tier3", "상태": ""}]
    with mock.patch.object(tm.t3, "month_rows", return_value=t3_rows), \
         mock.patch.object(tm.t3, "update_row", lambda m, r, **kw: calls.append((m, r, kw)) or {"message": "ok"}), \
         mock.patch.object(tm.t3, "add_student", lambda m, c, l: calls.append(("add", c, l)) or {"message": "ok"}), \
         mock.patch.object(tm, "school_year", return_value=2026), \
         mock.patch.object(tm, "mirror_after_change", lambda *a: {"changed": 0}):
        tm.set_student(11, "B", t3_level="Tier3+")
        tm.set_student(11, "B", t3_level="")
        tm.set_student(11, "Z", t3_level="Tier3")
    assert calls == [(11, 7, {"level": "Tier3+"}), (11, 7, {"excluded": True}), ("add", "Z", "Tier3")]
