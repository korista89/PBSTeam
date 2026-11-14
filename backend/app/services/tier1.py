"""Tier1(보편적 지원) 프로그램 관리와 성과.

- 프로그램: 이름·유형·월 단위 기간·대상 범위(전교 / 과정 / 학급)·표적 행동유형·장소(비우면 전체)·목표 감소율.
  저장은 운영 시트 숨김 탭 'Tier1_프로그램'(처음 저장할 때 앱이 만든다). 삭제는 상태='삭제'로 남긴다.
- 프로그램 성과: 대상 범위 학생의 표적 위기행동 기록 건수를 운영 전 1개월(기초선)·운영 중·운영 후 1개월로 나눠
  학생 10명당 건수로 비교하고, 목표 감소율 달성 여부와 범위 안의 'Tier1만' 비율을 함께 본다.
- 연간 현황: 전교 월별 위기행동 기록과 Tier 분포(Tier1만·Tier2·Tier3, 월별 표 기준).
"""

import logging
from collections import Counter
from typing import Any, Dict, List, Optional

from app.adapters.sheets.client import get_cached, set_cached, invalidate_cache, open_main_sheet, safe_get_all_values
from app.adapters.sheets.cico_store import school_year
from app.core.time import now_kst
from app.services.sst import SCHOOL_MONTHS, month_index, calendar_year

logger = logging.getLogger(__name__)

TAB = "Tier1_프로그램"
HEADERS = ["학년도", "프로그램명", "유형", "시작월", "종료월", "범위", "범위값", "행동유형", "장소", "목표감소율", "내용", "담당", "메모", "상태", "수정시각"]
TYPES = ["기대행동 교수", "강화 체계(토큰·경은마트)", "학급 규칙·환경 구성", "의사소통 지원(그림말)", "교직원 연수", "학부모 연계", "기타"]
SCOPES = ["전교", "과정", "학급"]
COURSES = {"1": "유치원", "2": "초등", "3": "중학교", "4": "고등", "5": "전공과"}
CACHE_KEY = "sheet:tier1:programs"
SEP = "|"  # 행동유형 이름에 쉼표가 있어 구분자로 '|'를 쓴다


def course_of(code: str) -> str:
    return COURSES.get(str(code)[:1], "")


# ── 저장소 ─────────────────────────────────────────────
def _ws():
    ss = open_main_sheet()
    try:
        return ss.worksheet(TAB)
    except Exception:
        ws = ss.add_worksheet(title=TAB, rows=200, cols=len(HEADERS))
        ws.update(range_name="A1", values=[HEADERS])
        try:
            ws.hide()
        except Exception:
            logger.warning("Tier1_프로그램 탭 숨기기 실패", exc_info=True)
        return ws


def _split(v: str) -> List[str]:
    return [x.strip() for x in str(v or "").split(SEP) if x.strip()]


def _rows() -> List[Dict[str, Any]]:
    cached = get_cached(CACHE_KEY, ttl=60)
    if cached is not None:
        return cached
    try:
        values = safe_get_all_values(open_main_sheet().worksheet(TAB))
    except Exception:
        values = []
    hdr = values[0] if values else HEADERS
    out = []
    for i, row in enumerate(values[1:], start=2):
        r = {h: (row[j] if j < len(row) else "") for j, h in enumerate(hdr)}
        try:
            start, end = int(r.get("시작월") or 0), int(r.get("종료월") or 0)
        except ValueError:
            continue
        if start not in SCHOOL_MONTHS or end not in SCHOOL_MONTHS:
            continue
        try:
            goal = float(r.get("목표감소율") or 0) or None
        except ValueError:
            goal = None
        out.append({
            "id": i, "year": int(r.get("학년도") or 0), "name": r.get("프로그램명", ""), "type": r.get("유형", ""),
            "start": start, "end": end, "scope": r.get("범위") or "전교", "scope_values": _split(r.get("범위값")),
            "behaviors": _split(r.get("행동유형")), "places": _split(r.get("장소")), "goal_pct": goal,
            "content": r.get("내용", ""), "staff": r.get("담당", ""), "memo": r.get("메모", ""),
            "deleted": r.get("상태") == "삭제",
        })
    set_cached(CACHE_KEY, out)
    return out


def list_programs(sy: Optional[int] = None) -> List[Dict[str, Any]]:
    sy = sy or school_year()
    return [p for p in _rows() if p["year"] == sy and not p["deleted"]]


def validate(d: Dict[str, Any]) -> Optional[str]:
    if not str(d.get("name", "")).strip():
        return "프로그램 이름을 적어 주세요."
    try:
        start, end = int(d.get("start")), int(d.get("end"))
    except (TypeError, ValueError):
        return "시작월·종료월을 골라 주세요."
    if start not in SCHOOL_MONTHS or end not in SCHOOL_MONTHS:
        return "시작월·종료월은 1~12월이어야 합니다."
    if month_index(start) > month_index(end):
        return "종료월이 시작월보다 앞입니다(학년도는 3월에 시작합니다)."
    if d.get("scope") not in SCOPES:
        return "대상 범위는 전교·과정·학급 중 하나입니다."
    if d.get("scope") != "전교" and not d.get("scope_values"):
        return "대상 과정 또는 학급을 골라 주세요."
    g = d.get("goal_pct")
    if g not in (None, "") and not (0 < float(g) <= 100):
        return "목표 감소율은 1~100(%)입니다."
    return None


def save_program(d: Dict[str, Any], program_id: Optional[int] = None) -> Dict[str, Any]:
    err = validate(d)
    if err:
        return {"error": err}
    sy = school_year()
    stamp = now_kst().replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
    values = [str(sy), str(d["name"]).strip(), str(d.get("type", "")), str(int(d["start"])), str(int(d["end"])),
              d["scope"], SEP.join(d.get("scope_values") or []), SEP.join(d.get("behaviors") or []),
              SEP.join(d.get("places") or []), "" if d.get("goal_pct") in (None, "") else str(float(d["goal_pct"])),
              str(d.get("content", "")), str(d.get("staff", "")), str(d.get("memo", "")), "", stamp]
    ws = _ws()
    if program_id:
        if not any(p["id"] == program_id for p in list_programs(sy)):
            return {"error": "프로그램을 찾을 수 없습니다."}
        ws.update(range_name=f"A{program_id}", values=[values], value_input_option="RAW")
    else:
        ws.append_rows([values], value_input_option="RAW", table_range="A1")
    invalidate_cache(CACHE_KEY)
    return {"message": "저장했습니다."}


def delete_program(program_id: int) -> Dict[str, Any]:
    if not any(p["id"] == program_id for p in list_programs()):
        return {"error": "프로그램을 찾을 수 없습니다."}
    _ws().update_cell(program_id, HEADERS.index("상태") + 1, "삭제")
    invalidate_cache(CACHE_KEY)
    return {"message": "삭제했습니다."}


# ── 성과 ───────────────────────────────────────────────
def _enrolled() -> Dict[str, Dict[str, Any]]:
    from app.services.sheets import fetch_student_status
    return {str(s.get("학생코드", "")).strip(): s for s in fetch_student_status() or []
            if s.get("학생코드") and str(s.get("재학여부", "O")).strip() != "X"}


def _in_scope(p: Dict[str, Any], code: str, cls: str) -> bool:
    if p["scope"] == "전교":
        return True
    if p["scope"] == "과정":
        return course_of(code) in p["scope_values"]
    return cls in p["scope_values"]


def _month_key(sy: int, m: int) -> str:
    return f"{calendar_year(sy, m)}-{m:02d}"


def options() -> Dict[str, Any]:
    """폼 선택지: 실제 기록에 있는 행동유형·장소, 학급 목록."""
    from app.services.sheets import fetch_all_records
    recs = fetch_all_records() or []
    return {
        "types": TYPES, "scopes": SCOPES, "courses": list(COURSES.values()),
        "classes": sorted({s.get("학급", "") for s in _enrolled().values() if s.get("학급")}),
        "behaviors": [b for b, _ in Counter(r.get("행동유형", "") for r in recs if r.get("행동유형")).most_common()],
        "places": [b for b, _ in Counter(r.get("장소", "") for r in recs if r.get("장소")).most_common()],
    }


def _tier1_only_pct(codes: List[str], m: int) -> Optional[float]:
    from app.services.tier_monthly import month_state
    if not codes:
        return None
    st = month_state(m)
    supported = set(st["cico"]) | set(st["sst"]) | set(st["t3"])
    return round(sum(1 for c in codes if c not in supported) / len(codes) * 100, 1)


def monitor_program(program_id: int, allowed_codes: Optional[set] = None) -> Dict[str, Any]:
    from app.services.sheets import fetch_all_records
    sy = school_year()
    p = next((x for x in list_programs(sy) if x["id"] == program_id), None)
    if not p:
        return {"error": "프로그램을 찾을 수 없습니다."}
    a, b = month_index(p["start"]), month_index(p["end"])
    now_i = month_index(now_kst().month)
    phases = ([(SCHOOL_MONTHS[a - 1], "운영 전")] if a > 0 else []) + [(m, "운영 중") for m in SCHOOL_MONTHS[a:b + 1]]
    if b + 1 < len(SCHOOL_MONTHS):
        phases.append((SCHOOL_MONTHS[b + 1], "운영 후"))
    phases = [(m, ph) for m, ph in phases if month_index(m) <= now_i]

    roster = _enrolled()
    scope = [c for c, s in roster.items() if _in_scope(p, c, s.get("학급", "")) and (allowed_codes is None or c in allowed_codes)]
    scope_set = set(scope)
    keys = {_month_key(sy, m): m for m, _ in phases}
    counts = {m: 0 for m, _ in phases}
    students: Dict[int, set] = {m: set() for m, _ in phases}
    by_type: Counter = Counter()
    for r in fetch_all_records() or []:
        m = keys.get(str(r.get("행동발생날짜", ""))[:7])
        if m is None or str(r.get("학생코드", "")).strip() not in scope_set:
            continue
        if p["behaviors"] and r.get("행동유형") not in p["behaviors"]:
            continue
        if p["places"] and r.get("장소") not in p["places"]:
            continue
        counts[m] += 1
        students[m].add(str(r.get("학생코드")).strip())
        by_type[r.get("행동유형", "")] += 1
    n = len(scope)
    months = [{
        "month": m, "phase": ph, "count": counts[m],
        "per10": round(counts[m] / n * 10, 2) if n else None,
        "students_with": len(students[m]),
        "tier1_only_pct": _tier1_only_pct(scope, m),
    } for m, ph in phases]

    def mean(ph):
        v = [x["per10"] for x in months if x["phase"] == ph and x["per10"] is not None]
        return round(sum(v) / len(v), 2) if v else None
    pre, dur = mean("운영 전"), mean("운영 중")
    change = round((dur - pre) / pre * 100, 1) if pre and dur is not None else None
    goal = p["goal_pct"]
    if not any(x["phase"] == "운영 중" for x in months):
        verdict = "운영 전"
    elif pre is None:
        verdict = "기초선 없음"
    elif goal and change is not None and change <= -goal:
        verdict = "목표 달성"
    elif change is not None and change < 0:
        verdict = "감소(목표 미달)" if goal else "감소"
    elif change is not None and change <= 10:
        verdict = "변화 없음"
    else:
        verdict = "증가 — 재검토"
    return {
        "program": p, "scope_students": n, "months": months,
        "top_types": by_type.most_common(5),
        "summary": {"per10_pre": pre, "per10_during": dur, "change_pct": change, "goal_pct": goal, "verdict": verdict},
    }


def summaries(allowed_codes: Optional[set] = None) -> List[Dict[str, Any]]:
    out = []
    for p in list_programs():
        r = monitor_program(p["id"], allowed_codes)
        if "error" not in r and r["scope_students"]:
            out.append({"id": p["id"], "name": p["name"], "start": p["start"], "end": p["end"], "scope_students": r["scope_students"], **r["summary"]})
    return out


def annual(allowed_codes: Optional[set] = None) -> Dict[str, Any]:
    """전교(교사는 자기 학급) 월별 위기행동 기록과 Tier 분포."""
    from app.services.sheets import fetch_all_records
    from app.services.tier_monthly import month_state
    sy = school_year()
    now_i = month_index(now_kst().month)
    months = SCHOOL_MONTHS[:now_i + 1]
    roster = _enrolled()
    codes = [c for c in roster if allowed_codes is None or c in allowed_codes]
    code_set = set(codes)
    keys = {_month_key(sy, m): m for m in months}
    counts = Counter()
    for r in fetch_all_records() or []:
        m = keys.get(str(r.get("행동발생날짜", ""))[:7])
        if m and str(r.get("학생코드", "")).strip() in code_set:
            counts[m] += 1
    trend = []
    for m in months:
        st = month_state(m)
        t3 = {c for c in st["t3"] if c in code_set}
        t2 = {c for c in (set(st["cico"]) | set(st["sst"])) if c in code_set} - t3
        n = len(codes)
        trend.append({
            "month": m, "crisis": counts[m],
            "tier1_only": n - len(t2 | t3), "tier2": len(t2), "tier3": len(t3),
            "tier1_only_pct": round((n - len(t2 | t3)) / n * 100, 1) if n else None,
        })
    return {"year": sy, "students": len(codes), "trend": trend}
