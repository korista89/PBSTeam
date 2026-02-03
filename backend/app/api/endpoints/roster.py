from fastapi import APIRouter, HTTPException
from app.services.sheets import fetch_all_records, fetch_student_codes, update_student_codes
from typing import List, Dict

router = APIRouter()

@router.get("")
async def get_roster():
    # ... existing roster logic ...
    # Simplified mock for now as we focus on codes
    return []

@router.get("/codes")
async def get_codes():
    mapping = fetch_student_codes()
    # Return as list of objects for frontend grid
    # We might want to merge with a generated list of all possible codes on frontend
    return mapping

@router.post("/codes")
async def save_codes(codes: List[Dict[str, str]]):
    result = update_student_codes(codes)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
