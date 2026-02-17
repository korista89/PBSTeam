from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

class BIPData(BaseModel):
    StudentCode: str
    TargetBehavior: str = ""
    Hypothesis: str = ""
    Goals: str = ""  # NEW: 목표(수치화)
    PreventionStrategies: str = ""
    TeachingStrategies: str = ""
    ConsequenceStrategies: str = ""
    CrisisPlan: str = ""
    EvaluationPlan: str = ""
    UpdatedAt: str = ""
    Author: str = ""

@router.get("/students/{student_code}/bip")
async def get_student_bip(student_code: str):
    from app.services.sheets import get_bip
    bip = get_bip(student_code)
    if not bip:
        return {}
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
