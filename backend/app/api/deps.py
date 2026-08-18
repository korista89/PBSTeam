# backend/app/api/deps.py

from typing import Optional, Dict, Any, List
from fastapi import Request, HTTPException, status, Depends
from app.core.config import settings
from app.core.security import decode_access_token
from app.services.sheets import get_user_by_id, fetch_student_status
from app.adapters.sheets.tier_status import TierStatusAdapter

# Canonical class normalization mapping
CLASS_MAP = {
    # 1. 유치원
    "101": "유1", "유1": "유1", "유1관리자": "유1", "유치원 1반": "유1", "유치원1반": "유1",
    "102": "유2", "유2": "유2", "유2관리자": "유2", "유치원 2반": "유2", "유치원2반": "유2",
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
    "340": "중순회", "중순회": "중순회", "중학교순회학급관리자": "중순회", "중학교 순회학급": "중순회", "순회(중)": "중순회",
    # 4. 고등
    "411": "고1-1", "고1-1": "고1-1", "고1-1관리자": "고1-1", "고등학교 1학년 1반": "고1-1", "고등1-1": "고1-1",
    "412": "고1-2", "고1-2": "고1-2", "고1-2관리자": "고1-2", "고등학교 1학년 2반": "고1-2", "고등1-2": "고1-2",
    "421": "고2-1", "고2-1": "고2-1", "고2-1관리자": "고2-1", "고등학교 2학년 1반": "고2-1", "고등2-1": "고2-1",
    "422": "고2-2", "고2-2": "고2-2", "고2-2관리자": "고2-2", "고등학교 2학년 2반": "고2-2", "고등2-2": "고2-2",
    "431": "고3-1", "고3-1": "고3-1", "고3-1관리자": "고3-1", "고등학교 3학년 1반": "고3-1", "고등3-1": "고3-1",
    "432": "고3-2", "고3-2": "고3-2", "고3-2관리자": "고3-2", "고등학교 3학년 2반": "고3-2", "고등3-2": "고3-2",
    "440": "고순회", "고순회": "고순회", "고등순회학급관리자": "고순회", "고등학교 순회학급": "고순회", "순회(고)": "고순회",
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


async def get_current_user_optional(request: Request) -> Optional[Dict[str, Any]]:
    """
    Extracts session token from HttpOnly cookie and resolves current active user.
    Returns user context or None if unauthenticated.
    """
    token: Optional[str] = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if not token:
        return None

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None

        # Revalidate with current user store
        user = get_user_by_id(user_id)
        if not user:
            return None

        is_active = str(user.get("Active", "true")).strip().lower()
        if is_active in ["false", "0", "inactive", "x", "no"]:
            return None

        current_role = str(user.get("Role", "teacher")).lower()
        current_class_id = str(user.get("ClassID", "")).strip()
        current_class_name = str(user.get("ClassName", "")).strip()
        current_name = str(user.get("Name", "")).strip()

        return {
            "id": str(user_id),
            "sub": str(user_id),
            "role": current_role,
            "class_id": current_class_id,
            "class_name": current_class_name,
            "name": current_name,
            "active": True
        }
    except Exception:
        return None


async def get_current_user(request: Request) -> Dict[str, Any]:
    """
    Strict authentication and live user revalidation dependency.
    1. Extracts signed session token from HttpOnly cookie.
    2. Validates JWT signature and expiration.
    3. Revalidates user against current Users store (prevents stale role/class privilege escalation).
    4. Rejects inactive or deleted users with HTTP 401.
    """
    token: Optional[str] = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication session required. Please log in."
        )

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token."
        )

    # Live / cached Users lookup to prevent stale privileges and check active state
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer active or not found."
        )

    # Check Active flag
    is_active = str(user.get("Active", "true")).strip().lower()
    if is_active in ["false", "0", "inactive", "x", "no"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated."
        )

    current_role = str(user.get("Role", "teacher")).lower()
    current_class_id = str(user.get("ClassID", "")).strip()
    current_class_name = str(user.get("ClassName", "")).strip()
    current_name = str(user.get("Name", "")).strip()

    return {
        "id": str(user_id),
        "sub": str(user_id),
        "role": current_role,
        "class_id": current_class_id,
        "class_name": current_class_name,
        "name": current_name,
        "active": True
    }


async def require_authenticated_user(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Requires an authenticated and active user session."""
    return current_user


async def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Requires ADMIN role. Returns HTTP 403 if user is not admin."""
    if current_user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Administrator access required."
        )
    return current_user


async def require_teacher_or_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Requires TEACHER or ADMIN role. Returns HTTP 403 for unauthorized roles."""
    if current_user.get("role") not in ["admin", "teacher", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Teacher or Administrator access required."
        )
    return current_user


def get_student_class_code(student_code: str) -> Optional[str]:
    """Look up a student's canonical class code strictly by student_code from TierStatus roster."""
    if not student_code:
        return None
    s_clean = str(student_code).strip()

    # 1. Check TierStatusAdapter (strictly by student_code)
    students = TierStatusAdapter.fetch_students()
    for s in students:
        if s.student_code.strip() == s_clean:
            return normalize_class_identifier(s.class_name)

    # 2. Check fetch_student_status (strictly by student_code fields)
    raw_statuses = fetch_student_status()
    for row in raw_statuses:
        rc = str(row.get("학생코드") or row.get("Code") or row.get("학번") or "").strip()
        if rc == s_clean:
            return normalize_class_identifier(row.get("학급") or row.get("Class") or "")

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
