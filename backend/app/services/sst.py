"""SST(사회성·의사소통 기술 훈련) 프로그램 관리.

- 프로그램: 학년도마다 최대 6개. 이름·유형·시작월~종료월(월 단위)·대상 학생·목표 기술.
- 저장: 운영 시트의 숨김 탭 'SST_프로그램'(처음 저장할 때 앱이 만든다). 삭제는 상태='삭제'로 남긴다.
- 프로그램 표·모니터링은 ProgramBook으로 묶어 Tier3+ 개별 프로그램(tier3plus.py)도 같이 쓴다.
- 효과 모니터링: 대상 학생의 월별 위기행동 기록 건수(Log_Main)와 CICO 수행률(목표 여러 개면 평균)을
  운영 전 1개월(기초선)·운영 기간·운영 후 1개월로 나눠 보여 준다.
- 운영 중인 프로그램 대상이 그 달의 SST 대상이다. TierStatus 'Tier2(SST)' 칸은 이번 달의 거울로,
  프로그램을 저장·삭제하면 tier_monthly.mirror_after_change가 그 학생들만 맞춘다.
"""

import gspread
import logging
from typing import Any, Dict, List, Optional

from app.adapters.sheets.client import get_cached, set_cached, invalidate_cache, open_main_sheet, safe_get_all_values
from app.adapters.sheets.cico_store import school_year
from app.core.time import now_kst

logger = logging.getLogger(__name__)

MAX_PROGRAMS = 6
TYPES = ["의사소통", "사회적 기술", "정서·자기조절", "기타"]
SCHOOL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]  # 학년도 순서


def month_index(m: int) -> int:
    return SCHOOL_MONTHS.index(int(m))


def calendar_year(sy: int, m: int) -> int:
    return sy if int(m) >= 3 else sy + 1


def program_months(p: Dict[str, Any]) -> List[int]:
    a, b = month_index(p["start"]), month_index(p["end"])
    return SCHOOL_MONTHS[a:b + 1]


def runs_in(p: Dict[str, Any], month: int) -> bool:
    return int(month) in program_months(p)


# ── 프로그램 표(SST·Tier3+ 공용) ─────────────────────────
class ProgramBook:
    """월 단위 기간·대상 학생이 있는 프로그램 표. SST(여러 학생)와 Tier3+(학생 1명)가 같이 쓴다."""

    BASE = ["학년도", "프로그램명", "유형", "시작월", "종료월", "대상학생", "목표기술", "담당", "메모", "상태", "수정시각"]

    def __init__(self, tab: str, max_programs: int, types: List[str], single_target: bool = False,
                 extra: Optional[Dict[str, str]] = None):
        self.tab, self.max, self.types, self.single = tab, max_programs, types, single_target
        self.extra = extra or {}  # 시트 열 이름 → 응답 키(예: 연계기관 → agency)
        self.headers = self.BASE[:-2] + list(self.extra) + self.BASE[-2:]
        self.cache_key = f"sheet:programs:{tab}"

    def _ws(self):
        ss = open_main_sheet()
        try:
            return ss.worksheet(self.tab)
        except gspread.WorksheetNotFound:  # 없을 때만 만든다(일시 장애에 같은 이름 탭을 또 만들지 않게)
            ws = ss.add_worksheet(title=self.tab, rows=200, cols=len(self.headers))
            ws.update(range_name="A1", values=[self.headers])
            try:
                ws.hide()  # 운영 시트는 사람이 보는 4개 탭만 보이게 둔다
            except Exception:
                logger.warning("%s 탭 숨기기 실패", self.tab, exc_info=True)
            return ws

    def _parse_row(self, row_no: int, rec: Dict[str, str]) -> Optional[Dict[str, Any]]:
        try:
            start, end = int(rec.get("시작월") or 0), int(rec.get("종료월") or 0)
        except ValueError:
            return None
        if start not in SCHOOL_MONTHS or end not in SCHOOL_MONTHS:
            return None
        return {
            "id": row_no, "year": int(rec.get("학년도") or 0), "name": rec.get("프로그램명", ""),
            "type": rec.get("유형", ""), "start": start, "end": end,
            "targets": [c.strip() for c in str(rec.get("대상학생", "")).split(",") if c.strip()],
            "skills": rec.get("목표기술", ""), "staff": rec.get("담당", ""), "memo": rec.get("메모", ""),
            **{key: rec.get(col, "") for col, key in self.extra.items()},
            "deleted": rec.get("상태", "") == "삭제",
        }

    def _all_rows(self) -> List[Dict[str, Any]]:
        cached = get_cached(self.cache_key, ttl=60)
        if cached is not None:
            return cached
        try:
            values = safe_get_all_values(open_main_sheet().worksheet(self.tab))
        except gspread.WorksheetNotFound:
            values = []  # 탭이 없을 때만 빈 표. 읽기 실패(할당량 초과 등)는 올린다
        hdr = values[0] if values else self.headers
        out = []
        for i, row in enumerate(values[1:], start=2):
            p = self._parse_row(i, {h: (row[j] if j < len(row) else "") for j, h in enumerate(hdr)})
            if p:
                out.append(p)
        set_cached(self.cache_key, out)
        return out

    def list_programs(self, sy: Optional[int] = None) -> List[Dict[str, Any]]:
        sy = sy or school_year()
        return [p for p in self._all_rows() if p["year"] == sy and not p["deleted"]]

    def validate(self, data: Dict[str, Any], sy: int, editing_id: Optional[int] = None) -> Optional[str]:
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
        targets = [c for c in data.get("targets") or [] if str(c).strip()]
        if not targets:
            return "대상 학생을 골라 주세요."
        if self.single and len(set(targets)) != 1:
            return "개별학생 프로그램이라 대상 학생은 한 명입니다."
        others = [p for p in self.list_programs(sy) if p["id"] != editing_id]
        if len(others) >= self.max:
            return f"프로그램은 학년도마다 {self.max}개까지 만들 수 있습니다."
        return None

    def _row_values(self, data: Dict[str, Any], sy: int) -> List[str]:
        stamp = now_kst().replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
        targets = ",".join(dict.fromkeys(str(c).strip() for c in data.get("targets", []) if str(c).strip()))
        return ([str(sy), str(data.get("name", "")).strip(), str(data.get("type", "")), str(int(data["start"])),
                 str(int(data["end"])), targets, str(data.get("skills", "")), str(data.get("staff", "")),
                 str(data.get("memo", ""))]
                + [str(data.get(key, "")) for key in self.extra.values()] + ["", stamp])

    def save_program(self, data: Dict[str, Any], program_id: Optional[int] = None) -> Dict[str, Any]:
        sy = school_year()
        err = self.validate(data, sy, program_id)
        if err:
            return {"error": err}
        ws = self._ws()
        if program_id:
            if not any(p["id"] == program_id for p in self.list_programs(sy)):
                return {"error": "프로그램을 찾을 수 없습니다."}
            ws.update(range_name=f"A{program_id}", values=[self._row_values(data, sy)], value_input_option="RAW")
        else:
            ws.append_rows([self._row_values(data, sy)], value_input_option="RAW", table_range="A1")
        invalidate_cache(self.cache_key)
        return {"message": "저장했습니다."}

    def delete_program(self, program_id: int) -> Dict[str, Any]:
        if not any(p["id"] == program_id for p in self.list_programs()):
            return {"error": "프로그램을 찾을 수 없습니다."}
        self._ws().update_cell(program_id, self.headers.index("상태") + 1, "삭제")  # 행은 남긴다
        invalidate_cache(self.cache_key)
        return {"message": "삭제했습니다."}

    def monitor_program(self, program_id: int, allowed_codes: Optional[set] = None) -> Dict[str, Any]:
        p = next((x for x in self.list_programs() if x["id"] == program_id), None)
        return monitor(p, allowed_codes) if p else {"error": "프로그램을 찾을 수 없습니다."}

    def summaries(self, allowed_codes: Optional[set] = None) -> List[Dict[str, Any]]:
        """모든 프로그램의 운영 기간 성과 요약(카드·비교용)."""
        out = []
        for p in self.list_programs():
            codes = None if allowed_codes is None else allowed_codes & set(p["targets"])
            if codes is not None and not codes:
                continue
            r = monitor(p, codes)
            out.append({"id": p["id"], "name": p["name"], "start": p["start"], "end": p["end"],
                        "targets": r["program"]["targets"], **r["summary"]})
        return out


SST = ProgramBook("SST_프로그램", MAX_PROGRAMS, TYPES)


# SST 화면·다른 모듈이 쓰는 이름(그대로 유지)
def list_programs(sy: Optional[int] = None) -> List[Dict[str, Any]]:
    return SST.list_programs(sy)


def validate(data: Dict[str, Any], sy: int, editing_id: Optional[int] = None) -> Optional[str]:
    return SST.validate(data, sy, editing_id)


def save_program(data: Dict[str, Any], program_id: Optional[int] = None) -> Dict[str, Any]:
    return SST.save_program(data, program_id)


def delete_program(program_id: int) -> Dict[str, Any]:
    return SST.delete_program(program_id)


def monitor_program(program_id: int, allowed_codes: Optional[set] = None) -> Dict[str, Any]:
    return SST.monitor_program(program_id, allowed_codes)


def summaries(allowed_codes: Optional[set] = None) -> List[Dict[str, Any]]:
    return SST.summaries(allowed_codes)


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


def _crisis_detail(codes: List[str], months: List[int], sy: int):
    """학생별 월 위기행동 기록 건수와 평균 강도(1~5)."""
    from app.services.sheets import fetch_all_records
    keys = {f"{calendar_year(sy, m)}-{m:02d}": m for m in months}
    counts = {c: {m: 0 for m in months} for c in codes}
    inten: Dict[str, Dict[int, List[float]]] = {c: {m: [] for m in months} for c in codes}
    for r in fetch_all_records() or []:
        code = str(r.get("학생코드", "")).strip()
        m = keys.get(str(r.get("행동발생날짜", ""))[:7])
        if code in counts and m:
            counts[code][m] += 1
            try:
                inten[code][m].append(float(str(r.get("강도", "")).strip()[:1]))
            except ValueError:
                pass
    avg = {c: {m: (round(sum(v) / len(v), 1) if v else None) for m, v in ms.items()} for c, ms in inten.items()}
    return counts, avg


def monitor(p: Dict[str, Any], allowed_codes: Optional[set] = None) -> Dict[str, Any]:
    """운영 전 1개월·운영 기간·운영 후 1개월의 학생별·집단 평균 지표. 아직 오지 않은 달은 뺀다."""
    from app.services.sheets import fetch_student_status
    sy = school_year()
    a, b = month_index(p["start"]), month_index(p["end"])
    now_idx = month_index(now_kst().month)
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
    crisis, intensity = _crisis_detail(codes, months, sy)
    cico = _cico_rates(codes, months)

    def avg(vals):
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    return {
        "program": {**p, "targets": codes},
        "summary": _summary(phases, codes, crisis, cico),
        "months": [{
            "month": m, "phase": ph,
            "crisis_avg": avg([crisis[c][m] for c in codes]),
            "intensity_avg": avg([intensity[c][m] for c in codes]),
            "cico_avg": avg([cico[c][m] for c in codes]),
            "cico_n": sum(1 for c in codes if cico[c][m] is not None),
        } for m, ph in phases],
        "students": [{
            "code": c,
            "name": roster.get(c, {}).get("학생이름", ""),
            "class": roster.get(c, {}).get("학급", ""),
            "crisis": {str(m): crisis[c][m] for m in months},
            "intensity": {str(m): intensity[c][m] for m in months},
            "cico": {str(m): cico[c][m] for m in months},
        } for c in codes],
    }


def _summary(phases, codes, crisis, cico) -> Dict[str, Any]:
    """운영 전(기초선) 대비 운영 중 변화. 위기행동은 줄수록, CICO는 오를수록 좋다."""
    def mean(xs):
        xs = [x for x in xs if x is not None]
        return round(sum(xs) / len(xs), 2) if xs else None
    pre = [m for m, ph in phases if ph == "운영 전"]
    dur = [m for m, ph in phases if ph == "운영 중"]
    per = []
    for c in codes:
        b, d = mean([crisis[c][m] for m in pre]), mean([crisis[c][m] for m in dur])
        per.append((b, d))
    base, during = mean([b for b, _ in per]), mean([d for _, d in per])
    change = round((during - base) / base * 100, 1) if base and during is not None else None
    improved = sum(1 for b, d in per if b is not None and d is not None and d < b)
    worse = sum(1 for b, d in per if b is not None and d is not None and d > b)
    cico_pre = mean([mean([cico[c][m] for c in codes]) for m in pre])
    cico_dur = mean([mean([cico[c][m] for c in codes]) for m in dur])
    if not dur:
        verdict = "운영 전"
    elif base is None:
        verdict = "기초선 없음"
    elif base == 0 and during == 0:
        verdict = "위기행동 없음 유지"
    elif change is not None and change <= -20:
        verdict = "효과 있음"
    elif change is not None and change < 0:
        verdict = "소폭 개선"
    elif change is not None and change <= 10:
        verdict = "변화 없음"
    else:
        verdict = "재검토 필요"
    return {
        "crisis_pre": base, "crisis_during": during, "crisis_change_pct": change,
        "improved": improved, "worse": worse, "students": len(codes),
        "cico_pre": cico_pre, "cico_during": cico_dur,
        "cico_change": round(cico_dur - cico_pre, 1) if cico_pre is not None and cico_dur is not None else None,
        "verdict": verdict,
    }

