"""2027 완전 비식별(Zero-PII) 모드의 서버 기능.

- 보호자 동의(숨김 탭 '보호자동의'): 미동의·철회 학생은 2027 모드에서 개별 분석·집계에서 뺀다.
- 익명코드 이관: 학생 표기(별칭 김O준)를 무작위 익명코드(K27-418)로 모든 탭에서 바꾼다.
  대응표(익명코드→이전 표기)는 서버에 두지 않고 관리자에게 한 번 내려준다(되돌리기·오프라인 보관용).
- 졸업·전출생 서술 기록 파기: 재학여부 X 학생의 서술 칸만 비우고 날짜·유형·강도 같은 통계 칸은 남긴다.
"""
import logging
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.adapters.sheets.client import get_cached, set_cached, invalidate_cache, open_main_sheet
from app.core.config import settings
from app.core.privacy import anonymize_text, is_anon_code, new_anon_code
from app.core.time import now_kst

logger = logging.getLogger(__name__)

ZERO_PII = "2027_FULL_ZERO_PII"


def zero_pii_on() -> bool:
    return settings.PRIVACY_MODE == ZERO_PII


# ── 보호자 동의 ──────────────────────────────────────────
CONSENT_TAB = "보호자동의"
CONSENT_HEADERS = ["학생코드", "동의상태", "동의일", "보관기한", "수정시각", "수정자"]
CONSENT_STATES = ("동의", "미동의", "철회")


def _consent_ws():
    ss = open_main_sheet()
    try:
        return ss.worksheet(CONSENT_TAB)
    except Exception:
        ws = ss.add_worksheet(title=CONSENT_TAB, rows=400, cols=len(CONSENT_HEADERS))
        ws.update(range_name="A1", values=[CONSENT_HEADERS])
        try:
            ws.hide()
        except Exception:
            pass
        return ws


def consent_map() -> Dict[str, Dict[str, str]]:
    cached = get_cached("svc:consent", ttl=120)
    if cached is not None:
        return cached
    try:
        values = open_main_sheet().worksheet(CONSENT_TAB).get_all_values()
    except Exception:
        values = []
    hdr = values[0] if values else CONSENT_HEADERS
    out = {}
    for r in values[1:]:
        rec = dict(zip(hdr, r + [""] * (len(hdr) - len(r))))
        if rec.get("학생코드"):
            out[str(rec["학생코드"]).strip()] = rec
    set_cached("svc:consent", out)
    return out


def set_consent(code: str, state: str, date: str, until: str, author: str) -> Dict[str, str]:
    if state not in CONSENT_STATES:
        raise ValueError("동의상태는 동의·미동의·철회 중 하나입니다.")
    ws = _consent_ws()
    row = [str(code).strip(), state, date or "", until or "", now_kst().strftime("%Y-%m-%d %H:%M"), author]
    codes = ws.col_values(1)
    if row[0] in codes:
        ws.update(range_name=f"A{codes.index(row[0]) + 1}", values=[row], value_input_option="RAW")
    else:
        ws.append_rows([row], value_input_option="RAW")
    invalidate_cache("svc:consent")
    return dict(zip(CONSENT_HEADERS, row))


def excluded_codes() -> set:
    """2027 모드에서 분석·집계에서 뺄 학생코드(미동의·철회). 2026 모드에서는 빈 집합."""
    if not zero_pii_on():
        return set()
    return {c for c, r in consent_map().items() if r.get("동의상태") in ("미동의", "철회")}


def ensure_analyzable(code: str) -> None:
    """개별 분석(AI·FBA 근거 등) 입구에서 부른다."""
    if str(code or "").strip() in excluded_codes():
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="보호자 동의가 없는(미동의·철회) 학생은 개별 분석에서 제외됩니다.")


# ── 익명코드 이관 ────────────────────────────────────────
SKIP_TABS = {"Users", "날짜 관리", "평가문장", "접속기록", CONSENT_TAB}
SKIP_COLS = {"입력교사명", "Author", "RecordedBy", "입력자", "ID", "Password", "작성자", "UpdatedBy", "By", "수정자", "담당"}
NAME_COLS = {"학생명", "학생이름", "학생명(코드)", "Name"}


def build_code_map(students: Iterable[Dict[str, Any]], year: int) -> Dict[str, str]:
    """{이전 표기(별칭): 익명코드}. 이미 익명코드인 학생은 그대로 두고, 같은 표기는 같은 코드."""
    taken = {str(s.get("학생이름", "")).strip() for s in students if is_anon_code(s.get("학생이름"))}
    out: Dict[str, str] = {}
    for s in students:
        name = str(s.get("학생이름", "")).strip()
        if not name or is_anon_code(name) or name in out:
            continue
        out[name] = new_anon_code(taken, year)
        taken.add(out[name])
    return out


def _bare(name: str) -> str:
    return re.sub(r"\(\d+\)$", "", name.strip()).strip()


def plan_changes(tabs: Dict[str, List[List[str]]], code_map: Dict[str, str]) -> Dict[str, List[Tuple[int, int, str, str]]]:
    """{탭: [(행, 열, 이전값, 새값)]}. 이름 칸은 통째로, 그 밖의 글 칸은 글 속 표기를 바꾼다. 교사 칸은 건드리지 않는다."""
    # '김O준-2513'처럼 접미사가 붙은 표기와 접미사 없는 표기를 모두 찾는다
    text_map = dict(code_map)
    for alias, code in code_map.items():
        base = alias.split("-")[0]
        if base != alias and sum(1 for a in code_map if a.split("-")[0] == base) == 1:
            text_map.setdefault(base, code)
    changes: Dict[str, List[Tuple[int, int, str, str]]] = {}
    for tab, rows in tabs.items():
        if tab in SKIP_TABS or not rows:
            continue
        hdr = rows[0]
        for ri in range(1, len(rows)):
            for ci, cell in enumerate(rows[ri]):
                if not isinstance(cell, str) or not cell or cell.startswith("="):
                    continue
                h = hdr[ci] if ci < len(hdr) else ""
                if h in SKIP_COLS:
                    continue
                if h in NAME_COLS:
                    m = re.match(r"^(.*?)(\(\d+\))?$", cell.strip())
                    code = text_map.get(m.group(1).strip())
                    new = code + (m.group(2) or "") if code else cell
                else:
                    new = anonymize_text(cell, text_map)
                if new != cell:
                    changes.setdefault(tab, []).append((ri, ci, cell, new))
    return changes


def _a1(ri: int, ci: int) -> str:
    s, n = "", ci + 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return f"{s}{ri + 1}"


def write_changes(ss, changes: Dict[str, List[Tuple[int, int, str, str]]], use_old: bool = False) -> int:
    n = 0
    for tab, cells in changes.items():
        for i in range(0, len(cells), 3000):
            part = cells[i:i + 3000]
            body = [{"range": f"'{tab}'!{_a1(r, c)}", "values": [[old if use_old else new]]} for r, c, old, new in part]
            ss.values_batch_update({"valueInputOption": "RAW", "data": body})
            n += len(part)
    return n


def read_tabs(ss) -> Dict[str, List[List[str]]]:
    out = {}
    for ws in ss.worksheets():
        if ws.title in SKIP_TABS:
            continue
        try:
            out[ws.title] = ws.get_all_values(value_render_option="FORMULA")
        except Exception:
            logger.warning("탭 읽기 실패: %s", ws.title, exc_info=True)
    return out


def migrate_to_anon(apply: bool, year: Optional[int] = None) -> Dict[str, Any]:
    """재학생 표기를 익명코드로. apply=False면 바뀔 셀 수만. 결과의 code_map은 화면에서 한 번 내려받게 한다."""
    from app.services.sheets import fetch_student_status, clear_cache
    year = year or now_kst().year
    students = [s for s in fetch_student_status() if str(s.get("재학여부", "")).strip().upper() != "X"]
    code_map = build_code_map(students, year)
    targets = [("main", open_main_sheet())]
    try:
        from app.adapters.sheets.client import open_pw_sheet
        targets.append(("pw", open_pw_sheet()))
    except Exception:
        pass
    summary, total = {}, 0
    for label, ss in targets:
        changes = plan_changes(read_tabs(ss), code_map)
        summary.update({f"{label}:{t}": len(c) for t, c in changes.items()})
        if apply and changes:
            total += write_changes(ss, changes)
    if apply:
        clear_cache()
    return {"students": len(code_map), "cells": summary, "written": total,
            "code_map": {code: alias for alias, code in code_map.items()}}


# ── 졸업·전출생 서술 기록 파기 ─────────────────────────────
# 서술 칸으로 보는 머리글(부분 일치). 날짜·시간·장소·유형·강도·기능·선택형 칸은 통계용으로 남긴다.
NARRATIVE_HINTS = ("특기사항", "경위", "방법", "내용", "상해를 입은 사람", "담당한 교사", "메모", "Memo", "Content",
                   "Hypothesis", "Strategies", "Plan", "Definition", "Goals", "Info", "Considerations", "Report",
                   "Crisis", "Home", "Support", "BIP(JSON)", "팀 협의", "목표행동", "15열", "Wish")
KEY_COLS = {"학생코드", "StudentCode"}
PURGED = "[파기]"


def _narrative(h: str) -> bool:
    return h not in KEY_COLS and any(k in h for k in NARRATIVE_HINTS)


def plan_purge(tabs: Dict[str, List[List[str]]], codes: set, names: set) -> Dict[str, List[Tuple[int, int, str, str]]]:
    changes: Dict[str, List[Tuple[int, int, str, str]]] = {}
    for tab, rows in tabs.items():
        if tab in SKIP_TABS or not rows:
            continue
        hdr = rows[0]
        kc = next((i for i, h in enumerate(hdr) if h in KEY_COLS), None)
        nc = next((i for i, h in enumerate(hdr) if h in NAME_COLS), None)
        if kc is None and nc is None:
            continue
        for ri in range(1, len(rows)):
            r = rows[ri]
            code = r[kc].strip() if kc is not None and kc < len(r) else ""
            name = _bare(r[nc]) if nc is not None and nc < len(r) else ""
            if not ((code and code in codes) or (name and name in names)):
                continue
            for ci, cell in enumerate(r):
                h = hdr[ci] if ci < len(hdr) else ""
                if cell and cell != PURGED and not str(cell).startswith("=") and _narrative(h):
                    changes.setdefault(tab, []).append((ri, ci, cell, PURGED))
            if nc is not None and nc < len(r) and r[nc] and r[nc] != "졸업·전출":
                changes.setdefault(tab, []).append((ri, nc, r[nc], "졸업·전출"))
    return changes


def purge_graduates(apply: bool) -> Dict[str, Any]:
    from app.services.sheets import fetch_student_status, clear_cache
    gone = [s for s in fetch_student_status() if str(s.get("재학여부", "")).strip().upper() == "X"]
    codes = {str(s.get("학생코드", "")).strip() for s in gone if s.get("학생코드")}
    names = {str(s.get("학생이름", "")).strip() for s in gone if s.get("학생이름")}
    ss = open_main_sheet()
    changes = plan_purge(read_tabs(ss), codes, names)
    written = write_changes(ss, changes) if apply and changes else 0
    if apply:
        clear_cache()
    return {"students": len(codes), "cells": {t: len(c) for t, c in changes.items()}, "written": written}


def rollback_anon(code_map: Dict[str, str]) -> Dict[str, Any]:
    """익명코드 이관 되돌리기: 이관 때 내려받은 대응표 {익명코드: 이전 표기}로 거꾸로 바꾼다."""
    from app.adapters.sheets.client import open_pw_sheet
    from app.services.sheets import clear_cache
    bad = [k for k in code_map if not is_anon_code(k)]
    if bad:
        raise ValueError(f"대응표 형식이 아닙니다: {bad[:3]}")
    total = 0
    for ss in (open_main_sheet(), open_pw_sheet()):
        total += write_changes(ss, plan_changes(read_tabs(ss), code_map))
    clear_cache()
    return {"written": total}
