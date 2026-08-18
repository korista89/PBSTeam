from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Dict, Any, Optional
from pydantic import BaseModel
from app.services.picture_words import (
    fetch_all_students, fetch_students_by_class,
    add_student, delete_student,
    fetch_student_vocab, update_student_vocab, batch_update_student_vocab,
    fetch_lessons, update_lesson,
    fetch_minutes, add_minute_entry, update_minute_entry, delete_minute_entry,
    fetch_class_overview, fetch_certification_status,
    init_picture_word_system, get_evaluation_sentences
)
from app.api.deps import require_authenticated_user, require_admin, normalize_class_identifier

router = APIRouter()

def _check_class_permission(class_id: str, current_user: Dict[str, Any]):
    role = str(current_user.get("role", "")).lower()
    if role in ["admin", "superadmin"]:
        return
    user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
    req_class = normalize_class_identifier(class_id)
    if not user_class or req_class != user_class:
        raise HTTPException(status_code=403, detail="Forbidden: You do not have permission for this class.")

# ─────────────────────────────────────────────────────────────
# 초기화
# ─────────────────────────────────────────────────────────────
@router.post("/init")
def init_system(current_admin: Dict[str, Any] = Depends(require_admin)):
    return init_picture_word_system()

# ─────────────────────────────────────────────────────────────
# 학생 명부
# ─────────────────────────────────────────────────────────────
@router.get("/students")
def get_all_students(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    students = fetch_all_students()
    role = str(current_user.get("role", "")).lower()
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        students = [s for s in students if normalize_class_identifier(s.get("학급ID") or s.get("학급명")) == user_class]
    return students

@router.get("/students/by-class/{class_id}")
def get_students_by_class(class_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _check_class_permission(class_id, current_user)
    return fetch_students_by_class(class_id)

class AddStudentRequest(BaseModel):
    class_id: str
    class_name: str
    student_num: int
    student_name: str

@router.post("/students")
def create_student(req: AddStudentRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _check_class_permission(req.class_id, current_user)
    return add_student(req.class_id, req.class_name, req.student_num, req.student_name)

@router.delete("/students/{class_id}/{student_name}")
def remove_student(class_id: str, student_name: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _check_class_permission(class_id, current_user)
    result = delete_student(class_id, student_name)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

# ─────────────────────────────────────────────────────────────
# 체크리스트 (학생별 어휘 습득)
# ─────────────────────────────────────────────────────────────
@router.get("/vocab/{class_id}/{student_name}")
def get_vocab(class_id: str, student_name: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _check_class_permission(class_id, current_user)
    return fetch_student_vocab(class_id, student_name)

class VocabBatchUpdateRequest(BaseModel):
    payload: list[Dict[str, Any]]

@router.patch("/vocab/batch/{class_id}/{student_name}")
def patch_vocab_batch(class_id: str, student_name: str, req: VocabBatchUpdateRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _check_class_permission(class_id, current_user)
    result = batch_update_student_vocab(class_id, student_name, req.payload)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

class VocabUpdateRequest(BaseModel):
    updates: Dict[str, Any]

@router.patch("/vocab/{class_id}/{student_name}/{vocab_id}")
def patch_vocab(class_id: str, student_name: str, vocab_id: int, req: VocabUpdateRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _check_class_permission(class_id, current_user)
    result = update_student_vocab(class_id, student_name, vocab_id, req.updates)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

# ─────────────────────────────────────────────────────────────
# 수업 가이드
# ─────────────────────────────────────────────────────────────
@router.get("/lessons")
def get_lessons(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return fetch_lessons()

class LessonUpdateRequest(BaseModel):
    updates: Dict[str, Any]

@router.patch("/lessons/{lesson_num}")
def patch_lesson(lesson_num: int, req: LessonUpdateRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    result = update_lesson(lesson_num, req.updates)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

# ─────────────────────────────────────────────────────────────
# 협의록
# ─────────────────────────────────────────────────────────────
@router.get("/minutes")
def get_minutes(class_id: Optional[str] = Query(None), current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    if class_id:
        _check_class_permission(class_id, current_user)
    return fetch_minutes(class_id)

class MinuteRequest(BaseModel):
    date: str
    kind: str           # 수업협의 | 평가협의
    source: str         # 학생명 또는 차시 정보
    content: str
    class_id: str = ""
    class_name: str = ""

@router.post("/minutes")
def post_minute(req: MinuteRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    if req.class_id:
        _check_class_permission(req.class_id, current_user)
    result = add_minute_entry(req.date, req.kind, req.source, req.content, req.class_id, req.class_name)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

class MinuteUpdateRequest(BaseModel):
    source_type: str
    row_index: int
    updates: Dict[str, Any]

@router.patch("/minutes")
def patch_minute(req: MinuteUpdateRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    try:
        all_min = fetch_minutes()
        target = next((m for m in all_min if m.get("source_type") == req.source_type and int(m.get("row_index", -1)) == req.row_index), None)
        if not target:
            raise HTTPException(status_code=404, detail="협의록 항목을 찾을 수 없습니다.")

        role = str(current_user.get("role", "")).lower()
        if role not in ["admin", "superadmin"]:
            if req.source_type == "lessons":
                raise HTTPException(status_code=403, detail="수업가이드 수정은 관리자만 가능합니다.")
            user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
            entry_class = normalize_class_identifier(target.get("학급ID") or target.get("class_id"))
            if not user_class or entry_class != user_class:
                raise HTTPException(status_code=403, detail="본인 학급의 협의록만 수정할 수 있습니다.")

        result = update_minute_entry(req.source_type, req.row_index, req.updates)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail={"error": "API Error", "message": str(e), "trace": traceback.format_exc()})

@router.delete("/minutes/{source_type}/{row_index}")
def remove_minute(source_type: str, row_index: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    try:
        all_min = fetch_minutes()
        target = next((m for m in all_min if m.get("source_type") == source_type and int(m.get("row_index", -1)) == row_index), None)
        if not target:
            raise HTTPException(status_code=404, detail="협의록 항목을 찾을 수 없습니다.")

        role = str(current_user.get("role", "")).lower()
        if role not in ["admin", "superadmin"]:
            if source_type == "lessons":
                raise HTTPException(status_code=403, detail="수업가이드 삭제는 관리자만 가능합니다.")
            user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
            entry_class = normalize_class_identifier(target.get("학급ID") or target.get("class_id"))
            if not user_class or entry_class != user_class:
                raise HTTPException(status_code=403, detail="본인 학급의 협의록만 삭제할 수 있습니다.")

        result = delete_minute_entry(source_type, row_index)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail={"error": "API Error", "message": str(e), "trace": traceback.format_exc()})

# ─────────────────────────────────────────────────────────────
# 학급 현황
# ─────────────────────────────────────────────────────────────
@router.get("/overview")
def get_overview(class_id: Optional[str] = Query(None), current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    if class_id:
        _check_class_permission(class_id, current_user)
    return fetch_class_overview(class_id)

# ─────────────────────────────────────────────────────────────
# 인증제 현황
# ─────────────────────────────────────────────────────────────
@router.get("/certification/{class_id}/{student_name}")
def get_certification(class_id: str, student_name: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _check_class_permission(class_id, current_user)
    return fetch_certification_status(class_id, student_name)

# ─────────────────────────────────────────────────────────────
# 평가문장 (마우스오버 툴팁용)
# ─────────────────────────────────────────────────────────────
@router.get("/evaluation-sentences")
def get_sentences(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    return get_evaluation_sentences()
