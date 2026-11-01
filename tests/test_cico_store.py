"""CICO 표 3개 → 월별 표(가상) 변환과 분포도기록지 수행률."""
from app.adapters.sheets.cico_store import MonthSheet, period_slots, LEGACY_FIXED
from app.services.sheets import _calculate_cico_rate


class FakeStore:
    def __init__(self, rows, dates, records, layout=""):
        self.rows, self.dates, self.records, self.layout = rows, dates, records, layout
        self.upserts, self.settings = [], []

    def month_rows(self, sy, month): return self.rows
    def month_dates(self, sy, month): return self.dates
    def month_layout(self, sy, month): return self.layout
    def record_map(self, sy): return {(d, c, g, p): {"값": v} for d, c, g, p, v in self.records}

    def periods_for(self, sy, month):
        out = {}
        for d, c, g, p, v in self.records:
            if p:
                out.setdefault((c, g), {}).setdefault(d[5:], {})[p] = v
        return out

    def upsert_records(self, sy, items): self.upserts += items
    def update_settings(self, cells): self.settings += cells


ROWS = [
    {"_row": 2, "번호": "1", "학급": "초등 1학년 1반", "학생코드": "2116", "목표": "1", "학생명": "가O", "Tier2": "O", "척도": "O/X(발생)"},
    {"_row": 3, "번호": "2", "학급": "초등 1학년 1반", "학생코드": "2116", "목표": "2", "학생명": "가O", "Tier2": "O", "척도": "O/X(발생)"},
    {"_row": 4, "번호": "3", "학급": "중학교 1학년 1반", "학생코드": "3111", "목표": "1", "학생명": "나O", "Tier2": "O",
     "척도": "O/X(발생)", "기록방식": "분포도"},
]
RECORDS = [
    ("2026-10-01", "2116", "1", "", "O"), ("2026-10-01", "2116", "2", "", "X"),
    ("2026-10-01", "3111", "1", "2교시", "O"), ("2026-10-01", "3111", "1", "점심", "X"),
    ("2026-10-02", "3111", "1", "1교시", "X"),
]


def sheet(layout=""):
    store = FakeStore(ROWS, ["10-01", "10-02"], RECORDS, layout)
    return store, MonthSheet(store, 10, sy=2026)


def test_grid_keeps_goals_apart_and_summarises_scatter_days():
    _, ms = sheet()
    grid = ms.get_all_values()
    h = grid[0]
    assert h[:3] == ["번호", "학급", "학생명(코드)"] and h[10:12] == ["10-01", "10-02"]
    day = h.index("10-01")
    assert [r[day] for r in grid[1:]] == ["O", "X", "O"]  # 목표 1·2가 섞이지 않고, 분포도는 하루 요약
    assert grid[3][h.index("10-02")] == "X"
    assert grid[1][2] == "가O(2116)"


def test_writes_go_to_records_and_settings():
    store, ms = sheet()
    ms.batch_update([{"range": "L3", "values": [["O"]]}, {"range": "F2", "values": [["손 들기"]]}])
    assert store.upserts == [("2026-10-02", "2116", "2", "", "O")]
    assert store.settings == [(2, "목표행동", "손 들기")]


def test_legacy_march_layout():
    _, ms = sheet(layout="구형")
    assert ms.get_all_values()[0] == LEGACY_FIXED + ["10-01", "10-02"]


def test_period_slots_lunch_position():
    assert period_slots("초등 2학년 1반")[3] == "점심"
    assert period_slots("고등학교 1학년 1반")[4] == "점심"
    assert period_slots("전공과 1학년 1반")[4] == "점심"


def test_scatter_rate_counts_periods():
    student = {"기록방식": "분포도", "척도": "0~5", "목표행동 유형": "감소 목표행동", "목표 달성 기준": "20% 이하",
               "days": {"10-01": "O", "10-02": "X"},
               "periods": {"10-01": {"1교시": "O", "2교시": "X", "점심": "X", "3교시": "X"}, "10-02": {"1교시": "X"}}}
    res = _calculate_cico_rate(student)
    assert res["rate_str"] == "80%"  # 발생 1/5 = 20% → 감소 목표라 달성도 80%
    assert res["achieved"] == "O" and res["input_days"] == 2
    week = _calculate_cico_rate({**student, "days": {"10-02": "X"}})
    assert week["rate_str"] == "100%"  # 주별 계산은 그 주 날짜의 교시만 센다
