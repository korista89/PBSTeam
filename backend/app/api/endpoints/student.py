from fastapi import APIRouter, HTTPException
from app.services.analysis import get_student_analytics
from typing import Optional

router = APIRouter()

@router.get("/{student_name}")
async def get_student_detail(student_name: str):
    data = get_student_analytics(student_name)
    if "error" in data:
        # If student not found, 404
        if data["error"] == "Student not found":
            raise HTTPException(status_code=404, detail="Student not found")
        raise HTTPException(status_code=500, detail=data["error"])
    return data

@router.get("/{student_code}/analysis")
async def get_student_dashboard_analysis_api(student_code: str):
    from app.services.sheets import get_student_dashboard_analysis
    data = get_student_dashboard_analysis(student_code)
    if "error" in data:
         raise HTTPException(status_code=500, detail=data["error"])
    return data
