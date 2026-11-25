"""2027 완전 비식별 모드: 보호자 동의 관리, 학급별 매핑 CSV, 원스톱 초기화 마법사.

마법사의 쓰기 작업(비밀번호 일괄 초기화·졸업생 파기·익명코드 이관)은 PRIVACY_MODE=2027_FULL_ZERO_PII 에서만,
계정 관리자만, 확인 문구를 입력해야 실행된다. 확인 문구 없이 부르면 바뀔 양만 알려 준다(점검).
"""
import csv
import io
import secrets
from typing import Any, Dict, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.api.deps import require_account_admin, require_authenticated_user, user_scope, in_scope
from app.core.config import settings
from app.core.time import now_kst
from app.services import zero_pii as Z

router = APIRouter()


@router.get("/mode")
def privacy_mode():
    """로그인 전 화면(공용 PC 모드 칸 등)이 쓰는 현재 단계."""
    return {"privacy_mode": settings.PRIVACY_MODE}


def _require_2027():
    if not Z.zero_pii_on():
        raise HTTPException(status_code=409, detail="2027 완전 비식별 모드(PRIVACY_MODE=2027_FULL_ZERO_PII)에서만 실행합니다.")


# ── 보호자 동의 ──────────────────────────────────────────
@router.get("/consent")
def list_consent(current_user: Dict[str, Any] = Depends(require_account_admin)):
    from app.services.sheets import fetch_student_status
    cm = Z.consent_map()
    rows = []
    for s in fetch_student_status():
        code = str(s.get("학생코드", "")).strip()
        if not code or str(s.get("재학여부", "")).strip().upper() == "X":
            continue
        c = cm.get(code, {})
        rows.append({"code": code, "class": s.get("학급", ""), "label": s.get("학생이름", ""),
                     "state": c.get("동의상태", ""), "date": c.get("동의일", ""), "until": c.get("보관기한", "")})
    return {"rows": rows, "excluded_now": sorted(Z.excluded_codes())}


class ConsentIn(BaseModel):
    state: str
    date: str = ""
    until: str = ""


@router.put("/consent/{code}")
def put_consent(code: str, req: ConsentIn, current_user: Dict[str, Any] = Depends(require_account_admin)):
    try:
        return Z.set_consent(code, req.state, req.date, req.until, current_user.get("sub", ""))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 학급별 실명 매핑 CSV(이름 칸은 비워서 준다. 담임이 오프라인에서 채워 브라우저에 등록) ──
@router.get("/class-map.csv")
def class_map_csv(class_id: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    from app.services.sheets import fetch_student_status
    scope = user_scope(current_user)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["student_code", "익명코드", "학급", "student_name"])
    for s in fetch_student_status():
        cls = s.get("학급", "")
        if str(s.get("재학여부", "")).strip().upper() == "X" or not in_scope(cls, scope):
            continue
        if class_id and not in_scope(cls, class_id):
            continue
        w.writerow([s.get("학생코드", ""), s.get("학생이름", ""), cls, ""])
    name = f"실명매핑_{class_id or '전체'}_{now_kst().strftime('%Y%m%d')}.csv"
    return Response(content="﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})


# ── 원스톱 초기화 마법사 ─────────────────────────────────
class WizardIn(BaseModel):
    confirm: str = ""  # 비우면 점검만


@router.post("/wizard/reset-passwords")
def wizard_reset_passwords(req: WizardIn, current_user: Dict[str, Any] = Depends(require_account_admin)):
    """① 사용 중인 전 계정(본인 제외) 비밀번호를 무작위로 바꾸고 배부표를 이번 응답에만 준다."""
    _require_2027()
    from app.services.sheets import get_all_users, update_user_passwords_bulk
    users = [u for u in get_all_users()
             if str(u.get("Active", "true")).strip().lower() not in ("false", "0", "inactive", "x", "no")
             and str(u.get("ID")) != current_user.get("sub")]
    if req.confirm != "초기화":
        return {"preview": True, "accounts": len(users)}
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    temps = {str(u["ID"]): "".join(secrets.choice(alphabet) for _ in range(8)) for u in users}
    done = update_user_passwords_bulk(temps)
    return {"preview": False, "table": [{"id": i, "temp_password": temps[i]} for i in done]}


@router.post("/wizard/purge-graduates")
def wizard_purge(req: WizardIn, current_user: Dict[str, Any] = Depends(require_account_admin)):
    """② 졸업·전출생(재학여부 X) 서술 기록 파기. 날짜·유형·강도 등 익명 통계 칸은 남긴다."""
    _require_2027()
    return Z.purge_graduates(apply=req.confirm == "파기")


@router.post("/wizard/anon-codes")
def wizard_anon_codes(req: WizardIn, current_user: Dict[str, Any] = Depends(require_account_admin)):
    """③ 재학생 표기를 익명코드로 이관. 실행하면 대응표(익명코드→이전 표기)를 한 번만 내려준다."""
    _require_2027()
    res = Z.migrate_to_anon(apply=req.confirm == "이관")
    if req.confirm != "이관":
        res.pop("code_map", None)
    return res


class RollbackIn(BaseModel):
    code_map: Dict[str, str]
    confirm: str = ""


@router.post("/wizard/anon-codes/rollback")
def wizard_anon_rollback(req: RollbackIn, current_user: Dict[str, Any] = Depends(require_account_admin)):
    """익명코드 이관 되돌리기(이관 때 내려받은 대응표 파일을 올린다)."""
    if req.confirm != "되돌리기":
        return {"preview": True, "codes": len(req.code_map)}
    try:
        return Z.rollback_anon(req.code_map)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
