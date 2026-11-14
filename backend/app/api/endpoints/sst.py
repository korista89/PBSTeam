from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_student_class_code, normalize_class_identifier, require_admin, require_authenticated_user
from app.services import sst

router = APIRouter()


class ProgramIn(BaseModel):
    name: str
    type: str = ""
    start: int
    end: int
    targets: List[str]
    skills: str = ""
    staff: str = ""
    memo: str = ""


def _scope(current_user: Dict[str, Any]):
    """관리자는 None(전체), 교사는 자기 학급 코드 판별 함수."""
    if str(current_user.get("role", "")).lower() in ["admin", "superadmin"]:
        return None
    user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
    return lambda code: get_student_class_code(str(code).strip()) == user_class


def _targets_of(program_id: int) -> List[str]:
    return next((p["targets"] for p in sst.list_programs() if p["id"] == program_id), [])


def _mirror(result: Dict[str, Any], codes: List[str]):
    """프로그램이 바뀐 학생만 이번 달 TierStatus Tier2(SST) 칸을 맞춘다."""
    from app.services.tier_monthly import mirror_after_change, current_month, SST_COLS
    result["mirror"] = mirror_after_change(current_month(), set(codes), SST_COLS)
    return result


def _raise(result: Dict[str, Any]):
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/programs")
def get_programs(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """이 학년도 SST 프로그램. 교사는 자기 학급 학생이 든 프로그램만, 대상도 자기 학급만."""
    mine = _scope(current_user)
    programs = sst.list_programs()
    if mine:
        programs = [{**p, "targets": [c for c in p["targets"] if mine(c)]} for p in programs]
        programs = [p for p in programs if p["targets"]]
    return {"programs": programs, "max": sst.MAX_PROGRAMS, "types": sst.TYPES}


@router.post("/programs")
def create_program(req: ProgramIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    return _mirror(_raise(sst.save_program(req.model_dump())), req.targets)


@router.put("/programs/{program_id}")
def update_program(program_id: int, req: ProgramIn, current_admin: Dict[str, Any] = Depends(require_admin)):
    before = _targets_of(program_id)
    return _mirror(_raise(sst.save_program(req.model_dump(), program_id)), before + req.targets)


@router.delete("/programs/{program_id}")
def remove_program(program_id: int, current_admin: Dict[str, Any] = Depends(require_admin)):
    before = _targets_of(program_id)
    return _mirror(_raise(sst.delete_program(program_id)), before)


@router.get("/programs/{program_id}/monitor")
def monitor(program_id: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    mine = _scope(current_user)
    allowed: Optional[set] = None
    if mine:
        p = next((x for x in sst.list_programs() if x["id"] == program_id), None)
        allowed = {c for c in (p or {}).get("targets", []) if mine(c)}
        if not allowed:
            raise HTTPException(status_code=403, detail="우리 반 학생이 없는 프로그램입니다.")
    return _raise(sst.monitor_program(program_id, allowed))

