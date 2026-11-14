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


def _month(m: int):
    if m < 1 or m > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")


def _ok(result: Dict[str, Any], month: Optional[int] = None, codes=()):
    """성공하면 이번 달 TierStatus Tier3·Tier3+ 칸을 그 학생들만 맞춘다(전교생 차이는 Tier현황의 '모두 반영'으로만)."""
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    if month is not None:
        from app.services.tier_monthly import mirror_after_change, T3_COLS
        result["mirror"] = mirror_after_change(month, codes, T3_COLS)
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
    res = t3.fill_from_tierstatus(req.month)
    return _ok(res, req.month, res.get("codes", []))


@router.post("/copy-prev")
def post_copy_prev(req: MonthIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(req.month)
    res = t3.copy_prev(req.month)
    return _ok(res, req.month, res.get("codes", []))


@router.post("/students")
def post_student(req: AddIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(req.month)
    return _ok(t3.add_student(req.month, req.code, req.level), req.month, [req.code])


@router.post("/row")
def post_row(req: RowIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    _month(req.month)
    res = t3.update_row(req.month, req.row, req.level, req.memo, req.excluded)
    return _ok(res, req.month if req.memo is None else None, [res.get("code", "")])

