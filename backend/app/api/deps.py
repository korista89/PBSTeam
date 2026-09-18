# backend/app/api/deps.py

from typing import Optional, Dict, Any, List
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
    return r


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

    return {
        "id": str(user_id),
        "sub": str(user_id),
        "role": normalize_role(user.get("Role", "teacher")),
        "class_id": str(user.get("ClassID", "")).strip(),
        "class_name": str(user.get("ClassName", "")).strip(),
        "name": str(user.get("Name", "")).strip(),
        "active": True
    }


def get_current_user_optional(request: Request) -> Optional[Dict[str, Any]]:
    """Returns the resolved session user, or None if unauthenticated or unresolvable."""
    try:
        return resolve_session_user(request)
    except HTTPException:
        return None


def get_current_user(request: Request) -> Dict[str, Any]:
    """Strict authentication dependency (401 unauthenticated, 503 user store unavailable)."""
    return resolve_session_user(request)


def require_authenticated_user(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Requires an authenticated and active user session."""
    return current_user


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Requires ADMIN role. Returns HTTP 403 if user is not admin."""
    if current_user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Administrator access required."
        )
    return current_user


def require_teacher_or_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Requires TEACHER or ADMIN role. Returns HTTP 403 for unauthorized roles."""
    if current_user.get("role") not in ["admin", "teacher", "class_teacher", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Teacher or Administrator access required."
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
    - Teacher: Access permitted ONLY if student's class matches teacher's assigned class.
    - Raises HTTP 404 if student does not exist.
    - Raises HTTP 403 if student belongs to another class.
    """
    role = str(current_user.get("role", "")).lower()
    if role in ["admin", "superadmin"]:
        return

    student_class = get_student_class_code(student_code)
    if student_class is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with code '{student_code}' not found."
        )

    user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
    if not user_class or student_class != user_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have permission to access student data outside your assigned class."
        )
