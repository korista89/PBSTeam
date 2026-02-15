from fastapi import APIRouter, HTTPException
from app.services.sheets import (
    fetch_student_status, update_student_tier, fetch_cico_daily, add_cico_daily,
    update_student_enrollment, update_student_beable_code, get_enrolled_student_count, get_beable_code_mapping,
    reset_tier_status_sheet, update_student_tier_unified
)
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

# =============================
# Tier Status Endpoints
# =============================

class TierUpdateRequest(BaseModel):
    code: str
    tier1: Optional[str] = None  # O or X
    tier2_cico: Optional[str] = None  # O or X
    tier2_sst: Optional[str] = None  # O or X
    tier3: Optional[str] = None  # O or X
    tier3_plus: Optional[str] = None  # O or X
    memo: Optional[str] = ""

class UnifiedTierUpdateRequest(BaseModel):
    """Single request for all tier-related updates"""
    code: str
    tier1: Optional[str] = None
    tier2_cico: Optional[str] = None
    tier2_sst: Optional[str] = None
    tier3: Optional[str] = None
    tier3_plus: Optional[str] = None
    memo: Optional[str] = ""
    enrolled: Optional[str] = None
    beable_code: Optional[str] = None

class EnrollmentUpdateRequest(BaseModel):
    code: str
    enrolled: str  # O or X

class BeAbleCodeUpdateRequest(BaseModel):
    code: str
    beable_code: str

@router.get("/status")
async def get_all_status():
    """Get all students' tier status with enrollment count"""
    status = fetch_student_status()
    enrolled_count = get_enrolled_student_count()
    return {
        "students": status,
        "enrolled_count": enrolled_count,
        "total_count": len(status)
    }

@router.put("/status")
async def update_tier(request: TierUpdateRequest):
    """Update a student's tier status (5 separate O/X columns)"""
    tier_values = {}
    if request.tier1 is not None:
        tier_values['Tier1'] = request.tier1
    if request.tier2_cico is not None:
        tier_values['Tier2(CICO)'] = request.tier2_cico
    if request.tier2_sst is not None:
        tier_values['Tier2(SST)'] = request.tier2_sst
    if request.tier3 is not None:
        tier_values['Tier3'] = request.tier3
    if request.tier3_plus is not None:
        tier_values['Tier3+'] = request.tier3_plus
    
    result = update_student_tier(request.code, tier_values, request.memo)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.put("/status/unified")
async def update_tier_unified(request: UnifiedTierUpdateRequest):
    """Unified update: tier + enrollment + beable in single API call"""
    tier_values = {}
    if request.tier1 is not None:
        tier_values['Tier1'] = request.tier1
    if request.tier2_cico is not None:
        tier_values['Tier2(CICO)'] = request.tier2_cico
    if request.tier2_sst is not None:
        tier_values['Tier2(SST)'] = request.tier2_sst
    if request.tier3 is not None:
        tier_values['Tier3'] = request.tier3
    if request.tier3_plus is not None:
        tier_values['Tier3+'] = request.tier3_plus
    
    result = update_student_tier_unified(
        code=request.code,
        tier_values=tier_values,
        enrolled=request.enrolled,
        beable_code=request.beable_code,
        memo=request.memo or ""
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.put("/enrollment")
async def update_enrollment(request: EnrollmentUpdateRequest):
    """Update a student's enrollment status (O/X)"""
    if request.enrolled not in ["O", "X"]:
        raise HTTPException(status_code=400, detail="Enrolled must be O or X")
    result = update_student_enrollment(request.code, request.enrolled)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.put("/beable")
async def update_beable(request: BeAbleCodeUpdateRequest):
    """Update a student's BeAble code for data linking"""
    result = update_student_beable_code(request.code, request.beable_code)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.get("/beable-mapping")
async def get_beable_mapping():
    """Get BeAble code to student code mapping for data analysis"""
    mapping = get_beable_code_mapping()
    return mapping

@router.post("/reset-sheet")
async def reset_sheet():
    """Reset TierStatus sheet with all 210 students (Admin only)"""
    result = reset_tier_status_sheet()
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
