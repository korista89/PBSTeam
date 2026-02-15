from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.sheets import (
    get_monthly_cico_data,
    update_monthly_cico_cells,
    update_student_cico_settings,
    toggle_tier2_status,
    get_holidays_from_config,
    get_business_days,
    get_cico_report_data,
)

router = APIRouter()


@router.get("/business-days")
async def get_cico_business_days(month: int = 3, year: int = 2025):
    """Get business days (weekdays excluding holidays) for a given month."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")
    holidays = get_holidays_from_config()
    days = get_business_days(year, month, holidays)
    return {"month": month, "year": year, "business_days": days, "holidays": holidays}


@router.get("/report")
async def get_cico_report(month: int = 3):
    """Get T2 CICO report data for decision making."""
    if month < 3 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 3-12")
    data = get_cico_report_data(month)
    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])
    return data

@router.get("/monthly")
async def get_cico_monthly(month: int = 3):
    """Get all Tier2 student data for a monthly sheet (grid view)."""
    if month < 3 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 3-12")
    
    data = get_monthly_cico_data(month)
    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])
    return data


class CellUpdate(BaseModel):
    row: int
    col: int  # 1-based column index
    value: str


class BatchUpdateRequest(BaseModel):
    month: int
    updates: list[CellUpdate]


@router.post("/monthly/update")
async def update_cico_cells(req: BatchUpdateRequest):
    """Batch update daily cell values in a monthly sheet."""
    if req.month < 3 or req.month > 12:
        raise HTTPException(status_code=400, detail="Month must be 3-12")
    
    updates = [{"row": u.row, "col": u.col, "value": u.value} for u in req.updates]
    result = update_monthly_cico_cells(req.month, updates)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


class SettingsUpdateRequest(BaseModel):
    month: int
    student_code: str
    settings: dict  # key-value pairs like {"목표행동": "착석 유지", "목표행동 유형": "증가 목표행동"}


@router.post("/settings")
async def update_settings(req: SettingsUpdateRequest):
    """Update CICO settings for a student."""
    result = update_student_cico_settings(req.month, req.student_code, req.settings)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


class Tier2ToggleRequest(BaseModel):
    month: int
    student_code: str
    status: str  # "O" or "X"


@router.post("/tier2-toggle")
async def tier2_toggle(req: Tier2ToggleRequest):
    """Toggle Tier2 status for a student in a monthly sheet."""
    if req.status not in ("O", "X"):
        raise HTTPException(status_code=400, detail="Status must be 'O' or 'X'")
    
    result = toggle_tier2_status(req.month, req.student_code, req.status)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
