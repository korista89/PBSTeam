from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_student_class_code, normalize_class_identifier, require_admin, require_authenticated_user
from app.services import tier3plus as t3p

router = APIRouter()


class ProgramIn(BaseModel):
    name: str
    type: str = ""
    start: int
    end: int
    targets: List[str]
    skills: str = ""      # 목표
    staff: str = ""
    memo: str = ""
    agency: str = ""      # 연계기관


def _mine(current_user: Dict[str, Any]):
    if str(current_user.get("role", "")).lower() in ["admin", "superadmin"]:
        return None
    user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
    return lambda code: get_student_class_code(str(code).strip()) == user_class


def _ok(result: Dict[str, Any]):
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/programs")
def get_programs(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """이 학년도 Tier3+ 개별 프로그램. 교사는 자기 학급 학생 프로그램만."""
    mine = _mine(current_user)
    programs = [p for p in t3p.BOOK.list_programs() if not mine or any(mine(c) for c in p["targets"])]
    return {"programs": programs, "max": t3p.MAX_PROGRAMS, "types": t3p.TYPES}


@router.get("/summary")
def get_summary(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    mine = _mine(current_user)
    allowed = {c for p in t3p.BOOK.list_programs() for c in p["targets"] if mine(c)} if mine else None
    return {"programs": t3p.BOOK.summaries(allowed)}


@router.get("/level-check")
def get_level_check(month: int, current_admin: Dict[str, Any] = Depends(require_admin)):
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")
    return {"month": month, "items": t3p.level_check(month)}


@router.post("/programs")
def create_program(req: ProgramIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    return _ok(t3p.BOOK.save_program(req.model_dump()))


@router.put("/programs/{program_id}")
def update_program(program_id: int, req: ProgramIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    return _ok(t3p.BOOK.save_program(req.model_dump(), program_id))


@router.delete("/programs/{program_id}")
def remove_program(program_id: int, current_admin: Dict[str, Any] = Depends(require_admin)):
    return _ok(t3p.BOOK.delete_program(program_id))


@router.get("/programs/{program_id}/monitor")
def monitor(program_id: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    mine = _mine(current_user)
    if mine:
        p = next((x for x in t3p.BOOK.list_programs() if x["id"] == program_id), None)
        if not p or not any(mine(c) for c in p["targets"]):
            raise HTTPException(status_code=403, detail="우리 반 학생 프로그램이 아닙니다.")
    return _ok(t3p.BOOK.monitor_program(program_id))
