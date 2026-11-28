"""결석·위기행동 없음·기록 안 함을 나눠 등교일 기준 근거를 만든다."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.services.attendance import school_days, summarize


def test_school_days_skip_weekend_holiday_and_summer():
    assert school_days("2026-11-02", "2026-11-08", {"2026-11-04"}) == ["2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06"]
    assert school_days("2026-07-27", "2026-07-31", set()) == []  # 여름방학 주


def test_summary_counts_each_day_once():
    days = ["2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06"]
    s = summarize(days, incident={"2026-11-02", "2026-10-30"}, calm={"2026-11-02", "2026-11-03"}, absent={"2026-11-05"})
    assert s == {"school_days": 4, "absent": 1, "attended": 3, "incident_days": 1, "calm_confirmed": 1, "unrecorded": 1}
