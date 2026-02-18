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
    
    records = fetch_all_records()
    student_logs = [
        r for r in records 
        if str(r.get("학생코드", "")) == student_code or str(r.get("코드번호", "")) == student_code
    ]
    
    status_records = fetch_student_status()
    tier_data = None
    for s in status_records:
        if s.get("학생코드", "") == student_code or s.get("코드번호", "") == student_code:
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
    
    records = fetch_all_records()
    student_logs = [
        r for r in records 
        if str(r.get("학생코드", "")) == student_code or str(r.get("코드번호", "")) == student_code
    ]
    
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
    
    # 1) BehaviorLogs for the period
    records = fetch_all_records()
    student_logs = [
        r for r in records 
        if str(r.get("학생코드", "")) == student_code or str(r.get("코드번호", "")) == student_code
    ]
    
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
        if s.get("학생코드", "") == student_code or s.get("코드번호", "") == student_code:
            tier_data = s
            break
    
    # 3) MeetingNotes
    meeting_notes = []
    try:
        notes_result = fetch_meeting_notes(student_code=student_code)
        meeting_notes = notes_result if isinstance(notes_result, list) else notes_result.get("notes", [])
    except Exception as e:
        print(f"MeetingNotes fetch error: {e}")
    
    # 4) CICO monthly data
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
        if isinstance(cico_result, dict) and "students" in cico_result:
            # Filter for this student
            for cs in cico_result["students"]:
                if str(cs.get("code", "")) == student_code or str(cs.get("student_code", "")) == student_code:
                    cico_data.append(cs)
        elif isinstance(cico_result, list):
            for cs in cico_result:
                if str(cs.get("code", "")) == student_code or str(cs.get("student_code", "")) == student_code:
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
