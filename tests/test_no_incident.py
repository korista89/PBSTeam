"""무발생 기록: 평일 확장·검증, 위기행동 기록일 제외."""
import datetime
import pytest
from fastapi import HTTPException
from app.api.endpoints import behavior as bh

TODAY = datetime.date(2026, 11, 11)  # 수요일


def test_expand_skips_weekend():
    assert bh.expand_school_days("2026-11-06", "2026-11-10", TODAY) == ["2026-11-06", "2026-11-09", "2026-11-10"]


@pytest.mark.parametrize("s,e", [("2026-11-12", "2026-11-12"), ("2026-11-10", "2026-11-09"), ("2026-09-01", "2026-11-11"), ("x", "y")])
def test_expand_rejects_bad_input(s, e):
    with pytest.raises(HTTPException):
        bh.expand_school_days(s, e, TODAY)


def test_add_skips_days_with_incident(monkeypatch):
    import app.services.sheets as sh
    monkeypatch.setattr(bh, "check_student_scope", lambda *a, **k: None)
    monkeypatch.setattr(bh, "today_kst", lambda: TODAY)
    monkeypatch.setattr(bh, "fetch_all_records", lambda force_refresh=False: [{"학생코드": "S01", "행동발생날짜": "2026-11-10"}])
    got = {}
    monkeypatch.setattr(sh, "add_no_incident_dates", lambda c, d, by="": got.update(c=c, d=d) or {"added": d, "existing": []})
    r = bh.add_no_incident("S01", {"start_date": "2026-11-09", "end_date": "2026-11-11"}, {"name": "t"})
    assert r["skipped_has_incident"] == ["2026-11-10"]
    assert got["d"] == ["2026-11-09", "2026-11-11"]
