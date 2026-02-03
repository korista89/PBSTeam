from fastapi import APIRouter, HTTPException
from app.services.sheets import fetch_student_status, update_student_tier, fetch_cico_daily, add_cico_daily
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

# =============================
# Tier Status Endpoints
# =============================

class TierUpdateRequest(BaseModel):
    code: str
    tier: str
    memo: Optional[str] = ""

@router.get("/status")
async def get_all_status():
    """Get all students' tier status"""
    status = fetch_student_status()
    return status

@router.put("/status")
async def update_tier(request: TierUpdateRequest):
    """Update a student's tier"""
    result = update_student_tier(request.code, request.tier, request.memo)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# =============================
# CICO Daily Tracking Endpoints
# =============================

class CICODailyInput(BaseModel):
    date: Optional[str] = None
    student_code: str
    target1: str  # O or X
    target2: str  # O or X
    achievement_rate: Optional[int] = 0
    memo: Optional[str] = ""
    entered_by: Optional[str] = ""

@router.get("/cico")
async def get_cico_records(student_code: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Get CICO daily records, optionally filtered"""
    records = fetch_cico_daily(student_code, start_date, end_date)
    return records

@router.post("/cico")
async def add_cico_record(data: CICODailyInput):
    """Add a new CICO daily record"""
    # Calculate achievement rate
    achieved = sum([1 for x in [data.target1, data.target2] if x.upper() == 'O'])
    rate = int((achieved / 2) * 100)
    
    record_data = {
        "date": data.date,
        "student_code": data.student_code,
        "target1": data.target1,
        "target2": data.target2,
        "achievement_rate": rate,
        "memo": data.memo,
        "entered_by": data.entered_by
    }
    
    result = add_cico_daily(record_data)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
