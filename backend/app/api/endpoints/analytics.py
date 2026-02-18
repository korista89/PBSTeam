from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from app.services.analysis import get_analytics_data
from app.services.sheets import (
    fetch_all_records, get_beable_code_mapping, get_tier3_report_data,
    fetch_student_status, fetch_meeting_notes, get_monthly_cico_data
)

router = APIRouter()

# ============================================================
# Date filtering helper
# ============================================================
def _filter_by_date(records: list, start_date: str = None, end_date: str = None) -> list:
    """Filter BehaviorLogs by date range. Returns all records if no dates provided."""
    if not start_date or not end_date:
        return records
    return [
        r for r in records
        if start_date <= str(r.get("행동발생 날짜", "")) <= end_date
    ]


class MeetingMinutesRequest(BaseModel):
    start_date: str
    end_date: str

@router.post("/ai-meeting-minutes")
async def ai_meeting_minutes(req: MeetingMinutesRequest):
    """Generate comprehensive AI meeting minutes using ALL school data."""
    from app.services.ai_insight import generate_bcba_meeting_minutes
    
    # 1. Fetch all records and filter by date
    records = fetch_all_records()
    records = _filter_by_date(records, req.start_date, req.end_date)
    
    total_incidents = len(records)
    
    # Calculate daily average
    from datetime import datetime
    try:
        d1 = datetime.strptime(req.start_date, "%Y-%m-%d")
        d2 = datetime.strptime(req.end_date, "%Y-%m-%d")
        days = (d2 - d1).days + 1
        daily_avg = round(total_incidents / days, 1) if days > 0 else 0
    except:
        daily_avg = 0
        
    summary = {
        "total_incidents": total_incidents,
        "daily_avg": daily_avg
    }
    
    # 2. Identify Risk Students (Status records)
    status_records = fetch_student_status()
    risk_list = []
    for s in status_records:
        # Simple heuristic: if mentioned in logs highly
        # Or check 'Tier' column
        tier = str(s.get("Tier", s.get("지원단계", "")))
        if "3" in tier or "2" in tier: # Tier 2 or 3
            # Count incidents for this student in the filtered logs
            scode = str(s.get("학생코드", "")).strip()
            count = sum(1 for r in records if str(r.get("학생코드", "")).strip() == scode or str(r.get("코드번호", "")).strip() == scode)
            if count > 0:
                risk_list.append({
                    "name": s.get("성명", s.get("이름", "")),
                    "code": scode,
                    "tier": tier,
                    "count": count
                })
    
    # Sort by count desc
    risk_list.sort(key=lambda x: x["count"], reverse=True)
    
    # 3. CICO Stats (fetch current month)
    import datetime
    current_month = datetime.datetime.now().month
    cico_data = get_monthly_cico_data(current_month)
    cico_stats = {}
    if isinstance(cico_data, dict) and "students" in cico_data:
        students = cico_data["students"]
        cico_stats = {
            "total_students": len(students),
            "avg_rate": round(sum(float(s.get("rate", 0)) for s in students) / len(students), 1) if students else 0,
            "achieved_count": sum(1 for s in students if s.get("achieved", "") == "O"),
            "not_achieved_count": sum(1 for s in students if s.get("achieved", "") == "X")
        }
        
    # 4. Tier 3 Data
    t3_data = get_tier3_report_data(req.start_date, req.end_date)
    tier3_stats = []
    if isinstance(t3_data, dict) and "students" in t3_data:
        tier3_stats = t3_data["students"]
        
    result = generate_bcba_meeting_minutes(
        req.start_date, req.end_date,
        summary, risk_list, cico_stats, tier3_stats
    )
    
    return {"analysis": result}


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
    start_date: Optional[str] = None
    end_date: Optional[str] = None

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
        # Apply date range filter
        records = _filter_by_date(records, req.start_date, req.end_date)
        if records:
            enriched_context["total_records"] = len(records)
            enriched_context["record_sample"] = str(records[:3])[:500]
            if req.start_date and req.end_date:
                enriched_context["analysis_period"] = f"{req.start_date} ~ {req.end_date}"
    
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
    
    # Resolve student codes to BeAble codes for BehaviorLogs matching
    beable_mapping = get_beable_code_mapping()
    reverse_map = {str(v['student_code']).strip(): k for k, v in beable_mapping.items()}
    
    cico_student_codes = [str(s.get("code", s.get("student_code", ""))).strip() for s in students]
    cico_all_codes = set(cico_student_codes)
    for sc in cico_student_codes:
        bc = reverse_map.get(sc, "")
        if bc:
            cico_all_codes.add(bc)
    
    records = fetch_all_records()
    # Filter by the CICO month's date range
    import datetime
    year = datetime.datetime.now().year
    month_start = f"{year}-{req.month:02d}-01"
    month_end = f"{year}-{req.month:02d}-31"
    records = _filter_by_date(records, month_start, month_end)
    
    cico_behavior_logs = [
        r for r in records
        if str(r.get("학생코드", "")).strip() in cico_all_codes
        or str(r.get("코드번호", "")).strip() in cico_all_codes
    ]
    
    status_records = fetch_student_status()
    cico_tier_info = [
        s for s in status_records
        if str(s.get("학생코드", "")).strip() in cico_all_codes
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
    
    # Resolve student codes to BeAble codes for BehaviorLogs
    beable_mapping = get_beable_code_mapping()
    reverse_map = {str(v['student_code']).strip(): k for k, v in beable_mapping.items()}
    
    t3_student_codes = [s.get("code", "") for s in t3_data.get("students", [])]
    t3_all_codes = set(t3_student_codes)
    for sc in t3_student_codes:
        bc = reverse_map.get(str(sc).strip(), "")
        if bc:
            t3_all_codes.add(bc)
    
    records = fetch_all_records()
    # Apply date range filter
    records = _filter_by_date(records, req.start_date, req.end_date)
    
    t3_logs = [
        r for r in records
        if str(r.get("학생코드", "")).strip() in t3_all_codes
        or str(r.get("코드번호", "")).strip() in t3_all_codes
    ]
    
    result = generate_bcba_tier3_analysis(
        t3_data.get("students", []), 
        t3_logs
    )
    return {"analysis": result}

@router.post("/ai-student-analysis")
async def ai_student_analysis(req: StudentAnalysisRequest):
    """Generate BCBA AI analysis for individual student using ALL data sources."""
    from app.services.ai_insight import generate_bcba_student_analysis
    
    # Resolve BeAble code for BehaviorLogs matching
    beable_mapping = get_beable_code_mapping()
    beable_code = ""
    for bc, info in beable_mapping.items():
        if str(info.get('student_code', '')).strip() == str(req.student_code).strip():
            beable_code = bc
            break
    
    codes_to_match = {str(req.student_code).strip()}
    if beable_code:
        codes_to_match.add(str(beable_code).strip())
    
    records = fetch_all_records()
    student_logs = [
        r for r in records
        if str(r.get("학생코드", "")).strip() in codes_to_match
        or str(r.get("코드번호", "")).strip() in codes_to_match
    ]
    
    # Filter by date if provided
    student_logs = _filter_by_date(student_logs, req.start_date, req.end_date)
    
    # Get student info from TierStatus
    status_records = fetch_student_status()
    student_info = {}
    for s in status_records:
        if str(s.get("학생코드", "")).strip() == str(req.student_code).strip():
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
        meeting_notes = notes_result if isinstance(notes_result, list) else []
        # Also try with beable_code
        if beable_code and beable_code != req.student_code:
            notes_beable = fetch_meeting_notes(student_code=beable_code)
            if isinstance(notes_beable, list):
                meeting_notes.extend(notes_beable)
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
                cs_code = str(cs.get("code", cs.get("student_code", cs.get("학생코드", "")))).strip()
                if cs_code in codes_to_match:
                    cico_data.append(cs)
    except Exception as e:
        print(f"CICO fetch error for student analysis: {e}")
    
    result = generate_bcba_student_analysis(
        student_info, student_logs,
        meeting_notes=meeting_notes,
        cico_data=cico_data
    )
    return {"analysis": result}
