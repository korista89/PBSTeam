from app.services.sheets import tier_label
import logging
from app.adapters.sheets.resilience import SheetUnavailable
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import timedelta
from typing import Optional, List, Dict, Any
from app.services.analysis import get_analytics_data, get_student_analytics
from app.services.sheets import (
    fetch_all_records, get_beable_code_mapping, get_tier3_report_data,
    fetch_student_status, normalize_date_string
)
from app.services.normalize import (
    normalize_behavior_log, calculate_data_quality_report
)
from app.services.ai_insight import (
    generate_bcba_section_analysis,
    generate_medication_response_report
)
from app.services.fba_evidence import fba_data_gate
from app.api.deps import require_authenticated_user, require_admin, check_student_scope, normalize_class_identifier, user_scope, DIVISIONS, narrow_scope, student_in_scope

logger = logging.getLogger(__name__)

router = APIRouter()

# ============================================================
# Date filtering helper
# ============================================================
def _filter_by_date(records: list, start_date: str = None, end_date: str = None) -> list:
    """Filter records by date range. Returns all records if no dates provided."""
    if not start_date or not end_date:
        return records

    sd = normalize_date_string(start_date)
    ed = normalize_date_string(end_date)

    filtered = []
    for r in records:
        rd = normalize_date_string(r.get("date", r.get("행동발생날짜", r.get("발생날짜", r.get("행동발생 날짜", "")))))
        if rd and sd <= rd <= ed:
            filtered.append(r)
    return filtered


def _get_normalized_records(start_date: str = None, end_date: str = None) -> List[dict]:
    """Fetch raw records from Google Sheets and pass through §2 Normalization Layer."""
    raw_records = fetch_all_records()
    raw_filtered = _filter_by_date(raw_records, start_date, end_date)

    status_records = fetch_student_status()
    tier_info_map = {}
    for s in status_records:
        code = str(s.get("학생코드", s.get("code", ""))).strip()
        name = str(s.get("학생명", s.get("name", ""))).strip()
        meta = {
            "class": s.get("학급", ""),
            "tier": tier_label(s)
        }
        if code:
            tier_info_map[code] = meta
        if name:
            tier_info_map[name] = meta

    logs = [normalize_behavior_log(r, tier_info_map) for r in raw_filtered]
    from app.services.zero_pii import excluded_codes
    skip = excluded_codes()  # 2027 모드: 보호자 미동의·철회 학생은 집계에서 뺀다
    return [l for l in logs if str(l.get("student_code", "")).strip() not in skip] if skip else logs


# ============================================================
# §2 Data Quality Endpoint
# ============================================================
# ============================================================
# §4 Peer Contagion Endpoint
# ============================================================
# ============================================================
# AI BCBA Analysis Endpoints
# ============================================================

class SectionAnalysisRequest(BaseModel):
    section_name: str
    data_context: Any = {}
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class MedicationEntry(BaseModel):
    name: str
    dose: str = ""

class MedicationReportRequest(BaseModel):
    student_code: str
    student_name: Optional[str] = None
    before_medications: List[MedicationEntry] = []
    after_medications: List[MedicationEntry] = []
    before_start: str
    before_end: str
    after_start: str
    after_end: str


@router.post("/ai-section-analysis")
def ai_section_analysis(
    req: SectionAnalysisRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """② 🤖 5대 심층 영역별(시간/장소/유형/강도/기능) AI 분석 (교사 학급 스코프 격리)"""
    user_class = user_scope(current_user)

    normalized_logs = _get_normalized_records(req.start_date, req.end_date)
    if user_class is not None:
        normalized_logs = [
            l for l in normalized_logs
            if student_in_scope(str(l.get("student_code", "")).strip(), user_class)
        ]
    quality_report = calculate_data_quality_report(normalized_logs)

    if isinstance(req.data_context, dict):
        chart_data = req.data_context.get("chart_data", req.data_context)
        top_items = req.data_context.get("top_items", [])
    else:
        chart_data = req.data_context
        top_items = req.data_context if isinstance(req.data_context, list) else []

    result = generate_bcba_section_analysis(
        req.section_name,
        chart_data=chart_data,
        top_items=top_items,
        raw_summary=req.data_context,
        quality_report=quality_report
    )
    return {"analysis": result}


def _meeting_scope(current_user: Dict[str, Any]):
    return user_scope(current_user)


@router.get("/meeting-draft/plan")
def meeting_draft_plan(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """협의회 종류·차수·안건·기본 기간. 관리자는 학교행동중재지원팀 12차 일정, 담임은 학급 협의회."""
    from app.core.time import today_kst
    from app.services import meeting_draft as M
    today = today_kst()
    cls = _meeting_scope(current_user)
    if cls:
        # 기본 기간: 이번 달 1일부터(월초 첫 주면 지난달 1일부터)
        start = today.replace(day=1) if today.day >= 8 else (today.replace(day=1) - timedelta(days=1)).replace(day=1)
        unit = "과정" if cls in DIVISIONS else "학급"
        return {"scope": "class", "title": f"{cls} {unit} 협의회", "attendees": M.CLASS_ATTENDEES,
                "agenda": M.CLASS_AGENDA, "period_start": start.isoformat(), "period_end": today.isoformat()}
    no = M.pick_session(today)
    return {"scope": "school", "title": "학교행동중재지원팀 협의회", "attendees": M.SCHOOL_ATTENDEES, "selected": no,
            "sessions": [M.session_info(s[0], today) for s in M.SCHOOL_SESSIONS]}


class MeetingDraftRequest(BaseModel):
    title: str
    agenda: List[str]
    start_date: str
    end_date: str


@router.post("/meeting-draft")
def meeting_draft(req: MeetingDraftRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """협의회 실시 전 초안. 수치는 범위(학교/학급)에 맞춰 계산하고, 안건별 문장은 AI가 쓴다."""
    from app.services import meeting_draft as M
    cls = _meeting_scope(current_user)
    agenda = [a.strip() for a in req.agenda if a.strip()][:8]
    if not agenda:
        raise HTTPException(status_code=400, detail="안건이 비었습니다.")
    facts = M.build_facts(req.start_date, req.end_date, cls)
    attendees = M.CLASS_ATTENDEES if cls else M.SCHOOL_ATTENDEES
    audience = (f"{cls} 과정(과정부장·담임)" if cls in DIVISIONS else f"{cls} 학급(담임·부담임·교과·지원인력)") if cls else "학교행동중재지원팀(전교)"
    return {"draft": M.generate_draft(req.title, attendees, agenda, facts, audience), "facts": facts}


@router.post("/ai-medication-response-report")
def ai_medication_response_report(
    req: MedicationReportRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑨ 🤖 약물 변경 전후 교실 행동 비교 — 정신건강의학과 진료 참고용 담임교사 관찰
    의견서. 진단이나 처방은 하지 않으며, 교실에서 관찰된 객관적 행동 변화를
    정리해 의료진의 판단을 돕는 참고자료만 만든다."""
    target_code = str(req.student_code or "").strip()
    if target_code:
        check_student_scope(target_code, current_user)

    status_records = fetch_student_status()
    student_info = {"code": target_code, "name": req.student_name or target_code, "class": ""}
    for s in status_records:
        if str(s.get("학생코드", "")).strip() == target_code or str(s.get("학생명", "")).strip() == target_code:
            student_info = {
                "code": target_code,
                "name": s.get("학생명", req.student_name or target_code),
                "class": s.get("학급", ""),
            }
            break

    before_data = get_student_analytics(target_code, start_date=req.before_start, end_date=req.before_end)
    after_data = get_student_analytics(target_code, start_date=req.after_start, end_date=req.after_end)

    result = generate_medication_response_report(
        student_info=student_info,
        before_medications=[m.dict() for m in req.before_medications],
        after_medications=[m.dict() for m in req.after_medications],
        before_period={"start": req.before_start, "end": req.before_end},
        after_period={"start": req.after_start, "end": req.after_end},
        before_data=before_data,
        after_data=after_data,
    )
    return {"analysis": result}


@router.get("/dashboard")
def get_dashboard_summary(
    start_date: str = None,
    end_date: str = None,
    class_id: str = None,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    class_id = narrow_scope(current_user, class_id)
    return get_analytics_data(start_date, end_date, class_id)

@router.get("/tier3-report")
def get_tier3_report(
    start_date: str = None,
    end_date: str = None,
    class_id: str = None,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    import traceback
    try:
        class_id = narrow_scope(current_user, class_id)
        data = get_tier3_report_data(start_date, end_date, class_id)
        if isinstance(data, dict) and "error" in data:
            raise HTTPException(status_code=500, detail=data["error"])
        return data
    except SheetUnavailable:
        raise
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        err_msg = str(e)[:300] if str(e) else "T3 데이터 처리 중 오류 발생"
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=err_msg)

@router.get("/crisis-briefing")
def get_crisis_briefing(
    start_date: str,
    end_date: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """위기행동관리: 기간 중 학교행동중재지원팀 대상(Tier3·Tier3+) 학생의 위기행동 브리핑."""
    from datetime import date
    from app.services import crisis_briefing
    try:
        start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜는 YYYY-MM-DD 형식이어야 합니다.")
    if start > end or (end - start).days > 366:
        raise HTTPException(status_code=400, detail="기간을 1년 안으로 다시 골라 주세요.")
    return crisis_briefing.load(start, end, narrow_scope(current_user))


@router.post("/dashboard/refresh")
def refresh_dashboard(current_admin: Dict[str, Any] = Depends(require_admin)):
    # 예전에는 월별 탭(3~12월)을 새로 만들었다. CICO가 표 3개로 바뀐 뒤(2026-11-01)에는 캐시만 비운다.
    from app.services.sheets import clear_cache
    clear_cache()
    return {"message": "데이터를 새로 읽었습니다."}

