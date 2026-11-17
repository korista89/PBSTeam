from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import is_admin_user, require_authenticated_user
from app.services import afterschool as svc

router = APIRouter()


def _require_afterschool(user: Dict[str, Any] = Depends(require_authenticated_user)) -> Dict[str, Any]:
    if not is_admin_user(user) and str(user.get("role", "")).lower() != "afterschool":
        raise HTTPException(status_code=403, detail="늘봄실장·관리자만 쓸 수 있습니다.")
    return user


class ParticipantsIn(BaseModel):
    codes: List[str]


@router.get("/participants")
def get_participants(user: Dict[str, Any] = Depends(_require_afterschool)):
    """늘봄 참여 학생 명단과, 명단에 넣을 수 있는 재학생 목록(별칭)."""
    from app.adapters.sheets.tier_status import TierStatusAdapter
    from app.core.privacy import mask_name
    roster = [{"code": s.student_code, "name": mask_name(s.display_name), "class": s.class_name}
              for s in TierStatusAdapter.fetch_students() if s.enrolled]
    return {"participants": svc.participants(), "roster": roster, "slot": svc.SLOT}


@router.put("/participants")
def put_participants(req: ParticipantsIn, user: Dict[str, Any] = Depends(_require_afterschool)):
    return svc.save_participants(req.codes, str(user.get("name") or user.get("id")))
