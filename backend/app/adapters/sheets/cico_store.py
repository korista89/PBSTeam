# backend/app/adapters/sheets/cico_store.py
"""CICO 저장소: 월별 탭(3월·4월…) 대신 표 3개에 학년도별로 쌓는다.

- CICO_설정: 학년도·월마다 학생 한 줄(목표행동·척도·기록방식·수행률 등)
- CICO_기록: 학년도·날짜·학생·목표·교시·값 한 줄(교시가 비면 하루 기록, 있으면 분포도 기록)
- CICO_달력: 학년도·월의 기록일 목록(MM-DD, 쉼표 구분)과 표 배치

'목표'는 한 학생이 목표행동을 여러 개 가질 때 그 달 안에서의 순번(1, 2, …)이다.

기존 코드는 "10월" 같은 월별 탭을 열어 읽고 쓰므로, MonthSheet가 같은 모양의 표를
만들어 돌려주고(get_all_values) 칸 쓰기(batch_update·update_cell)를 위 표로 옮겨 적는다.
"""

import logging
import re
import threading
from typing import Any, Dict, List, Optional, Tuple

from gspread.utils import a1_range_to_grid_range

from app.core.time import now_kst

logger = logging.getLogger(__name__)

SETTINGS_TAB = "CICO_설정"
RECORDS_TAB = "CICO_기록"
CALENDAR_TAB = "CICO_달력"

SET_HEADERS = ["학년도", "월", "번호", "학급", "학생코드", "목표", "학생명", "Tier2", "Tier3", "목표행동", "목표행동 유형",
               "척도", "기록방식", "입력 기준(베이스라인)", "목표 달성 기준", "수행/발생률", "목표 달성 여부",
               "교사메모", "입력자", "팀 협의 내용", "차월 대상여부"]
REC_HEADERS = ["학년도", "날짜", "학생코드", "목표", "교시", "값", "입력자", "수정시각"]
CAL_HEADERS = ["학년도", "월", "기록일", "배치"]

# 월별 표(가상)의 열 배치. 예전 9월~ 탭과 같다. 기록방식은 맨 끝에 붙인다.
GRID_FIXED = ["번호", "학급", "학생명(코드)", "Tier2", "Tier3", "목표행동", "목표행동 유형", "척도",
              "입력 기준(베이스라인)", "목표 달성 기준"]
GRID_TAIL = ["수행/발생률", "목표 달성 여부", "교사메모", "입력자", "팀 협의 내용", "차월 대상여부", "기록방식"]
# 2026학년도 3월 탭은 학생코드·학생명 열이 따로였고 날짜가 맨 뒤였다. 그 달은 같은 모양으로 보여 준다.
LEGACY_FIXED = ["번호", "학급", "학생코드", "학생명", "Tier2", "목표행동", "목표행동 유형", "척도", "입력 기준",
                "목표 달성 기준", "수행/발생률", "목표 달성 여부", "교사메모", "입력자", "팀 협의 내용", "차월 대상여부"]
LEGACY_FIELD = {"입력 기준": "입력 기준(베이스라인)"}

SCATTER = "분포도"  # 기록방식 값. 비어 있으면 하루 기록(기존 방식)
PERIODS_ELEMENTARY = ["1교시", "2교시", "3교시", "점심", "4교시", "5교시", "6교시", "7교시"]
PERIODS_SECONDARY = ["1교시", "2교시", "3교시", "4교시", "점심", "5교시", "6교시", "7교시"]

_lock = threading.Lock()
_load_lock = threading.Lock()
_rec_index: Tuple[Any, Dict[int, Dict]] = (None, {})


def period_slots(class_name: str) -> List[str]:
    """분포도기록지 칸 순서. 초등은 3교시 뒤, 중·고·전공과는 4교시 뒤가 점심이다."""
    return PERIODS_ELEMENTARY if "초등" in str(class_name or "") else PERIODS_SECONDARY


def school_year(today=None) -> int:
    today = today or now_kst()
    return today.year if today.month >= 3 else today.year - 1


def full_date(sy: int, mmdd: str) -> str:
    month = int(mmdd[:2])
    return f"{sy if month >= 3 else sy + 1}-{mmdd}"


def is_month_title(name: str) -> Optional[int]:
    m = re.fullmatch(r"\s*(\d{1,2})\s*월?\s*", str(name))
    if m and 1 <= int(m.group(1)) <= 12:
        return int(m.group(1))
    return None


def _parse(values: List[List[str]], headers: List[str]) -> List[Dict[str, Any]]:
    hdr = values[0] if values else headers
    out = []
    for i, row in enumerate(values[1:], start=2):
        rec = {h: (row[j] if j < len(row) else "") for j, h in enumerate(hdr)}
        rec["_row"] = i
        out.append(rec)
    return out


class _Table:
    """탭 하나를 읽어 두고(요청 사이 60초 캐시), 행 번호로 쓴다."""

    def __init__(self, ss, title: str, headers: List[str], store=None):
        self.ss, self.title, self.headers, self.store = ss, title, headers, store

    def ws(self):
        try:
            return self.ss.worksheet(self.title)
        except Exception:
            ws = self.ss.add_worksheet(title=self.title, rows=1000, cols=len(self.headers))
            ws.update(range_name="A1", values=[self.headers])
            return ws

    def rows(self) -> List[Dict[str, Any]]:
        from app.adapters.sheets.client import get_cached, set_cached
        key = f"cico:store:{self.title}"
        cached = get_cached(key)
        if cached is None and self.store is not None:
            self.store.load_all()
            cached = get_cached(key)
        if cached is not None:
            return cached
        out = _parse(self.ws().get_all_values(), self.headers)
        set_cached(key, out)
        return out

    def col(self, header: str) -> int:
        values_hdr = self.ws().row_values(1)
        return values_hdr.index(header) + 1

    def invalidate(self):
        from app.adapters.sheets.client import invalidate_cache
        invalidate_cache(f"cico:store:{self.title}")


class CicoStore:
    def __init__(self, ss):
        self.ss = ss
        self.settings = _Table(ss, SETTINGS_TAB, SET_HEADERS, self)
        self.records = _Table(ss, RECORDS_TAB, REC_HEADERS, self)
        self.calendar = _Table(ss, CALENDAR_TAB, CAL_HEADERS, self)

    def load_all(self):
        """비어 있는 표 캐시를 한 번의 batch 읽기로 채운다. 동시에 들어온 요청은 기다렸다가 같이 쓴다."""
        from app.adapters.sheets.client import get_cached, set_cached
        from app.adapters.sheets.resilience import resilient_call
        tables = (self.settings, self.records, self.calendar)
        with _load_lock:
            todo = [t for t in tables if get_cached(f"cico:store:{t.title}") is None]
            if not todo:
                return
            ranges = ["'" + t.title + "'" for t in todo]
            try:
                res = resilient_call(("cico-store", tuple(ranges)), "CICO", lambda: self.ss.values_batch_get(ranges))
            except Exception:
                logger.warning("CICO 표 batch 읽기 실패, 표마다 따로 읽음", exc_info=True)
                return
            for t, vr in zip(todo, res.get("valueRanges", [])):
                set_cached(f"cico:store:{t.title}", _parse(vr.get("values") or [], t.headers))

    # ── 읽기 ──────────────────────────────────────────────
    def month_rows(self, sy: int, month: int) -> List[Dict[str, Any]]:
        rows = [r for r in self.settings.rows() if r.get("학년도") == str(sy) and r.get("월") == str(month)]
        return sorted(rows, key=lambda r: r["_row"])

    def _cal(self, sy: int, month: int) -> Dict[str, Any]:
        for r in self.calendar.rows():
            if r.get("학년도") == str(sy) and r.get("월") == str(month):
                return r
        return {}

    def month_dates(self, sy: int, month: int) -> List[str]:
        return [d.strip() for d in str(self._cal(sy, month).get("기록일", "")).split(",") if d.strip()]

    def month_layout(self, sy: int, month: int) -> str:
        return self._cal(sy, month).get("배치", "")

    def has_month(self, sy: int, month: int) -> bool:
        return bool(self.month_rows(sy, month)) or bool(self.month_dates(sy, month))

    def record_map(self, sy: int) -> Dict[Tuple[str, str, str, str], Dict[str, Any]]:
        """(날짜, 학생코드, 목표, 교시) → 기록 행. 같은 열쇠가 여러 줄이면 뒤의 것이 이긴다."""
        global _rec_index
        rows = self.records.rows()
        if _rec_index[0] is rows and sy in _rec_index[1]:
            return _rec_index[1][sy]  # 같은 캐시 목록이면 색인을 다시 만들지 않는다
        out = {}
        for r in rows:
            if r.get("학년도") == str(sy):
                out[(r.get("날짜", ""), r.get("학생코드", ""), r.get("목표", "") or "1", r.get("교시", ""))] = r
        _rec_index = (rows, {**(_rec_index[1] if _rec_index[0] is rows else {}), sy: out})
        return out

    def periods_for(self, sy: int, month: int) -> Dict[Tuple[str, str], Dict[str, Dict[str, str]]]:
        """{(학생코드, 목표): {MM-DD: {교시: 값}}} — 이 달의 분포도 기록."""
        out: Dict[Tuple[str, str], Dict[str, Dict[str, str]]] = {}
        for (date, code, goal, period), r in self.record_map(sy).items():
            if period and len(date) == 10 and int(date[5:7]) == month and r.get("값", "") != "":
                out.setdefault((code, goal), {}).setdefault(date[5:], {})[period] = r["값"]
        return out

    # ── 쓰기 ──────────────────────────────────────────────
    def upsert_records(self, sy: int, items: List[Tuple[str, str, str, str]], by: str = ""):
        """items = [(YYYY-MM-DD, 학생코드, 목표, 교시, 값)]. 있으면 값을 고치고 없으면 붙인다."""
        if not items:
            return
        with _lock:
            existing = self.record_map(sy)
            ws = self.records.ws()
            stamp = now_kst().replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
            updates, appends = [], []
            for date, code, goal, period, value in items:
                hit = existing.get((date, code, str(goal or "1"), period))
                if hit:
                    r = hit["_row"]
                    updates.append({"range": f"F{r}:H{r}", "values": [[value, by or hit.get("입력자", ""), stamp]]})
                elif value != "":
                    appends.append([str(sy), date, code, str(goal or "1"), period, value, by, stamp])
            if updates:
                ws.batch_update(updates, value_input_option="RAW")
            if appends:
                ws.append_rows(appends, value_input_option="RAW", table_range="A1")
            self.records.invalidate()

    def update_settings(self, cells: List[Tuple[int, str, Any]]):
        """cells = [(설정 탭 행 번호, 열 이름, 값)]"""
        if not cells:
            return
        ws = self.settings.ws()
        hdr = ws.row_values(1)
        missing = [h for _, h, _ in cells if h not in hdr]
        if missing:
            hdr = self._add_columns(ws, hdr, missing)
        from gspread.utils import rowcol_to_a1
        ws.batch_update([{"range": rowcol_to_a1(r, hdr.index(h) + 1), "values": [[v]]} for r, h, v in cells],
                        value_input_option="RAW")
        self.settings.invalidate()

    def _add_columns(self, ws, hdr, names):
        from gspread.utils import rowcol_to_a1
        new = [n for n in dict.fromkeys(names) if n not in hdr]
        ws.update(range_name=rowcol_to_a1(1, len(hdr) + 1), values=[new])
        return hdr + new

    def add_month(self, sy: int, month: int, rows: List[Dict[str, Any]], dates: List[str]):
        """새 달: 설정 줄과 기록일을 만든다."""
        if rows:
            self.settings.ws().append_rows([[str(r.get(h, "")) for h in SET_HEADERS] for r in rows],
                                           value_input_option="RAW", table_range="A1")
            self.settings.invalidate()
        if dates and not self.month_dates(sy, month):
            self.calendar.ws().append_rows([[str(sy), str(month), ",".join(dates), ""]],
                                           value_input_option="RAW", table_range="A1")
            self.calendar.invalidate()


class MonthSheet:
    """예전 월별 탭과 같은 모양으로 보이는 가상 시트. 읽기·칸 쓰기만 지원한다."""

    def __init__(self, store: CicoStore, month: int, sy: Optional[int] = None):
        self.store, self.month = store, month
        self.sy = sy if sy is not None else school_year()
        self.title = f"{month}월"
        self.id = f"cico-{self.sy}-{month}"

    def _layout(self):
        rows = self.store.month_rows(self.sy, self.month)
        dates = self.store.month_dates(self.sy, self.month)
        if self.store.month_layout(self.sy, self.month) == "구형":
            return rows, dates, LEGACY_FIXED + dates
        return rows, dates, GRID_FIXED + dates + GRID_TAIL

    @staticmethod
    def _cell(r: Dict[str, Any], col: str) -> str:
        if col == "학생명(코드)":
            code, name = r.get("학생코드", ""), r.get("학생명", "")
            return f"{name}({code})" if code else name
        return str(r.get(LEGACY_FIELD.get(col, col), ""))

    def get_all_values(self, *args, **kwargs) -> List[List[str]]:
        rows, dates, header = self._layout()
        recs = self.store.record_map(self.sy)
        periods = self.store.periods_for(self.sy, self.month)
        grid = [header]
        for r in rows:
            code, goal = r.get("학생코드", ""), r.get("목표", "") or "1"
            if r.get("기록방식") == SCATTER:
                day_vals = {}
                for d in dates:
                    vals = [v for v in periods.get((code, goal), {}).get(d, {}).values() if v]
                    day_vals[d] = "O" if "O" in vals else ("X" if vals else "")
            else:
                day_vals = {d: (recs.get((full_date(self.sy, d), code, goal, "")) or {}).get("값", "") for d in dates}
            grid.append([day_vals[h] if h in day_vals else self._cell(r, h) for h in header])
        return grid

    get_values = get_all_values

    def row_values(self, row: int, *args, **kwargs) -> List[str]:
        grid = self.get_all_values()
        return grid[row - 1] if row - 1 < len(grid) else []

    def _write(self, cells: List[Tuple[int, int, Any]]):
        rows, dates, header = self._layout()
        rec_items, set_cells = [], []
        for r, c, v in cells:
            if r < 2 or r - 2 >= len(rows) or c < 1 or c > len(header):
                continue
            srow, col = rows[r - 2], header[c - 1]
            if col in dates:
                rec_items.append((full_date(self.sy, col), srow.get("학생코드", ""), srow.get("목표", "") or "1", "", str(v)))
            elif col in ("학생명(코드)", "학생코드", "학생명"):
                continue
            else:
                set_cells.append((srow["_row"], LEGACY_FIELD.get(col, col), v))
        self.store.upsert_records(self.sy, rec_items)
        self.store.update_settings(set_cells)

    def batch_update(self, data: List[Dict[str, Any]], **kwargs):
        cells = []
        for item in data:
            g = a1_range_to_grid_range(item["range"])
            r0, c0 = g.get("startRowIndex", 0), g.get("startColumnIndex", 0)
            for i, line in enumerate(item.get("values") or []):
                for j, v in enumerate(line):
                    cells.append((r0 + i + 1, c0 + j + 1, v))
        self._write(cells)

    def update_cell(self, row: int, col: int, value: Any):
        self._write([(row, col, value)])

    def __repr__(self):
        return f"MonthSheet({self.sy}, {self.month})"


def open_store(ss=None) -> CicoStore:
    if ss is None:
        from app.adapters.sheets.client import open_main_sheet
        ss = open_main_sheet()
    return CicoStore(ss)
