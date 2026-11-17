"""TargetBehaviorData·Fidelity 탭이 머리글 수만큼만 열을 가져도 UUID 열을 붙인다."""
from app.services.sheets import _ensure_uuid_header


class FakeWS:
    def __init__(self, rows, cols):
        self.rows, self.col_count = rows, cols

    def row_values(self, i):
        return self.rows[i - 1]

    def col_values(self, c):
        return [r[c - 1] for r in self.rows]

    def add_cols(self, n):
        self.col_count += n

    def update(self, range_name, values):
        assert range_name == f"{chr(64 + self.col_count)}1", "쓰는 열이 탭 안에 있어야 한다"
        for r, v in zip(self.rows, values):
            r.append(v[0])


def test_adds_column_and_backfills():
    ws = FakeWS([["BehaviorID", "Date", "Value", "RecordedBy", "Memo"], ["b1", "d", "1", "x", ""], ["b2", "d", "2", "x", ""]], 5)
    _ensure_uuid_header(ws)
    assert ws.col_count == 6 and ws.rows[0][-1] == "UUID"
    assert all(len(r[-1]) == 36 for r in ws.rows[1:])
    _ensure_uuid_header(ws)  # 두 번째는 아무것도 안 한다
    assert ws.col_count == 6 and len(ws.rows[0]) == 6
