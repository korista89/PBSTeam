from fastapi import APIRouter, HTTPException, Response, Depends, status
from typing import Optional, Dict, Any
from pydantic import BaseModel
from app.services.sheets import get_user_by_id, update_user_password, get_all_users
from app.core.security import (
    verify_password_compat, create_access_token, set_session_cookie,
    delete_session_cookie, hash_password
)
from app.api.deps import require_authenticated_user

router = APIRouter()

class LoginRequest(BaseModel):
    user_id: str
    password: str

class PasswordUpdateRequest(BaseModel):
    user_id: str
    new_password: str

@router.post("/login")
async def login(request: LoginRequest, response: Response):
    user = get_user_by_id(request.user_id) if request.user_id else None

    stored_pw = str(user.get("Password", "")) if user else ""
    ver_res = verify_password_compat(request.password, stored_pw)

    if not user or not ver_res.verified:
        # Uniform 401 response to prevent user enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    # Issue signed JWT Session token & set HttpOnly Cookie
    user_id = str(user.get("ID", ""))
    from app.api.deps import normalize_role
    role_str = normalize_role(user.get("Role", "teacher"))
    class_id = str(user.get("ClassID", ""))

    # Minimal claims only: sub, role, class_id (no names, no PII in JWT)
    token = create_access_token({
        "sub": user_id,
        "role": role_str,
        "class_id": class_id
    })
    set_session_cookie(response, token)

    return {
        "message": "Login successful",
        "user": {
            "id": user.get("ID"),
            "role": role_str,
            "Role": str(user.get("Role", "teacher")),
            "class_id": user.get("ClassID", ""),
            "class_name": user.get("ClassName", ""),
            "name": user.get("Name", "")
        }
    }

@router.get("/me")
async def get_current_user_profile(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Returns the authenticated user's profile resolved from backend store using validated session."""
    user_id = current_user.get("sub", "")
    user = get_user_by_id(user_id) if user_id else None
    name = user.get("Name", "") if user else ""
    class_name = user.get("ClassName", "") if user else ""
    return {
        "id": user_id,
        "role": current_user.get("role"),
        "class_id": current_user.get("class_id", ""),
        "class_name": class_name,
        "name": name
    }

@router.post("/logout")
async def logout(response: Response):
    """Clears the session cookie."""
    delete_session_cookie(response)
    return {"message": "Logged out successfully"}

from app.api.deps import require_authenticated_user, require_admin

@router.get("/users")
async def list_users(current_admin: Dict[str, Any] = Depends(require_admin)):
    """Admin only: Get all users (without passwords)"""
    users = get_all_users()
    return users

@router.put("/users/{user_id}/password")
async def change_password(user_id: str, request: PasswordUpdateRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    """Admin only: Update password for a user"""
    result = update_user_password(user_id, request.new_password)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

class HolidayRequest(BaseModel):
    date: str  # YYYY-MM-DD
    name: str

@router.get("/holidays")
async def get_holidays_api(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    from app.services.sheets import get_holidays_from_config
    return get_holidays_from_config()

@router.post("/holidays")
async def add_holiday_api(req: HolidayRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    from app.services.sheets import add_holiday
    result = add_holiday(req.date, req.name)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.delete("/holidays/{date}")
async def delete_holiday_api(date: str, current_admin: Dict[str, Any] = Depends(require_admin)):
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

@router.post("/users")
async def create_new_user(request: CreateUserRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    """Admin only: Create a new user"""
    from app.services.sheets import create_user

    user_data = {
        "ID": request.id,
        "Password": request.password,
        "Role": request.role,
        "Name": request.name,
        "Phone": request.phone,
        "Email": request.email,
        "ClassID": request.class_id,
        "ClassName": request.class_name,
        "Memo": request.memo
    }

    result = create_user(user_data)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.delete("/users/{user_id}")
async def delete_existing_user(user_id: str, current_admin: Dict[str, Any] = Depends(require_admin)):
    """Admin only: Delete a user"""
    from app.services.sheets import delete_user

    result = delete_user(user_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.put("/users/{user_id}/role")
async def update_role(user_id: str, request: UserRoleUpdateRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    """Admin only: Update user role, class, name, and memo"""
    from app.services.sheets import update_user_role
    result = update_user_role(user_id, request.new_role, request.new_class, request.name, request.memo)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.post("/reset-users")
async def reset_users_db(current_admin: Dict[str, Any] = Depends(require_admin)):
    """DEV ONLY: Reset Users sheet to default Admin + 34 Class Teachers"""
    from app.core.config import settings
    if settings.ENVIRONMENT.lower() != "development":
        raise HTTPException(
            status_code=403,
            detail="Destructive reset endpoints are strictly disabled in production environment."
        )
    from app.services.sheets import reset_users_sheet
    result = reset_users_sheet()
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
