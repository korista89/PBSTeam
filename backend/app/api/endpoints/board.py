from fastapi import APIRouter, HTTPException, Body, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.services.sheets import fetch_board_posts, add_board_post, delete_board_post, update_board_post
from app.api.deps import require_authenticated_user

router = APIRouter()

class PostCreate(BaseModel):
    title: str
    content: str
    author: Optional[str] = ""

class PostUpdate(BaseModel):
    title: str
    content: str

class PostResponse(BaseModel):
    id: str
    title: str
    content: str
    author: str
    created_at: str
    views: int

@router.get("/", response_model=List[dict])
async def get_posts(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    posts = fetch_board_posts()
    return posts

@router.post("/")
async def create_post(
    post: PostCreate,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    author = post.author or current_user.get("name") or current_user.get("id")
    result = add_board_post(post.title, post.content, author)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Delete a board post with verified server session ownership check"""
    posts = fetch_board_posts()
    post = next((p for p in posts if p.get("id") == post_id), None)
    
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    
    current_user_id = str(current_user.get("id", "")).strip()
    current_user_name = str(current_user.get("name", "")).strip()
    author_id = str(post.get("author", "")).strip()
    is_author = (current_user_id == author_id) or (current_user_name and current_user_name == author_id)
    is_admin = current_user.get("role") in ["admin", "superadmin"]
    
    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다. 작성자나 관리자만 삭제 가능합니다.")
        
    result = delete_board_post(post_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.put("/{post_id}")
async def update_existing_post(
    post_id: str,
    request: PostUpdate,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Update a board post with verified server session ownership check"""
    posts = fetch_board_posts()
    post = next((p for p in posts if p.get("id") == post_id), None)
    
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    
    current_user_id = str(current_user.get("id", "")).strip()
    current_user_name = str(current_user.get("name", "")).strip()
    author_id = str(post.get("author", "")).strip()
    is_author = (current_user_id == author_id) or (current_user_name and current_user_name == author_id)
    is_admin = current_user.get("role") in ["admin", "superadmin"]
    
    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다. 작성자나 관리자만 수정 가능합니다.")
        
    result = update_board_post(post_id, request.title, request.content)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
