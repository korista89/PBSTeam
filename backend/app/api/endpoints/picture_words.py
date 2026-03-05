
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from app.services.picture_words import (
    init_picture_word_sheets, fetch_student_vocab, update_student_vocab,
    fetch_lessons, update_lesson, fetch_overview, fetch_certification_status
)
from app.schemas import PictureWordRecord, PictureWordLesson, PictureWordOverview

router = APIRouter()

@router.post("/init")
def init_sheets():
    return init_picture_word_sheets()

@router.get("/student/{student_num}/vocab")
def get_vocab(student_num: int):
    return fetch_student_vocab(student_num)

@router.patch("/student/{student_num}/vocab/{vocab_id}")
def update_vocab(student_num: int, vocab_id: int, updates: Dict[str, Any]):
    return update_student_vocab(student_num, vocab_id, updates)

@router.get("/lessons")
def get_all_lessons():
    return fetch_lessons()

@router.patch("/lessons/{lesson_num}")
def update_lesson_data(lesson_num: int, updates: Dict[str, Any]):
    return update_lesson(lesson_num, updates)

@router.get("/overview")
def get_picture_word_overview():
    return fetch_overview()

@router.get("/student/{student_num}/certification")
def get_certification(student_num: int):
    return fetch_certification_status(student_num)

@router.get("/minutes")
def get_minutes():
    from app.services.picture_words import fetch_picture_word_minutes
    return fetch_picture_word_minutes()
