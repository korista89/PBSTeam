"""위기행동관리 브리핑 — 학교행동중재지원팀 회의용.

대상: 기간과 겹치는 달의 Tier3·Tier3+ 학생(출처 Tier3_월별, 비면 TierStatus 거울).
같은 길이의 바로 앞 기간과 비교하고, 대상이 아닌 학생 중 의뢰를 검토할 학생도 함께 보인다.
계산은 build()에 모아 시트 없이 검사한다(tests/test_crisis_briefing.py).
"""

import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

LEVEL_RANK = {"Tier3": 1, "Tier3+": 2}
WATCH_MIN_INCIDENTS = 3   # 대상 밖 학생: 기간 중 이만큼 이상이면 의뢰 검토 후보
WATCH_MIN_INTENSITY = 4   # 또는 강도 이 이상이 한 번이라도 있으면


def _d(s: str) -> Optional[date]:
    m = re.match(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})", str(s or ""))
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None
    except ValueError:
        return None


def _int(v, default=0) -> int:
    m = re.match(r"\s*(\d+)", str(v or ""))
    return int(m.group(1)) if m else default


def _short(v: str) -> str:
    """'신체적공격행동: 타인 밀치기…' → '신체적공격행동', '3(위기행동): …' → 그대로 앞부분."""
    s = str(v or "").strip()
    return re.split(r"[:(]", s, maxsplit=1)[0].strip() or s


def action_kind(raw: str) -> str:
    """'방어 및 보호 / 개별학생교육지원 / 상해' 칸 → 제지·교육지원·상해·보고·없음."""
    s = str(raw or "")
    if "개별학생교육지원" in s:
        return "교육지원"
    if "제지" in s and not s.strip().startswith("X"):
        return "제지"
    if "상해" in s:
        return "상해"
    if s.strip().startswith("O"):
        return "보고"
    return ""


def _top(c: Counter, n=1) -> List[str]:
    return [k for k, _ in Counter({k: v for k, v in c.items() if k}).most_common(n)]


def _dist(c: Counter, n=8) -> List[Dict[str, Any]]:
    return [{"name": k, "value": v} for k, v in Counter({k: v for k, v in c.items() if k}).most_common(n)]


def _multi(v: str) -> List[str]:
    return [p.strip() for p in str(v or "").split(",") if p.strip() and "특이사항 없음" not in p]


def _week(d: date) -> str:
    return (d - timedelta(days=d.weekday())).isoformat()


def build(records: List[Dict[str, Any]], roster: Dict[str, Dict[str, str]],
          targets: Dict[str, str], start: date, end: date) -> Dict[str, Any]:
    """records: 정규화한 위기행동 기록, roster: 학생코드→{name, class}, targets: 학생코드→단계."""
    span = (end - start).days + 1
    pstart, pend = start - timedelta(days=span), start - timedelta(days=1)
    name_to_code = {v.get("name"): c for c, v in roster.items() if v.get("name")}

    cur, prev = defaultdict(list), defaultdict(list)
    for r in records:
        d = _d(r.get("행동발생날짜"))
        if not d:
            continue
        code = str(r.get("학생코드") or "").strip() or name_to_code.get(str(r.get("학생명") or "").strip(), "")
        if not code:
            continue
        if start <= d <= end:
            cur[code].append((d, r))
        elif pstart <= d <= pend:
            prev[code].append((d, r))

    def stats(items):
        inten = [_int(r.get("강도")) for _, r in items]
        return {
            "incidents": len(items),
            "occurrences": sum(max(1, _int(r.get("발생횟수"), 1)) for _, r in items),
            "max_intensity": max(inten, default=0),
            "avg_intensity": round(sum(inten) / len(inten), 1) if inten else 0,
            "high": sum(1 for i in inten if i >= WATCH_MIN_INTENSITY),
        }

    weeks, w = [], _week(start)
    while w <= end.isoformat():
        weeks.append(w)
        w = (date.fromisoformat(w) + timedelta(days=7)).isoformat()

    students, all_items = [], []
    for code, level in targets.items():
        items = sorted(cur.get(code, []), key=lambda x: x[0])
        all_items += items
        s, p = stats(items), stats(prev.get(code, []))
        acts = Counter(action_kind(r.get("제지유형_원문") or r.get("물리적제지여부")) for _, r in items)
        wk = Counter(_week(d) for d, _ in items)
        delta = s["incidents"] - p["incidents"]
        signal = ("무발생" if s["incidents"] == 0 else "증가" if delta > 0 and s["incidents"] >= p["incidents"] * 1.2
                  else "감소" if delta < 0 else "유지")
        info = roster.get(code, {})
        students.append({
            "code": code, "name": info.get("name", ""), "class": info.get("class", ""), "level": level,
            **s, "prev_incidents": p["incidents"], "delta": delta, "signal": signal,
            "top_type": _top(Counter(_short(r.get("행동유형")) for _, r in items))[:1],
            "top_function": _top(Counter(_short(r.get("기능")) for _, r in items))[:1],
            "top_time": _top(Counter(str(r.get("시간대") or "").strip() for _, r in items))[:1],
            "top_place": _top(Counter(str(r.get("장소") or "").strip() for _, r in items))[:1],
            "restraint": acts["제지"], "support": acts["교육지원"], "injury": acts["상해"],
            "pending": sum(1 for _, r in items if str(r.get("Status") or "").strip() not in ("Approved",)),
            "last_date": items[-1][0].isoformat() if items else "",
            "weekly": [wk.get(x, 0) for x in weeks],
        })
    students.sort(key=lambda s: (-s["incidents"], -s["max_intensity"], s["code"]))

    watch = []
    for code, items in cur.items():
        if code in targets:
            continue
        s = stats(items)
        if s["incidents"] >= WATCH_MIN_INCIDENTS or s["max_intensity"] >= WATCH_MIN_INTENSITY:
            info = roster.get(code, {})
            watch.append({"code": code, "name": info.get("name", ""), "class": info.get("class", ""),
                          **s, "prev_incidents": len(prev.get(code, [])),
                          "top_type": _top(Counter(_short(r.get("행동유형")) for _, r in items))[:1]})
    watch.sort(key=lambda s: (-s["incidents"], -s["max_intensity"]))

    serious = []
    for d, r in sorted(all_items, key=lambda x: x[0], reverse=True):
        kind = action_kind(r.get("제지유형_원문") or r.get("물리적제지여부"))
        if _int(r.get("강도")) >= WATCH_MIN_INTENSITY or kind in ("제지", "교육지원", "상해"):
            code = str(r.get("학생코드") or "").strip() or name_to_code.get(str(r.get("학생명") or "").strip(), "")
            serious.append({"date": d.isoformat(), "code": code, "name": roster.get(code, {}).get("name", r.get("학생명", "")),
                            "time": r.get("시간대", ""), "place": r.get("장소", ""), "type": _short(r.get("행동유형")),
                            "intensity": _int(r.get("강도")), "action": kind, "note": str(r.get("특기사항") or "")[:120],
                            "log_id": r.get("Log_ID", ""), "status": r.get("Status", "")})

    total, ptotal = stats(all_items), stats([x for c in targets for x in prev.get(c, [])])
    acts = Counter(action_kind(r.get("제지유형_원문") or r.get("물리적제지여부")) for _, r in all_items)
    wk_all = Counter(_week(d) for d, _ in all_items)
    wk_high = Counter(_week(d) for d, r in all_items if _int(r.get("강도")) >= WATCH_MIN_INTENSITY)
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "days": span},
        "prev_period": {"start": pstart.isoformat(), "end": pend.isoformat()},
        "summary": {
            "targets": len(targets),
            "tier3plus": sum(1 for v in targets.values() if v == "Tier3+"),
            "with_incidents": sum(1 for s in students if s["incidents"]),
            **total, "prev_incidents": ptotal["incidents"], "prev_occurrences": ptotal["occurrences"],
            "restraint": acts["제지"], "support": acts["교육지원"], "injury": acts["상해"],
            "pending": sum(s["pending"] for s in students),
            "increased": sum(1 for s in students if s["signal"] == "증가"),
            "watch": len(watch),
        },
        "weekly": [{"week": x, "count": wk_all.get(x, 0), "high": wk_high.get(x, 0)} for x in weeks],
        "by_time": _dist(Counter(str(r.get("시간대") or "").strip() for _, r in all_items), 12),
        "by_place": _dist(Counter(str(r.get("장소") or "").strip() for _, r in all_items)),
        "by_type": _dist(Counter(_short(r.get("행동유형")) for _, r in all_items)),
        "by_function": _dist(Counter(_short(r.get("기능")) for _, r in all_items)),
        "by_antecedent": _dist(Counter(x for _, r in all_items for x in _multi(r.get("선행사건")))),
        "by_setting": _dist(Counter(x for _, r in all_items for x in _multi(r.get("배경사건")))),
        "students": students,
        "watch": watch,
        "serious": serious[:30],
    }


def _months(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield (y if m >= 3 else y - 1), m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def load(start: date, end: date, scope: Optional[str] = None) -> Dict[str, Any]:
    from app.api.deps import in_scope
    from app.services.sheets import fetch_all_records, fetch_student_status
    from app.services.tier3_monthly import month_rows, tierstatus_level

    status = fetch_student_status() or []
    roster = {str(s.get("학생코드", "")).strip(): {"name": str(s.get("학생이름", "")).strip(), "class": str(s.get("학급", "")).strip()}
              for s in status if str(s.get("학생코드", "")).strip()}
    targets: Dict[str, str] = {}
    for sy, m in _months(start, end):
        for r in month_rows(sy, m):
            c, lv = str(r.get("학생코드", "")).strip(), str(r.get("단계", "")).strip()
            if c and LEVEL_RANK.get(lv, 0) > LEVEL_RANK.get(targets.get(c, ""), 0):
                targets[c] = lv
    source = "Tier3_월별"
    if not targets:
        source = "TierStatus"
        targets = {str(s.get("학생코드", "")).strip(): tierstatus_level(s) for s in status if tierstatus_level(s)}
    if scope:
        roster = {c: v for c, v in roster.items() if in_scope(v.get("class"), scope)}
        targets = {c: v for c, v in targets.items() if c in roster}
    names = {v["name"] for v in roster.values()}
    records = [r for r in (fetch_all_records() or []) if not scope or str(r.get("학생코드", "")).strip() in roster
               or (not str(r.get("학생코드", "")).strip() and str(r.get("학생명", "")).strip() in names)]
    out = build(records, roster, targets, start, end)
    out["target_source"] = source
    return out
