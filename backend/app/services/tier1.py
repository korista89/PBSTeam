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


# ══ 보편적 지원 운영(운영계획 Ⅰ): 기대행동 교수 기록 · 토큰 집계 · 실행충실도 ══════════════
import json as _json
import os as _os
from datetime import date as _date, timedelta as _td

_PLAN_PATH = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), "data", "tier1_plan.json")
_plan_cache: Optional[Dict[str, Any]] = None


def plan() -> Dict[str, Any]:
    """운영계획에서 옮긴 고정 자료(장소별 IEP 세부목표, 교수 전략, 토큰 단계, 경은마트, 실행충실도 문항)."""
    global _plan_cache
    if _plan_cache is None:
        with open(_PLAN_PATH, encoding="utf-8") as f:
            _plan_cache = _json.load(f)
    return _plan_cache


class _Table:
    """숨김 탭 하나. keys 열이 같으면 같은 줄로 보고 고쳐 쓴다(없으면 붙인다)."""

    def __init__(self, tab: str, headers: List[str], keys: List[str]):
        self.tab, self.headers, self.keys = tab, headers, keys
        self.cache_key = f"sheet:tier1:{tab}"

    def _ws(self):
        ss = open_main_sheet()
        try:
            return ss.worksheet(self.tab)
        except Exception:
            ws = ss.add_worksheet(title=self.tab, rows=1000, cols=len(self.headers))
            ws.update(range_name="A1", values=[self.headers])
            try:
                ws.hide()
            except Exception:
                logger.warning("%s 탭 숨기기 실패", self.tab, exc_info=True)
            return ws

    def rows(self) -> List[Dict[str, Any]]:
        cached = get_cached(self.cache_key, ttl=60)
        if cached is not None:
            return cached
        try:
            values = safe_get_all_values(open_main_sheet().worksheet(self.tab))
        except Exception:
            values = []
        hdr = values[0] if values else self.headers
        out = []
        for i, row in enumerate(values[1:], start=2):
            r = {h: (row[j] if j < len(row) else "") for j, h in enumerate(hdr)}
            r["_row"] = i
            out.append(r)
        set_cached(self.cache_key, out)
        return out

    def upsert(self, rec: Dict[str, Any]):
        rec = {**rec, "수정시각": now_kst().replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")}
        values = [str(rec.get(h, "")) for h in self.headers]
        hit = next((r for r in self.rows() if all(str(r.get(k, "")) == str(rec.get(k, "")) for k in self.keys)), None)
        ws = self._ws()
        if hit:
            ws.update(range_name=f"A{hit['_row']}", values=[values], value_input_option="RAW")
        else:
            ws.append_rows([values], value_input_option="RAW", table_range="A1")
        invalidate_cache(self.cache_key)


TEACH = _Table("Tier1_교수기록", ["학년도", "주", "학급", "실시", "지도규칙", "교수전략", "메모", "입력자", "수정시각"], ["학년도", "주", "학급"])
TOKENS = _Table("Tier1_토큰집계", ["학년도", "월", "학급", "1000원토큰", "적용단계", "메모", "입력자", "수정시각"], ["학년도", "월", "학급"])
FIDELITY = _Table("Tier1_충실도", ["학년도", "학기", "학급", "점수", "점검자", "점검일", "메모", "수정시각"], ["학년도", "학기", "학급"])


def classes(allowed_codes: Optional[set] = None) -> List[Dict[str, Any]]:
    """재학생이 있는 학급과 인원(교사는 자기 학급만)."""
    cnt: Counter = Counter()
    first: Dict[str, str] = {}  # 학급의 가장 작은 학생코드 → 유치원·초·중·고·전공과 순서로 정렬
    for c, s in _enrolled().items():
        if s.get("학급") and (allowed_codes is None or c in allowed_codes):
            cnt[s["학급"]] += 1
            first[s["학급"]] = min(first.get(s["학급"], c), c)
    return [{"class": k, "students": cnt[k]} for k in sorted(cnt, key=lambda k: (first[k], k))]


def school_weeks(month: int) -> List[str]:
    """그 달 수업일이 하루라도 있는 주의 월요일(YYYY-MM-DD)."""
    from app.services.sheets import get_business_days, get_holidays_from_config
    sy = school_year()
    y = calendar_year(sy, month)
    days = get_business_days(y, month, get_holidays_from_config()) or []
    weeks = set()
    for d in days:
        mm, dd = (int(x) for x in str(d).split("-")[-2:])
        day = _date(y, mm, dd)
        weeks.add((day - _td(days=day.weekday())).isoformat())
    return sorted(weeks)


def _in(rows, field, values):
    return [r for r in rows if r.get(field) in values]


def teaching(month: int, class_names: List[str]) -> Dict[str, Any]:
    sy = str(school_year())
    weeks = school_weeks(month)
    recs = [r for r in TEACH.rows() if r.get("학년도") == sy and r.get("주") in weeks and r.get("학급") in class_names]
    by = {(r["학급"], r["주"]): r for r in recs}
    out = []
    for cls in class_names:
        cells = []
        for w in weeks:
            r = by.get((cls, w))
            cells.append({"week": w, "done": bool(r and r.get("실시") == "O"), "rule": (r or {}).get("지도규칙", ""),
                          "strategies": [x for x in str((r or {}).get("교수전략", "")).split(SEP) if x], "memo": (r or {}).get("메모", "")})
        done = sum(1 for c in cells if c["done"])
        out.append({"class": cls, "weeks": cells, "done": done, "rate": round(done / len(weeks) * 100, 1) if weeks else None})
    return {"month": month, "weeks": weeks, "classes": out}


def save_teaching(week: str, cls: str, done: bool, rule: str, strategies: List[str], memo: str, by: str) -> Dict[str, Any]:
    try:
        d = _date.fromisoformat(week)
    except ValueError:
        return {"error": "주(월요일 날짜)가 올바르지 않습니다."}
    if d.weekday() != 0:
        return {"error": "주는 월요일 날짜로 적습니다."}
    TEACH.upsert({"학년도": school_year(), "주": week, "학급": cls, "실시": "O" if done else "",
                  "지도규칙": rule, "교수전략": SEP.join(strategies), "메모": memo, "입력자": by})
    return {"message": "저장했습니다."}


def _digital_bills(month: int) -> Counter:
    """디지털 토큰판 기록(TokenLog)에서 그 달 학급별 100원 지급 합 ÷ 10 = 1000원 환산(참고용)."""
    from app.services.sheets import get_token_log, fetch_student_status
    key = _month_key(school_year(), month)
    cls_of = {str(s.get("학생코드", "")).strip(): s.get("학급", "") for s in fetch_student_status() or []}
    tokens: Counter = Counter()
    try:
        log = get_cached("sheet:tier1:tokenlog", ttl=60)
        if log is None:
            log = get_token_log(limit=100000)
            set_cached("sheet:tier1:tokenlog", log)
        for r in log:
            if str(r.get("Date", ""))[:7] == key and r.get("Category") != "1000원 사용":
                tokens[cls_of.get(str(r.get("StudentCode", "")).strip(), "")] += int(r.get("Delta") or 0)
    except Exception:
        logger.warning("토큰 기록 읽기 실패", exc_info=True)
    return Counter({k: max(0, v) // 10 for k, v in tokens.items()})


def tokens(month: int, class_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    sy = str(school_year())
    recs = {r["학급"]: r for r in TOKENS.rows() if r.get("학년도") == sy and r.get("월") == str(month)}
    digital = _digital_bills(month)
    out = []
    for c in class_list:
        r = recs.get(c["class"])
        bills = int(r["1000원토큰"]) if r and str(r.get("1000원토큰", "")).strip().isdigit() else None
        out.append({**c, "bills": bills, "stage": (r or {}).get("적용단계", ""), "memo": (r or {}).get("메모", ""),
                    "per_student": round(bills / c["students"], 2) if bills is not None and c["students"] else None,
                    "digital": digital.get(c["class"], 0)})
    vals = [x["per_student"] for x in out if x["per_student"] is not None]
    mean = round(sum(vals) / len(vals), 2) if vals else None
    sd = round((sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5, 2) if len(vals) > 1 else None
    return {"month": month, "classes": out, "entered": len(vals), "mean": mean, "sd": sd}


def save_tokens(month: int, cls: str, bills: int, stage: str, memo: str, by: str) -> Dict[str, Any]:
    if bills < 0:
        return {"error": "토큰 수량은 0 이상입니다."}
    TOKENS.upsert({"학년도": school_year(), "월": month, "학급": cls, "1000원토큰": bills, "적용단계": stage, "메모": memo, "입력자": by})
    return {"message": "저장했습니다."}


def fidelity(semester: int, class_names: List[str]) -> Dict[str, Any]:
    sy = str(school_year())
    items = plan()["fidelity_items"]
    recs = {r["학급"]: r for r in FIDELITY.rows() if r.get("학년도") == sy and r.get("학기") == str(semester)}
    out = []
    for cls in class_names:
        r = recs.get(cls)
        scores = [int(x) if x.strip().isdigit() else None for x in str((r or {}).get("점수", "")).split(",")] if r else []
        scores = (scores + [None] * len(items))[:len(items)]
        filled = [s for s in scores if s is not None]
        pct = round(sum(filled) / (2 * len(items)) * 100, 1) if len(filled) == len(items) else None
        out.append({"class": cls, "scores": scores, "pct": pct, "checker": (r or {}).get("점검자", ""),
                    "date": (r or {}).get("점검일", ""), "memo": (r or {}).get("메모", ""),
                    "needs_support": pct is not None and pct < plan()["fidelity_threshold"]})
    done = [x["pct"] for x in out if x["pct"] is not None]
    by_item = [round(sum(x["scores"][i] for x in out if x["pct"] is not None) / (2 * len(done)) * 100, 1) if done else None
               for i in range(len(items))]
    return {"semester": semester, "items": items, "classes": out, "done": len(done),
            "mean": round(sum(done) / len(done), 1) if done else None, "by_item": by_item}


def save_fidelity(semester: int, cls: str, scores: List[int], memo: str, by: str) -> Dict[str, Any]:
    n = len(plan()["fidelity_items"])
    if semester not in (1, 2):
        return {"error": "학기는 1 또는 2입니다."}
    if len(scores) != n or any(s not in (0, 1, 2) for s in scores):
        return {"error": f"{n}개 문항 모두 0·1·2로 점검해 주세요."}
    FIDELITY.upsert({"학년도": school_year(), "학기": semester, "학급": cls, "점수": ",".join(map(str, scores)),
                     "점검자": by, "점검일": now_kst().strftime("%Y-%m-%d"), "메모": memo})
    return {"message": "저장했습니다."}


def current_semester() -> int:
    return 1 if 3 <= now_kst().month <= 8 else 2


def dashboard(allowed_codes: Optional[set] = None) -> Dict[str, Any]:
    """대시보드: 연간 Tier1 현황 + 월별 교수 실행률·1인당 토큰 + 학급별 이번 달 토큰·이번 학기 충실도."""
    base = annual(allowed_codes)
    cls = classes(allowed_codes)
    names = [c["class"] for c in cls]
    for t in base["trend"]:
        m = t["month"]
        te = teaching(m, names)
        rates = [c["rate"] for c in te["classes"] if c["rate"] is not None]
        recorded = any(c["done"] for c in te["classes"])  # 아무 학급도 기록하지 않은 달은 0%가 아니라 '기록 없음'
        t["teach_rate"] = round(sum(rates) / len(rates), 1) if rates and te["weeks"] and recorded else None
        tk = tokens(m, cls)
        t["tokens_per_student"] = tk["mean"]
        t["tokens_entered"] = tk["entered"]
    cur = now_kst().month
    return {**base, "classes": cls, "this_month": tokens(cur, cls), "teach_now": teaching(cur, names),
            "fidelity": fidelity(current_semester(), names), "semester": current_semester()}


def briefing_line(today: Optional[_date] = None) -> Optional[str]:
    """아침 브리핑 한 줄: 지난주 기대행동 교수 기록 없는 학급, 월말(22일~)·월초(~5일) 1000원 토큰 미입력 학급.
    알릴 것이 없으면 None."""
    today = today or now_kst().date()
    names = [c["class"] for c in classes()]
    if not names:
        return None
    parts = []
    last_monday = (today - _td(days=today.weekday() + 7)).isoformat()
    lm = _date.fromisoformat(last_monday)
    if last_monday in school_weeks(lm.month) or (lm + _td(days=4)).month != lm.month:
        sy = str(school_year())
        done = {r["학급"] for r in TEACH.rows() if r.get("학년도") == sy and r.get("주") == last_monday and r.get("실시") == "O"}
        missing = [n for n in names if n not in done]
        if missing:
            parts.append(f"지난주 기대행동 교수 기록 없음 {len(missing)}학급")
    token_month = today.month if today.day >= 22 else (today.month - 1 or 12) if today.day <= 5 else None
    if token_month:
        sy = str(school_year())
        entered = {r["학급"] for r in TOKENS.rows() if r.get("학년도") == sy and r.get("월") == str(token_month)
                   and str(r.get("1000원토큰", "")).strip().isdigit()}
        missing = [n for n in names if n not in entered]
        if missing:
            parts.append(f"{token_month}월 1000원 토큰 미입력 {len(missing)}학급")
    return ("🌱 Tier1: " + " · ".join(parts) + " (Tier1관리 탭)") if parts else None
