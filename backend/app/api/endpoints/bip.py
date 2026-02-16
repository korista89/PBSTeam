from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

class BIPData(BaseModel):
    StudentCode: str
    TargetBehavior: str = ""
    Hypothesis: str = ""
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
        return {} # Return empty if not found, frontend handles it
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
