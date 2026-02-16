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
            "role": str(user.get("Role")).lower(), # Normalize to lowercase
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

class HolidayRequest(BaseModel):
    date: str # YYYY-MM-DD
    name: str

@router.get("/holidays")
async def get_holidays_api():
    from app.services.sheets import get_holidays_from_config
    return get_holidays_from_config()

@router.post("/holidays")
async def add_holiday_api(req: HolidayRequest):
    from app.services.sheets import add_holiday
    result = add_holiday(req.date, req.name)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

class UserRoleUpdateRequest(BaseModel):

    user_id: str
    new_role: str
    new_class: Optional[str] = ""

class CreateUserRequest(BaseModel):
    id: str
    password: str
    role: str = "teacher"
    name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    class_id: Optional[str] = ""
    class_name: Optional[str] = ""

@router.post("/users")
async def create_new_user(request: CreateUserRequest):
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
        "ClassName": request.class_name
    }
    
    result = create_user(user_data)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.delete("/users/{user_id}")
async def delete_existing_user(user_id: str):
    """Admin only: Delete a user"""
    from app.services.sheets import delete_user
    
    result = delete_user(user_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

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
