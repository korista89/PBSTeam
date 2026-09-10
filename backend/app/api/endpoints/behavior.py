from fastapi import APIRouter, HTTPException, Query, Body, Depends
from typing import Optional, List, Dict, Any
from app.services.sheets import fetch_all_records, get_sheets_client, safe_get_all_records, clear_cache, normalize_date_string
from app.core.config import settings
from app.api.deps import require_authenticated_user, require_admin, check_student_scope, normalize_class_identifier
from app.adapters.sheets.tier_status import TierStatusAdapter
import uuid
import datetime
import gspread

router = APIRouter()

# 짧은 키(프론트에서 쓰는 이름) -> 실제 구글폼 헤더 후보들(우선순위 순).
# 폼이 개편될 때마다 문항 텍스트가 바뀌어 온 이력이 있어(fetch_all_records의 매핑과 동일한
# 후보 목록), 시트의 실제 헤더 행에서 존재하는 첫 후보를 찾아 그 컬럼에 쓴다.
FIELD_HEADER_CANDIDATES: Dict[str, List[str]] = {
    "행동유형": ["행동 유형(핵심 행동으로 택1, 추가 설명 필요 시 특기사항란 기입)", "행동유형", "행동유형(핵심행동으로택1)", "(주요)행동유형", "주요행동유형"],
    "강도": ["강도(1~5)", "강도(1~5점 척도)", "강도"],
    "장소": ["행동 발생 장소(위기행동 시작 장소 기준)", "행동 발생 장소", "행동발생장소", "장소"],
    "기능": ["추정기능(이번 행동을 통해 파악된 기능)", "기능(이번 행동을 통해 파악된 기능)", "기능", "추정기능"],
    "발생횟수": ["발생횟수(한 에피소드 당 1회로 입력 권장)", "발생횟수", "발생빈도"],
    "특기사항": ["특기사항(기타)", "특기사항", "비고", "기타"],
    "배경사건": ["배경사건 - 오늘 평소와 다른 점이 있었나요? (복수 선택 가능)"],
    "선행사건": ["선행사건 - 행동 직전에 무엇이 있었나요?   (복수 선택 가능)"],
    "후속결과": ["후속결과 - 행동 직후 무엇이 달라졌나요?   (복수 선택 가능)"],
    "시간대": ["시간대(위기행동 시작 시간 기준)", "시간대", "시간대 (복수)", "시간대(복수)"],
}

@router.post("")
def submit_behavior_log(
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

    from app.services.sheets import get_main_worksheet
    log_main_ws = get_main_worksheet()
    if not log_main_ws:
        raise HTTPException(status_code=500, detail="Cannot access Google Sheets behavior worksheet")
    
    try:
        log_id = str(uuid.uuid4())
        is_crisis = (
            str(payload.get("방어 및 보호를 위한 제지 / 개별학생교육지원 / 본인·타인 상해 발생 여부", "")).strip()
            not in ("", "X - 보고서 작성 불필요")
        ) or str(payload.get("물리적제지, 3/4호분리지도,본인/타인상해 발생 여부", "")).startswith("O")
        status = "Pending" if is_crisis else "Approved"
        source = "Vercel"

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

        # 컬럼 순서를 코드에 하드코딩해서 구글 폼이 바뀔 때마다 밀리는 사고를 막기 위해,
        # 매번 시트의 실제 헤더 행을 읽어 그 순서·이름 그대로 채운다(위치 하드코딩 금지).
        real_headers = log_main_ws.row_values(1)
        row_data = [str(payload.get(h, "")) for h in real_headers]

        log_main_ws.append_row(row_data, table_range='A1')
        clear_cache("records")
            
        return {"success": True, "message": "Log submitted", "log_id": log_id, "status": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/approve")
def approve_behavior_log(
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
def revise_behavior_log(
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

@router.patch("/{log_id}")
def update_behavior_log(
    log_id: str,
    payload: dict = Body(...),
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """
    행동 로그의 데이터 필드를 수정한다 (전체 로그 페이지 인라인 편집용).
    필드명은 짧은 키(FIELD_HEADER_CANDIDATES) 또는 crisis_details의 원본 헤더명을 그대로 받는다.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="수정할 필드가 없습니다")

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
        except ValueError:
            raise HTTPException(status_code=500, detail="Schema error: Missing Log_ID column")
        student_code_idx = headers.index("학생코드") if "학생코드" in headers else None

        target_row_num = None
        target_row = None
        for i, row in enumerate(all_vals[1:]):
            row_log_id = row[log_id_idx] if log_id_idx < len(row) else ""
            if row_log_id == log_id:
                target_row_num = i + 2
                target_row = row
                break

        if target_row_num is None:
            raise HTTPException(status_code=404, detail="Log ID not found")

        student_code = target_row[student_code_idx] if student_code_idx is not None and student_code_idx < len(target_row) else ""
        if student_code:
            check_student_scope(student_code, current_user)

        cells = []
        for key, value in payload.items():
            header_text = key if key in headers else next(
                (c for c in FIELD_HEADER_CANDIDATES.get(key, []) if c in headers), None
            )
            if not header_text:
                continue
            col_idx = headers.index(header_text) + 1
            cells.append(gspread.Cell(row=target_row_num, col=col_idx, value=str(value)))

        if not cells:
            raise HTTPException(status_code=400, detail="일치하는 필드를 찾을 수 없습니다")

        log_main_ws.update_cells(cells)
        clear_cache("records")

        return {"success": True, "message": "Log updated", "updated_fields": len(cells)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeline/{student_id}")
def get_student_timeline(
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
def get_pending_logs(current_admin: Dict[str, Any] = Depends(require_admin)):
    """
    Fetch all pending logs requiring admin approval (Admin only).
    """
    records = fetch_all_records(force_refresh=False)
    pending_logs = [r for r in records if r.get("Status") == "Pending"]

    return {"success": True, "logs": pending_logs}


@router.get("/logs")
def get_all_logs(
    q: Optional[str] = Query(None, description="학생명/코드/교사명/행동유형/특기사항 검색어"),
    status: Optional[str] = Query(None, description="Status 필터 (Pending/Approved/Revision Requested)"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """
    전체 행동기록 원자료 조회/검색. 관리자는 전교 전체, 교사는 담임 학급 학생만 반환한다.
    """
    records = fetch_all_records(force_refresh=False)

    # 코드→학급 매핑을 한 번만 만들어 재사용 (레코드마다 전체 명단을 다시 스캔하지 않도록)
    students = TierStatusAdapter.fetch_students()
    code_to_class = {s.student_code.strip(): normalize_class_identifier(s.class_name) for s in students}

    role = str(current_user.get("role", "")).lower()
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        records = [
            r for r in records
            if code_to_class.get(str(r.get("학생코드") or r.get("코드번호") or "").strip()) == user_class
        ]

    if status and status != "전체":
        records = [r for r in records if str(r.get("Status", "")) == status]

    if start_date and end_date:
        sd = normalize_date_string(start_date)
        ed = normalize_date_string(end_date)
        records = [
            r for r in records
            if sd <= normalize_date_string(r.get("행동발생날짜", "")) <= ed
        ]

    if q:
        q_lower = q.strip().lower()

        def _matches(r: dict) -> bool:
            fields = [
                r.get("학생명", ""), r.get("학생코드", ""), r.get("코드번호", ""),
                r.get("입력교사명", ""), r.get("행동유형", ""), r.get("특기사항", ""),
            ]
            return any(q_lower in str(f).lower() for f in fields)

        records = [r for r in records if _matches(r)]

    for r in records:
        code = str(r.get("학생코드") or r.get("코드번호") or "").strip()
        r["학급"] = code_to_class.get(code, "")

    records = sorted(records, key=lambda r: str(r.get("타임스탬프", "")), reverse=True)

    return {"logs": records, "total": len(records)}
