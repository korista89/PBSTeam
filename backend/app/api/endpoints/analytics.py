from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.services.analysis import get_analytics_data
from app.services.sheets import (
    fetch_all_records, get_beable_code_mapping, get_tier3_report_data,
    fetch_student_status, fetch_meeting_notes, get_monthly_cico_data,
    normalize_date_string
)
from app.services.normalize import (
    normalize_behavior_log, calculate_data_quality_report
)
from app.services.contagion import analyze_peer_contagion
from app.services.ai_insight import (
    generate_bcba_comprehensive_analysis,
    generate_bcba_section_analysis,
    generate_bcba_cico_analysis,
    generate_bcba_meeting_minutes,
    generate_bcba_tier3_analysis,
    generate_bcba_student_analysis,
    generate_peer_contagion_analysis
)
from app.api.deps import require_authenticated_user, require_admin, check_student_scope, normalize_class_identifier

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
            "tier": s.get("Tier", s.get("지원단계", 1))
        }
        if code:
            tier_info_map[code] = meta
        if name:
            tier_info_map[name] = meta

    return [normalize_behavior_log(r, tier_info_map) for r in raw_filtered]


# ============================================================
# §2 Data Quality Endpoint
# ============================================================
@router.get("/data-quality")
async def get_data_quality(
    start_date: str = None,
    end_date: str = None,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """
    §2 데이터 정규화 레이어 품질 진단:
    정규화 실패 건수, 필드별 오염률, 평균 기록 지연일 JSON 반환
    """
    normalized_logs = _get_normalized_records(start_date, end_date)
    report = calculate_data_quality_report(normalized_logs)
    return report


# ============================================================
# §4 Peer Contagion Endpoint
# ============================================================
@router.get("/peer-contagion")
async def get_peer_contagion(
    start_date: str = None,
    end_date: str = None,
    with_ai: bool = False,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """
    §4 학급 또래 행동 전염 분석:
    특기사항 텍스트 기반 상호작용 네트워크 및 AI 임상 분석 보고서 반환 (교사 학급 스코프 격리)
    """
    role = str(current_user.get("role", "")).lower()
    normalized_logs = _get_normalized_records(start_date, end_date)
    status_records = fetch_student_status()

    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        from app.api.deps import get_student_class_code
        normalized_logs = [
            l for l in normalized_logs
            if get_student_class_code(str(l.get("student_code", "")).strip()) == user_class
        ]
        status_records = [
            s for s in status_records
            if get_student_class_code(str(s.get("학생코드") or s.get("Code") or s.get("학번") or "").strip()) == user_class
        ]

    contagion_data = analyze_peer_contagion(normalized_logs, status_records)

    ai_analysis = ""
    if with_ai and contagion_data["edges"]:
        ai_analysis = generate_peer_contagion_analysis(contagion_data)

    return {
        "network": contagion_data,
        "ai_analysis": ai_analysis
    }


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

class ComprehensiveAnalysisRequest(BaseModel):
    start_date: str
    end_date: str

class MeetingMinutesRequest(BaseModel):
    start_date: str
    end_date: str
    context_start_date: Optional[str] = None
    context_end_date: Optional[str] = None


@router.post("/ai-comprehensive-analysis")
async def ai_comprehensive_analysis(
    req: ComprehensiveAnalysisRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """① 🤖 메인 대시보드 BCBA 종합 분석 (교사 학급 스코프 격리)"""
    role = str(current_user.get("role", "")).lower()
    user_class = None
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))

    analytics_data = get_analytics_data(req.start_date, req.end_date, class_id=user_class)
    summary = analytics_data.get("summary", {})
    trends = analytics_data.get("trends", [])
    risk_list = analytics_data.get("risk_list", [])

    normalized_logs = _get_normalized_records(req.start_date, req.end_date)
    if user_class:
        from app.api.deps import get_student_class_code
        normalized_logs = [
            l for l in normalized_logs
            if get_student_class_code(str(l.get("student_code", "")).strip()) == user_class
        ]
    quality_report = calculate_data_quality_report(normalized_logs)

    result = generate_bcba_comprehensive_analysis(
        summary, trends, risk_list, quality_report=quality_report
    )
    return {"analysis": result}


@router.post("/ai-section-analysis")
async def ai_section_analysis(
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
async def ai_cico_analysis(
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
            if get_student_class_code(str(s.get("code") or s.get("student_code") or "").strip()) == user_class
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


@router.post("/ai-meeting-minutes")
async def ai_meeting_minutes(
    req: MeetingMinutesRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """④ 🤖 SST 행동중재협의회 공문서 규격 AI 회의록 자동 생성 (교사 학급 스코프 격리)"""
    role = str(current_user.get("role", "")).lower()
    user_class = None
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))

    analytics = get_analytics_data(req.start_date, req.end_date, class_id=user_class)
    risk_list = analytics.get("risk_list", [])
    risk_list.sort(key=lambda x: x.get("count", 0), reverse=True)

    meeting_data = {
        "start_date": req.start_date,
        "end_date": req.end_date,
        "summary": analytics.get("summary", {}),
        "total_incidents": analytics.get("summary", {}).get("total_incidents", 0)
    }

    result = generate_bcba_meeting_minutes(
        meeting_data=meeting_data,
        risk_students=risk_list[:5],
        recent_trends=analytics.get("trends", [])
    )
    return {"analysis": result}


@router.post("/ai-tier3-analysis")
async def ai_tier3_analysis(
    req: Tier3AnalysisRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑤ 🤖 Tier 3 심층 위기관리 AI 컨설팅 (교사 학급 스코프 격리)"""
    role = str(current_user.get("role", "")).lower()
    user_class = None
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))

    t3_data = get_tier3_report_data(req.start_date, req.end_date, class_id=user_class)
    if "error" in t3_data:
        return {"analysis": f"데이터 로드 실패: {t3_data['error']}"}

    normalized_logs = _get_normalized_records(req.start_date, req.end_date)
    if user_class:
        from app.api.deps import get_student_class_code
        normalized_logs = [
            l for l in normalized_logs
            if get_student_class_code(str(l.get("student_code", "")).strip()) == user_class
        ]

    t3_students = t3_data.get("students", [])
    t3_codes = {str(s.get("code", "")).strip() for s in t3_students}

    t3_logs = [
        l for l in normalized_logs
        if l.get("student_code") in t3_codes or l.get("student_name") in t3_codes
    ]

    result = generate_bcba_tier3_analysis(
        tier3_students=t3_students,
        behavior_logs=t3_logs
    )
    return {"analysis": result}


@router.post("/ai-student-analysis")
async def ai_student_analysis(
    req: StudentAnalysisRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑥ 🤖 개별 학생 A-B-C 기능평가 기반 AI 종합 진단 (학생 Scope 검증)"""
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
                "tier": s.get("Tier", s.get("지원단계", 1)),
            }
            break
    if not student_info:
        student_info = {"code": target_code, "name": req.student_name or target_code, "class": "", "tier": 1}

    all_notes = [{"date": l.get("date"), "content": l.get("notes")} for l in student_logs if l.get("notes")]

    result = generate_bcba_student_analysis(
        student_info=student_info,
        student_logs=student_logs,
        all_notes=all_notes
    )
    return {"analysis": result}


@router.get("/debug-sheets")
async def debug_sheets(current_admin: Dict[str, Any] = Depends(require_admin)):
    """Debug endpoint to inspect sheets connectivity (Admin only)."""
    from app.services.sheets import get_sheets_client, safe_get_all_records
    sheet = get_sheets_client()
    if not sheet:
        return {"error": "Failed to connect to Google Spreadsheet"}
    worksheets_info = []
    for ws in sheet.worksheets():
        try:
            records = safe_get_all_records(ws)
            sample_keys = list(records[0].keys()) if records else []
            worksheets_info.append({
                "title": ws.title,
                "row_count": len(records),
                "columns": sample_keys[:10]
            })
        except Exception as e:
            worksheets_info.append({
                "title": ws.title,
                "error": str(e)
            })
    return {"sheets": worksheets_info}

@router.get("/dashboard")
async def get_dashboard_summary(
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

@router.get("/meeting")
async def get_meeting_analysis(
    target_date: str = None,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    from app.services.analysis import analyze_meeting_data
    from app.api.deps import get_student_class_code, normalize_class_identifier
    result = analyze_meeting_data(target_date)

    role = str(current_user.get("role", "")).lower()
    if role not in ["admin", "superadmin"] and isinstance(result, dict) and "students" in result:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        scoped_students = []
        for s in result.get("students", []):
            st_code = str(s.get("code") or s.get("student_code") or "").strip()
            if get_student_class_code(st_code) == user_class:
                scoped_students.append(s)
        result["students"] = scoped_students
    return result

@router.get("/tier3-report")
async def get_tier3_report(
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
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        err_msg = str(e)[:300] if str(e) else "T3 데이터 처리 중 오류 발생"
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=err_msg)

@router.post("/dashboard/refresh")
async def refresh_dashboard(current_admin: Dict[str, Any] = Depends(require_admin)):
    from app.services.sheets import initialize_monthly_sheets
    result = initialize_monthly_sheets()
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/debug-ai")
async def debug_ai_keys(current_admin: Dict[str, Any] = Depends(require_admin)):
    """AI API 키 및 로컬 LLM 터널 상태 실시간 진단 (Admin only)"""
    import os, requests as req
    results = {}

    gemini_key = (
        os.getenv("GEMINI_API_KEY", "").strip()
        or os.getenv("GEMINI_API_KEY_0817", "").strip()
        or os.getenv("GOOGLE_AI_API_KEY", "").strip()
    )
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    local_url = os.getenv("LOCAL_LLM_URL", "").strip()

    results["env"] = {
        "LOCAL_LLM_URL": local_url if local_url else "(설정 안 됨)",
        "GEMINI_API_KEY": f"{gemini_key[:8]}...{gemini_key[-4:]}" if len(gemini_key) > 12 else ("(없음)" if not gemini_key else "(너무 짧음)"),
        "GROQ_API_KEY": f"{groq_key[:8]}...{groq_key[-4:]}" if len(groq_key) > 12 else ("(없음)" if not groq_key else "(너무 짧음)"),
    }

    if local_url:
        target_v1 = local_url.rstrip("/") if local_url.rstrip("/").endswith("/v1") else f"{local_url.rstrip('/')}/v1"
        try:
            r0 = req.get(f"{target_v1}/models", timeout=5)
            if r0.status_code == 200:
                models = [m.get("id") for m in r0.json().get("data", [])]
                results["local_llm"] = {"status": "✅ 정상 연결", "models": models[:3]}
            else:
                results["local_llm"] = {"status": f"⚠️ HTTP {r0.status_code}", "body": r0.text[:100]}
        except Exception as e:
            results["local_llm"] = {"status": "❌ 연결 실패", "error": str(e)[:150]}
    else:
        results["local_llm"] = {"status": "ℹ️ LOCAL_LLM_URL 미설정 (클라우드 모드)"}

    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            r = req.post(url, json={
                "contents": [{"role": "user", "parts": [{"text": "안녕? '정상'이라고 두 글자로만 답해줘."}]}],
                "generationConfig": {"maxOutputTokens": 20, "thinkingConfig": {"thinkingBudget": 0}}
            }, timeout=20)
            if r.status_code == 200:
                txt = r.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                results["gemini_2.5_flash"] = {"status": "✅ 정상", "http": 200, "response": txt.strip()[:50]}
            else:
                results["gemini_2.5_flash"] = {"status": "❌ 실패", "http": r.status_code, "body": r.text[:200]}
        except Exception as e:
            results["gemini_2.5_flash"] = {"status": "❌ 예외 발생", "error": str(e)[:150]}
    else:
        results["gemini_2.5_flash"] = {"status": "⚠️ 키 없음"}

    if groq_key:
        try:
            r2 = req.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={"model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": "안녕?"}], "max_tokens": 10},
                timeout=15
            )
            if r2.status_code == 200:
                txt2 = r2.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                results["groq_70b"] = {"status": "✅ 정상", "http": 200, "response": txt2.strip()[:50]}
            else:
                results["groq_70b"] = {"status": "❌ 실패", "http": r2.status_code, "body": r2.text[:200]}
        except Exception as e:
            results["groq_70b"] = {"status": "❌ 예외 발생", "error": str(e)[:150]}
    else:
        results["groq_70b"] = {"status": "⚠️ 키 없음"}

    return results
