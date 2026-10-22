"""관리자 브리핑 API — 한 번의 호출로 브리핑 전체를 돌려준다(5분 캐시, 시트 읽기 한도 보호)."""
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.adapters.sheets.client import get_cached, set_cached
from app.api.deps import require_admin
from app.core.time import today_kst
from app.services.briefing import build_briefing, semester_range
from app.services.sheets import fetch_all_records, fetch_student_status, get_holidays_from_config

router = APIRouter()
CACHE_KEY = "briefing:admin"


def _cico_trend(today, current_admin) -> list:
    """이번 학기 월별 CICO 목표 달성률. 실패해도 브리핑은 나간다."""
    try:
        from app.api.endpoints.cico import get_cico_achievement_trend
        _, start, _ = semester_range(today)
        if today.month < 3:
            return []
        res = get_cico_achievement_trend(start_month=max(3, start.month), end_month=today.month, current_user=current_admin)
        return (res or {}).get("trend", []) if isinstance(res, dict) else []
    except Exception as e:
        print(f"briefing: CICO trend skipped: {e}")
        return []


@router.get("")
def get_admin_briefing(refresh: bool = False, current_admin: Dict[str, Any] = Depends(require_admin)):
    if not refresh:
        cached = get_cached(CACHE_KEY, ttl=300)
        if cached is not None:
            return cached
    today = today_kst()
    data = build_briefing(
        records=fetch_all_records(force_refresh=refresh),
        students=fetch_student_status(),
        holidays=get_holidays_from_config() or [],
        today=today,
    )
    set_cached(CACHE_KEY, data)
    return data


@router.get("/cico")
def get_briefing_cico(current_admin: Dict[str, Any] = Depends(require_admin)):
    """이번 학기 월별 CICO 달성률. 월별 시트를 여러 개 읽어 느리므로 본 브리핑과 따로 불러온다(10분 캐시)."""
    cached = get_cached("briefing:cico", ttl=600)
    if cached is not None:
        return cached
    data = {"trend": _cico_trend(today_kst(), current_admin)}
    set_cached("briefing:cico", data)
    return data
