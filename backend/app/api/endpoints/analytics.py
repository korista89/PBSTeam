from fastapi import APIRouter
from app.services.analysis import get_analytics_data
from app.services.sheets import (
    fetch_all_records, get_beable_code_mapping, get_tier3_report_data,
    fetch_student_status, fetch_meeting_notes, get_monthly_cico_data
)

router = APIRouter()

@router.get("/dashboard")
async def get_dashboard_summary(start_date: str = None, end_date: str = None):
    return get_analytics_data(start_date, end_date)

@router.get("/meeting")
async def get_meeting_analysis(target_date: str = None):
    from app.services.analysis import analyze_meeting_data
    return analyze_meeting_data(target_date)

@router.get("/tier3-report")
async def get_tier3_report(start_date: str = None, end_date: str = None):
    """Get Tier3 report data for decision making."""
    data = get_tier3_report_data(start_date, end_date)
    if "error" in data:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=data["error"])
    return data


@router.get("/debug")
async def debug_data():
    """Debug endpoint to check data flow"""
    raw_data = fetch_all_records()
    beable_mapping = get_beable_code_mapping()
    
    # Get columns
    columns = list(raw_data[0].keys()) if raw_data else []
    
    # Check 코드번호 values (all unique)
    all_code_values = list(set(str(r.get('코드번호', 'N/A')) for r in raw_data)) if raw_data else []
    
    # Check BeAble mapping keys (all)
    all_beable_keys = list(beable_mapping.keys()) if beable_mapping else []
    
    # Check intersection (matching codes)
    matching_codes = set(all_code_values) & set(all_beable_keys)
    
    # Count matched records
    matched_records = [r for r in raw_data if str(r.get('코드번호', '')) in all_beable_keys]
    
    # Check March records specifically
    march_records = [r for r in raw_data if str(r.get('행동발생 날짜', '')).startswith('2025-03')]
    march_codes = list(set(str(r.get('코드번호', '')) for r in march_records))
    march_matched = [c for c in march_codes if c in all_beable_keys]
    march_unmatched = [c for c in march_codes if c not in all_beable_keys]
    
    # March matched records count
    march_matched_records = [r for r in march_records if str(r.get('코드번호', '')) in all_beable_keys]
    
    return {
        "시트1_total_records": len(raw_data),
        "시트1_columns": columns,
        "시트1_unique_코드번호_count": len(all_code_values),
        "TierStatus_total_with_beable": len(beable_mapping),
        "matching_codes_count": len(matching_codes),
        "matched_records_count": len(matched_records),
        "march_총_records": len(march_records),
        "march_코드번호": march_codes,
        "march_TierStatus일치": march_matched,
        "march_TierStatus불일치": march_unmatched,
        "march_일치_records_count": len(march_matched_records)
    }

@router.post("/dashboard/refresh")
async def refresh_dashboard():
    """Trigger a refresh of monthly sheets and dashboard data."""
    from app.services.sheets import initialize_monthly_sheets
    result = initialize_monthly_sheets()
    if "error" in result:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ============================================================
# AI BCBA Analysis Endpoints
# ============================================================

from pydantic import BaseModel
from typing import Optional, List

class SectionAnalysisRequest(BaseModel):
    section_name: str
    data_context: dict

class CICOAnalysisRequest(BaseModel):
    month: int = 3
    students_data: Optional[list] = None

class Tier3AnalysisRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class StudentAnalysisRequest(BaseModel):
    student_code: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None

@router.post("/ai-section-analysis")
async def ai_section_analysis(req: SectionAnalysisRequest):
    """Generate BCBA AI analysis for a T1 report section using school-wide data."""
    from app.services.ai_insight import generate_bcba_section_analysis
    
    # Enrich with actual school-wide data if not provided
    enriched_context = dict(req.data_context)
    if not enriched_context.get("behavior_summary"):
        records = fetch_all_records()
        if records:
            enriched_context["total_records"] = len(records)
            enriched_context["record_sample"] = str(records[:3])[:500]
    
    result = generate_bcba_section_analysis(req.section_name, enriched_context)
    return {"analysis": result}

@router.post("/ai-cico-analysis")
async def ai_cico_analysis(req: CICOAnalysisRequest):
    """Generate BCBA AI analysis for CICO report using comprehensive data."""
    from app.services.ai_insight import generate_bcba_cico_analysis
    from app.services.sheets import get_cico_report_data
    
    if req.students_data:
        students = req.students_data
    else:
        data = get_cico_report_data(req.month)
        if "error" in data:
            return {"analysis": f"데이터 로드 실패: {data['error']}"}
        students = data.get("students", [])
    
    # Enrich CICO students with BehaviorLogs + TierStatus
    records = fetch_all_records()
    status_records = fetch_student_status()
    cico_codes = [str(s.get("code", s.get("student_code", ""))) for s in students]
    
    cico_behavior_logs = [
        r for r in records
        if str(r.get("학생코드", "")) in cico_codes or str(r.get("코드번호", "")) in cico_codes
    ]
    
    cico_tier_info = [
        s for s in status_records
        if s.get("학생코드", "") in cico_codes or s.get("코드번호", "") in cico_codes
    ]
    
    result = generate_bcba_cico_analysis(
        students,
        behavior_logs=cico_behavior_logs[:50],
        tier_info=cico_tier_info
    )
    return {"analysis": result}

@router.post("/ai-tier3-analysis")
async def ai_tier3_analysis(req: Tier3AnalysisRequest):
    """Generate BCBA AI analysis for Tier 3 report."""
    from app.services.ai_insight import generate_bcba_tier3_analysis
    
    t3_data = get_tier3_report_data(req.start_date, req.end_date)
    if "error" in t3_data:
        return {"analysis": f"데이터 로드 실패: {t3_data['error']}"}
    
    records = fetch_all_records()
    # Filter records for T3 students
    t3_codes = [s.get("code", "") for s in t3_data.get("students", [])]
    t3_logs = [r for r in records if str(r.get("학생코드", "")) in t3_codes or str(r.get("코드번호", "")) in t3_codes]
    
    result = generate_bcba_tier3_analysis(
        t3_data.get("students", []), 
        t3_logs
    )
    return {"analysis": result}

@router.post("/ai-student-analysis")
async def ai_student_analysis(req: StudentAnalysisRequest):
    """Generate BCBA AI analysis for individual student using ALL data sources."""
    from app.services.ai_insight import generate_bcba_student_analysis
    
    records = fetch_all_records()
    student_logs = [r for r in records if str(r.get("학생코드", "")) == req.student_code or str(r.get("코드번호", "")) == req.student_code]
    
    # Filter by date if provided
    if req.start_date and req.end_date:
        student_logs = [
            r for r in student_logs
            if req.start_date <= str(r.get("행동발생 날짜", "")) <= req.end_date
        ]
    
    # Get student info from TierStatus
    status_records = fetch_student_status()
    student_info = {}
    for s in status_records:
        if s.get("학생코드", "") == req.student_code or s.get("코드번호", "") == req.student_code:
            student_info = {
                "code": req.student_code,
                "class": s.get("학급", ""),
                "tier": s.get("Tier", s.get("지원단계", "")),
            }
            break
    
    if not student_info:
        student_info = {"code": req.student_code, "class": "", "tier": ""}
    
    # Gather MeetingNotes for this student
    meeting_notes = []
    try:
        notes_result = fetch_meeting_notes(student_code=req.student_code)
        meeting_notes = notes_result if isinstance(notes_result, list) else notes_result.get("notes", [])
    except Exception as e:
        print(f"MeetingNotes fetch error for student analysis: {e}")
    
    # Gather CICO data for this student
    import datetime
    cico_data = []
    try:
        month = datetime.datetime.now().month
        if req.start_date:
            try:
                month = int(req.start_date.split("-")[1])
            except:
                pass
        cico_result = get_monthly_cico_data(month)
        if isinstance(cico_result, dict) and "students" in cico_result:
            for cs in cico_result["students"]:
                if str(cs.get("code", "")) == req.student_code or str(cs.get("student_code", "")) == req.student_code:
                    cico_data.append(cs)
    except Exception as e:
        print(f"CICO fetch error for student analysis: {e}")
    
    result = generate_bcba_student_analysis(
        student_info, student_logs,
        meeting_notes=meeting_notes,
        cico_data=cico_data
    )
    return {"analysis": result}

