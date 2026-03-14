"""Meeting Notes API endpoints"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.services.sheets import add_meeting_note, fetch_meeting_notes, update_meeting_note, delete_meeting_note

router = APIRouter()

class MeetingNoteRequest(BaseModel):
    meeting_type: str  # "tier1", "tier2", "tier3", "consultation"
    date: str
    content: str
    author: Optional[str] = ""
    student_code: Optional[str] = ""
    period_start: Optional[str] = ""
    period_end: Optional[str] = ""

class UpdateMeetingNoteRequest(BaseModel):
    content: str
    user_id: str
    role: str

class DeleteMeetingNoteRequest(BaseModel):
    user_id: str
    role: str


class MeetingNoteResponse(BaseModel):
    id: str
    meeting_type: str
    date: str
    content: str
    author: str
    student_code: str
    period_start: str
    period_end: str
    created_at: str


@router.post("")
async def save_meeting_note(request: MeetingNoteRequest):
    """Save a meeting note"""
    data = {
        "meeting_type": request.meeting_type,
        "date": request.date,
        "content": request.content,
        "author": request.author or "",
        "student_code": request.student_code or "",
        "period_start": request.period_start or "",
        "period_end": request.period_end or ""
    }
    
    result = add_meeting_note(data)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    return {"message": "회의록이 저장되었습니다.", "result": result}


@router.get("")
async def get_meeting_notes(meeting_type: Optional[str] = None, student_code: Optional[str] = None):
    """Get meeting notes, optionally filtered by type and student_code"""
    notes = fetch_meeting_notes(meeting_type, student_code)
    return {"notes": notes, "total": len(notes)}


@router.get("/latest")
async def get_latest_notes():
    """Get the latest note for each meeting type"""
    # Fetch all notes (or optimize later to fetch by type)
    all_notes = fetch_meeting_notes()
    
    latest = {}
    for note in all_notes:
        mt = note["meeting_type"]
        if mt not in latest:
            latest[mt] = note
            
    return {"notes": latest}

@router.patch("/{note_id}")
async def update_note(note_id: str, request: UpdateMeetingNoteRequest):
    """Update a meeting note with permission check"""
    # 1. Fetch the note to check author
    all_notes = fetch_meeting_notes()
    # Robust matching: check 'id', 'uuid', or 'created_at' (legacy)
    note = next((n for n in all_notes if str(n.get("id")) == str(note_id) or str(n.get("uuid")) == str(note_id) or str(n.get("created_at")) == str(note_id)), None)
    
    if not note:
        raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다.")
    
    # 2. Permission check: Author or Admin
    is_author = str(note.get("author", "")).strip() == str(request.user_id).strip()
    is_admin = str(request.role).lower() == "admin"
    
    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다. 작성자나 관리자만 수정 가능합니다.")
        
    result = update_meeting_note(note_id, request.content)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    return {"message": "회의록이 수정되었습니다."}

@router.delete("/{note_id}")
async def delete_note(note_id: str, user_id: str, role: str):
    """Delete a meeting note with permission check"""
    # 1. Fetch the note to check author
    all_notes = fetch_meeting_notes()
    note = next((n for n in all_notes if str(n.get("id")) == str(note_id) or str(n.get("uuid")) == str(note_id) or str(n.get("created_at")) == str(note_id)), None)
    
    if not note:
        raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다.")
    
    # 2. Permission check: Author or Admin
    is_author = str(note.get("author", "")).strip() == str(user_id).strip()
    is_admin = str(role).lower() == "admin"
    
    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다. 작성자나 관리자만 삭제 가능합니다.")
        
    result = delete_meeting_note(note_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    return {"message": "회의록이 삭제되었습니다."}
