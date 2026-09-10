from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.services.sheets import (
    get_monthly_cico_data,
    update_monthly_cico_cells,
    update_student_cico_settings,
    toggle_tier2_status,
    get_holidays_from_config,
    get_business_days,
    get_cico_report_data,
    create_monthly_cico_sheet
)
from app.api.deps import require_authenticated_user, require_admin, check_student_scope, normalize_class_identifier, get_student_class_code

router = APIRouter()

class GenerateSheetRequest(BaseModel):
    year: int
    month: int

@router.post("/generate")
def generate_cico_sheet(req: GenerateSheetRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    """Generate a monthly CICO sheet with dropdowns for students marked as Tier2(CICO) - Admin only."""
    if req.month < 1 or req.month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")

    result = create_monthly_cico_sheet(req.year, req.month)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/business-days")
def get_cico_business_days(
    month: int = 3,
    year: int = 2025,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Get business days (weekdays excluding holidays) for a given month."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")
    holidays = get_holidays_from_config()
    days = get_business_days(year, month, holidays)
    return {"month": month, "year": year, "business_days": days, "holidays": holidays}


@router.get("/report")
def get_cico_report(
    month: int = 3,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Get T2 CICO report data for decision making."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")
    data = get_cico_report_data(month)
    if "error" in data:
        if "없습니다" in data["error"]:
            raise HTTPException(status_code=404, detail=data["error"])
        raise HTTPException(status_code=500, detail=data["error"])

    role = str(current_user.get("role", "")).lower()
    if role not in ["admin", "superadmin"] and isinstance(data, dict) and "students" in data:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        scoped_students = [
            s for s in data.get("students", [])
            if get_student_class_code(str(s.get("code") or s.get("student_code") or s.get("학생코드") or "").strip()) == user_class
        ]
        data["students"] = scoped_students

        # The summary counts baked in by get_cico_report_data are school-wide; a teacher
        # should only see their own class's totals, not "16명 중" school-wide figures.
        if isinstance(data.get("summary"), dict):
            rates = [float(s.get("rate_num", 0) or 0) for s in scoped_students]
            achieved = sum(1 for s in scoped_students if s.get("목표_달성_여부", "") == "O")
            data["summary"] = {
                **data["summary"],
                "total_students": len(set(s.get("code") for s in scoped_students if s.get("code"))),
                "avg_rate": round(sum(rates) / len(rates), 1) if rates else 0,
                "achieved_count": achieved,
                "not_achieved_count": len(scoped_students) - achieved,
            }

    return data

@router.get("/monthly")
def get_cico_monthly(
    month: int = 3,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Get Tier2 student data for a monthly sheet (scoped by teacher class or admin)."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")

    data = get_monthly_cico_data(month)
    if "error" in data:
        if "없습니다" in data["error"]:
             raise HTTPException(status_code=404, detail=data["error"])
        raise HTTPException(status_code=500, detail=data["error"])

    role = str(current_user.get("role", "")).lower()
    if role not in ["admin", "superadmin"] and isinstance(data, dict) and "students" in data:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        scoped_students = []
        for s in data.get("students", []):
            st_code = str(s.get("code") or s.get("student_code") or s.get("학생코드") or "").strip()
            if get_student_class_code(st_code) == user_class:
                scoped_students.append(s)
        data["students"] = scoped_students

    return data


class CellUpdate(BaseModel):
    row: int
    col: int  # 1-based column index
    value: str


class BatchUpdateRequest(BaseModel):
    month: int
    updates: list[CellUpdate]


def _is_valid_daily_value(scale: str, value: str) -> bool:
    """Validate a CICO daily entry against the row's configured scale."""
    normalized = str(value).strip()
    if normalized == "":
        return True
    scale = str(scale or "").strip()
    if "O/X" in scale:
        return normalized in {"O", "X"}
    if "0점/1점/2점" in scale:
        return normalized in {"0", "1", "2", "0점", "1점", "2점"}
    try:
        numeric = float(normalized.replace("점", "").replace("회", "").replace("분", ""))
    except ValueError:
        return False
    if "0~5" in scale:
        return 0 <= numeric <= 5
    if "0~7" in scale:
        return 0 <= numeric <= 7
    if "1~100" in scale:
        return 0 <= numeric <= 100
    return False


@router.post("/monthly/update")
def update_cico_cells(
    req: BatchUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Batch update daily cell values in a monthly sheet (scoped by student/class authorization)."""
    if req.month < 1 or req.month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")

    monthly_data = get_monthly_cico_data(req.month)
    if "error" in monthly_data:
        raise HTTPException(status_code=500, detail=monthly_data["error"])

    students = monthly_data.get("students", [])
    row_to_student = {int(s.get("row", -1)): s for s in students}
    allowed_daily_columns = {
        int(day.get("index", -1)) + 1 for day in monthly_data.get("day_columns", [])
    }
    role = str(current_user.get("role", "")).lower()

    # Pre-validate the complete batch before any Sheet write is attempted.
    for u in req.updates:
        target_student = row_to_student.get(u.row)
        if not target_student:
            raise HTTPException(status_code=404, detail=f"Row {u.row} does not map to a known student record.")
        if role not in ["admin", "superadmin"]:
            st_code = target_student.get("학생코드") or ""
            check_student_scope(str(st_code), current_user)
        if u.col not in allowed_daily_columns:
            raise HTTPException(status_code=400, detail=f"Column {u.col} is not a daily CICO input column.")
        if not _is_valid_daily_value(target_student.get("척도", ""), u.value):
            raise HTTPException(status_code=400, detail=f"'{u.value}' is not valid for scale '{target_student.get('척도', '')}'.")

    updates = [{"row": u.row, "col": u.col, "value": u.value} for u in req.updates]
    result = update_monthly_cico_cells(req.month, updates)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


class SettingsUpdateRequest(BaseModel):
    month: int
    student_code: str
    settings: dict
    row_index: Optional[int] = None


@router.post("/settings")
def update_settings(
    req: SettingsUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Update CICO settings for a student (scoped to assigned class)."""
    check_student_scope(req.student_code, current_user)
    result = update_student_cico_settings(req.month, req.student_code, req.settings, req.row_index)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


class Tier2ToggleRequest(BaseModel):
    month: int
    student_code: str
    status: str  # "O" or "X"


@router.post("/tier2-toggle")
def tier2_toggle(
    req: Tier2ToggleRequest,
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    """Toggle Tier2 status for a student in a monthly sheet (Admin only)."""
    if req.status not in ("O", "X"):
        raise HTTPException(status_code=400, detail="Status must be 'O' or 'X'")

    result = toggle_tier2_status(req.month, req.student_code, req.status)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
