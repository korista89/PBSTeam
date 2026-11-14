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

