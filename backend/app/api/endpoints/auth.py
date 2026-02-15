from fastapi import APIRouter, HTTPException
from app.services.sheets import get_user_by_id, update_user_password, get_all_users
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class LoginRequest(BaseModel):
    user_id: str
    password: str

class PasswordUpdateRequest(BaseModel):
    user_id: str
    new_password: str

@router.post("/login")
async def login(request: LoginRequest):
    user = get_user_by_id(request.user_id)
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    if user.get("Password") != request.password:
        raise HTTPException(status_code=401, detail="Invalid password")
    
    return {
        "message": "Login successful",
        "user": {
            "id": user.get("ID"),
            "role": user.get("Role"),
            "class_id": user.get("ClassID", ""),
            "class_name": user.get("ClassName", "")
        }
    }

@router.get("/users")
async def list_users():
    """Admin only: Get all users (without passwords)"""
    users = get_all_users()
    return users

@router.put("/users/{user_id}/password")
async def change_password(user_id: str, request: PasswordUpdateRequest):
    """Admin only: Update password for a user"""
    result = update_user_password(user_id, request.new_password)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

class UserRoleUpdateRequest(BaseModel):
    user_id: str
    new_role: str
    new_class: Optional[str] = ""

@router.put("/users/{user_id}/role")
async def update_role(user_id: str, request: UserRoleUpdateRequest):
    """Admin only: Update user role and class"""
    from app.services.sheets import update_user_role
    result = update_user_role(user_id, request.new_role, request.new_class)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.post("/reset-users")
async def reset_users_db():
    """
    DEV ONLY: Reset Users sheet to default Admin + 34 Class Teachers
    """
    from app.services.sheets import reset_users_sheet
    result = reset_users_sheet()
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
