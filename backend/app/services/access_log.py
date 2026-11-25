"""접속·행위 감사로그(숨김 탭 '접속기록'). 덧붙이기만 하고 고치거나 지우는 코드는 없다.

한 줄: 일시 | 사용자ID | 권한 | 행위 | 학생코드 | 사유 | IP | 경로 | 서명
행위: LOGIN·LOGIN_FAIL·VIEW·CREATE·UPDATE·DELETE·EXPORT·DENIED
서명 = HMAC(AUTH_SECRET, 앞 8칸) 앞 16자. 시트에서 칸을 고치면 서명이 맞지 않아 드러난다(verify_row).
보관: 최소 2년. 이 탭을 지우는 코드는 만들지 않는다.
"""
import hashlib
import hmac
import logging
import re
import threading
import time
from typing import Any, Dict, List, Optional

from app.adapters.sheets.client import open_main_sheet
from app.core.time import now_kst

logger = logging.getLogger(__name__)

TAB = "접속기록"
HEADERS = ["일시", "사용자ID", "권한", "행위", "학생코드", "사유", "IP", "경로", "서명"]
VIEW_DEDUPE_SECONDS = 600  # 같은 사람이 같은 학생을 10분 안에 다시 보면 한 번만 남긴다

_lock = threading.Lock()
_buffer: List[List[str]] = []
_seen_view: Dict[tuple, float] = {}
_ws_cache = None


def _secret() -> bytes:
    from app.core.config import settings
    return (settings.AUTH_SECRET or "pbst-access-log").encode()


def sign(cells: List[str]) -> str:
    return hmac.new(_secret(), "\x1f".join(cells).encode(), hashlib.sha256).hexdigest()[:16]


def verify_row(row: List[str]) -> bool:
    return len(row) >= 9 and hmac.compare_digest(sign([str(c) for c in row[:8]]), str(row[8]))


def make_row(user_id: str, roles: str, action: str, student: str = "", reason: str = "",
             ip: str = "", path: str = "") -> List[str]:
    cells = [now_kst().strftime("%Y-%m-%d %H:%M:%S"), str(user_id or ""), str(roles or ""), action,
             str(student or ""), str(reason or "")[:100], str(ip or ""), str(path or "")[:120]]
    return cells + [sign(cells)]


def record(user_id: str, roles: str, action: str, student: str = "", reason: str = "",
           ip: str = "", path: str = "") -> bool:
    """버퍼에 넣는다. VIEW는 10분 안 중복을 뺀다. 넣었으면 True."""
    now = time.time()
    with _lock:
        if action == "VIEW":
            key = (user_id, student)
            if now - _seen_view.get(key, 0) < VIEW_DEDUPE_SECONDS:
                return False
            _seen_view[key] = now
            if len(_seen_view) > 5000:
                _seen_view.clear()
        _buffer.append(make_row(user_id, roles, action, student, reason, ip, path))
        del _buffer[:-1000]  # 시트가 오래 막혀도 메모리는 1000줄까지만
    return True


def _ws():
    global _ws_cache
    if _ws_cache is not None:
        return _ws_cache
    ss = open_main_sheet()
    try:
        ws = ss.worksheet(TAB)
    except Exception:
        ws = ss.add_worksheet(title=TAB, rows=1000, cols=len(HEADERS))
        ws.update(range_name="A1", values=[HEADERS])
        try:
            ws.hide()
        except Exception:
            logger.warning("접속기록 탭 숨기기 실패", exc_info=True)
    _ws_cache = ws
    return ws


def flush() -> None:
    """버퍼를 시트에 덧붙인다. 실패하면 버퍼에 남겨 다음에 다시 보낸다. 요청 처리를 막지 않는다."""
    import os
    if os.getenv("PYTEST_CURRENT_TEST"):
        return  # 테스트가 운영 시트에 쓰지 않게
    with _lock:
        rows = list(_buffer)
        _buffer.clear()
    if not rows:
        return
    try:
        _ws().append_rows(rows, value_input_option="RAW")
    except Exception:
        logger.warning("접속기록 쓰기 실패(%d줄, 다음에 다시 시도)", len(rows), exc_info=True)
        with _lock:
            _buffer[:0] = rows
            del _buffer[:-1000]


# ── 요청 → 기록 ──────────────────────────────────────────
_CODE_IN_PATH = re.compile(r"(?<![0-9])(\d{4})(?![0-9])")
_SKIP = ("/api/v1/auth/login", "/api/v1/auth/me", "/api/v1/auth/logout", "/api/v1/auth/export-log")


def action_for(method: str, status: int) -> Optional[str]:
    if status in (401, 403):
        return "DENIED"
    if status >= 400:
        return None
    return {"GET": "VIEW", "POST": "CREATE", "PUT": "UPDATE", "PATCH": "UPDATE", "DELETE": "DELETE"}.get(method)


def _roster_codes() -> set:
    try:
        from app.services.sheets import fetch_student_status
        return {str(r.get("학생코드", "")).strip() for r in fetch_student_status()}
    except Exception:
        return set()


def student_in_request(path: str, query: Dict[str, Any], roster: Optional[set] = None) -> str:
    """요청에 든 학생코드(명단에 있는 4자리만. 연도·날짜 숫자는 거른다)."""
    cands = [str(query.get(k) or "").strip() for k in ("student_code", "code", "student")]
    cands += _CODE_IN_PATH.findall(path)
    cands = [c for c in cands if re.fullmatch(r"\d{4}", c)]
    if not cands:
        return ""
    roster = _roster_codes() if roster is None else roster
    return next((c for c in cands if c in roster), "")


def from_request(path: str, method: str, status: int, query: Dict[str, Any], user: Dict[str, Any], ip: str) -> bool:
    """API 요청 하나를 기록할지 정하고 버퍼에 넣는다. 개별 학생이 없는 GET(목록·통계)은 남기지 않는다."""
    if not path.startswith("/api/v1/") or path.startswith(_SKIP) or method == "OPTIONS":
        return False
    action = action_for(method, status)
    if not action:
        return False
    student = student_in_request(path, query)
    if action == "VIEW" and not student:
        return False
    return record(user.get("sub", ""), user.get("role", ""), action, student, "", ip, path)
