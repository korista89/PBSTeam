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


# ── 보편적 지원 운영: 기대행동·교수 기록·토큰 집계·실행충실도·대시보드 ─────────────
class TeachIn(BaseModel):
    week: str
    class_name: str
    done: bool
    rule: str = ""
    strategies: List[str] = []
    memo: str = ""


class TokenIn(BaseModel):
    month: int
    class_name: str
    bills: int
    stage: str = ""
    memo: str = ""


class FidelityIn(BaseModel):
    semester: int
    class_name: str
    scores: List[int]
    memo: str = ""


def _class_names(current_user: Dict[str, Any]) -> List[str]:
    return [c["class"] for c in tier1.classes(_allowed(current_user))]


def _own_class(cls: str, current_user: Dict[str, Any]):
    if cls not in _class_names(current_user):
        raise HTTPException(status_code=403, detail="본인 학급만 입력할 수 있습니다.")


def _who(u: Dict[str, Any]) -> str:
    return str(u.get("name") or u.get("id") or "")


@router.get("/plan")
def get_plan(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """운영계획 고정 자료 + 학교 기대행동 15개(게시물 삽화)."""
    from app.api.endpoints.class_rules import _load_catalog
    return {**tier1.plan(), "behaviors": _load_catalog()["behaviors"], "places": _load_catalog()["places"],
            "categories": _load_catalog()["categories"]}


@router.get("/classes")
def get_classes(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return {"classes": tier1.classes(_allowed(current_user))}


@router.get("/teaching")
def get_teaching(month: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return tier1.teaching(month, _class_names(current_user))


@router.post("/teaching")
def post_teaching(req: TeachIn, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _own_class(req.class_name, current_user)
    return _ok(tier1.save_teaching(req.week, req.class_name, req.done, req.rule, req.strategies, req.memo, _who(current_user)))


@router.get("/tokens")
def get_tokens(month: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return tier1.tokens(month, tier1.classes(_allowed(current_user)))


@router.post("/tokens")
def post_tokens(req: TokenIn, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _own_class(req.class_name, current_user)
    return _ok(tier1.save_tokens(req.month, req.class_name, req.bills, req.stage, req.memo, _who(current_user)))


@router.get("/fidelity")
def get_fidelity(semester: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return tier1.fidelity(semester, _class_names(current_user))


@router.post("/fidelity")
def post_fidelity(req: FidelityIn, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """담임 자체점검 또는 행동중재지원팀 점검."""
    _own_class(req.class_name, current_user)
    return _ok(tier1.save_fidelity(req.semester, req.class_name, req.scores, req.memo, _who(current_user)))


@router.get("/dashboard")
def get_dashboard(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return tier1.dashboard(_allowed(current_user))
