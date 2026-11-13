from fastapi import APIRouter, HTTPException, Depends
from app.adapters.sheets.resilience import SheetUnavailable
from app.services.sheets import (
    fetch_student_status, update_student_tier,
    update_student_enrollment, update_student_beable_code, get_enrolled_student_count, get_beable_code_mapping,
    update_student_tier_unified
)
from pydantic import BaseModel
from typing import Optional, Union, Dict, Any
from app.api.deps import require_authenticated_user, require_admin, check_student_scope, normalize_class_identifier

router = APIRouter()

# =============================
# Tier Status Endpoints
# =============================

class TierUpdateRequest(BaseModel):
    code: str
    tier1: Optional[str] = None  # O or X
    tier2_cico: Optional[str] = None  # O or X
    tier2_sst: Optional[str] = None  # O or X
    tier3: Optional[str] = None  # O or X
    tier3_plus: Optional[str] = None  # O or X
    memo: Optional[str] = ""

class UnifiedTierUpdateRequest(BaseModel):
    """Single request for all tier-related updates"""
    code: Union[str, int]
    student_name: Optional[str] = None
    tier1: Optional[str] = None
    tier2_cico: Optional[str] = None
    tier2_sst: Optional[str] = None
    tier3: Optional[str] = None
    tier3_plus: Optional[str] = None
    memo: Optional[str] = ""
    enrolled: Optional[str] = None
    beable_code: Optional[str] = None

    model_config = {"extra": "ignore"}

class EnrollmentUpdateRequest(BaseModel):
    code: Union[str, int]
    enrolled: str  # O or X

class BeAbleCodeUpdateRequest(BaseModel):
    code: Union[str, int]
    beable_code: str

@router.get("/status")
def get_all_status(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Get students' tier status scoped by user role and class"""
    status = fetch_student_status()
    role = str(current_user.get("role", "")).lower()

    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        from app.api.deps import get_student_class_code
        status = [
            s for s in status
            if get_student_class_code(str(s.get("학생코드") or s.get("Code") or s.get("학번") or "").strip()) == user_class
        ]
        enrolled_count = len([s for s in status if str(s.get("재학여부", s.get("재학상태", "O"))).strip() in ["O", "o", "재학", "True", "true"]])
    else:
        enrolled_count = get_enrolled_student_count()

    return {
        "students": status,
        "enrolled_count": enrolled_count,
        "total_count": len(status)
    }

@router.put("/status")
def update_tier(request: TierUpdateRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    """Update a student's tier status (5 separate O/X columns - Admin only)"""
    tier_values = {}
    if request.tier1 is not None:
        tier_values['Tier1'] = request.tier1
    if request.tier2_cico is not None:
        tier_values['Tier2(CICO)'] = request.tier2_cico
    if request.tier2_sst is not None:
        tier_values['Tier2(SST)'] = request.tier2_sst
    if request.tier3 is not None:
        tier_values['Tier3'] = request.tier3
    if request.tier3_plus is not None:
        tier_values['Tier3+'] = request.tier3_plus

    result = update_student_tier(request.code, tier_values, request.memo)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.put("/status/unified")
def update_tier_unified(req_data: UnifiedTierUpdateRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    """Unified update: tier + enrollment + beable in single API call (Admin only)"""
    try:
        # Ensure code is string
        str_code = str(req_data.code)

        tier_values = {}
        if req_data.tier1 is not None:
            tier_values['Tier1'] = req_data.tier1
        if req_data.tier2_cico is not None:
            tier_values['Tier2(CICO)'] = req_data.tier2_cico
        if req_data.tier2_sst is not None:
            tier_values['Tier2(SST)'] = req_data.tier2_sst
        if req_data.tier3 is not None:
            tier_values['Tier3'] = req_data.tier3
        if req_data.tier3_plus is not None:
            tier_values['Tier3+'] = req_data.tier3_plus

        result = update_student_tier_unified(
            code=str_code,
            tier_values=tier_values,
            enrolled=req_data.enrolled,
            beable_code=req_data.beable_code,
            memo=req_data.memo or "",
            student_name=req_data.student_name
        )
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except SheetUnavailable:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Validation Error: {str(e)}")

@router.put("/enrollment")
def update_enrollment(request: EnrollmentUpdateRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    """Update a student's enrollment status (O/X - Admin only)"""
    if request.enrolled not in ["O", "X"]:
        raise HTTPException(status_code=400, detail="Enrolled must be O or X")
    result = update_student_enrollment(str(request.code), request.enrolled)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.put("/beable")
def update_beable(request: BeAbleCodeUpdateRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    """Update a student's BeAble code for data linking (Admin only)"""
    result = update_student_beable_code(str(request.code), request.beable_code)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.get("/beable-mapping")
def get_beable_mapping(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Get BeAble code to student code mapping for data analysis"""
    mapping = get_beable_code_mapping()
    return mapping




# =============================
# 인수인계 자료 연결 (학생코드 ↔ 인수인계 가명ID)
# =============================
# 이전 학년도 기록(비식별 인수인계 파일)은 사이트에 올리지 않고 브라우저에서만 읽는다.
# 사이트에는 "이 학생 = 인수인계 파일의 P○○○○○○" 연결표(학생코드, 인수인계ID)만 숨김 탭에 둔다.
import re as _re

HANDOVER_TAB = "인수인계_연결"
_HANDOVER_ID = _re.compile(r"^P[A-Z]{6}$")


def _handover_ws(create: bool = False):
    from app.services.sheets import get_main_worksheet
    ws = get_main_worksheet()
    if ws is None:
        raise HTTPException(status_code=503, detail="시트에 연결할 수 없습니다.")
    sh = ws.spreadsheet
    try:
        return sh.worksheet(HANDOVER_TAB)
    except Exception:
        if not create:
            return None
        new = sh.add_worksheet(HANDOVER_TAB, rows=500, cols=3)
        new.update(range_name="A1", values=[["학생코드", "인수인계ID", "연결일"]], value_input_option="RAW")
        try:
            new.hide()
        except Exception:
            pass
        return new


@router.get("/handover-links")
def get_handover_links(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """{학생코드: 인수인계ID}. 교사는 자기 학급 학생 것만 받는다."""
    ws = _handover_ws()
    links: Dict[str, str] = {}
    for r in (ws.get_all_values()[1:] if ws else []):
        if len(r) >= 2 and r[0] and r[1]:
            try:
                check_student_scope(str(r[0]), current_user)
            except HTTPException:
                continue
            links[str(r[0])] = r[1]
    return {"links": links}


class HandoverLinkRequest(BaseModel):
    code: Union[str, int]
    handover_id: str = ""  # 비우면 연결 해제


@router.put("/handover-links")
def put_handover_link(req: HandoverLinkRequest, current_user: Dict[str, Any] = Depends(require_admin)):
    from datetime import datetime, timezone, timedelta
    code, hid = str(req.code).strip(), req.handover_id.strip()
    if hid and not _HANDOVER_ID.match(hid):
        raise HTTPException(status_code=400, detail="인수인계ID 형식이 올바르지 않습니다(예: PABCDEF).")
    if not any(str(s.get("학생코드", "")).strip() == code for s in fetch_student_status()):
        raise HTTPException(status_code=404, detail="학생코드를 찾을 수 없습니다.")
    ws = _handover_ws(create=bool(hid))
    if ws is None:
        return {"ok": True}
    rows = ws.get_all_values()
    hit = next((i + 1 for i, r in enumerate(rows) if i > 0 and r and r[0] == code), None)
    if not hid:
        if hit:
            ws.delete_rows(hit)
        return {"ok": True}
    today = (datetime.now(timezone.utc) + timedelta(hours=9)).strftime("%Y-%m-%d")
    if hit:
        ws.update(range_name=f"A{hit}", values=[[code, hid, today]], value_input_option="RAW")
    else:
        ws.append_row([code, hid, today], value_input_option="RAW")
    return {"ok": True}
