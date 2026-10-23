"""관리자 브리핑 API — 한 번의 호출로 브리핑 전체를 돌려준다(5분 캐시, 시트 읽기 한도 보호)."""
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.adapters.sheets.client import get_cached, set_cached
from app.api.deps import require_authenticated_user, normalize_class_identifier
from app.adapters.sheets.tier_status import TierStatusAdapter
from app.core.time import today_kst
from app.services.briefing import build_briefing, semester_range
from app.services.sheets import fetch_all_records, fetch_student_status, get_holidays_from_config, fetch_approval_states

router = APIRouter()
CACHE_KEY = "briefing:"


def class_scope(current_user: Dict[str, Any]):
    """관리자는 None(전교), 담임은 자기 학급 식별자."""
    if str(current_user.get("role", "")).lower() in ("admin", "superadmin"):
        return None
    return normalize_class_identifier(current_user.get("class_id") or current_user.get("id")) or "__none__"


def scope_records(records: list, students: list, cls):
    """담임이면 자기 학급 학생의 기록·명단만 남긴다."""
    if cls is None:
        return records, students
    code_cls = {s.student_code.strip(): normalize_class_identifier(s.class_name) for s in TierStatusAdapter.fetch_students()}
    recs = [r for r in records if code_cls.get(str(r.get("학생코드") or r.get("코드번호") or "").strip()) == cls]
    studs = [s for s in students if code_cls.get(str(s.get("학생코드", "")).strip()) == cls]
    return recs, studs


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
def get_admin_briefing(refresh: bool = False, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """관리자는 전교, 담임은 자기 학급 브리핑."""
    cls = class_scope(current_user)
    key = CACHE_KEY + (cls or "all")
    if not refresh:
        cached = get_cached(key, ttl=300)
        if cached is not None:
            return cached
    today = today_kst()
    records, students = scope_records(fetch_all_records(force_refresh=refresh), fetch_student_status(), cls)
    data = build_briefing(
        records=records,
        students=students,
        holidays=get_holidays_from_config() or [],
        today=today,
        signoffs=fetch_approval_states(),
    )
    data["scope"] = cls or "전교"
    set_cached(key, data)
    return data


@router.get("/cico")
def get_briefing_cico(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """이번 학기 월별 CICO 달성률. 월별 시트를 여러 개 읽어 느리므로 본 브리핑과 따로 불러온다(10분 캐시)."""
    # CICO 보고서 집계가 담임 학급 범위를 이미 적용한다
    key = "briefing:cico:" + (class_scope(current_user) or "all")
    cached = get_cached(key, ttl=600)
    if cached is not None:
        return cached
    data = {"trend": _cico_trend(today_kst(), current_user)}
    set_cached(key, data)
    return data
