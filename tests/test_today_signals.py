"""Today 신호: ID에 근거 기록의 마지막 날짜가 들어가 '확인 완료' 뒤 새 기록이 생기면 다시 뜬다."""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
os.environ.setdefault("AUTH_SECRET", "test")

from app.adapters.sheets.log_main import LogMainAdapter
from app.services.decision.signals import evaluate_decision_signals

HEAD_A = "선행사건 - 행동 직전에 무엇이 있었나요?   (복수 선택 가능)"
HEAD_C = "후속결과 - 행동 직후 무엇이 달라졌나요?   (복수 선택 가능)"


def ev(day, a="", c=""):
    return LogMainAdapter._normalize_row({"학생코드": "2211", "행동발생날짜": day, HEAD_A: a, HEAD_C: c}, row_idx=2)


def test_long_form_headers_are_read():
    e = ev("2026-11-02", "과제 제시", "과제 철회")
    assert e.antecedent == "과제 제시" and e.consequence == "과제 철회"


def test_signal_id_moves_with_new_evidence():
    events = [ev("2026-11-02"), ev("2026-11-05")]
    ids = {s.signal_id for s in evaluate_decision_signals("2211", events, as_of_date=date(2026, 11, 13))}
    assert "SIG_DATA_2211_2026-11-05" in ids
    ids2 = {s.signal_id for s in evaluate_decision_signals("2211", events + [ev("2026-11-12")], as_of_date=date(2026, 11, 13))}
    assert "SIG_DATA_2211_2026-11-12" in ids2 and "SIG_DATA_2211_2026-11-05" not in ids2
    # ABC가 3건 이상 채워지면 신호가 사라진다
    full = [ev(f"2026-11-0{d}", "요구", "회피") for d in (2, 3, 4)]
    assert not evaluate_decision_signals("2211", full, as_of_date=date(2026, 11, 13))
