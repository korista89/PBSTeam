"""Meeting Notes API endpoints"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.services.sheets import add_meeting_note, fetch_meeting_notes, update_meeting_note, delete_meeting_note
from app.api.deps import require_authenticated_user, check_student_scope, normalize_class_identifier, get_student_class_code

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
async def save_meeting_note(
    request: MeetingNoteRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Save a meeting note with student scope check if student_code is present"""
    if request.student_code:
        check_student_scope(request.student_code, current_user)

    author = request.author or current_user.get("name") or current_user.get("id") or ""
    data = {
        "meeting_type": request.meeting_type,
        "date": request.date,
        "content": request.content,
        "author": author,
        "student_code": request.student_code or "",
        "period_start": request.period_start or "",
        "period_end": request.period_end or ""
    }

    result = add_meeting_note(data)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {"message": "회의록이 저장되었습니다.", "result": result}


@router.get("")
async def get_meeting_notes(
    meeting_type: Optional[str] = None,
    student_code: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Get meeting notes, optionally filtered by type and student_code with class isolation"""
    if student_code:
        check_student_scope(student_code, current_user)
    notes = fetch_meeting_notes(meeting_type, student_code)

    role = str(current_user.get("role", "")).lower()
    if role not in ["admin", "superadmin"] and not student_code:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        scoped_notes = []
        for n in notes:
            st_code = str(n.get("student_code", "")).strip()
            if not st_code or get_student_class_code(st_code) == user_class:
                scoped_notes.append(n)
        notes = scoped_notes

    return {"notes": notes, "total": len(notes)}


@router.get("/latest")
async def get_latest_notes(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Get the latest note for each meeting type (scoped by teacher class or school-wide for admin)"""
    all_notes = fetch_meeting_notes()
    role = str(current_user.get("role", "")).lower()

    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        all_notes = [
            n for n in all_notes
            if not n.get("student_code") or get_student_class_code(str(n.get("student_code", "")).strip()) == user_class
        ]

    latest = {}
    for note in all_notes:
        mt = note["meeting_type"]
        if mt not in latest:
            latest[mt] = note

    return {"notes": latest}

@router.patch("/{note_id}")
async def update_note(
    note_id: str,
    request: UpdateMeetingNoteRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Update a meeting note with verified server session ownership and class scope check"""
    all_notes = fetch_meeting_notes()
    note = next((n for n in all_notes if str(n.get("id")) == str(note_id) or str(n.get("uuid")) == str(note_id) or str(n.get("created_at")) == str(note_id)), None)

    if not note:
        raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다.")

    # Class scope enforcement: if attached to a student, user must have access to that student
    student_code = str(note.get("student_code", "")).strip()
    if student_code:
        check_student_scope(student_code, current_user)

    current_user_id = str(current_user.get("id", "")).strip()
    current_user_name = str(current_user.get("name", "")).strip()
    author_id = str(note.get("author", "")).strip()
    is_author = (current_user_id == author_id) or (current_user_name and current_user_name == author_id)
    is_admin = current_user.get("role") in ["admin", "superadmin"]

    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다. 작성자나 관리자만 수정 가능합니다.")

    result = update_meeting_note(note_id, request.content)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {"message": "회의록이 수정되었습니다."}

@router.delete("/{note_id}")
async def delete_note(
    note_id: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Delete a meeting note with verified server session ownership and class scope check"""
    all_notes = fetch_meeting_notes()
    note = next((n for n in all_notes if str(n.get("id")) == str(note_id) or str(n.get("uuid")) == str(note_id) or str(n.get("created_at")) == str(note_id)), None)

    if not note:
        raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다.")

    # Class scope enforcement: if attached to a student, user must have access to that student
    student_code = str(note.get("student_code", "")).strip()
    if student_code:
        check_student_scope(student_code, current_user)

    current_user_id = str(current_user.get("id", "")).strip()
    current_user_name = str(current_user.get("name", "")).strip()
    author_id = str(note.get("author", "")).strip()
    is_author = (current_user_id == author_id) or (current_user_name and current_user_name == author_id)
    is_admin = current_user.get("role") in ["admin", "superadmin"]

    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다. 작성자나 관리자만 삭제 가능합니다.")

    result = delete_meeting_note(note_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {"message": "회의록이 삭제되었습니다."}
