from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
from app.services.sheets import fetch_board_posts, add_board_post, delete_board_post

router = APIRouter()

class PostCreate(BaseModel):
    title: str
    content: str
    author: str

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
async def delete_post(post_id: str):
    result = delete_board_post(post_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
