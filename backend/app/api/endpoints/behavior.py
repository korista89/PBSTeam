from fastapi import APIRouter, HTTPException, Query, Body, Depends
from typing import Optional, List, Dict, Any
from app.services.sheets import fetch_all_records, get_sheets_client, safe_get_all_records
from app.core.config import settings
from app.api.deps import require_authenticated_user, require_admin, check_student_scope
import uuid
import datetime

router = APIRouter()

@router.post("")
async def submit_behavior_log(
    payload: dict = Body(...),
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """
    Submit a new behavior log from Vercel Frontend.
    Handles 'Intensity' branching and auto-forwards to Google Sheets with student scope validation.
    """
    student_identifier = str(payload.get("학생코드") or payload.get("학생명") or "").strip()
    if student_identifier:
        check_student_scope(student_identifier, current_user)

    from app.services.sheets import get_main_worksheet, clear_cache
    log_main_ws = get_main_worksheet()
    if not log_main_ws:
        raise HTTPException(status_code=500, detail="Cannot access Google Sheets behavior worksheet")
    
    try:
        log_id = str(uuid.uuid4())
        is_crisis = str(payload.get("물리적제지, 3/4호분리지도,본인/타인상해 발생 여부", "")).startswith("O")
        status = "Pending" if is_crisis else "Approved"
        source = "Vercel"
        
        # Hardcode headers to match exact Google Form fields
        headers = [
            "타임스탬프", "학생명", "입력교사명", "행동발생날짜", "시간대", 
            "행동 발생 장소", "행동유형(핵심행동으로택1)", "강도(1~5점 척도)",
            "기능(이번 행동을 통해 파악된 기능)", "물리적제지, 3/4호분리지도,본인/타인상해 발생 여부",
            "발생횟수(한 에피소드 당 1회로 입력 권장)", "특기사항(기타)",
            "학생코드", "Log_ID", "Status", "Source", "Approval_Meta",
            "발생 시 지도교사", 
            "1차_개별학생교육지원_시간", "1차_개별학생교육지원_장소", "1차_개별학생교육지원_교사",
            "2차_개별학생교육지원_시간", "2차_개별학생교육지원_장소", "2차_개별학생교육지원_교사",
            "A_배경_선행사건", "B_나타난_위기행동", "C_후속결과",
            "1차_경위", "2차_경위", "1차_관찰기록", "2차_관찰기록",
            "부상자_치료_시간", "부상자_치료_내용",
            "관리자_보고_시간", "관리자_보고_내용",
            "학부모_알림_시간", "학부모_알림_내용",
            "학생_상담_시간", "학생_상담_내용",
            "학부모_상담_시간", "학부모_상담_내용",
            "긴급회의_시간", "긴급회의_내용"
        ]
        
        row_data = []
        
        payload["Log_ID"] = log_id
        payload["Status"] = status
        payload["Source"] = source
        now = datetime.datetime.now()
        ampm = "오후" if now.hour >= 12 else "오전"
        hour12 = now.hour % 12 or 12
        payload["타임스탬프"] = f"{now.year}. {now.month}. {now.day} {ampm} {hour12}:{now.minute:02d}:{now.second:02d}"
        
        try:
            if "행동발생날짜" in payload and "-" in payload["행동발생날짜"]:
                dt = datetime.datetime.strptime(payload["행동발생날짜"], "%Y-%m-%d")
                payload["행동발생날짜"] = f"{dt.year}. {dt.month}. {dt.day}"
        except Exception:
            pass
        
        for h in headers:
            row_data.append(str(payload.get(h, "")))
            
        log_main_ws.append_row(row_data, table_range='A1')
        clear_cache("records")
            
        return {"success": True, "message": "Log submitted", "log_id": log_id, "status": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/approve")
async def approve_behavior_log(
    payload: dict = Body(...),
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    """
    Approve a pending behavior log (Admin only).
    """
    log_id = payload.get("log_id")
    admin_id = current_admin.get("id") or current_admin.get("name") or "Admin"
    
    if not log_id:
        raise HTTPException(status_code=400, detail="log_id required")
        
    client = get_sheets_client()
    if not client:
        raise HTTPException(status_code=500, detail="Cannot access Google Sheets")
        
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        log_main_ws = sheet.worksheet("Log_Main")
        
        all_vals = log_main_ws.get_all_values()
        if len(all_vals) < 2:
            raise HTTPException(status_code=404, detail="No logs found")
            
        headers = all_vals[0]
        try:
            log_id_idx = headers.index("Log_ID")
            status_idx = headers.index("Status")
            approval_idx = headers.index("Approval_Meta")
        except ValueError:
            raise HTTPException(status_code=500, detail="Schema error: Missing Log_ID or Status columns")
            
        for i, row in enumerate(all_vals[1:]):
            row_log_id = row[log_id_idx] if log_id_idx < len(row) else ""
            if row_log_id == log_id:
                row_status = row[status_idx] if status_idx < len(row) else ""
                if row_status == "Approved":
                    return {"success": False, "message": "Already approved"}
                
                meta = f"Approved by {admin_id} on {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                
                log_main_ws.update_cell(i + 2, status_idx + 1, "Approved")
                log_main_ws.update_cell(i + 2, approval_idx + 1, meta)
                clear_cache("records")
                
                return {"success": True, "message": "Log approved"}
                
        raise HTTPException(status_code=404, detail="Log ID not found")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/revise")
async def revise_behavior_log(
    payload: dict = Body(...),
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    """
    Request revision for a pending behavior log (Admin only).
    """
    log_id = payload.get("log_id")
    admin_id = current_admin.get("id") or current_admin.get("name") or "Admin"
    memo = payload.get("memo", "")
    
    if not log_id:
        raise HTTPException(status_code=400, detail="log_id required")
        
    client = get_sheets_client()
    if not client:
        raise HTTPException(status_code=500, detail="Cannot access Google Sheets")
        
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        log_main_ws = sheet.worksheet("Log_Main")
        
        all_vals = log_main_ws.get_all_values()
        if len(all_vals) < 2:
            raise HTTPException(status_code=404, detail="No logs found")
            
        headers = all_vals[0]
        try:
            log_id_idx = headers.index("Log_ID")
            status_idx = headers.index("Status")
            approval_idx = headers.index("Approval_Meta")
        except ValueError:
            raise HTTPException(status_code=500, detail="Schema error: Missing Log_ID or Status columns")
            
        for i, row in enumerate(all_vals[1:]):
            row_log_id = row[log_id_idx] if log_id_idx < len(row) else ""
            if row_log_id == log_id:
                row_status = row[status_idx] if status_idx < len(row) else ""
                if row_status == "Approved":
                    return {"success": False, "message": "Already approved"}
                
                meta = f"Revision requested by {admin_id} on {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}. Memo: {memo}"
                
                log_main_ws.update_cell(i + 2, status_idx + 1, "Revision Requested")
                log_main_ws.update_cell(i + 2, approval_idx + 1, meta)
                clear_cache("records")
                
                return {"success": True, "message": "Revision requested"}
                
        raise HTTPException(status_code=404, detail="Log ID not found")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/timeline/{student_id}")
async def get_student_timeline(
    student_id: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """
    Fetch merged timeline of behaviors for a student with scope check.
    """
    check_student_scope(student_id, current_user)
    records = fetch_all_records(force_refresh=False)
    student_logs = []
    
    for r in records:
        if str(r.get("학생코드", "")) == student_id or str(r.get("학생명", "")) == student_id:
            student_logs.append(r)
            
    return {"student_id": student_id, "logs": student_logs}

@router.get("/pending")
async def get_pending_logs(current_admin: Dict[str, Any] = Depends(require_admin)):
    """
    Fetch all pending logs requiring admin approval (Admin only).
    """
    records = fetch_all_records(force_refresh=False)
    pending_logs = [r for r in records if r.get("Status") == "Pending"]
        
    return {"success": True, "logs": pending_logs}
