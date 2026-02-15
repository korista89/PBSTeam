from fastapi import APIRouter, HTTPException, Query
from app.services.analysis import get_student_analytics
from typing import Optional

router = APIRouter()

@router.get("/{student_name}")
async def get_student_detail(
    student_name: str,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    data = get_student_analytics(student_name, start_date=start_date, end_date=end_date)
    if "error" in data:
        if data["error"] == "Student not found":
            raise HTTPException(status_code=404, detail="Student not found")
        raise HTTPException(status_code=500, detail=data["error"])
    return data

@router.get("/{student_code}/analysis")
async def get_student_dashboard_analysis_api(student_code: str):
    from app.services.sheets import get_student_dashboard_analysis
    data = get_student_dashboard_analysis(student_code)
    if "error" in data:
         # If student not found in dashboard, return 404 but maybe with empty structure to avoid frontend crash?
         # Or just 404 is fine if frontend handles it.
         if "not found" in data["error"]:
             raise HTTPException(status_code=404, detail="Student analysis data not found")
         raise HTTPException(status_code=500, detail=data["error"])
    return data
