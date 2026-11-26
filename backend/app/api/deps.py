# backend/app/api/deps.py

import re
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, status, Depends
from app.core.config import settings
from app.core.security import decode_access_token
from app.services.sheets import get_user_by_id, UserStoreUnavailable
from app.adapters.sheets.tier_status import TierStatusAdapter

# Canonical class normalization mapping
CLASS_MAP = {
    # 1. 유치원
    "101": "유1", "유1": "유1", "유1관리자": "유1", "유치원 1반": "유1", "유치원1반": "유1", "유난초": "유1",
    "유치원 0학년 1반": "유1", "유치원0학년1반": "유1",
    "102": "유2", "유2": "유2", "유2관리자": "유2", "유치원 2반": "유2", "유치원2반": "유2", "유백합": "유2",
    "유치원 0학년 2반": "유2", "유치원0학년2반": "유2",
    # 2. 초등
    "211": "초1-1", "초1-1": "초1-1", "초1-1관리자": "초1-1", "초등 1학년 1반": "초1-1", "초등1-1": "초1-1",
    "212": "초1-2", "초1-2": "초1-2", "초1-2관리자": "초1-2", "초등 1학년 2반": "초1-2", "초등1-2": "초1-2",
    "221": "초2-1", "초2-1": "초2-1", "초2-1관리자": "초2-1", "초등 2학년 1반": "초2-1", "초등2-1": "초2-1",
    "222": "초2-2", "초2-2": "초2-2", "초2-2관리자": "초2-2", "초등 2학년 2반": "초2-2", "초등2-2": "초2-2",
    "231": "초3-1", "초3-1": "초3-1", "초3-1관리자": "초3-1", "초등 3학년 1반": "초3-1", "초등3-1": "초3-1",
    "232": "초3-2", "초3-2": "초3-2", "초3-2관리자": "초3-2", "초등 3학년 2반": "초3-2", "초등3-2": "초3-2",
    "241": "초4-1", "초4-1": "초4-1", "초4-1관리자": "초4-1", "초등 4학년 1반": "초4-1", "초등4-1": "초4-1",
    "242": "초4-2", "초4-2": "초4-2", "초4-2관리자": "초4-2", "초등 4학년 2반": "초4-2", "초등4-2": "초4-2",
    "251": "초5-1", "초5-1": "초5-1", "초5-1관리자": "초5-1", "초등 5학년 1반": "초5-1", "초등5-1": "초5-1",
    "252": "초5-2", "초5-2": "초5-2", "초5-2관리자": "초5-2", "초등 5학년 2반": "초5-2", "초등5-2": "초5-2",
    "261": "초6-1", "초6-1": "초6-1", "초6-1관리자": "초6-1", "초등 6학년 1반": "초6-1", "초등6-1": "초6-1",
    "262": "초6-2", "초6-2": "초6-2", "초6-2관리자": "초6-2", "초등 6학년 2반": "초6-2", "초등6-2": "초6-2",
    # 3. 중학
    "311": "중1-1", "중1-1": "중1-1", "중1-1관리자": "중1-1", "중학교 1학년 1반": "중1-1", "중학1-1": "중1-1",
    "312": "중1-2", "중1-2": "중1-2", "중1-2관리자": "중1-2", "중학교 1학년 2반": "중1-2", "중학1-2": "중1-2",
    "321": "중2-1", "중2-1": "중2-1", "중2-1관리자": "중2-1", "중학교 2학년 1반": "중2-1", "중학2-1": "중2-1",
    "322": "중2-2", "중2-2": "중2-2", "중2-2관리자": "중2-2", "중학교 2학년 2반": "중2-2", "중학2-2": "중2-2",
    "331": "중3-1", "중3-1": "중3-1", "중3-1관리자": "중3-1", "중학교 3학년 1반": "중3-1", "중학3-1": "중3-1",
    "332": "중3-2", "중3-2": "중3-2", "중3-2관리자": "중3-2", "중학교 3학년 2반": "중3-2", "중학3-2": "중3-2",
    "340": "중순회", "중순회": "중순회", "중학교순회학급관리자": "중순회", "중등순회학급관리자": "중순회", "중학교 순회학급": "중순회", "순회(중)": "중순회",
    # 4. 고등
    "411": "고1-1", "고1-1": "고1-1", "고1-1관리자": "고1-1", "고등학교 1학년 1반": "고1-1", "고등1-1": "고1-1", "고등 1학년 1반": "고1-1",
    "412": "고1-2", "고1-2": "고1-2", "고1-2관리자": "고1-2", "고등학교 1학년 2반": "고1-2", "고등1-2": "고1-2", "고등 1학년 2반": "고1-2",
    "421": "고2-1", "고2-1": "고2-1", "고2-1관리자": "고2-1", "고등학교 2학년 1반": "고2-1", "고등2-1": "고2-1", "고등 2학년 1반": "고2-1",
    "422": "고2-2", "고2-2": "고2-2", "고2-2관리자": "고2-2", "고등학교 2학년 2반": "고2-2", "고등2-2": "고2-2", "고등 2학년 2반": "고2-2",
    "431": "고3-1", "고3-1": "고3-1", "고3-1관리자": "고3-1", "고등학교 3학년 1반": "고3-1", "고등3-1": "고3-1", "고등 3학년 1반": "고3-1",
    "432": "고3-2", "고3-2": "고3-2", "고3-2관리자": "고3-2", "고등학교 3학년 2반": "고3-2", "고등3-2": "고3-2", "고등 3학년 2반": "고3-2",
    "440": "고순회", "고순회": "고순회", "고등순회학급관리자": "고순회", "고등학교 순회학급": "고순회", "순회(고)": "고순회", "고등 순회학급": "고순회",
    # 5. 전공과
    "511": "전1-1", "전1-1": "전1-1", "전1-1관리자": "전1-1", "전공과 1학년 1반": "전1-1", "전공1-1": "전1-1",
    "512": "전1-2", "전1-2": "전1-2", "전1-2관리자": "전1-2", "전공과 1학년 2반": "전1-2", "전공1-2": "전1-2",
    "513": "전1-3", "전1-3": "전1-3", "전1-3관리자": "전1-3", "전공과 1학년 3반": "전1-3", "전공1-3": "전1-3",
    "521": "전2-1", "전2-1": "전2-1", "전2-1관리자": "전2-1", "전공과 2학년 1반": "전2-1", "전공2-1": "전2-1",
    "522": "전2-2", "전2-2": "전2-2", "전2-2관리자": "전2-2", "전공과 2학년 2반": "전2-2", "전공2-2": "전2-2",
    "523": "전2-3", "전2-3": "전2-3", "전2-3관리자": "전2-3", "전공과 2학년 3반": "전2-3", "전공2-3": "전2-3",
    # 6. 예비
    "600": "예비", "예비": "예비", "예비관리자": "예비", "예비 학급": "예비"
}

def normalize_class_identifier(val: Optional[str]) -> str:
    """Normalizes class codes, names, and admin IDs into a canonical form (e.g. '초1-1')."""
    if not val:
        return ""
    clean = str(val).strip()
    return CLASS_MAP.get(clean, clean)


def normalize_role(role_val: Optional[str]) -> str:
    """Normalizes role strings (e.g. 'class_teacher' from Users sheet -> canonical 'teacher')."""
    if not role_val:
        return "teacher"
    r = str(role_val).strip().lower()
    if r in ["admin", "superadmin"]:
        return r
    if r in ["class_teacher", "teacher", "담임", "교사"]:
        return "teacher"
    if r in ["division_head", "과정부장", "부장"]:
        return "division_head"
    if r in ["afterschool", "늘봄", "늘봄실장"]:
        return "afterschool"
    if r in ["pbst_staff", "pbst", "담당자"]:
        return "pbst_staff"
    return r


def _split(v: Any) -> list:
    return [x.strip() for x in re.split(r"[,;/]", str(v or "")) if x.strip()]


_RANK = ["admin", "division_head", "teacher", "afterschool"]


def account_profile(row: Dict[str, Any]) -> Dict[str, Any]:
    """Users 한 줄 → 실제로 쓰는 권한. 겸임은 Roles(여러 개)·AssignedClasses(여러 학급) 칸으로 적는다.
    - 화면·API가 쓰는 role은 가장 넓은 것 하나(admin > division_head > teacher > afterschool).
    - pbst_staff(기능별 담당자): 배정 학급이 없으면 전교를 보므로 admin처럼 동작하고, 있으면 그 학급들만 본다.
    - account_admin: 계정·비밀번호 관리는 Role이 진짜 admin인 계정(학교관리자 등)만 한다."""
    roles = [normalize_role(x) for x in [row.get("Role", "teacher"), *_split(row.get("Roles"))] if str(x).strip()] or ["teacher"]
    assigned = [normalize_class_identifier(c) for c in _split(row.get("AssignedClasses"))]
    eff = ["admin" if r in ("admin", "superadmin") or (r == "pbst_staff" and not assigned)
           else "teacher" if r == "pbst_staff" else r for r in roles]
    role = min(eff, key=lambda r: _RANK.index(r) if r in _RANK else len(_RANK))
    group = ("ADMIN" if any(r in ("admin", "superadmin") for r in roles) else
             "PBST_STAFF" if any(r in ("pbst_staff", "afterschool") for r in roles) else
             "DEPT_HEAD" if "division_head" in roles else "TEACHER")
    return {"role": role, "roles": roles, "assigned": assigned, "group": group,
            "account_admin": any(r in ("admin", "superadmin") for r in roles)}


# ── 열람 범위 ────────────────────────────────────────────────
# 관리자: 전교(None). 과정부장: Users.ClassID에 적힌 과정 하나. 담임: 자기 학급 하나.
# 늘봄실장: 학급 단위 자료가 없다(늘봄 참여 학생만 check_student_scope에서 따로 허용).
DIVISIONS = ["초등저학년", "초등고학년", "중학교", "고등학교", "전공과"]
NO_SCOPE = "__none__"


def division_of(cls: Optional[str]) -> str:
    """학급 → 과정. 유치원·초1·초2는 초등저학년, 초3~6은 초등고학년. 예비 학급은 어느 과정에도 들지 않는다."""
    c = normalize_class_identifier(cls)
    if c.startswith("유") or c.startswith(("초1-", "초2-")):
        return "초등저학년"
    if c.startswith("초"):
        return "초등고학년"
    return {"중": "중학교", "고": "고등학교", "전": "전공과"}.get(c[:1], "")


def is_admin_user(user: Dict[str, Any]) -> bool:
    return str(user.get("role", "")).lower() in ["admin", "superadmin"]


def user_scope(user: Dict[str, Any]) -> Optional[str]:
    """None=전교, 과정명(DIVISIONS)=과정, 그 밖=학급 하나. 맞는 학급이 없으면 NO_SCOPE."""
    if is_admin_user(user):
        return None
    role = str(user.get("role", "")).lower()
    parts = []
    if role == "division_head":
        cid = str(user.get("class_id", "")).strip()
        if cid in DIVISIONS:
            parts.append(cid)
    elif role != "afterschool" and not user.get("assigned"):
        parts.append(normalize_class_identifier(user.get("class_id") or user.get("id")))
    parts += [c for c in user.get("assigned") or [] if c]
    parts = list(dict.fromkeys(p for p in parts if p))
    return ",".join(parts) if parts else NO_SCOPE  # 여러 학급(겸임)은 쉼표로 잇는다


def in_scope(cls: Optional[str], scope: Optional[str]) -> bool:
    """학급(이름·코드 무엇이든)이 범위 안인가."""
    if scope is None:
        return True
    if "," in scope:
        return any(in_scope(cls, p) for p in scope.split(","))
    c = normalize_class_identifier(cls)
    if not c or scope == NO_SCOPE:
        return False
    if scope in DIVISIONS:
        return division_of(c) == scope
    return c == normalize_class_identifier(scope)


def student_in_scope(student_code: str, scope: Optional[str]) -> bool:
    return scope is None or in_scope(get_student_class_code(str(student_code or "").strip()), scope)


def narrow_scope(user: Dict[str, Any], requested: Optional[str] = None) -> Optional[str]:
    """화면에서 고른 학급·과정이 내 범위 안이면 그것으로 좁히고, 아니면 내 범위 그대로."""
    base = user_scope(user)
    req = str(requested or "").strip()
    if not req:
        return base
    if req in DIVISIONS:
        return req if base is None or req in str(base).split(",") else base
    req = normalize_class_identifier(req)
    return req if in_scope(req, base) else base


def classes_in_scope(scope: Optional[str]) -> list:
    """범위 안 학급 목록(학교 순서). 화면의 학급 고르기에 쓴다."""
    seen = []
    for v in CLASS_MAP.values():
        if v not in seen and in_scope(v, scope):
            seen.append(v)
    return seen


_INACTIVE_FLAGS = ["false", "0", "inactive", "x", "no"]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def resolve_session_user(request: Request) -> Dict[str, Any]:
    """
    Single source of truth for session authentication, shared by every endpoint.
    1. Extracts signed session token from HttpOnly cookie.
    2. Validates JWT signature and expiration.
    3. Revalidates user against current Users store (prevents stale role/class privilege escalation).
    4. Rejects inactive or deleted users with HTTP 401.
    5. If the Users store itself cannot be read (Sheets quota/outage), answers 503 —
       an infrastructure failure must never be reported as "not logged in".
    """
    token: Optional[str] = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if not token:
        raise _unauthorized("Authentication session required. Please log in.")

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise _unauthorized("Invalid session token.")

    try:
        user = get_user_by_id(user_id, strict=True)
    except UserStoreUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="User store temporarily unavailable. Please retry shortly.",
            headers={"Retry-After": "5"},
        )
    if not user:
        raise _unauthorized("User account no longer active or not found.")

    is_active = str(user.get("Active", "true")).strip().lower()
    if is_active in _INACTIVE_FLAGS:
        raise _unauthorized("User account is deactivated.")

    prof = account_profile(user)
    return {
        **prof,
        "id": str(user_id),
        "sub": str(user_id),
        "class_id": str(user.get("ClassID", "")).strip(),
        "class_name": str(user.get("ClassName", "")).strip(),
        "name": str(user.get("Name", "")).strip(),
        "active": True
    }


def get_current_user(request: Request) -> Dict[str, Any]:
    """Strict authentication dependency (401 unauthenticated, 503 user store unavailable)."""
    return resolve_session_user(request)


def require_authenticated_user(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Requires an authenticated and active user session."""
    return current_user


def require_account_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """계정·비밀번호 관리: Role이 admin인 계정(학교관리자·행동중재지원팀장 등)만. 기능 담당자(pbst_staff)는 안 된다."""
    if not current_user.get("account_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: 계정 관리는 관리자 계정만 할 수 있습니다.")
    return current_user


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Requires ADMIN role. Returns HTTP 403 if user is not admin."""
    if current_user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Administrator access required."
        )
    return current_user


def get_student_class_code(student_code: str) -> Optional[str]:
    """Look up a student's canonical class code strictly by student_code from TierStatus roster.

    TierStatusAdapter.fetch_students() and fetch_student_status() both read the
    same "TierStatus" worksheet through two independent caches, so calling both
    doubled the Google Sheets round-trips on every scope check. This check runs
    on nearly every authenticated mutation, so the extra live Sheets call was a
    meaningful contributor to request latency under concurrent load.
    """
    if not student_code:
        return None
    s_clean = str(student_code).strip()

    students = TierStatusAdapter.fetch_students()
    for s in students:
        if s.student_code.strip() == s_clean:
            return normalize_class_identifier(s.class_name)

    return None


def check_student_scope(student_code: str, current_user: Dict[str, Any]) -> None:
    """
    Enforces student-level authorization:
    - Admin: School-wide access permitted.
    - Division head: students of classes in their division.
    - After-school lead: students on the 늘봄 participant list.
    - Teacher: Access permitted ONLY if student's class matches teacher's assigned class.
    - Raises HTTP 404 if student does not exist.
    - Raises HTTP 403 if student belongs to another class.
    """
    if is_admin_user(current_user):
        return

    student_class = get_student_class_code(student_code)
    if student_class is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with code '{student_code}' not found."
        )

    if str(current_user.get("role", "")).lower() == "afterschool":
        from app.services.afterschool import participant_codes
        if str(student_code).strip() in participant_codes():
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="늘봄 참여 학생으로 등록된 학생만 볼 수 있습니다.")

    if not in_scope(student_class, user_scope(current_user)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have permission to access student data outside your assigned class."
        )
