# backend/app/core/time.py

from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")

def now_kst() -> datetime:
    """Returns current datetime in Korea Standard Time (UTC+9)."""
    return datetime.now(KST)

def today_kst() -> date:
    """Returns current date in Korea Standard Time (UTC+9)."""
    return now_kst().date()
