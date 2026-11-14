"""CICO 관리 탭: 대상자 추가(같은 학생이면 목표 순번+1)·해제/복원(Tier2만 바꿈)."""
import os
import sys
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))


class FakeStore:
    def __init__(self, rows):
        self.rows, self.added, self.cells = rows, [], []
        self.settings = SimpleNamespace(rows=lambda: self.rows)

    def month_rows(self, sy, month):
        return [r for r in self.rows if r["월"] == str(month)]

    def month_dates(self, sy, month):
        return ["06-01"]

    def has_month(self, sy, month):
        return True

    def record_map(self, sy):
        return {("2026-06-01", "3124", "2", ""): {"값": "O"}}

    def add_month(self, sy, month, rows, dates):
        self.added += rows

    def update_settings(self, cells):
        self.cells += cells


def _patch(store):
    from app.services import sheets
    from app.adapters.sheets import cico_store
    return [
        mock.patch.object(cico_store, "open_store", return_value=store),
        mock.patch.object(cico_store, "school_year", return_value=2026),
        mock.patch.object(sheets, "open_main_sheet", return_value=None),
        mock.patch.object(sheets, "fetch_student_status", return_value=[{"학생코드": "3124", "학생이름": "홍길동", "학급": "중1-2"}]),
        mock.patch.object(sheets, "_invalidate_cico_caches", return_value=None),
    ]


def _run(store, fn):
    ps = _patch(store)
    for p in ps:
        p.start()
    try:
        return fn()
    finally:
        for p in ps:
            p.stop()


ROWS = [
    {"_row": 10, "학년도": "2026", "월": "6", "번호": "3", "학생코드": "3124", "목표": "1", "Tier2": "O", "학생명": "홍O동"},
    {"_row": 11, "학년도": "2026", "월": "6", "번호": "4", "학생코드": "3124", "목표": "2", "Tier2": "O", "학생명": "홍O동"},
]


def test_add_existing_student_gets_next_goal_and_masked_name():
    from app.services import sheets
    store = FakeStore(list(ROWS))
    res = _run(store, lambda: sheets.add_cico_target(2026, 6, "3124"))
    assert res["goal"] == 3
    row = store.added[0]
    assert (row["목표"], row["번호"], row["Tier2"], row["학생명"]) == (3, 5, "O", "홍O동")


def test_list_marks_grid_rows_and_record_counts():
    from app.services import sheets
    store = FakeStore(list(ROWS))
    data = _run(store, lambda: sheets.list_cico_targets(6))
    t = data["targets"]
    assert data["history"] == {"6": ["3124", "3124"]}
    assert [(x["row"], x["goal"], x["record_count"]) for x in t] == [(2, "1", 0), (3, "2", 1)]


def test_deactivate_only_flips_tier2_of_this_month_row():
    from app.services import sheets
    store = FakeStore(list(ROWS))
    assert "error" in _run(store, lambda: sheets.set_cico_target_active(6, 99, False))
    _run(store, lambda: sheets.set_cico_target_active(6, 11, False))
    assert store.cells == [(11, "Tier2", "X")]


def test_copy_prev_month_skips_existing_fills_blank_and_appends():
    from app.services import sheets
    prev = [
        {"_row": 2, "월": "5", "학생코드": "3124", "목표": "1", "Tier2": "O", "목표행동": "옷 벗는 행동", "척도": "0~7교시", "목표 달성 기준": "10% 이하", "학생명": "홍O동"},
        {"_row": 3, "월": "5", "학생코드": "3124", "목표": "2", "Tier2": "O", "목표행동": "타인 공격", "척도": "O/X(발생)", "학생명": "홍O동"},
        {"_row": 4, "월": "5", "학생코드": "2211", "목표": "1", "Tier2": "O", "목표행동": "기다리기", "학생명": "김O수"},
        {"_row": 7, "월": "5", "학생코드": "5000", "목표": "1", "Tier2": "O", "목표행동": "자리 이탈", "척도": "0~5", "학생명": "박O"},
        {"_row": 8, "월": "5", "학생코드": "5000", "목표": "2", "Tier2": "O", "목표행동": "소리 지르기", "학생명": "박O"},
        {"_row": 5, "월": "5", "학생코드": "9999", "목표": "1", "Tier2": "X", "목표행동": "해제됨"},
        {"_row": 6, "월": "5", "학생코드": "8888", "목표": "1", "Tier2": "O", "목표행동": "다음달 제외", "차월 대상여부": "X"},
    ]
    cur = [
        {"_row": 20, "월": "6", "번호": "1", "학생코드": "3124", "목표": "1", "Tier2": "O", "목표행동": "옷 벗는 행동"},
        {"_row": 21, "월": "6", "번호": "2", "학생코드": "2211", "목표": "1", "Tier2": "O", "목표행동": ""},
    ]
    store = FakeStore(prev + cur)
    res = _run(store, lambda: sheets.copy_prev_month_targets(2026, 6))
    # 3124는 이미 이 달에 있다 → 문구가 다른 목표 2도 새로 붙이지 않는다
    assert (res["added"], res["filled"], res["skipped"]) == (2, 1, 2)
    # 이 달에 없는 5000은 목표 둘을 모두 가져오고 번호가 이어진다
    assert [(r["학생코드"], r["목표"], r["번호"], r["목표행동"], r["척도"]) for r in store.added] == [
        ("5000", 1, 3, "자리 이탈", "0~5"), ("5000", 2, 4, "소리 지르기", "")]
    # 2211은 목표행동이 빈 이 달 줄(21행)을 채운다
    assert (21, "목표행동", "기다리기") in store.cells and all(r == 21 for r, _, _ in store.cells)


def test_copy_prev_month_march_has_no_previous():
    from app.services import sheets
    assert "error" in _run(FakeStore([]), lambda: sheets.copy_prev_month_targets(2026, 3))
