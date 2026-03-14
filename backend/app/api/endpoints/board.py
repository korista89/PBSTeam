from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
from app.services.sheets import fetch_board_posts, add_board_post, delete_board_post, update_board_post

router = APIRouter()

class PostCreate(BaseModel):
    title: str
    content: str
    author: str

class PostUpdate(BaseModel):
    title: str
    content: str
    user_id: str
    role: str

class PostResponse(BaseModel):
    id: str
    title: str
    content: str
    author: str
    created_at: str
    views: int

@router.get("/", response_model=List[dict])
async def get_posts():
    posts = fetch_board_posts()
    return posts

@router.post("/")
async def create_post(post: PostCreate):
    result = add_board_post(post.title, post.content, post.author)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.delete("/{post_id}")
async def delete_post(post_id: str, user_id: str, role: str):
    """Delete a board post with permission check"""
    # 1. Fetch posts to find author
    posts = fetch_board_posts()
    post = next((p for p in posts if p.get("id") == post_id), None)
    
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    
    # 2. Permission check: Author or Admin
    current_user_id = str(user_id).strip()
    author_id = str(post.get("author", "")).strip()
    is_author = current_user_id == author_id
    is_admin = str(role).lower() == "admin"
    
    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다. 작성자나 관리자만 삭제 가능합니다.")
        
    result = delete_board_post(post_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.put("/{post_id}")
async def update_existing_post(post_id: str, request: PostUpdate):
    """Update a board post with permission check"""
    # 1. Fetch posts to find author
    posts = fetch_board_posts()
    post = next((p for p in posts if p.get("id") == post_id), None)
    
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    
    # 2. Permission check: Author or Admin
    current_user_id = str(request.user_id).strip()
    author_id = str(post.get("author", "")).strip()
    is_author = current_user_id == author_id
    is_admin = str(request.role).lower() == "admin"
    
    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다. 작성자나 관리자만 수정 가능합니다.")
        
    result = update_board_post(post_id, request.title, request.content)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
