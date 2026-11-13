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
    generate_bcba_cico_analysis,
    generate_bcba_student_analysis,
    generate_medication_response_report
)
from app.services.fba_evidence import fba_data_gate
from app.api.deps import require_authenticated_user, require_admin, check_student_scope, normalize_class_identifier

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

    return [normalize_behavior_log(r, tier_info_map) for r in raw_filtered]


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

class CICOAnalysisRequest(BaseModel):
    month: int = 3
    students_data: Optional[list] = None

class Tier3AnalysisRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class StudentAnalysisRequest(BaseModel):
    student_code: Optional[str] = None
    student_name: Optional[str] = None
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

class ComprehensiveAnalysisRequest(BaseModel):
    start_date: str
    end_date: str

@router.post("/ai-section-analysis")
def ai_section_analysis(
    req: SectionAnalysisRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """② 🤖 5대 심층 영역별(시간/장소/유형/강도/기능) AI 분석 (교사 학급 스코프 격리)"""
    role = str(current_user.get("role", "")).lower()
    user_class = None
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))

    normalized_logs = _get_normalized_records(req.start_date, req.end_date)
    if user_class:
        from app.api.deps import get_student_class_code
        normalized_logs = [
            l for l in normalized_logs
            if get_student_class_code(str(l.get("student_code", "")).strip()) == user_class
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


@router.post("/ai-cico-analysis")
def ai_cico_analysis(
    req: CICOAnalysisRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """③ 🤖 CICO AI 성과 분석 및 Tier 조정 의사결정 (교사 학급 스코프 격리)"""
    from app.services.sheets import get_cico_report_data
    role = str(current_user.get("role", "")).lower()
    user_class = None
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))

    if req.students_data:
        students = req.students_data
    else:
        data = get_cico_report_data(req.month)
        if "error" in data:
            return {"analysis": f"데이터 로드 실패: {data['error']}"}
        students = data.get("students", [])

    if user_class:
        from app.api.deps import get_student_class_code
        students = [
            s for s in students
            if get_student_class_code(str(s.get("code") or s.get("student_code") or s.get("학생코드") or "").strip()) == user_class
        ]

    normalized_logs = _get_normalized_records()
    if user_class:
        from app.api.deps import get_student_class_code
        normalized_logs = [
            l for l in normalized_logs
            if get_student_class_code(str(l.get("student_code", "")).strip()) == user_class
        ]

    status_records = fetch_student_status()
    if user_class:
        from app.api.deps import get_student_class_code
        status_records = [
            s for s in status_records
            if get_student_class_code(str(s.get("학생코드") or s.get("Code") or s.get("학번") or "").strip()) == user_class
        ]

    result = generate_bcba_cico_analysis(
        students_data=students,
        behavior_logs=normalized_logs[:100],
        tier_info=status_records,
        selected_month=req.month
    )
    return {"analysis": result}


def _meeting_scope(current_user: Dict[str, Any]):
    role = str(current_user.get("role", "")).lower()
    if role in ["admin", "superadmin"]:
        return None
    return normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))


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
        return {"scope": "class", "title": f"{cls} 학급 협의회", "attendees": M.CLASS_ATTENDEES,
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
    audience = f"{cls} 학급(담임·부담임·교과·지원인력)" if cls else "학교행동중재지원팀(전교)"
    return {"draft": M.generate_draft(req.title, attendees, agenda, facts, audience), "facts": facts}


@router.post("/ai-student-analysis")
def ai_student_analysis(
    req: StudentAnalysisRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑥ 🤖 구조화 필드+특기사항 기반 개별 학생 잠정 FBA 분석 (학생 Scope 검증)"""
    beable_mapping = get_beable_code_mapping()
    target_code = str(req.student_code or "").strip()

    if not target_code and req.student_name:
        for bc, info in beable_mapping.items():
            if str(info.get('student_name', '')).strip() == str(req.student_name).strip():
                target_code = str(info.get('student_code', bc)).strip()
                break
    if not target_code and req.student_name:
        target_code = req.student_name

    if target_code:
        check_student_scope(target_code, current_user)

    beable_code = ""
    for bc, info in beable_mapping.items():
        if str(info.get('student_code', '')).strip() == target_code:
            beable_code = bc
            break

    codes_to_match = {target_code}
    if beable_code:
        codes_to_match.add(str(beable_code).strip())
    if req.student_name:
        codes_to_match.add(str(req.student_name).strip())

    normalized_logs = _get_normalized_records(req.start_date, req.end_date)
    student_logs = [
        l for l in normalized_logs
        if l.get("student_code") in codes_to_match or l.get("student_name") in codes_to_match
    ]

    status_records = fetch_student_status()
    student_info = {}
    for s in status_records:
        if str(s.get("학생코드", "")).strip() == target_code or str(s.get("학생명", "")).strip() == target_code:
            student_info = {
                "code": target_code,
                "name": s.get("학생명", req.student_name or target_code),
                "class": s.get("학급", ""),
                "tier": tier_label(s),
            }
            break
    if not student_info:
        student_info = {"code": target_code, "name": req.student_name or target_code, "class": "", "tier": 1}

    all_notes = [{"date": l.get("date"), "content": l.get("notes")} for l in student_logs if l.get("notes")]

    gate = fba_data_gate(len(student_logs))
    result = generate_bcba_student_analysis(
        student_info=student_info,
        student_logs=student_logs,
        all_notes=all_notes
    )
    return {"analysis": result, **gate}


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
    role = str(current_user.get("role", "")).lower()
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        class_id = user_class
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
        role = str(current_user.get("role", "")).lower()
        if role not in ["admin", "superadmin"]:
            user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
            class_id = user_class
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

@router.post("/dashboard/refresh")
def refresh_dashboard(current_admin: Dict[str, Any] = Depends(require_admin)):
    # 예전에는 월별 탭(3~12월)을 새로 만들었다. CICO가 표 3개로 바뀐 뒤(2026-11-01)에는 캐시만 비운다.
    from app.services.sheets import clear_cache
    clear_cache()
    return {"message": "데이터를 새로 읽었습니다."}

