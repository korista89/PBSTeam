"""SST(사회성·의사소통 기술 훈련) 프로그램 관리.

- 프로그램: 학년도마다 최대 6개. 이름·유형·시작월~종료월(월 단위)·대상 학생·목표 기술.
- 저장: 운영 시트의 숨김 탭 'SST_프로그램'(처음 저장할 때 앱이 만든다). 삭제는 상태='삭제'로 남긴다.
- 효과 모니터링: 대상 학생의 월별 위기행동 기록 건수(Log_Main)와 CICO 수행률(목표 여러 개면 평균)을
  운영 전 1개월(기초선)·운영 기간·운영 후 1개월로 나눠 보여 준다.
- Tier현황 맞춤: 사이트의 SST 표시는 TierStatus 'Tier2(SST)' 열이 기준이다. 이 달 운영 중인 프로그램 대상과
  그 열이 다르면 목록으로 보여 주고, 관리자가 학생별로 맞출 수 있다.
"""

import logging
from typing import Any, Dict, List, Optional

from app.adapters.sheets.client import get_cached, set_cached, invalidate_cache, open_main_sheet, safe_get_all_values
from app.adapters.sheets.cico_store import school_year
from app.core.time import now_kst

logger = logging.getLogger(__name__)

TAB = "SST_프로그램"
HEADERS = ["학년도", "프로그램명", "유형", "시작월", "종료월", "대상학생", "목표기술", "담당", "메모", "상태", "수정시각"]
MAX_PROGRAMS = 6
TYPES = ["의사소통", "사회적 기술", "정서·자기조절", "기타"]
SCHOOL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]  # 학년도 순서
CACHE_KEY = "sheet:sst:programs"


def month_index(m: int) -> int:
    return SCHOOL_MONTHS.index(int(m))


def calendar_year(sy: int, m: int) -> int:
    return sy if int(m) >= 3 else sy + 1


def program_months(p: Dict[str, Any]) -> List[int]:
    a, b = month_index(p["start"]), month_index(p["end"])
    return SCHOOL_MONTHS[a:b + 1]


def runs_in(p: Dict[str, Any], month: int) -> bool:
    return int(month) in program_months(p)


# ── 저장소 ─────────────────────────────────────────────
def _ws():
    ss = open_main_sheet()
    try:
        return ss.worksheet(TAB)
    except Exception:
        ws = ss.add_worksheet(title=TAB, rows=200, cols=len(HEADERS))
        ws.update(range_name="A1", values=[HEADERS])
        try:
            ws.hide()  # 운영 시트는 사람이 보는 4개 탭만 보이게 둔다
        except Exception:
            logger.warning("SST_프로그램 탭 숨기기 실패", exc_info=True)
        return ws


def _parse_row(row_no: int, rec: Dict[str, str]) -> Optional[Dict[str, Any]]:
    try:
        start, end = int(rec.get("시작월") or 0), int(rec.get("종료월") or 0)
    except ValueError:
        return None
    if start not in SCHOOL_MONTHS or end not in SCHOOL_MONTHS:
        return None
    return {
        "id": row_no,
        "year": int(rec.get("학년도") or 0),
        "name": rec.get("프로그램명", ""),
        "type": rec.get("유형", ""),
        "start": start,
        "end": end,
        "targets": [c.strip() for c in str(rec.get("대상학생", "")).split(",") if c.strip()],
        "skills": rec.get("목표기술", ""),
        "staff": rec.get("담당", ""),
        "memo": rec.get("메모", ""),
        "deleted": rec.get("상태", "") == "삭제",
    }


def _all_rows() -> List[Dict[str, Any]]:
    cached = get_cached(CACHE_KEY, ttl=60)
    if cached is not None:
        return cached
    try:
        values = safe_get_all_values(open_main_sheet().worksheet(TAB))
    except Exception:
        values = []  # 탭이 아직 없으면 프로그램 0개
    hdr = values[0] if values else HEADERS
    out = []
    for i, row in enumerate(values[1:], start=2):
        p = _parse_row(i, {h: (row[j] if j < len(row) else "") for j, h in enumerate(hdr)})
        if p:
            out.append(p)
    set_cached(CACHE_KEY, out)
    return out


def list_programs(sy: Optional[int] = None) -> List[Dict[str, Any]]:
    sy = sy or school_year()
    return [p for p in _all_rows() if p["year"] == sy and not p["deleted"]]


def validate(data: Dict[str, Any], sy: int, editing_id: Optional[int] = None) -> Optional[str]:
    if not str(data.get("name", "")).strip():
        return "프로그램 이름을 적어 주세요."
    try:
        start, end = int(data.get("start")), int(data.get("end"))
    except (TypeError, ValueError):
        return "시작월·종료월을 골라 주세요."
    if start not in SCHOOL_MONTHS or end not in SCHOOL_MONTHS:
        return "시작월·종료월은 1~12월이어야 합니다."
    if month_index(start) > month_index(end):
        return "종료월이 시작월보다 앞입니다(학년도는 3월에 시작합니다)."
    if not data.get("targets"):
        return "대상 학생을 한 명 이상 골라 주세요."
    others = [p for p in list_programs(sy) if p["id"] != editing_id]
    if len(others) >= MAX_PROGRAMS:
        return f"프로그램은 학년도마다 {MAX_PROGRAMS}개까지 만들 수 있습니다."
    return None


def _row_values(data: Dict[str, Any], sy: int, status: str = "") -> List[str]:
    stamp = now_kst().replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
    targets = ",".join(dict.fromkeys(str(c).strip() for c in data.get("targets", []) if str(c).strip()))
    return [str(sy), str(data.get("name", "")).strip(), str(data.get("type", "")), str(int(data["start"])),
            str(int(data["end"])), targets, str(data.get("skills", "")), str(data.get("staff", "")),
            str(data.get("memo", "")), status, stamp]


def save_program(data: Dict[str, Any], program_id: Optional[int] = None) -> Dict[str, Any]:
    sy = school_year()
    err = validate(data, sy, program_id)
    if err:
        return {"error": err}
    ws = _ws()
    if program_id:
        if not any(p["id"] == program_id for p in list_programs(sy)):
            return {"error": "프로그램을 찾을 수 없습니다."}
        ws.update(range_name=f"A{program_id}", values=[_row_values(data, sy)], value_input_option="RAW")
    else:
        ws.append_rows([_row_values(data, sy)], value_input_option="RAW", table_range="A1")
    invalidate_cache(CACHE_KEY)
    return {"message": "저장했습니다."}


def delete_program(program_id: int) -> Dict[str, Any]:
    p = next((p for p in list_programs() if p["id"] == program_id), None)
    if not p:
        return {"error": "프로그램을 찾을 수 없습니다."}
    col = HEADERS.index("상태") + 1
    _ws().update_cell(program_id, col, "삭제")  # 행은 남긴다(되살리려면 시트에서 상태 칸을 비운다)
    invalidate_cache(CACHE_KEY)
    return {"message": "삭제했습니다."}


# ── 효과 모니터링 ───────────────────────────────────────
def _crisis_counts(codes: List[str], months: List[int], sy: int) -> Dict[str, Dict[int, int]]:
    from app.services.sheets import fetch_all_records
    keys = {f"{calendar_year(sy, m)}-{m:02d}": m for m in months}
    out = {c: {m: 0 for m in months} for c in codes}
    for r in fetch_all_records() or []:
        code = str(r.get("학생코드", "")).strip()
        m = keys.get(str(r.get("행동발생날짜", ""))[:7])
        if code in out and m:
            out[code][m] += 1
    return out


def _cico_rates(codes: List[str], months: List[int]) -> Dict[str, Dict[int, Optional[float]]]:
    from app.services.sheets import get_cico_report_data
    out = {c: {m: None for m in months} for c in codes}
    for m in months:
        if m not in range(3, 13):
            continue  # CICO는 3~12월
        try:
            rows = (get_cico_report_data(m) or {}).get("students", [])
        except Exception:
            logger.warning("SST 모니터링: %s월 CICO 읽기 실패", m, exc_info=True)
            continue
        acc: Dict[str, List[float]] = {}
        for s in rows:
            if s.get("code") in out and s.get("rate_num") is not None:
                acc.setdefault(s["code"], []).append(float(s["rate_num"]))
        for c, rates in acc.items():
            out[c][m] = round(sum(rates) / len(rates), 1)
    return out


def monitor_program(program_id: int, allowed_codes: Optional[set] = None) -> Dict[str, Any]:
    """운영 전 1개월·운영 기간·운영 후 1개월의 학생별·집단 평균 지표. 아직 오지 않은 달은 뺀다."""
    from app.services.sheets import fetch_student_status
    sy = school_year()
    p = next((x for x in list_programs(sy) if x["id"] == program_id), None)
    if not p:
        return {"error": "프로그램을 찾을 수 없습니다."}
    a, b = month_index(p["start"]), month_index(p["end"])
    now_idx = month_index(now_kst().month) if school_year() == sy else len(SCHOOL_MONTHS) - 1
    phases = []
    if a > 0:
        phases.append((SCHOOL_MONTHS[a - 1], "운영 전"))
    phases += [(m, "운영 중") for m in SCHOOL_MONTHS[a:b + 1]]
    if b + 1 < len(SCHOOL_MONTHS):
        phases.append((SCHOOL_MONTHS[b + 1], "운영 후"))
    phases = [(m, ph) for m, ph in phases if month_index(m) <= now_idx]
    months = [m for m, _ in phases]

    codes = [c for c in p["targets"] if allowed_codes is None or c in allowed_codes]
    roster = {str(s.get("학생코드", "")).strip(): s for s in fetch_student_status() or []}
    crisis = _crisis_counts(codes, months, sy)
    cico = _cico_rates(codes, months)

    def avg(vals):
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    return {
        "program": {**p, "targets": codes},
        "months": [{
            "month": m, "phase": ph,
            "crisis_avg": avg([crisis[c][m] for c in codes]),
            "cico_avg": avg([cico[c][m] for c in codes]),
            "cico_n": sum(1 for c in codes if cico[c][m] is not None),
        } for m, ph in phases],
        "students": [{
            "code": c,
            "name": roster.get(c, {}).get("학생이름", ""),
            "class": roster.get(c, {}).get("학급", ""),
            "crisis": {str(m): crisis[c][m] for m in months},
            "cico": {str(m): cico[c][m] for m in months},
        } for c in codes],
    }


# ── Tier현황 맞춤 ──────────────────────────────────────
def tier_sync_status(month: int) -> Dict[str, Any]:
    """이 달 운영 중인 프로그램 대상 ↔ TierStatus 'Tier2(SST)'=O 비교."""
    from app.services.sheets import fetch_student_status
    running = [p for p in list_programs() if runs_in(p, month)]
    in_program: Dict[str, List[str]] = {}
    for p in running:
        for c in p["targets"]:
            in_program.setdefault(c, []).append(p["name"])
    roster = {str(s.get("학생코드", "")).strip(): s for s in fetch_student_status() or []}
    sst_on = {c for c, s in roster.items() if str(s.get("Tier2(SST)", "")).strip().upper() == "O"}

    def row(c, programs):
        s = roster.get(c, {})
        return {"code": c, "name": s.get("학생이름", ""), "class": s.get("학급", ""), "programs": programs}

    return {
        "month": month,
        "running": [p["name"] for p in running],
        "need_on": [row(c, ps) for c, ps in in_program.items() if c not in sst_on and c in roster],
        "need_off": [row(c, []) for c in sorted(sst_on - set(in_program))],
        "matched": len(sst_on & set(in_program)),
        "unknown": [c for c in in_program if c not in roster],
    }
