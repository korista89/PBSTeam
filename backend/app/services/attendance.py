"""AI 문서 근거용 출결·기록 확인 요약(2026-11-28).
기록이 없는 평일을 '위기행동 없음 확인 / 결석 / 기록 안 함'으로 나눠, 건수 비교를 등교일 기준으로 하게 한다."""
from datetime import date, timedelta

from app.services.log_normalize import is_vacation_week


def school_days(start: str, end: str, holidays: set) -> list:
    """start~end 평일 중 공휴일(날짜 관리 탭)·여름방학 주를 뺀 날."""
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    out = []
    while a <= b:
        y, w, _ = a.isocalendar()
        if a.weekday() < 5 and a.isoformat() not in holidays and not is_vacation_week(f"{y}-W{w:02d}"):
            out.append(a.isoformat())
        a += timedelta(days=1)
    return out


def summarize(days: list, incident: set, calm: set, absent: set) -> dict:
    d = set(days)
    inc, ab = incident & d, absent & d
    ok = (calm & d) - inc - ab
    attended = len(d) - len(ab)
    return {"school_days": len(d), "absent": len(ab), "attended": attended, "incident_days": len(inc),
            "calm_confirmed": len(ok), "unrecorded": attended - len(inc) - len(ok)}


def attendance_line(student_code: str, start: str = "", end: str = "", log_dates=None) -> str:
    """'[출결·기록 확인] …' 한 줄. 시트를 못 읽으면 빈 문자열."""
    from app.core.time import today_kst
    from app.services.sheets import get_day_marks, get_holidays_from_config, ABSENT
    try:
        t = today_kst()
        today = (t.isoformat() if hasattr(t, "isoformat") else str(t))[:10]
        sy = date.fromisoformat(today)
        default_start = date(sy.year if sy.month >= 3 else sy.year - 1, 3, 1).isoformat()
        start, end = (start or default_start)[:10], min((end or today)[:10], today)
        if start > end:
            return ""
        marks = get_day_marks(student_code)
        s = summarize(school_days(start, end, set(get_holidays_from_config() or [])), set(log_dates or []),
                      {d for d, k in marks.items() if k != ABSENT}, {d for d, k in marks.items() if k == ABSENT})
    except Exception:
        return ""
    if not s["school_days"]:
        return ""
    return (f"[출결·기록 확인 {start} ~ {end}] 학교 가는 날 {s['school_days']}일 중 결석 {s['absent']}일, 등교 {s['attended']}일. "
            f"등교일 가운데 위기행동 있는 날 {s['incident_days']}일, 위기행동 없음 확인 {s['calm_confirmed']}일, 기록 안 한 날 {s['unrecorded']}일. "
            "건수·빈도 비교와 효과 판단은 등교일 기준으로 하고, 기록 안 한 날이 많으면 그 한계를 함께 적는다.")
