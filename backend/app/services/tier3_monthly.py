"""Tier3·Tier3+ 월별 대상자 관리.

- 저장: 운영 시트 숨김 탭 'Tier3_월별'(처음 저장할 때 앱이 만든다). 학년도·월·학생 한 줄, 단계는 Tier3 또는 Tier3+.
  명단 정정으로 뺀 줄은 상태='제외'로 남긴다(월 중도 해제 개념은 없다 — 변화는 지난달 대비로 본다).
- 이 표가 Tier3/Tier3+의 달마다 출처다. TierStatus의 Tier3·Tier3+ 칸은 이번 달의 거울로,
  바뀌면 tier_monthly.mirror_after_change가 맞춘다.
"""

import gspread
import logging
from typing import Any, Dict, List, Optional

from app.adapters.sheets.client import get_cached, set_cached, invalidate_cache, open_main_sheet, safe_get_all_values
from app.adapters.sheets.cico_store import school_year
from app.core.privacy import mask_name
from app.core.time import now_kst
from app.services.sst import SCHOOL_MONTHS, month_index, _crisis_counts

logger = logging.getLogger(__name__)

TAB = "Tier3_월별"
HEADERS = ["학년도", "월", "학생코드", "학생명", "학급", "단계", "메모", "상태", "수정시각"]
LEVELS = ["Tier3", "Tier3+"]
CACHE_KEY = "sheet:tier3m:rows"


def prev_month(m: int) -> Optional[int]:
    i = month_index(m)
    return SCHOOL_MONTHS[i - 1] if i > 0 else None


def tierstatus_level(s: Dict[str, Any]) -> str:
    """TierStatus 한 줄의 지금 단계. Tier3+가 켜져 있으면 Tier3+로 본다."""
    if str(s.get("Tier3+", "")).strip().upper() == "O":
        return "Tier3+"
    if str(s.get("Tier3", "")).strip().upper() == "O":
        return "Tier3"
    return ""


# ── 저장소 ─────────────────────────────────────────────
def _ws():
    ss = open_main_sheet()
    try:
        return ss.worksheet(TAB)
    except gspread.WorksheetNotFound:  # 없을 때만 만든다(일시 장애에 같은 이름 탭을 또 만들지 않게)
        ws = ss.add_worksheet(title=TAB, rows=1000, cols=len(HEADERS))
        ws.update(range_name="A1", values=[HEADERS])
        try:
            ws.hide()
        except Exception:
            logger.warning("Tier3_월별 탭 숨기기 실패", exc_info=True)
        return ws


def _rows() -> List[Dict[str, Any]]:
    cached = get_cached(CACHE_KEY, ttl=60)
    if cached is not None:
        return cached
    try:
        values = safe_get_all_values(open_main_sheet().worksheet(TAB))
    except gspread.WorksheetNotFound:
        values = []
    # 그 밖의 읽기 실패(할당량 초과 등)는 올린다. 예전엔 빈 표로 60초 캐시돼 Tier3 학생이 Tier2·표 없음으로 잘못 보였다.
    hdr = values[0] if values else HEADERS
    out = []
    for i, row in enumerate(values[1:], start=2):
        rec = {h: (row[j] if j < len(row) else "") for j, h in enumerate(hdr)}
        rec["_row"] = i
        out.append(rec)
    set_cached(CACHE_KEY, out)
    return out


def month_rows(sy: int, month: int, include_excluded: bool = False) -> List[Dict[str, Any]]:
    return [r for r in _rows() if r.get("학년도") == str(sy) and r.get("월") == str(month)
            and (include_excluded or r.get("상태") != "제외")]


def _stamp() -> str:
    return now_kst().replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")


def _append(sy: int, month: int, items: List[Dict[str, Any]]):
    if not items:
        return
    _ws().append_rows([[str(sy), str(month), it["code"], mask_name(it.get("name", "")), it.get("class", ""),
                        it["level"], it.get("memo", ""), "", _stamp()] for it in items],
                      value_input_option="RAW", table_range="A1")
    invalidate_cache(CACHE_KEY)


def _set(row: int, field: str, value: str):
    from gspread.utils import rowcol_to_a1
    ws = _ws()
    ws.batch_update([{"range": rowcol_to_a1(row, HEADERS.index(field) + 1), "values": [[value]]},
                     {"range": rowcol_to_a1(row, HEADERS.index("수정시각") + 1), "values": [[_stamp()]]}],
                    value_input_option="RAW")
    invalidate_cache(CACHE_KEY)


def _roster() -> Dict[str, Dict[str, Any]]:
    from app.services.sheets import fetch_student_status
    return {str(s.get("학생코드", "")).strip(): s for s in fetch_student_status() or [] if s.get("학생코드")}


# ── 명단 만들기·고치기 ───────────────────────────────────
def fill_from_tierstatus(month: int) -> Dict[str, Any]:
    """TierStatus에서 지금 Tier3/Tier3+인 학생 중 이 달 명단에 없는 학생을 넣는다(제외한 줄은 되살리지 않음)."""
    sy = school_year()
    have = {r["학생코드"] for r in month_rows(sy, month, include_excluded=True)}
    items = [{"code": c, "name": s.get("학생이름", ""), "class": s.get("학급", ""), "level": tierstatus_level(s)}
             for c, s in _roster().items() if tierstatus_level(s) and c not in have]
    _append(sy, month, items)
    return {"message": f"Tier현황에서 {len(items)}명을 넣었습니다." if items else "빠진 학생이 없습니다.", "added": len(items),
            "codes": [i["code"] for i in items]}


def copy_prev(month: int) -> Dict[str, Any]:
    """지난달 명단(제외 줄 빼고)을 단계·메모까지 이 달로 가져온다. 이 달에 이미 있는 학생은 건너뛴다."""
    sy = school_year()
    pm = prev_month(month)
    if pm is None:
        return {"error": "3월은 학년도 첫 달이라 가져올 지난달이 없습니다."}
    prev = month_rows(sy, pm)
    if not prev:
        return {"error": f"{pm}월 Tier3 명단이 없습니다."}
    have = {r["학생코드"] for r in month_rows(sy, month, include_excluded=True)}
    items = [{"code": r["학생코드"], "name": r.get("학생명", ""), "class": r.get("학급", ""), "level": r.get("단계", "Tier3"),
              "memo": r.get("메모", "")} for r in prev if r["학생코드"] not in have]
    _append(sy, month, items)
    return {"message": f"{pm}월에서 {len(items)}명을 가져왔습니다(이미 있음 {len(prev) - len(items)}명).", "added": len(items),
            "codes": [i["code"] for i in items]}


def add_student(month: int, code: str, level: str) -> Dict[str, Any]:
    if level not in LEVELS:
        return {"error": "단계는 Tier3 또는 Tier3+입니다."}
    sy = school_year()
    code = str(code).strip()
    s = _roster().get(code)
    if not s:
        return {"error": f"학생코드 {code}를 Tier현황에서 찾을 수 없습니다."}
    existing = next((r for r in month_rows(sy, month, include_excluded=True) if r["학생코드"] == code), None)
    if existing and existing.get("상태") != "제외":
        return {"error": "이미 이 달 명단에 있습니다."}
    if existing:  # 제외했던 줄이면 되살린다
        _set(existing["_row"], "상태", "")
        _set(existing["_row"], "단계", level)
    else:
        _append(sy, month, [{"code": code, "name": s.get("학생이름", ""), "class": s.get("학급", ""), "level": level}])
    return {"message": "추가했습니다."}


def _own_row(month: int, row: int) -> Optional[Dict[str, Any]]:
    return next((r for r in month_rows(school_year(), month, include_excluded=True) if r["_row"] == row), None)


def update_row(month: int, row: int, level: Optional[str] = None, memo: Optional[str] = None,
               excluded: Optional[bool] = None) -> Dict[str, Any]:
    own = _own_row(month, row)
    if not own:
        return {"error": "이 달 명단의 줄이 아닙니다."}
    if level is not None:
        if level not in LEVELS:
            return {"error": "단계는 Tier3 또는 Tier3+입니다."}
        _set(row, "단계", level)
    if memo is not None:
        _set(row, "메모", memo)
    if excluded is not None:
        _set(row, "상태", "제외" if excluded else "")
    return {"message": "저장했습니다.", "code": own["학생코드"]}


# ── 화면 자료 ───────────────────────────────────────────
def overview(month: int) -> Dict[str, Any]:
    """이 달 명단 + 학년도 월별 기록(신규·종료·상향·하향 계산용) + 위기행동 건수 + CICO·SST 병행."""
    sy = school_year()
    pm = prev_month(month)
    rows = month_rows(sy, month, include_excluded=True)

    history: Dict[str, Dict[str, str]] = {}
    names: Dict[str, Dict[str, str]] = {}
    for r in _rows():
        if r.get("학년도") == str(sy) and r.get("상태") != "제외":
            history.setdefault(str(r.get("월")), {})[r["학생코드"]] = r.get("단계", "Tier3")
            names[r["학생코드"]] = {"name": r.get("학생명", ""), "class": r.get("학급", "")}

    codes = sorted({r["학생코드"] for r in rows} | set(history.get(str(pm), {}) if pm else []))
    months = [m for m in (pm, month) if m]
    crisis = _crisis_counts(codes, months, sy) if codes else {}

    cico_codes: set = set()
    try:
        from app.adapters.sheets.cico_store import open_store
        cico_codes = {r.get("학생코드") for r in open_store(open_main_sheet()).month_rows(sy, month)
                      if str(r.get("Tier2", "")).strip().upper() == "O"}
    except Exception:
        logger.warning("Tier3 관리: CICO 명단 읽기 실패", exc_info=True)
    sst_by_code: Dict[str, List[str]] = {}
    try:
        from app.services.sst import list_programs, runs_in
        for p in list_programs(sy):
            if runs_in(p, month):
                for c in p["targets"]:
                    sst_by_code.setdefault(c, []).append(p["name"])
    except Exception:
        logger.warning("Tier3 관리: SST 프로그램 읽기 실패", exc_info=True)

    roster = _roster()
    is_current = month == now_kst().month
    return {
        "month": month,
        "prev_month": pm,
        "is_current": is_current,
        "history": history,
        "names": names,
        "rows": [{
            "row": r["_row"],
            "code": r["학생코드"],
            "name": r.get("학생명", ""),
            "class": r.get("학급", ""),
            "level": r.get("단계", "Tier3"),
            "prev_level": history.get(str(pm), {}).get(r["학생코드"], "") if pm else "",
            "memo": r.get("메모", ""),
            "excluded": r.get("상태") == "제외",
            "crisis": crisis.get(r["학생코드"], {}).get(month, 0),
            "crisis_prev": crisis.get(r["학생코드"], {}).get(pm, 0) if pm else None,
            "cico": r["학생코드"] in cico_codes,
            "sst": sst_by_code.get(r["학생코드"], []),
            "tierstatus": tierstatus_level(roster.get(r["학생코드"], {})),
        } for r in rows],
    }

