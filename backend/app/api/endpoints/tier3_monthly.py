from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_student_class_code, normalize_class_identifier, require_admin, require_authenticated_user
from app.services import tier3_monthly as t3

router = APIRouter()


class MonthIn(BaseModel):
    month: int


class AddIn(BaseModel):
    month: int
    code: str
    level: str = "Tier3"


class RowIn(BaseModel):
    month: int
    row: int
    level: Optional[str] = None
    memo: Optional[str] = None
    excluded: Optional[bool] = None


class SyncIn(BaseModel):
    code: str
    level: str  # "Tier3" | "Tier3+" | ""


def _month(m: int):
    if m < 1 or m > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")


def _ok(result: Dict[str, Any]):
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/overview")
def get_overview(month: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """이 달 Tier3 명단과 대시보드 자료. 교사는 자기 학급만."""
    _month(month)
    data = t3.overview(month)
    if str(current_user.get("role", "")).lower() not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        mine = lambda c: get_student_class_code(str(c).strip()) == user_class  # noqa: E731
        data["rows"] = [r for r in data["rows"] if mine(r["code"])]
        data["history"] = {m: {c: v for c, v in h.items() if mine(c)} for m, h in data["history"].items()}
        data["names"] = {c: v for c, v in data["names"].items() if mine(c)}
    return data


@router.post("/fill")
def post_fill(req: MonthIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(req.month)
    return _ok(t3.fill_from_tierstatus(req.month))


@router.post("/copy-prev")
def post_copy_prev(req: MonthIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(req.month)
    return _ok(t3.copy_prev(req.month))


@router.post("/students")
def post_student(req: AddIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(req.month)
    return _ok(t3.add_student(req.month, req.code, req.level))


@router.post("/row")
def post_row(req: RowIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(req.month)
    return _ok(t3.update_row(req.month, req.row, req.level, req.memo, req.excluded))


@router.get("/tier-sync")
def get_sync(month: int, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(month)
    return t3.tier_sync_status(month)


@router.post("/tier-sync")
def post_sync(req: SyncIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    return _ok(t3.apply_to_tierstatus(req.code, req.level))
