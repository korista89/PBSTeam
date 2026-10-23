"""관리자 브리핑: 위기행동 기록을 기간별로 집계하고, 급할 때 읽을 10줄 요약과 조치 권고를 만든다.

규칙 기반(외부 AI 미사용)이라 빠르고 학생 정보가 밖으로 나가지 않는다. 학생은 별칭·코드로만 표시한다.
- 어제/엊그제 = 직전 수업일/그 전 수업일(주말·공휴일 제외)
- 학기: 1학기 3. 1.~8. 15., 2학기 8. 16.~2월 말 / 학년도: 3. 1.~2월 말
- 증가·감소 학생: 최근 14일 vs 그 전 14일, 기준 3건 이상, 50% 이상 변화, 각각 최대 3명
"""
from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any, Dict, Iterable, List, Optional

TREND_DAYS = 14
TREND_MIN = 3
TREND_TOP = 3


def _d(s: str) -> Optional[date]:
    try:
        y, m, dd = str(s)[:10].split("-")
        return date(int(y), int(m), int(dd))
    except Exception:
        return None


def school_year_start(today: date) -> date:
    return date(today.year if today.month >= 3 else today.year - 1, 3, 1)


def semester_range(today: date):
    sy = school_year_start(today)
    first_end = date(sy.year, 8, 15)
    if today <= first_end:
        return "1학기", sy, first_end
    end = date(sy.year + 1, 3, 1) - timedelta(days=1)
    return "2학기", date(sy.year, 8, 16), end


def prev_school_days(today: date, holidays: Iterable[str], n: int = 2) -> List[date]:
    hol = {h for h in (str(x)[:10] for x in holidays)}
    out, d = [], today
    while len(out) < n:
        d -= timedelta(days=1)
        if d.weekday() < 5 and d.isoformat() not in hol:
            out.append(d)
    return out


def _is_crisis(r: dict) -> bool:
    return str(r.get("물리적제지여부", "")).startswith("O")


def _slots(r: dict) -> List[str]:
    return [s.strip() for s in str(r.get("시간대", "")).split(",") if s.strip()]


def _intensity(r: dict) -> Optional[int]:
    s = str(r.get("강도", "")).strip()
    return int(s[0]) if s[:1].isdigit() else None


def _short(v: str) -> str:
    return str(v).split(":")[0].split("(")[0].strip() or "-"


def _pct(cur: int, prev: int) -> Optional[int]:
    if prev == 0:
        return None
    return round((cur - prev) / prev * 100)


def _tier(s: dict) -> int:
    o = lambda k: str(s.get(k, "")).strip().upper() == "O"
    if o("Tier3") or o("Tier3+"):
        return 3
    if o("Tier2(CICO)") or o("Tier2(SST)"):
        return 2
    return 1


class _Ctx:
    def __init__(self, records: List[dict], students: List[dict]):
        self.info = {}
        for s in students:
            code = str(s.get("학생코드", "")).strip()
            if code:
                self.info[code] = {"name": str(s.get("학생이름", "")).strip() or code,
                                   "class": str(s.get("학급", "")).strip(), "tier": _tier(s)}
        self.rows = []
        for r in records:
            d = _d(r.get("행동발생날짜", ""))
            if d:
                code = str(r.get("학생코드") or r.get("코드번호") or r.get("학생명") or "").strip()
                self.rows.append((d, code, r))

    def label(self, code: str) -> str:
        i = self.info.get(code)
        if not i or i["name"] == code:
            return code
        return i["name"] if i["name"].endswith(f"-{code}") else f"{i['name']}({code})"

    def between(self, a: date, b: date):
        return [(d, c, r) for d, c, r in self.rows if a <= d <= b]


def _summary(ctx: _Ctx, rows, top: int = 5) -> Dict[str, Any]:
    per = Counter(c for _, c, _ in rows)
    crisis = Counter(c for _, c, r in rows if _is_crisis(r))
    ints = [i for _, _, r in rows if (i := _intensity(r)) is not None]
    return {
        "count": len(rows),
        "students": len(per),
        "crisis": sum(crisis.values()),
        "avg_intensity": round(sum(ints) / len(ints), 1) if ints else None,
        "by_type": Counter(_short(r.get("행동유형", "")) for _, _, r in rows).most_common(6),
        "by_place": Counter(_short(r.get("장소", "")) for _, _, r in rows).most_common(6),
        "by_slot": Counter(_short(s) for _, _, r in rows for s in _slots(r)).most_common(8),
        "top_students": [{"code": c, "label": ctx.label(c), "count": n, "crisis": crisis.get(c, 0),
                          "class": ctx.info.get(c, {}).get("class", "")} for c, n in per.most_common(top)],
    }


def _daily(rows, a: date, b: date) -> List[Dict[str, Any]]:
    cnt = Counter(d for d, _, _ in rows)
    crisis = Counter(d for d, _, r in rows if _is_crisis(r))
    out, d = [], a
    while d <= b:
        out.append({"date": d.isoformat(), "count": cnt.get(d, 0), "crisis": crisis.get(d, 0)})
        d += timedelta(days=1)
    return out


def _monthly(rows) -> List[Dict[str, Any]]:
    cnt = Counter(d.strftime("%Y-%m") for d, _, _ in rows)
    return [{"month": k, "count": v} for k, v in sorted(cnt.items())]


def _period(ctx: _Ctx, label: str, a: date, b: date, pa: date, pb: date, prev_label: str, series: str) -> Dict[str, Any]:
    cur, prev = ctx.between(a, b), ctx.between(pa, pb)
    out = {"label": label, "start": a.isoformat(), "end": b.isoformat(), **_summary(ctx, cur),
           "prev_label": prev_label, "prev_count": len(prev), "change_pct": _pct(len(cur), len(prev))}
    out["series"] = _daily(cur, a, b) if series == "daily" else _monthly(cur)
    return out


def _reported(r: dict) -> bool:
    """학교장 보고·보호자 알림이 둘 다 기록됐는지. 사이트 입력(시각 칸)과 구글폼(법적 의무 확인 체크) 모두 인정."""
    cd = r.get("crisis_details") or {}
    if str(cd.get("관리자_보고_시간", "")).strip() and str(cd.get("학부모_알림_시간", "")).strip():
        return True
    checks = " ".join(str(v) for k, v in (r.get("form_report_details") or {}).items() if "확인" in k)
    return "보고" in checks and "알림" in checks


def _day_detail(ctx: _Ctx, d: date) -> Dict[str, Any]:
    rows = ctx.between(d, d)
    items = []
    for _, c, r in rows:
        cd = r.get("crisis_details") or {}
        items.append({
            "log_id": r.get("Log_ID", ""), "code": c, "label": ctx.label(c),
            "class": ctx.info.get(c, {}).get("class", ""), "time": str(r.get("시간대", "")),
            "place": _short(r.get("장소", "")), "type": _short(r.get("행동유형", "")),
            "intensity": _intensity(r), "crisis": _is_crisis(r), "action": r.get("제지유형_원문", "") or r.get("물리적제지여부", ""),
            "status": r.get("Status", ""), "note": str(r.get("특기사항", ""))[:80],
            "missing_report": _is_crisis(r) and not _reported(r),
        })
    items.sort(key=lambda x: (not x["crisis"], -(x["intensity"] or 0)))
    return {"date": d.isoformat(), "count": len(rows), "students": len({c for _, c, _ in rows}),
            "crisis": sum(1 for i in items if i["crisis"]), "items": items}


def _actions_for(ctx: _Ctx, code: str, rows) -> List[str]:
    acts = []
    tier = ctx.info.get(code, {}).get("tier", 1)
    crisis = sum(1 for _, _, r in rows if _is_crisis(r))
    if tier < 3 and len(rows) >= 5:
        acts.append("Tier3 상향·FBA 착수 검토")
    places = Counter(_short(r.get("장소", "")) for _, _, r in rows).most_common(1)
    slots = Counter(_short(s) for _, _, r in rows for s in _slots(r)).most_common(1)
    if places and places[0][1] / len(rows) >= 0.5:
        where = places[0][0] + (f"·{slots[0][0]}" if slots and slots[0][1] / len(rows) >= 0.5 else "")
        acts.append(f"{where} 집중 — 그 시간 인력 배치·선행사건 조정")
    if crisis >= 2:
        acts.append("위기대응계획(BIP) 점검·보호자 상담")
    if not acts:
        acts.append("담임과 원인 협의(배경사건 확인)")
    return acts


def _trends(ctx: _Ctx, today: date):
    a = today - timedelta(days=TREND_DAYS - 1)
    pa, pb = a - timedelta(days=TREND_DAYS), a - timedelta(days=1)
    cur, prev = defaultdict(list), defaultdict(list)
    for d, c, r in ctx.rows:
        if a <= d <= today:
            cur[c].append((d, c, r))
        elif pa <= d <= pb:
            prev[c].append((d, c, r))
    # 기준(3건 이상·50% 이상 변화)을 넘는 학생을 먼저, 모자라면 변화가 큰 학생으로 3명까지 채운다.
    # 기준 미달로 채운 학생은 strong=False 로 표시해 화면에서 '관찰'로 구분한다.
    up, down = [], []
    for c in set(cur) | set(prev):
        n, p = len(cur[c]), len(prev[c])
        base = {"code": c, "label": ctx.label(c), "class": ctx.info.get(c, {}).get("class", ""),
                "tier": ctx.info.get(c, {}).get("tier", 1), "recent": n, "before": p}
        if n > p:
            strong = n >= TREND_MIN and (p == 0 or n >= p * 1.5)
            up.append({**base, "strong": strong, "actions": _actions_for(ctx, c, cur[c])})
        elif p > n:
            strong = p >= TREND_MIN and n <= p * 0.5
            down.append({**base, "strong": strong,
                         "message": f"최근 2주 위기행동이 {p}건에서 {n}건으로 줄었습니다. 담임 선생님께 칭찬과 감사를 전해 주세요."})
    up.sort(key=lambda x: (x["strong"], x["recent"] - x["before"], x["recent"]), reverse=True)
    down.sort(key=lambda x: (x["strong"], x["before"] - x["recent"], x["before"]), reverse=True)
    return up[:TREND_TOP], down[:TREND_TOP], {"recent": [a.isoformat(), today.isoformat()], "before": [pa.isoformat(), pb.isoformat()]}


def _trend_txt(s: dict) -> str:
    return f"{s['label']} {s['before']}→{s['recent']}건" + ("" if s["strong"] else "(관찰)")


def _signed(p: Optional[int]) -> str:
    return "비교 불가" if p is None else (f"+{p}%" if p > 0 else f"{p}%")


def build_briefing(records: List[dict], students: List[dict], holidays: Iterable[str], today: date,
                   cico_trend: Optional[List[dict]] = None,
                   signoffs: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, Any]:
    """signoffs: 결재함 단계 기록 {Log_ID: {단계: ...}}. 있으면 '결재 대기'를 학교장확인 전 보고서(최근 30일)로 센다."""
    ctx = _Ctx(records, students)
    holidays = list(holidays)
    d1, d2 = prev_school_days(today, holidays, 2)
    sem_label, s_a, s_b = semester_range(today)
    s_end = min(today, s_b)
    y_a = school_year_start(today)
    ly = lambda d: d.replace(year=d.year - 1) if not (d.month == 2 and d.day == 29) else d.replace(year=d.year - 1, day=28)

    day1, day2, today_d = _day_detail(ctx, d1), _day_detail(ctx, d2), _day_detail(ctx, today)
    week = _period(ctx, "최근 1주", today - timedelta(days=6), today, today - timedelta(days=13), today - timedelta(days=7), "그 전 1주", "daily")
    month = _period(ctx, "최근 1개월", today - timedelta(days=29), today, today - timedelta(days=59), today - timedelta(days=30), "그 전 1개월", "daily")
    semester = _period(ctx, f"이번 {sem_label}", s_a, s_end, ly(s_a), ly(s_end), "작년 같은 기간", "monthly")
    year = _period(ctx, "이번 학년도", y_a, today, ly(y_a), ly(today), "작년 같은 기간", "monthly")
    up, down, trend_range = _trends(ctx, today)

    recent = ctx.between(today - timedelta(days=13), today)
    if signoffs is None:
        pending = sum(1 for _, _, r in ctx.rows if r.get("Status") == "Pending")
    else:
        pending = sum(1 for d, _, r in ctx.rows
                      if r.get("Status") == "Pending" or (
                          _is_crisis(r) and d >= today - timedelta(days=29)
                          and "학교장확인" not in signoffs.get(str(r.get("Log_ID", "")), {})))
    revision = sum(1 for _, _, r in ctx.rows if r.get("Status") == "Revision Requested")
    missing = [i for day in (_day_detail(ctx, d) for d in {d for d, _, _ in recent}) for i in day["items"] if i["missing_report"]]
    todo = []
    if pending:
        todo.append({"level": "high", "text": f"학교장확인 전 보고서 {pending}건 결재", "href": "/admin/approvals"})
    if missing:
        todo.append({"level": "high", "text": f"최근 2주 위기조치 {len(missing)}건 관리자 보고·보호자 알림 기록 누락 확인", "href": "/logs"})
    if revision:
        todo.append({"level": "mid", "text": f"재작성 요청 {revision}건 작성자 보완 확인", "href": "/logs"})
    for s in (x for x in up if x["strong"]):
        todo.append({"level": "mid", "text": f"{s['label']}: {s['actions'][0]}", "href": f"/student/{s['code']}"})
    if down:
        todo.append({"level": "low", "text": f"감소 학생 {len(down)}명 담임에게 칭찬 전달", "href": None})

    def day_line(tag, dd):
        if not dd["count"]:
            return f"{tag}({_kdate(dd['date'])}): 위기행동 없음."
        top = Counter(i["label"] for i in dd["items"]).most_common(1)[0]
        return f"{tag}({_kdate(dd['date'])}): {dd['count']}건·{dd['students']}명, 조치 {dd['crisis']}건. 최다 {top[0]} {top[1]}건."

    def place_slot(p):
        pl = p["by_place"][0][0] if p["by_place"] else "-"
        sl = p["by_slot"][0][0] if p["by_slot"] else "-"
        return f"주로 {pl}·{sl}"

    lines = [
        day_line("어제", day1),
        day_line("엊그제", day2),
        f"오늘(지금까지): {today_d['count']}건, 조치 {today_d['crisis']}건.",
        f"최근 1주: {week['count']}건·{week['students']}명({_signed(week['change_pct'])} vs 그 전 주), {place_slot(week)}.",
        f"최근 1개월: {month['count']}건·{month['students']}명({_signed(month['change_pct'])} vs 그 전 달), 조치 {month['crisis']}건.",
        f"이번 {sem_label}: {semester['count']}건({_signed(semester['change_pct'])} vs 작년 같은 기간) · 학년도 누적 {year['count']}건.",
        ("⚠️ 증가: " + ", ".join(_trend_txt(s) for s in up)) if up else "⚠️ 증가 학생 없음.",
        ("👏 감소: " + ", ".join(_trend_txt(s) for s in down)) if down else "👏 감소 학생 없음.",
        f"✅ 결재 대기 {pending}건 · 재작성 {revision}건 · 보고/알림 누락 {len(missing)}건.",
        "👉 오늘 할 일: " + (todo[0]["text"] if todo else "특이사항 없음, 현 지원 유지."),
    ]

    tiers = Counter(i["tier"] for i in ctx.info.values())
    return {
        "today": today.isoformat(),
        "ten_lines": lines,
        "days": {"yesterday": day1, "day_before": day2, "today": today_d},
        "periods": {"week": week, "month": month, "semester": semester, "year": year},
        "increasing": up, "decreasing": down, "trend_range": trend_range,
        "todo": todo,
        "tier_counts": {f"Tier{k}": tiers.get(k, 0) for k in (1, 2, 3)},
        "cico_trend": cico_trend or [],
        "rules": {"school_day": "직전 수업일(주말·공휴일 제외)", "trend": f"최근 {TREND_DAYS}일 vs 그 전 {TREND_DAYS}일, {TREND_MIN}건 이상, 50% 이상 변화, 각각 최대 {TREND_TOP}명",
                  "semester": "1학기 3. 1.~8. 15. / 2학기 8. 16.~2월 말"},
    }


def _kdate(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{int(m)}. {int(d)}."
