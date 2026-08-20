# backend/app/api/endpoints/class_rules.py
"""학급 규칙(학교 기대행동 연계) + 학교차원 토큰경제(토큰 10개=1000원 교환) API"""

import json
import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.api.deps import require_authenticated_user, normalize_class_identifier

router = APIRouter()

_CATALOG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "expected_behaviors.json")
_catalog_cache: Optional[dict] = None


def _load_catalog() -> dict:
    global _catalog_cache
    if _catalog_cache is None:
        with open(_CATALOG_PATH, "r", encoding="utf-8") as f:
            _catalog_cache = json.load(f)
    return _catalog_cache


def _check_class_scope(class_id: str, current_user: Dict[str, Any]) -> str:
    """Non-admins may only act on their own class. Returns the normalized class_id."""
    clean = normalize_class_identifier(class_id)
    role = str(current_user.get("role", "")).lower()
    if role in ["admin", "superadmin"]:
        return clean
    user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
    if not user_class or clean != user_class:
        raise HTTPException(status_code=403, detail="본인 학급만 접근할 수 있습니다.")
    return clean


@router.get("/catalog")
async def get_expected_behaviors_catalog(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """학교 기대행동 15개 (스스로/바르게/안전하게 각 5개)"""
    return _load_catalog()


@router.get("/{class_id}")
async def get_rules(class_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    clean = _check_class_scope(class_id, current_user)
    from app.services.sheets import get_class_rules
    return {"class_id": clean, "rules": get_class_rules(clean)}


class ClassRuleItem(BaseModel):
    category: str  # 스스로 | 바르게 | 안전하게
    text: str
    source_id: Optional[int] = None


class SaveClassRulesRequest(BaseModel):
    rules: List[ClassRuleItem]


@router.post("/{class_id}")
async def save_rules(
    class_id: str,
    req: SaveClassRulesRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    clean = _check_class_scope(class_id, current_user)
    catalog_categories = {b["category"] for b in _load_catalog()["behaviors"]}
    seen = set()
    for r in req.rules:
        if r.category not in catalog_categories:
            raise HTTPException(status_code=400, detail=f"알 수 없는 카테고리: {r.category}")
        if r.category in seen:
            raise HTTPException(status_code=400, detail="카테고리(스스로/바르게/안전하게)당 규칙은 1개만 설정할 수 있습니다.")
        seen.add(r.category)

    from app.services.sheets import save_class_rules
    author = current_user.get("name") or current_user.get("id") or ""
    result = save_class_rules(clean, [r.dict() for r in req.rules], author)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/{class_id}/tokens")
async def get_tokens(class_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    clean = _check_class_scope(class_id, current_user)
    from app.services.sheets import get_token_board, fetch_student_status

    board_by_code = {str(r.get("StudentCode", "")).strip(): r for r in get_token_board(clean)}
    roster = []
    for s in fetch_student_status():
        code = str(s.get("학생코드", "")).strip()
        if not code:
            continue
        if normalize_class_identifier(s.get("학급", "")) != clean:
            continue
        board = board_by_code.get(code)
        roster.append({
            "student_code": code,
            "name": s.get("학생이름", s.get("학생명", "")),
            "token_count": int(board.get("TokenCount", 0) or 0) if board else 0,
            "exchanged_count": int(board.get("ExchangedCount", 0) or 0) if board else 0,
        })
    return {"class_id": clean, "students": roster}


class AwardTokenRequest(BaseModel):
    student_code: str
    category: str
    delta: int = 1


@router.post("/{class_id}/tokens/award")
async def award(
    class_id: str,
    req: AwardTokenRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    clean = _check_class_scope(class_id, current_user)
    from app.services.sheets import award_token
    author = current_user.get("name") or current_user.get("id") or ""
    result = award_token(req.student_code, clean, req.category, req.delta, author)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/{class_id}/tokens/log")
async def get_tokens_log(
    class_id: str,
    student_code: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    clean = _check_class_scope(class_id, current_user)
    from app.services.sheets import get_token_log
    return {"log": get_token_log(class_id=clean, student_code=student_code)}
