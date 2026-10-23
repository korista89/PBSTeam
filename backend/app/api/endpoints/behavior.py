from fastapi import APIRouter, HTTPException, Query, Body, Depends
from app.adapters.sheets.resilience import SheetUnavailable
from typing import Optional, List, Dict, Any
from app.services.sheets import fetch_all_records, get_sheets_client, safe_get_all_records, clear_cache, normalize_date_string, FORM_REPORT_HEADERS
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

        # 실명이 시트에 들어가지 않게 별칭으로 저장(이미 별칭이면 그대로)
        if payload.get("학생명"):
            from app.core.privacy import mask_name
            payload["학생명"] = mask_name(payload["학생명"])
        # 입력자는 화면 값이 아니라 로그인 계정으로 기록한다(본인 기록 수정·삭제 권한의 기준)
        payload["입력교사명"] = _author_label(current_user)
        action = str(payload.get(ACTION_HEADER, "")).strip()
        if action in REPORT_REQUIRED and not str(payload.get(REPORT_REQUIRED[action], "")).strip():
            raise HTTPException(status_code=400, detail="제지·개별학생교육지원·상해가 있었다면 위기행동 발생 보고서를 작성해야 합니다.")
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
        except SheetUnavailable:
            raise
        except Exception:
            pass

        # 컬럼 순서를 코드에 하드코딩해서 구글 폼이 바뀔 때마다 밀리는 사고를 막기 위해,
        # 매번 시트의 실제 헤더 행을 읽어 그 순서·이름 그대로 채운다(위치 하드코딩 금지).
        real_headers = log_main_ws.row_values(1)
        row_data = [str(payload.get(h, "")) for h in real_headers]

        log_main_ws.append_row(row_data, table_range='A1')
        clear_cache("records")
            
        return {"success": True, "message": "Log submitted", "log_id": log_id, "status": status}
    except (HTTPException, SheetUnavailable):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── 권한·상태 규칙 ──────────────────────────────────────────────
# 관리자: 모든 기록 추가·수정·삭제·재작성 요청·승인. 교사: 본인이 입력한 기록만 수정·삭제.
# 교사가 보고서(위기조치 있는 기록)를 고치면 다시 승인 대기(Pending)로 돌아간다(재제출).
# 삭제는 행을 지우지 않고 Status=Deleted 로 남긴다(되돌릴 수 있게). 모든 조회에서 제외된다.
NO_REPORT_ACTIONS = {"", "X - 보고서 작성 불필요", "X(보고서 작성 불필요)"}
ACTION_HEADER = "방어 및 보호를 위한 제지 / 개별학생교육지원 / 본인·타인 상해 발생 여부"
# 조치유형별로 반드시 채워야 하는 보고서 항목(경위)
REPORT_REQUIRED = {
    "방어 및 보호를 위한 제지": "[제지] 방어 및 보호를 위한 제지를 사용하게 된 경위",
    "개별학생교육지원": "[개별학생교육지원] 개별학생교육지원을 실시하게 된 경위",
    "본인/타인상해만 발생": "[상해]  상해가 발생하게 된 경위",
}


def _is_admin(user: Dict[str, Any]) -> bool:
    return str(user.get("role", "")).lower() in ["admin", "superadmin"]


def _author_label(user: Dict[str, Any]) -> str:
    return str(user.get("name") or user.get("id") or "알수없음").strip()


def _is_author(row_author: str, user: Dict[str, Any]) -> bool:
    row_author = str(row_author or "").strip()
    return bool(row_author) and row_author in {str(user.get("id", "")).strip(), str(user.get("name", "")).strip()} - {""}


def _now_str() -> str:
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _load_log_row(log_id: str):
    """(worksheet, headers, row_num, row) — 없으면 404. 삭제된 기록도 404."""
    if not log_id:
        raise HTTPException(status_code=400, detail="log_id required")
    client = get_sheets_client()
    if not client:
        raise HTTPException(status_code=500, detail="Cannot access Google Sheets")
    ws = client.open_by_url(settings.SHEET_URL).worksheet("Log_Main")
    all_vals = ws.get_all_values()
    headers = all_vals[0] if all_vals else []
    for col in ("Log_ID", "Status", "Approval_Meta"):
        if col not in headers:
            raise HTTPException(status_code=500, detail=f"Schema error: Missing {col} column")
    id_idx = headers.index("Log_ID")
    for i, row in enumerate(all_vals[1:]):
        if (row[id_idx] if id_idx < len(row) else "") == log_id:
            if _cell(row, headers, "Status") == "Deleted":
                break
            return ws, headers, i + 2, row
    raise HTTPException(status_code=404, detail="Log ID not found")


def _cell(row: list, headers: list, header: str) -> str:
    k = headers.index(header) if header in headers else -1
    return str(row[k]).strip() if 0 <= k < len(row) else ""


def _set_status(ws, headers, row_num, status: str, meta: str):
    ws.update_cells([
        gspread.Cell(row=row_num, col=headers.index("Status") + 1, value=status),
        gspread.Cell(row=row_num, col=headers.index("Approval_Meta") + 1, value=meta),
    ])
    clear_cache("records")
    try:
        from app.adapters.sheets.client import invalidate_cache
        invalidate_cache()
    except Exception:
        pass


@router.post("/approve")
def approve_behavior_log(
    payload: dict = Body(...),
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    """승인(관리자). 승인 대기·재작성 요청 상태에서 승인할 수 있다."""
    try:
        ws, headers, row_num, row = _load_log_row(payload.get("log_id"))
        if _cell(row, headers, "Status") == "Approved":
            return {"success": False, "message": "Already approved"}
        _set_status(ws, headers, row_num, "Approved", f"Approved by {_author_label(current_admin)} on {_now_str()}")
        return {"success": True, "message": "Log approved"}
    except (HTTPException, SheetUnavailable):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/revise")
def revise_behavior_log(
    payload: dict = Body(...),
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    """재작성 요청(관리자). 승인된 기록에도 요청할 수 있다. 작성자가 고치면 다시 승인 대기로 돌아간다."""
    try:
        ws, headers, row_num, row = _load_log_row(payload.get("log_id"))
        memo = str(payload.get("memo", "")).strip()
        _set_status(ws, headers, row_num, "Revision Requested",
                    f"Revision requested by {_author_label(current_admin)} on {_now_str()}. Memo: {memo}")
        return {"success": True, "message": "Revision requested"}
    except (HTTPException, SheetUnavailable):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sign")
def sign_behavior_log(
    payload: dict = Body(...),
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    """결재 단계 확인(관리자): 담당자확인·교감확인·학교장확인·학교장보고요청. cancel=true 면 취소.
    학교장확인이 되면 보고서는 최종 승인(Approved)으로 바뀐다."""
    from app.services.sheets import APPROVAL_STEPS, add_approval_step
    step = str(payload.get("step", "")).strip()
    if step not in APPROVAL_STEPS:
        raise HTTPException(status_code=400, detail=f"step 은 {', '.join(APPROVAL_STEPS)} 중 하나여야 합니다.")
    cancel = bool(payload.get("cancel"))
    try:
        ws, headers, row_num, row = _load_log_row(payload.get("log_id"))
        add_approval_step(payload["log_id"], step, _author_label(current_admin), cancel=cancel, memo=str(payload.get("memo", "")))
        if step == "학교장확인" and not cancel and _cell(row, headers, "Status") != "Approved":
            _set_status(ws, headers, row_num, "Approved", f"Approved by {_author_label(current_admin)} (학교장확인) on {_now_str()}")
        return {"success": True, "step": step, "cancel": cancel}
    except (HTTPException, SheetUnavailable):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/inbox")
def get_approval_inbox(
    kind: str = Query("all", description="report(보고서) | data(데이터만) | all"),
    days: int = Query(30, ge=1, le=400),
    pending_only: bool = Query(False, description="학교장확인 전인 것만"),
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    """결재함 목록(관리자): 보고서와 데이터만 입력 기록을 결재 단계 상태와 함께 돌려준다."""
    from app.services.sheets import fetch_approval_states
    since = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    states = fetch_approval_states()
    out = []
    for r in fetch_all_records(force_refresh=False):
        log_id = str(r.get("Log_ID", "")).strip()
        if not log_id:
            continue  # 결재 단계는 Log_ID 로 연결된다(Log_ID 없는 옛 폼 기록 제외)
        is_report = str(r.get("물리적제지여부", "")).startswith("O")
        if (kind == "report" and not is_report) or (kind == "data" and is_report):
            continue
        status = str(r.get("Status", ""))
        signed = states.get(log_id, {})
        # 결재 대기·재작성 요청은 기간과 무관하게 보이고, 나머지는 최근 기간만
        if status not in ("Pending", "Revision Requested") and normalize_date_string(r.get("행동발생날짜", "")) < since:
            continue
        if pending_only and "학교장확인" in signed:
            continue
        out.append({**r, "kind": "report" if is_report else "data", "signoffs": signed})
    out.sort(key=lambda r: (r.get("Status") != "Pending", str(r.get("타임스탬프", ""))), reverse=False)
    out.sort(key=lambda r: str(r.get("행동발생날짜", "")), reverse=True)
    out.sort(key=lambda r: r.get("Status") not in ("Pending", "Revision Requested"))
    return {"success": True, "logs": out}


@router.delete("/{log_id}")
def delete_behavior_log(
    log_id: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """삭제(관리자는 모든 기록, 교사는 본인 기록). 행은 남기고 Status=Deleted 로 표시한다."""
    try:
        ws, headers, row_num, row = _load_log_row(log_id)
        if not _is_admin(current_user) and not _is_author(_cell(row, headers, "입력교사명"), current_user):
            raise HTTPException(status_code=403, detail="본인이 입력한 기록만 삭제할 수 있습니다.")
        _set_status(ws, headers, row_num, "Deleted", f"Deleted by {_author_label(current_user)} on {_now_str()}")
        return {"success": True, "message": "Log deleted"}
    except (HTTPException, SheetUnavailable):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{log_id}")
def update_behavior_log(
    log_id: str,
    payload: dict = Body(...),
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """
    행동 로그의 데이터 필드를 수정한다 (관리자는 모든 기록, 교사는 본인 기록).
    필드명은 짧은 키(FIELD_HEADER_CANDIDATES) 또는 crisis_details의 원본 헤더명을 그대로 받는다.
    Status·Log_ID·입력교사명 등 관리 열은 여기서 바꿀 수 없다.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="수정할 필드가 없습니다")
    try:
        ws, headers, row_num, row = _load_log_row(log_id)
        admin = _is_admin(current_user)
        if not admin and not _is_author(_cell(row, headers, "입력교사명"), current_user):
            raise HTTPException(status_code=403, detail="본인이 입력한 기록만 수정할 수 있습니다.")

        protected = {"Log_ID", "Status", "Approval_Meta", "Source", "타임스탬프", "입력교사명", "학생코드", "학생명"}
        cells = []
        for key, value in payload.items():
            header_text = key if key in headers else next(
                (c for c in FIELD_HEADER_CANDIDATES.get(key, []) + [FORM_REPORT_HEADERS.get(key, "")] if c in headers), None
            )
            if not header_text or header_text in protected:
                continue
            cells.append(gspread.Cell(row=row_num, col=headers.index(header_text) + 1, value=str(value)))
        if not cells:
            raise HTTPException(status_code=400, detail="일치하는 필드를 찾을 수 없습니다")
        ws.update_cells(cells)

        # 교사가 보고서를 고치면(또는 재작성 요청에 응하면) 다시 승인 대기로
        status = _cell(row, headers, "Status")
        action = _cell(row, headers, ACTION_HEADER) if ACTION_HEADER in headers else ""
        is_report = action not in NO_REPORT_ACTIONS
        if not admin and (status == "Revision Requested" or (is_report and status == "Approved")):
            _set_status(ws, headers, row_num, "Pending", f"Resubmitted by {_author_label(current_user)} on {_now_str()}")
        else:
            clear_cache("records")
        return {"success": True, "message": "Log updated", "updated_fields": len(cells)}
    except (HTTPException, SheetUnavailable):
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
