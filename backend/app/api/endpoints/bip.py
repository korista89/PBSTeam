from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

class BIPData(BaseModel):
    StudentCode: str
    TargetBehavior: str = ""
    Hypothesis: str = ""
    Goals: str = ""
    PreventionStrategies: str = ""
    TeachingStrategies: str = ""
    ReinforcementStrategies: str = ""
    CrisisPlan: str = ""
    EvaluationPlan: str = ""
    MedicationStatus: str = ""
    ReinforcerInfo: str = ""
    OtherConsiderations: str = ""
    UpdatedAt: str = ""
    Author: str = ""


def _resolve_beable_code(student_code: str) -> str:
    """Convert student_code (e.g. '2611') to BeAble code (e.g. 'STU000012').
    BehaviorLogs use '코드번호' (BeAble code), not '학생코드'.
    Returns the BeAble code, or empty string if not found."""
    from app.services.sheets import get_beable_code_mapping
    mapping = get_beable_code_mapping()
    # mapping: { beable_code: { student_code: '2611', ... } }
    for beable_code, info in mapping.items():
        if str(info.get('student_code', '')).strip() == str(student_code).strip():
            return beable_code
    return ""


def _filter_student_logs(records: list, student_code: str, beable_code: str = "") -> list:
    """Filter BehaviorLogs for a student by student_code OR BeAble code (코드번호)."""
    codes_to_match = {str(student_code).strip()}
    if beable_code:
        codes_to_match.add(str(beable_code).strip())
    
    return [
        r for r in records
        if str(r.get("학생코드", "")).strip() in codes_to_match
        or str(r.get("코드번호", "")).strip() in codes_to_match
    ]


@router.get("/students/{student_code}/bip")
async def get_student_bip(student_code: str):
    from app.services.sheets import get_bip
    bip = get_bip(student_code)
    if not bip:
        return {}
    # Migration: rename old field if present
    if "ConsequenceStrategies" in bip and "ReinforcementStrategies" not in bip:
        bip["ReinforcementStrategies"] = bip.pop("ConsequenceStrategies")
    return bip

@router.post("/students/{student_code}/bip")
async def save_student_bip(student_code: str, data: BIPData):
    from app.services.sheets import save_bip
    if data.StudentCode != student_code:
        raise HTTPException(status_code=400, detail="Student Code mismatch")
    
    result = save_bip(data.dict())
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ============================================================
# AI BIP Endpoints
# ============================================================

@router.post("/students/{student_code}/ai-hypothesis")
async def ai_bip_hypothesis(student_code: str):
    """Generate BIP hypothesis using BCBA AI analysis."""
    from app.services.ai_insight import generate_bip_hypothesis
    from app.services.sheets import fetch_all_records, fetch_student_status
    
    beable_code = _resolve_beable_code(student_code)
    
    records = fetch_all_records()
    student_logs = _filter_student_logs(records, student_code, beable_code)
    
    status_records = fetch_student_status()
    tier_data = None
    for s in status_records:
        if str(s.get("학생코드", "")).strip() == student_code:
            tier_data = {
                "학급": s.get("학급", ""),
                "지원단계": s.get("Tier", s.get("지원단계", "")),
                "Tier2(CICO)": s.get("Tier2(CICO)", ""),
            }
            break
    
    result = generate_bip_hypothesis(student_code, student_logs, tier_data)
    return {"hypothesis": result}


class AIStrategiesRequest(BaseModel):
    target_behavior: str = ""
    hypothesis: str = ""
    goals: str = ""

@router.post("/students/{student_code}/ai-strategies")
async def ai_bip_strategies(student_code: str, req: AIStrategiesRequest):
    """Generate BIP intervention strategies using BCBA AI analysis."""
    from app.services.ai_insight import generate_bip_strategies
    from app.services.sheets import fetch_all_records
    
    beable_code = _resolve_beable_code(student_code)
    
    records = fetch_all_records()
    student_logs = _filter_student_logs(records, student_code, beable_code)
    
    result = generate_bip_strategies(
        student_code, 
        req.target_behavior, 
        req.hypothesis, 
        req.goals, 
        student_logs
    )
    return {"strategies": result}


class AIBIPFullRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    medication_status: str = ""
    reinforcer_info: str = ""
    other_considerations: str = ""

@router.post("/students/{student_code}/ai-bip-full")
async def ai_bip_full(student_code: str, req: AIBIPFullRequest):
    """Generate comprehensive AI BIP using ALL data sources."""
    from app.services.ai_insight import generate_full_bip
    from app.services.sheets import (
        fetch_all_records, fetch_student_status,
        fetch_meeting_notes, get_monthly_cico_data
    )
    import datetime
    
    # Resolve BeAble code for BehaviorLogs matching
    beable_code = _resolve_beable_code(student_code)
    
    # 1) BehaviorLogs for the period
    records = fetch_all_records()
    student_logs = _filter_student_logs(records, student_code, beable_code)
    
    # Filter by date if provided
    if req.start_date and req.end_date:
        student_logs = [
            r for r in student_logs
            if req.start_date <= str(r.get("행동발생 날짜", "")) <= req.end_date
        ]
    
    # 2) TierStatus
    status_records = fetch_student_status()
    tier_data = {}
    for s in status_records:
        if str(s.get("학생코드", "")).strip() == student_code:
            tier_data = s
            break
    
    # 3) MeetingNotes — try both student_code and beable_code
    meeting_notes = []
    try:
        notes_result = fetch_meeting_notes(student_code=student_code)
        meeting_notes = notes_result if isinstance(notes_result, list) else []
        # Also try with beable_code if different
        if beable_code and beable_code != student_code:
            notes_beable = fetch_meeting_notes(student_code=beable_code)
            if isinstance(notes_beable, list):
                meeting_notes.extend(notes_beable)
    except Exception as e:
        print(f"MeetingNotes fetch error: {e}")
    
    # 4) CICO monthly data — match by student_code (학생코드 in CICO sheet)
    cico_data = []
    try:
        now = datetime.datetime.now()
        month = now.month
        if req.start_date:
            try:
                month = int(req.start_date.split("-")[1])
            except:
                pass
        cico_result = get_monthly_cico_data(month)
        codes_to_match = {student_code}
        if beable_code:
            codes_to_match.add(beable_code)
        
        if isinstance(cico_result, dict) and "students" in cico_result:
            for cs in cico_result["students"]:
                cs_code = str(cs.get("code", cs.get("student_code", cs.get("학생코드", "")))).strip()
                if cs_code in codes_to_match:
                    cico_data.append(cs)
        elif isinstance(cico_result, list):
            for cs in cico_result:
                cs_code = str(cs.get("code", cs.get("student_code", cs.get("학생코드", "")))).strip()
                if cs_code in codes_to_match:
                    cico_data.append(cs)
    except Exception as e:
        print(f"CICO data fetch error: {e}")
    
    # 5) User-provided fields 9-11
    user_context = {
        "medication_status": req.medication_status,
        "reinforcer_info": req.reinforcer_info,
        "other_considerations": req.other_considerations,
    }
    
    result = generate_full_bip(
        student_code=student_code,
        behavior_logs=student_logs,
        tier_data=tier_data,
        meeting_notes=meeting_notes,
        cico_data=cico_data,
        user_context=user_context
    )
    
    return {"analysis": result}
