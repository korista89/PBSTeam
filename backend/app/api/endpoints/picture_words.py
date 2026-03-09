from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, Optional
from pydantic import BaseModel
from app.services.picture_words import (
    fetch_all_students, fetch_students_by_class,
    add_student, delete_student,
    fetch_student_vocab, update_student_vocab, batch_update_student_vocab,
    fetch_lessons, update_lesson,
    fetch_minutes, add_minute_entry, delete_minute_entry,
    fetch_class_overview, fetch_certification_status,
    init_picture_word_system
)

router = APIRouter()

# ─────────────────────────────────────────────────────────────
# 초기화
# ─────────────────────────────────────────────────────────────
@router.post("/init")
def init_system():
    return init_picture_word_system()

# ─────────────────────────────────────────────────────────────
# 학생 명부
# ─────────────────────────────────────────────────────────────
@router.get("/students")
def get_all_students():
    return fetch_all_students()

@router.get("/students/by-class/{class_id}")
def get_students_by_class(class_id: str):
    return fetch_students_by_class(class_id)

class AddStudentRequest(BaseModel):
    class_id: str
    class_name: str
    student_num: int
    student_name: str

@router.post("/students")
def create_student(req: AddStudentRequest):
    return add_student(req.class_id, req.class_name, req.student_num, req.student_name)

@router.delete("/students/{class_id}/{student_name}")
def remove_student(class_id: str, student_name: str):
    result = delete_student(class_id, student_name)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

# ─────────────────────────────────────────────────────────────
# 체크리스트 (학생별 어휘 습득)
# ─────────────────────────────────────────────────────────────
@router.get("/vocab/{class_id}/{student_name}")
def get_vocab(class_id: str, student_name: str):
    return fetch_student_vocab(class_id, student_name)

class VocabUpdateRequest(BaseModel):
    updates: Dict[str, Any]

@router.patch("/vocab/{class_id}/{student_name}/{vocab_id}")
def patch_vocab(class_id: str, student_name: str, vocab_id: int, req: VocabUpdateRequest):
    result = update_student_vocab(class_id, student_name, vocab_id, req.updates)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

class VocabBatchUpdateRequest(BaseModel):
    payload: list[Dict[str, Any]]

@router.patch("/vocab/batch/{class_id}/{student_name}")
def patch_vocab_batch(class_id: str, student_name: str, req: VocabBatchUpdateRequest):
    result = batch_update_student_vocab(class_id, student_name, req.payload)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

# ─────────────────────────────────────────────────────────────
# 수업 가이드
# ─────────────────────────────────────────────────────────────
@router.get("/lessons")
def get_lessons():
    return fetch_lessons()

class LessonUpdateRequest(BaseModel):
    updates: Dict[str, Any]

@router.patch("/lessons/{lesson_num}")
def patch_lesson(lesson_num: int, req: LessonUpdateRequest):
    result = update_lesson(lesson_num, req.updates)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

# ─────────────────────────────────────────────────────────────
# 협의록
# ─────────────────────────────────────────────────────────────
@router.get("/minutes")
def get_minutes(class_id: Optional[str] = Query(None)):
    return fetch_minutes(class_id)

class MinuteRequest(BaseModel):
    date: str
    kind: str           # 수업협의 | 평가협의
    source: str         # 학생명 또는 차시 정보
    content: str
    class_id: str = ""
    class_name: str = ""

@router.post("/minutes")
def post_minute(req: MinuteRequest):
    result = add_minute_entry(req.date, req.kind, req.source, req.content, req.class_id, req.class_name)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.delete("/minutes/{row_index}")
def remove_minute(row_index: int):
    result = delete_minute_entry(row_index)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

# ─────────────────────────────────────────────────────────────
# 학급 현황
# ─────────────────────────────────────────────────────────────
@router.get("/overview")
def get_overview(class_id: Optional[str] = Query(None)):
    return fetch_class_overview(class_id)

# ─────────────────────────────────────────────────────────────
# 인증제 현황
# ─────────────────────────────────────────────────────────────
@router.get("/certification/{class_id}/{student_name}")
def get_certification(class_id: str, student_name: str):
    return fetch_certification_status(class_id, student_name)
