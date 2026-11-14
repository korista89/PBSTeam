"""Tier3 월별 명단: TierStatus 단계 판정, 지난달 가져오기, Tier현황 맞추기 비교·쓰기 규칙."""
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))


def _r(row, month, code, level, status=""):
    return {"_row": row, "학년도": "2026", "월": str(month), "학생코드": code, "학생명": "", "학급": "",
            "단계": level, "메모": "", "상태": status}


def test_tierstatus_level_prefers_tier3_plus():
    from app.services import tier3_monthly as t3
    assert t3.tierstatus_level({"Tier3": "O", "Tier3+": "O"}) == "Tier3+"
    assert t3.tierstatus_level({"Tier3": "O", "Tier3+": "X"}) == "Tier3"
    assert t3.tierstatus_level({"Tier3": "X", "Tier3+": "X"}) == ""
    assert t3.prev_month(3) is None and t3.prev_month(1) == 12


def test_copy_prev_skips_existing_and_excluded_prev_rows():
    from app.services import tier3_monthly as t3
    rows = [_r(2, 10, "A", "Tier3"), _r(3, 10, "B", "Tier3+"), _r(4, 10, "C", "Tier3", "제외"), _r(5, 11, "A", "Tier3")]
    added = []
    with mock.patch.object(t3, "_rows", return_value=rows), mock.patch.object(t3, "school_year", return_value=2026), \
         mock.patch.object(t3, "_append", lambda sy, m, items: added.extend(items)):
        res = t3.copy_prev(11)
    assert [(i["code"], i["level"]) for i in added] == [("B", "Tier3+")] and res["added"] == 1
    assert "error" in t3.copy_prev(3)


def test_sync_diff_and_write_keeps_tier3_on_for_tier3_plus():
    from app.services import tier3_monthly as t3, sheets
    rows = [_r(2, 11, "A", "Tier3+"), _r(3, 11, "B", "Tier3")]
    roster = {"A": {"Tier3": "O", "Tier3+": "X"}, "B": {"Tier3": "O"}, "D": {"Tier3": "O"}}
    with mock.patch.object(t3, "_rows", return_value=rows), mock.patch.object(t3, "school_year", return_value=2026), \
         mock.patch.object(t3, "_roster", return_value=roster):
        s = t3.tier_sync_status(11)
    assert [(d["code"], d["monthly"], d["tierstatus"]) for d in s["diff"]] == [("A", "Tier3+", "Tier3"), ("D", "", "Tier3")]
    calls = []
    with mock.patch.object(sheets, "update_student_tier", lambda code, v: calls.append((code, v)) or {"message": "ok"}), \
         mock.patch.object(t3, "invalidate_cache", lambda *a: None):
        t3.apply_to_tierstatus("A", "Tier3+")
        t3.apply_to_tierstatus("D", "")
    assert calls == [("A", {"Tier3": "O", "Tier3+": "O"}), ("D", {"Tier3": "X", "Tier3+": "X"})]
