from fastapi import APIRouter, HTTPException, Query, Body
from typing import Optional, List, Dict, Any
from app.services.sheets import fetch_all_records, get_sheets_client
from app.core.config import settings
import uuid
import datetime

router = APIRouter()

@router.post("/")
async def submit_behavior_log(payload: dict = Body(...)):
    """
    Submit a new behavior log from Vercel Frontend.
    Handles 'Intensity' branching and auto-forwards to Google Sheets.
    """
    client = get_sheets_client()
    if not client:
        raise HTTPException(status_code=500, detail="Cannot access Google Sheets")
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        log_main_ws = sheet.worksheet("Log_Main")
        
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
            "학생코드", "Log_ID", "Status", "Source", "Approval_Meta"
        ]
        
        row_data = []
        
        payload["Log_ID"] = log_id
        payload["Status"] = status
        payload["Source"] = source
        payload["타임스탬프"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        for h in headers:
            row_data.append(str(payload.get(h, "")))
            
        log_main_ws.append_row(row_data)
        
        # If crisis report is required, write to Log_Crisis
        if is_crisis:
            try:
                crisis_ws = sheet.worksheet("Log_Crisis")
            except Exception:
                # Create if not exists
                crisis_ws = sheet.add_worksheet(title="Log_Crisis", rows=1000, cols=30)
                
            # Hardcode crisis headers matching the complex report
            crisis_headers = [
                "Log_ID", "발생 시 지도교사", 
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
            
            # Write headers row if the worksheet is brand new and empty
            if len(crisis_ws.row_values(1)) == 0:
                crisis_ws.append_row(crisis_headers)

            crisis_row = []
            for ch in crisis_headers:
                crisis_row.append(str(payload.get(ch, "")))
            crisis_ws.append_row(crisis_row)
            
        return {"success": True, "message": "Log submitted", "log_id": log_id, "status": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/approve")
async def approve_behavior_log(payload: dict = Body(...)):
    """
    Approve a pending behavior log.
    Requires Admin ID.
    """
    log_id = payload.get("log_id")
    admin_id = payload.get("admin_id")
    
    if not log_id or not admin_id:
        raise HTTPException(status_code=400, detail="log_id and admin_id required")
        
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
                
                # Update row
                # +2 because enumerate is 0-indexed and row 1 is headers
                log_main_ws.update_cell(i + 2, status_idx + 1, "Approved")
                log_main_ws.update_cell(i + 2, approval_idx + 1, meta)
                
                return {"success": True, "message": "Log approved"}
                
        raise HTTPException(status_code=404, detail="Log ID not found")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/timeline/{student_id}")
async def get_student_timeline(student_id: str):
    """
    Fetch merged timeline of behaviors for a student.
    """
    records = fetch_all_records(force_refresh=True)
    student_logs = []
    
    for r in records:
        if str(r.get("학생코드", "")) == student_id or str(r.get("학생명", "")) == student_id:
            student_logs.append(r)
            
    # Also fetch Log_Crisis details for Pending/Crisis logs
    client = get_sheets_client()
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        crisis_ws = sheet.worksheet("Log_Crisis")
        crisis_vals = crisis_ws.get_all_records()
        
        crisis_dict = {str(c.get("Log_ID")): c for c in crisis_vals if c.get("Log_ID")}
        
        for log in student_logs:
            lid = log.get("Log_ID")
            if lid and lid in crisis_dict:
                log["crisis_details"] = crisis_dict[lid]
    except Exception:
        pass # Optional, if Log_Crisis doesn't exist yet or fails
            
    return {"student_id": student_id, "logs": student_logs}

@router.get("/pending")
async def get_pending_logs():
    """
    Fetch all pending logs requiring admin approval.
    """
    records = fetch_all_records(force_refresh=True)
    pending_logs = [r for r in records if r.get("Status") == "Pending"]
    
    # Also fetch Log_Crisis details for these
    client = get_sheets_client()
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        crisis_ws = sheet.worksheet("Log_Crisis")
        crisis_vals = crisis_ws.get_all_records()
        
        crisis_dict = {str(c.get("Log_ID")): c for c in crisis_vals if c.get("Log_ID")}
        
        for log in pending_logs:
            lid = log.get("Log_ID")
            if lid and lid in crisis_dict:
                log["crisis_details"] = crisis_dict[lid]
    except Exception:
        pass
        
    return {"success": True, "logs": pending_logs}
