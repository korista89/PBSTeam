"""위기행동 없음과 결석을 같은 탭에 Type 칸으로 구분한다(2026-11-28). 결석은 '없었던 날'로 세지 않는다."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.services import sheets


class FakeWs:
    def __init__(self, rows, header):
        self.rows, self.header, self.col_count = rows, header, len(header)
    def row_values(self, n): return list(self.header)
    def resize(self, cols): self.col_count = cols
    def update_cell(self, r, c, v): self.header = self.header + [v]
    def append_rows(self, rows): self.rows += [dict(zip(self.header, r)) for r in rows]


def test_absent_is_separate_and_old_tab_gets_type_column(monkeypatch):
    ws = FakeWs([{"StudentCode": "S01", "Date": "2026-11-02"}], ["StudentCode", "Date", "RecordedBy", "UUID"])
    monkeypatch.setattr(sheets, "ensure_no_incident_sheet", lambda: ws)
    monkeypatch.setattr(sheets, "safe_get_all_records", lambda w: w.rows)
    r = sheets.add_no_incident_dates("S01", ["2026-11-02", "2026-11-03"], "담임", "결석")
    assert r == {"added": ["2026-11-03"], "existing": ["2026-11-02"]} and ws.header[-1] == "Type"
    assert sheets.get_day_marks("S01") == {"2026-11-02": "", "2026-11-03": "결석"}
    assert sheets.get_no_incident_dates("S01") == ["2026-11-02"]
