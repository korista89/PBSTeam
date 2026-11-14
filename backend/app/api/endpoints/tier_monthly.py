from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_student_class_code, normalize_class_identifier, require_admin, require_authenticated_user
from app.services import tier_monthly as tm

router = APIRouter()


class StudentIn(BaseModel):
    month: int
    code: str
    cico: Optional[bool] = None
    t3: Optional[str] = None  # "" | "Tier3" | "Tier3+"


class MonthIn(BaseModel):
    month: int


def _month(m: int):
    if m < 1 or m > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")


def _ok(result: Dict[str, Any]):
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/overview")
def get_overview(month: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """그 달 전교생 Tier(CICO·SST·Tier3는 월별 표, 나머지는 TierStatus). 교사는 자기 학급만."""
    _month(month)
    data = tm.overview(month)
    if str(current_user.get("role", "")).lower() not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        data["students"] = [s for s in data["students"] if get_student_class_code(str(s["학생코드"])) == user_class]
    return data


@router.post("/student")
def post_student(req: StudentIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(req.month)
    return _ok(tm.set_student(req.month, req.code, req.cico, req.t3))


@router.post("/start")
def post_start(req: MonthIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(req.month)
    return _ok(tm.start_month(req.month))


@router.get("/mirror")
def get_mirror(current_admin: Dict[str, Any] = Depends(require_admin)):
    """이번 달 월별 표와 TierStatus(지금)가 다른 칸."""
    return {"month": tm.current_month(), "diff": tm.mirror_diff()}


@router.post("/mirror")
def post_mirror(current_admin: Dict[str, Any] = Depends(require_admin)):
    """다른 칸을 모두 이번 달 월별 표에 맞춘다."""
    return tm.apply_mirror()
