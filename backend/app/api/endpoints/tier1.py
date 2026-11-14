from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_student_class_code, normalize_class_identifier, require_admin, require_authenticated_user
from app.services import tier1

router = APIRouter()


class ProgramIn(BaseModel):
    name: str
    type: str = ""
    start: int
    end: int
    scope: str = "전교"
    scope_values: List[str] = []
    behaviors: List[str] = []
    places: List[str] = []
    goal_pct: Optional[float] = None
    content: str = ""
    staff: str = ""
    memo: str = ""


def _allowed(current_user: Dict[str, Any]) -> Optional[set]:
    """관리자는 None(전교), 교사는 자기 학급 학생코드."""
    if str(current_user.get("role", "")).lower() in ["admin", "superadmin"]:
        return None
    user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
    return {c for c in tier1._enrolled() if get_student_class_code(c) == user_class}


def _ok(result: Dict[str, Any]):
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/programs")
def get_programs(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return {"programs": tier1.list_programs(), "options": tier1.options()}


@router.get("/summary")
def get_summary(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return {"programs": tier1.summaries(_allowed(current_user))}


@router.get("/annual")
def get_annual(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return tier1.annual(_allowed(current_user))


@router.post("/programs")
def create_program(req: ProgramIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    return _ok(tier1.save_program(req.model_dump()))


@router.put("/programs/{program_id}")
def update_program(program_id: int, req: ProgramIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    return _ok(tier1.save_program(req.model_dump(), program_id))


@router.delete("/programs/{program_id}")
def remove_program(program_id: int, current_admin: Dict[str, Any] = Depends(require_admin)):
    return _ok(tier1.delete_program(program_id))


@router.get("/programs/{program_id}/monitor")
def monitor(program_id: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return _ok(tier1.monitor_program(program_id, _allowed(current_user)))
