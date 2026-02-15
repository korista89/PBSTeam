"""Meeting Notes API endpoints"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.services.sheets import add_meeting_note, fetch_meeting_notes

router = APIRouter()

class MeetingNoteRequest(BaseModel):
    meeting_type: str  # "tier1", "tier2", "tier3", "consultation"
    date: str
    content: str
    author: Optional[str] = ""
    student_code: Optional[str] = ""
    period_start: Optional[str] = ""
    period_end: Optional[str] = ""


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
