"""업무담당자용 연간 성과: CICO(Tier2)·Tier3를 학년도 3월부터 이번 달까지 한 번에 본다.

- 월별 추이: 대상 수, 신규·종료, (CICO) 평균 수행률·목표 달성 비율·판정 분포, (Tier3) 위기행동 기록 평균
- 학생별: 달마다의 값과 지원 개월 수, 처음 대비 마지막 변화, 끝난 학생의 다음 달 행선지(상향·전환·종료)
모든 '그 달' 대상은 tier_monthly.month_state(월별 표)를 따른다.
"""

from collections import Counter
from typing import Any, Dict, List, Optional

from app.adapters.sheets.cico_store import school_year
from app.core.time import now_kst
from app.services import tier_monthly as tm
from app.services.sst import SCHOOL_MONTHS, month_index, _crisis_counts


def months_so_far(cico_only: bool = False) -> List[int]:
    now = month_index(now_kst().month)
    ms = SCHOOL_MONTHS[:now + 1]
    return [m for m in ms if 3 <= m <= 12] if cico_only else ms


def _avg(vals) -> Optional[float]:
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def _destination(code: str, nxt: Dict[str, Any], from_tier: str) -> str:
    """끝난 다음 달 어디로 갔나."""
    if from_tier == "cico":
        if code in nxt["t3"]:
            return "Tier3 상향"
        if code in nxt["sst"]:
            return "SST만 지속"
        return "Tier1 복귀"
    if code in nxt["cico"]:
        return "CICO 하향"
    if code in nxt["sst"]:
        return "SST 하향"
    return "Tier1 복귀"


def _flows(states: Dict[int, Dict[str, Any]], months: List[int], key: str):
    """학생별 대상이었던 달과 끝난 뒤 행선지."""
    in_months: Dict[str, List[int]] = {}
    for m in months:
        members = states[m][key]
        for c in members:
            in_months.setdefault(c, []).append(m)
    last = months[-1] if months else None
    outcome: Dict[str, str] = {}
    for c, ms in in_months.items():
        end = ms[-1]
        if end == last:
            outcome[c] = "지원 중"
            continue
        nxt_i = months.index(end) + 1
        outcome[c] = _destination(c, states[months[nxt_i]], key) if nxt_i < len(months) else "지원 중"
    return in_months, outcome


def cico_annual() -> Dict[str, Any]:
    from app.services.sheets import get_cico_report_data
    months = months_so_far(cico_only=True)
    states = {m: tm.month_state(m) for m in months}
    rate: Dict[str, Dict[int, Optional[float]]] = {}
    names: Dict[str, Dict[str, str]] = {}
    trend = []
    for i, m in enumerate(months):
        rows = (get_cico_report_data(m) or {}).get("students", []) if states[m]["ready"]["cico"] else []
        with_data = [r for r in rows if r.get("rate_num") is not None]
        per_code: Dict[str, List[float]] = {}
        for r in rows:
            names[r["code"]] = {"name": r.get("name", ""), "class": r.get("class", "")}
            if r.get("rate_num") is not None:
                per_code.setdefault(r["code"], []).append(float(r["rate_num"]))
        for c, v in per_code.items():
            rate.setdefault(c, {})[m] = _avg(v)
        cur, prev = states[m]["cico"], states[months[i - 1]]["cico"] if i else None
        trend.append({
            "month": m,
            "students": len(cur),
            "goals": len(rows),
            "new": len(cur - prev) if prev is not None else None,
            "ended": len(prev - cur) if prev is not None else None,
            "avg_rate": _avg(r["rate_num"] for r in with_data),
            "achieved_pct": round(sum(1 for r in with_data if r.get("achieved") == "O") / len(with_data) * 100, 1) if with_data else None,
            "decisions": dict(Counter(r.get("decision", "") for r in rows)),
        })
    in_months, outcome = _flows(states, months, "cico")
    students = []
    for c, ms in sorted(in_months.items()):
        rs = [rate.get(c, {}).get(m) for m in ms]
        rs = [r for r in rs if r is not None]
        students.append({
            "code": c, **names.get(c, {"name": "", "class": ""}),
            "months": ms, "rates": {str(m): rate.get(c, {}).get(m) for m in ms},
            "first": rs[0] if rs else None, "last": rs[-1] if rs else None,
            "outcome": outcome[c],
        })
    return {
        "year": school_year(), "months": months, "trend": trend, "students": students,
        "summary": {
            "total_students": len(in_months),
            "avg_months": _avg(len(v) for v in in_months.values()),
            "outcomes": dict(Counter(outcome.values())),
            "year_avg_rate": _avg(t["avg_rate"] for t in trend),
            "year_achieved_pct": _avg(t["achieved_pct"] for t in trend),
        },
    }


def tier3_annual() -> Dict[str, Any]:
    from app.services.sheets import fetch_student_status
    months = months_so_far()
    states = {m: tm.month_state(m) for m in months}
    in_months, outcome = _flows(states, months, "t3")
    crisis = _crisis_counts(sorted(in_months), months, school_year()) if in_months else {}
    roster = {str(s.get("학생코드", "")).strip(): s for s in fetch_student_status() or []}
    trend = []
    for i, m in enumerate(months):
        cur = states[m]["t3"]
        prev = states[months[i - 1]]["t3"] if i else None
        vals = [crisis.get(c, {}).get(m, 0) for c in cur]
        trend.append({
            "month": m,
            "tier3": sum(1 for v in cur.values() if v == "Tier3"),
            "tier3plus": sum(1 for v in cur.values() if v == "Tier3+"),
            "new": len(set(cur) - set(prev)) if prev is not None else None,
            "ended": len(set(prev) - set(cur)) if prev is not None else None,
            "up": sum(1 for c in cur if prev and prev.get(c) == "Tier3" and cur[c] == "Tier3+") if prev is not None else None,
            "down": sum(1 for c in cur if prev and prev.get(c) == "Tier3+" and cur[c] == "Tier3") if prev is not None else None,
            "crisis_total": sum(vals),
            "crisis_avg": _avg(vals),
        })
    students = []
    for c, ms in sorted(in_months.items()):
        vals = [crisis.get(c, {}).get(m, 0) for m in ms]
        students.append({
            "code": c, "name": roster.get(c, {}).get("학생이름", ""), "class": roster.get(c, {}).get("학급", ""),
            "months": ms, "levels": {str(m): states[m]["t3"].get(c, "") for m in ms},
            "crisis": {str(m): crisis.get(c, {}).get(m, 0) for m in months},
            "first": vals[0] if vals else None, "last": vals[-1] if vals else None,
            "outcome": outcome[c],
        })
    improved = [s for s in students if len(s["months"]) > 1 and s["last"] < s["first"]]
    comparable = [s for s in students if len(s["months"]) > 1]
    return {
        "year": school_year(), "months": months, "trend": trend, "students": students,
        "summary": {
            "total_students": len(in_months),
            "avg_months": _avg(len(v) for v in in_months.values()),
            "outcomes": dict(Counter(outcome.values())),
            "improved": len(improved),
            "comparable": len(comparable),
            "year_crisis_total": sum(t["crisis_total"] for t in trend),
        },
    }
