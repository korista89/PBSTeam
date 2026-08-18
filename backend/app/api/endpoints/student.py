from fastapi import APIRouter, HTTPException, Query, Depends
from app.services.analysis import get_student_analytics
from typing import Optional, Dict, Any
from pydantic import BaseModel
from app.api.deps import require_authenticated_user, require_admin, check_student_scope

router = APIRouter()

class TierUpdateRequest(BaseModel):
    student_code: str
    tier: str

@router.post("/tier-update")
async def update_tier(req: TierUpdateRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    from app.services.sheets import update_student_tier
    result = update_student_tier(req.student_code, req.tier)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.get("/{student_name}")
async def get_student_detail(
    student_name: str,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(student_name, current_user)
    data = get_student_analytics(student_name, start_date=start_date, end_date=end_date)
    if "error" in data:
        if data["error"] == "Student not found":
            raise HTTPException(status_code=404, detail="Student not found")
        raise HTTPException(status_code=500, detail=data["error"])
    return data

@router.get("/{student_code}/analysis")
async def get_student_dashboard_analysis_api(
    student_code: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(student_code, current_user)
    from app.services.sheets import get_student_dashboard_analysis
    data = get_student_dashboard_analysis(student_code)
    if "error" in data:
         if "not found" in data["error"]:
             raise HTTPException(status_code=404, detail="Student analysis data not found")
         raise HTTPException(status_code=500, detail=data["error"])
    return data
