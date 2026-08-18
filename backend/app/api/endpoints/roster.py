from fastapi import APIRouter, HTTPException, Depends
from app.services.sheets import fetch_all_records, fetch_student_codes, update_student_codes
from typing import List, Dict, Any
from app.api.deps import require_authenticated_user, require_admin, get_student_class_code, normalize_class_identifier

router = APIRouter()

@router.get("")
async def get_roster(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    from app.services.sheets import fetch_student_status

    status_records = fetch_student_status()
    role = str(current_user.get("role", "")).lower()
    user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id")) if role not in ["admin", "superadmin"] else None

    # Count students per canonical class
    class_counts = {}
    for r in status_records:
        cls = normalize_class_identifier(r.get("학급") or r.get("Class") or "")
        if cls:
            class_counts[cls] = class_counts.get(cls, 0) + 1

    sections_def = [
        {"section": "유치원", "classes": ["유1", "유2"]},
        {"section": "초등", "classes": ["초1-1", "초1-2", "초2-1", "초2-2", "초3-1", "초3-2", "초4-1", "초4-2", "초5-1", "초5-2", "초6-1", "초6-2"]},
        {"section": "중학교", "classes": ["중1-1", "중1-2", "중2-1", "중2-2", "중3-1", "중3-2", "중순회"]},
        {"section": "고등학교", "classes": ["고1-1", "고1-2", "고2-1", "고2-2", "고3-1", "고3-2", "고순회"]},
        {"section": "전공과", "classes": ["전1-1", "전1-2", "전1-3", "전2-1", "전2-2", "전2-3"]},
        {"section": "예비", "classes": ["예비"]}
    ]

    result = []
    for sec in sections_def:
        matched_classes = []
        for cname in sec["classes"]:
            if user_class and cname != user_class:
                continue
            matched_classes.append({
                "class_name": cname,
                "student_count": class_counts.get(cname, 0)
            })
        if matched_classes:
            result.append({
                "section": sec["section"],
                "classes": matched_classes
            })

    return result

@router.get("/codes")
async def get_codes(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    mapping = fetch_student_codes()
    role = str(current_user.get("role", "")).lower()
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        scoped_mapping = {}
        for name, code in mapping.items():
            if get_student_class_code(str(code)) == user_class:
                scoped_mapping[name] = code
        return scoped_mapping
    return mapping

@router.post("/codes")
async def save_codes(
    codes: list[dict[str, str]],
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    result = update_student_codes(codes)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
