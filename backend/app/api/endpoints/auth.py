from fastapi import APIRouter, HTTPException, Request, Response, Depends, status
from typing import Optional, Dict, Any
from pydantic import BaseModel
from app.services.sheets import get_user_by_id, UserStoreUnavailable, update_user_password, update_user_password_cas, get_all_users
from app.core.security import (
    verify_password_compat, create_access_token, set_session_cookie,
    delete_session_cookie
)
from app.api.deps import require_authenticated_user
from app.core import login_throttle

router = APIRouter()

class LoginRequest(BaseModel):
    user_id: str
    password: str

class PasswordUpdateRequest(BaseModel):
    user_id: str
    new_password: str

def _log(action: str, user_id: str, role: str, http: Optional[Request], student: str = "", reason: str = "", path: str = ""):
    """감사로그 한 줄. 기록 실패가 로그인·인쇄를 막지 않는다."""
    try:
        from app.services import access_log
        from app.main import _client_ip
        ip = _client_ip(http) if http is not None else ""
        access_log.record(user_id, role, action, student, reason, ip, path)
        access_log.flush()
    except Exception:
        pass


@router.post("/login")
def login(request: LoginRequest, response: Response, http: Request):
    wait = login_throttle.retry_after(request.user_id)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"로그인에 여러 번 실패해 잠시 막았습니다. {(wait + 59) // 60}분 뒤에 다시 시도해 주세요.",
            headers={"Retry-After": str(wait)},
        )
    try:
        user = get_user_by_id(request.user_id, strict=True) if request.user_id else None
    except UserStoreUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="사용자 정보를 일시적으로 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
            headers={"Retry-After": "5"},
        )

    stored_pw = str(user.get("Password", "")) if user else ""
    ver_res = verify_password_compat(request.password, stored_pw)

    if not user or not ver_res.verified:
        login_throttle.record_failure(request.user_id)
        _log("LOGIN_FAIL", request.user_id, "", http)
        # Uniform 401 response to prevent user enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    login_throttle.record_success(request.user_id)

    # Login-time Progressive Rehash (Silent migration to Argon2id with CAS protection)
    if ver_res.needs_rehash:
        try:
            update_user_password_cas(
                user_id=str(user.get("ID", "")),
                expected_stored_password=stored_pw,
                new_plain_password=request.password
            )
        except Exception:
            # Migration write failure must not break login authentication
            pass

    # Issue signed JWT Session token & set HttpOnly Cookie
    user_id = str(user.get("ID", ""))
    from app.api.deps import account_profile
    prof = account_profile(user)
    role_str = prof["role"]
    class_id = str(user.get("ClassID", ""))

    # Minimal claims only: sub, role, class_id (no names, no PII in JWT)
    token = create_access_token({
        "sub": user_id,
        "role": role_str,
        "class_id": class_id
    })
    set_session_cookie(response, token)
    _log("LOGIN", user_id, role_str, http)

    return {
        "message": "Login successful",
        "user": {
            "id": user.get("ID"),
            "role": role_str,
            "Role": str(user.get("Role", "teacher")),
            "class_id": user.get("ClassID", ""),
            "class_name": user.get("ClassName", ""),
            "name": user.get("Name", ""),
            "group": prof["group"],
            "account_admin": prof["account_admin"],
        }
    }

@router.get("/me")
def get_current_user_profile(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Returns the authenticated user's profile resolved from backend store using validated session."""
    # current_user is already revalidated against the Users store; no second lookup.
    return {
        "id": current_user.get("sub", ""),
        "role": current_user.get("role"),
        "class_id": current_user.get("class_id", ""),
        "class_name": current_user.get("class_name", ""),
        "name": current_user.get("name", ""),
        "group": current_user.get("group", ""),
        "roles": current_user.get("roles", []),
        "assigned_classes": current_user.get("assigned", []),
        "account_admin": bool(current_user.get("account_admin")),
        "privacy_mode": settings.PRIVACY_MODE,
        **_scope_info(current_user),
    }


def _scope_info(user: Dict[str, Any]) -> Dict[str, Any]:
    """화면이 쓰는 열람 범위: scope=None(전교)·과정명·학급, classes=고를 수 있는 학급."""
    from app.api.deps import user_scope, classes_in_scope, NO_SCOPE
    scope = user_scope(user)
    return {"scope": None if scope == NO_SCOPE else scope,
            "classes": [] if scope == NO_SCOPE else classes_in_scope(scope)}

@router.post("/logout")
def logout(response: Response):
    """Clears the session cookie."""
    delete_session_cookie(response)
    return {"message": "Logged out successfully"}

from app.api.deps import require_authenticated_user, require_admin, require_account_admin
from app.core.config import settings

@router.get("/users")
def list_users(current_admin: Dict[str, Any] = Depends(require_account_admin)):
    """Admin only: Get all users (without passwords)"""
    users = get_all_users()
    return users

class MyPasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.put("/me/password")
def change_my_password(request: MyPasswordRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """로그인한 본인 비밀번호 변경(현재 비밀번호 확인 필요)."""
    from app.services.sheets import get_user_by_id, update_user_password_cas
    from app.core.security import verify_password_compat
    if len(request.new_password) < 4:
        raise HTTPException(status_code=400, detail="새 비밀번호는 4자 이상이어야 합니다.")
    user = get_user_by_id(current_user["id"], strict=True)
    stored = str((user or {}).get("Password", ""))
    if not user or not verify_password_compat(request.current_password, stored).verified:
        raise HTTPException(status_code=400, detail="현재 비밀번호가 맞지 않습니다.")
    if not update_user_password_cas(current_user["id"], stored, request.new_password):
        raise HTTPException(status_code=409, detail="비밀번호가 방금 다른 곳에서 바뀌었습니다. 다시 시도하세요.")
    return {"success": True}


@router.put("/users/{user_id}/password")
def change_password(user_id: str, request: PasswordUpdateRequest, current_admin: Dict[str, Any] = Depends(require_account_admin)):
    """Admin only: Update password for a user"""
    result = update_user_password(user_id, request.new_password)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

class HolidayRequest(BaseModel):
    date: str  # YYYY-MM-DD
    name: str

@router.get("/holidays")
def get_holidays_api(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    from app.services.sheets import get_holidays_from_config
    return get_holidays_from_config()

@router.post("/holidays")
def add_holiday_api(req: HolidayRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    from app.services.sheets import add_holiday
    result = add_holiday(req.date, req.name)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.delete("/holidays/{date}")
def delete_holiday_api(date: str, current_admin: Dict[str, Any] = Depends(require_admin)):
    from app.services.sheets import delete_holiday
    result = delete_holiday(date)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

class UserRoleUpdateRequest(BaseModel):
    user_id: str
    new_role: str
    new_class: Optional[str] = ""
    name: Optional[str] = ""
    memo: Optional[str] = ""

class CreateUserRequest(BaseModel):
    id: str
    password: str
    role: str = "teacher"
    name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    class_id: Optional[str] = ""
    class_name: Optional[str] = ""
    memo: Optional[str] = ""
    roles: Optional[str] = ""             # 겸임: 쉼표로 여러 권한
    assigned_classes: Optional[str] = ""  # 겸임: 쉼표로 여러 학급(ClassID 대신 씀)

@router.post("/users")
def create_new_user(request: CreateUserRequest, current_admin: Dict[str, Any] = Depends(require_account_admin)):
    """Admin only: Create a new user"""
    from app.services.sheets import create_user

    user_data = {
        "ID": request.id,
        "Password": request.password,
        "Role": request.role,
        # 교사 실명·전화·이메일은 저장하지 않는다. 표시 이름은 직책 아이디 그대로.
        "Name": request.id,
        "Roles": request.roles or "",
        "AssignedClasses": request.assigned_classes or "",
        "ClassID": request.class_id,
        "ClassName": request.class_name,
        "Memo": request.memo
    }

    result = create_user(user_data)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.delete("/users/{user_id}")
def delete_existing_user(user_id: str, current_admin: Dict[str, Any] = Depends(require_account_admin)):
    """Admin only: Delete a user"""
    from app.services.sheets import delete_user

    result = delete_user(user_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.put("/users/{user_id}/role")
def update_role(user_id: str, request: UserRoleUpdateRequest, current_admin: Dict[str, Any] = Depends(require_account_admin)):
    """Admin only: Update user role, class, name, and memo"""
    from app.services.sheets import update_user_role
    result = update_user_role(user_id, request.new_role, request.new_class, request.name, request.memo)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result



class ExportLogRequest(BaseModel):
    student_code: str = ""
    doc: str = ""
    reason: str = ""


@router.post("/export-log")
def export_log(req: ExportLogRequest, http: Request, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """인쇄·PDF 저장 직전 화면이 부른다(EXPORT). 사유는 2027 모드의 사유 선택값."""
    _log("EXPORT", current_user.get("sub", ""), current_user.get("role", ""), http,
         req.student_code.strip()[:10], req.reason.strip()[:50], req.doc.strip()[:60])
    return {"ok": True}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: str, current_admin: Dict[str, Any] = Depends(require_account_admin)):
    """계정별 비밀번호 즉시 초기화: 임시 비밀번호(8자)를 만들어 저장하고 이번 응답에만 보여준다."""
    import secrets
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # 헷갈리는 글자(l·1·o·0) 뺌
    temp = "".join(secrets.choice(alphabet) for _ in range(8))
    result = update_user_password(user_id, temp)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"user_id": user_id, "temp_password": temp}


@router.get("/users/ledger.csv")
def users_ledger(current_admin: Dict[str, Any] = Depends(require_account_admin)):
    """계정-권한 관리대장(오프라인 보관용). 비밀번호·실명은 넣지 않는다."""
    import csv
    import io
    from fastapi.responses import Response as RawResponse
    from app.api.deps import account_profile, user_scope, NO_SCOPE
    from app.core.time import now_kst
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["아이디", "권한그룹", "실제 권한", "겸임 권한", "열람 범위", "사용", "마지막 로그인"])
    for u in get_all_users():
        p = account_profile(u)
        scope = user_scope({**p, "class_id": str(u.get("ClassID", "")).strip(), "id": str(u.get("ID", ""))})
        active = str(u.get("Active", "true")).strip().lower() not in ("false", "0", "inactive", "x", "no")
        w.writerow([u.get("ID", ""), p["group"], p["role"], ",".join(p["roles"]),
                    "전교" if scope is None else ("없음" if scope == NO_SCOPE else scope),
                    "O" if active else "X", u.get("LastLogin", "")])
    name = f"계정권한관리대장_{now_kst().strftime('%Y%m%d')}.csv"
    from urllib.parse import quote
    return RawResponse(content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                       headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})


@router.get("/accounts")
def login_accounts():
    """로그인 화면 드롭다운용 직책 아이디 목록(로그인 전). 아이디와 탭 구분만 준다(이름·학급 정보 없음)."""
    from app.api.deps import account_profile
    try:
        users = get_all_users()
    except Exception:
        raise HTTPException(status_code=503, detail="계정 목록을 불러오지 못했습니다.")
    tab = {"ADMIN": "admin", "PBST_STAFF": "admin", "DEPT_HEAD": "staff", "TEACHER": "teacher"}
    out = []
    for u in users:
        if str(u.get("Active", "true")).strip().lower() in ("false", "0", "inactive", "x", "no"):
            continue
        p = account_profile(u)
        t = "staff" if "afterschool" in p["roles"] else tab[p["group"]]
        out.append({"id": str(u.get("ID", "")), "tab": t})
    return out


@router.get("/access-log/verify")
def verify_access_log(current_admin: Dict[str, Any] = Depends(require_account_admin)):
    """접속기록 무결성 점검(관리자): 서명이 맞지 않는 줄(시트에서 고친 줄) 번호를 돌려준다."""
    from app.services import access_log
    rows = access_log._ws().get_all_values()[1:]
    bad = [i + 2 for i, r in enumerate(rows) if not access_log.verify_row(r)]
    return {"rows": len(rows), "tampered_rows": bad[:200], "ok": not bad}
