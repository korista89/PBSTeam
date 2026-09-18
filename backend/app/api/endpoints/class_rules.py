# backend/app/api/endpoints/class_rules.py
"""학급 기대행동(학교 기대행동 15개 중 1개) + 토큰경제(100원 토큰 10개=1000원, 최대 5장 보관·사용) API"""

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


def _find_behavior(source_id) -> Optional[dict]:
    try:
        sid = int(source_id)
    except (TypeError, ValueError):
        return None
    return next((b for b in _load_catalog()["behaviors"] if b["id"] == sid), None)


@router.get("/catalog")
def get_expected_behaviors_catalog(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """학교 기대행동 15개 (장소 5곳 × 스스로/바르게/안전하게, 게시물 삽화 포함)"""
    return _load_catalog()


@router.get("/{class_id}")
def get_rules(class_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """학급 기대행동(1개). 예전 카탈로그 번호로 저장된 규칙은 rule=None 으로 돌려 다시 고르게 한다."""
    clean = _check_class_scope(class_id, current_user)
    from app.services.sheets import get_class_rules
    rows = get_class_rules(clean)
    rule = next((b for b in (_find_behavior(r.get("SourceId")) for r in rows) if b), None)
    return {"class_id": clean, "rule": rule, "rules": rows}


class SetClassRuleRequest(BaseModel):
    source_id: int


@router.post("/{class_id}")
def save_rule(
    class_id: str,
    req: SetClassRuleRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """학급 기대행동은 학교 기대행동 15개 중 1개만 설정한다."""
    clean = _check_class_scope(class_id, current_user)
    behavior = _find_behavior(req.source_id)
    if not behavior:
        raise HTTPException(status_code=400, detail="학교 기대행동 목록에서 1개를 선택해 주세요.")

    from app.services.sheets import save_class_rules
    author = current_user.get("name") or current_user.get("id") or ""
    text = f"[{behavior['place']}] {behavior['label']} {behavior['text']}"
    result = save_class_rules(clean, [{"category": behavior["category"], "text": text, "source_id": behavior["id"]}], author)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {**result, "rule": behavior}


@router.get("/{class_id}/tokens")
def get_tokens(class_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    clean = _check_class_scope(class_id, current_user)
    from app.services.sheets import get_token_board, fetch_student_status, parse_token_board_row

    board_by_code = {str(r.get("StudentCode", "")).strip(): r for r in get_token_board(clean)}
    roster = []
    for s in fetch_student_status():
        code = str(s.get("학생코드", "")).strip()
        if not code:
            continue
        if normalize_class_identifier(s.get("학급", "")) != clean:
            continue
        roster.append({
            "student_code": code,
            "name": s.get("학생이름", s.get("학생명", "")),
            **parse_token_board_row(board_by_code.get(code) or {}),
        })
    return {"class_id": clean, "students": roster}


def _raise_on_error(result: dict) -> dict:
    if "error" in result:
        raise HTTPException(status_code=result.get("status", 500), detail=result["error"])
    return result


class AwardTokenRequest(BaseModel):
    student_code: str
    category: str
    delta: int = 1


@router.post("/{class_id}/tokens/award")
def award(
    class_id: str,
    req: AwardTokenRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    clean = _check_class_scope(class_id, current_user)
    if req.delta not in (1, -1):
        raise HTTPException(status_code=400, detail="토큰은 한 번에 1개씩 지급·정정합니다.")
    from app.services.sheets import award_token
    author = current_user.get("name") or current_user.get("id") or ""
    return _raise_on_error(award_token(req.student_code, clean, req.category, req.delta, author))


class UseBillRequest(BaseModel):
    student_code: str
    index: int = 0  # 몇 번째 1000원을 쓸지(지갑 표시 순서)


@router.post("/{class_id}/tokens/use")
def use(
    class_id: str,
    req: UseBillRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """1000원 1장 사용 → 보관 장수 -1, 누적 사용 +1,000원"""
    clean = _check_class_scope(class_id, current_user)
    from app.services.sheets import use_bill
    author = current_user.get("name") or current_user.get("id") or ""
    return _raise_on_error(use_bill(req.student_code, clean, author, req.index))


class WishRequest(BaseModel):
    student_code: str
    wish: str = ""


@router.post("/{class_id}/tokens/wish")
def set_wish(
    class_id: str,
    req: WishRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """토큰판 '내가 원하는 것은' 칸"""
    clean = _check_class_scope(class_id, current_user)
    from app.services.sheets import set_token_wish
    return _raise_on_error(set_token_wish(req.student_code, clean, req.wish))


@router.get("/{class_id}/tokens/log")
def get_tokens_log(
    class_id: str,
    student_code: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    clean = _check_class_scope(class_id, current_user)
    from app.services.sheets import get_token_log
    return {"log": get_token_log(class_id=clean, student_code=student_code)}
