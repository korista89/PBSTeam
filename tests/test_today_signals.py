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


def test_old_records_without_abc_are_not_flagged():
    """필수 안내(ABC_REQUIRED_SINCE) 전 기록은 A·C가 비어도 신호를 만들지 않는다."""
    old = [ev("2026-10-01"), ev("2026-11-13")]
    assert not evaluate_decision_signals("2211", old, as_of_date=date(2026, 11, 20))


def test_new_record_missing_abc_flagged_and_id_moves():
    events = [ev("2026-11-13"), ev("2026-11-17")]
    ids = {s.signal_id for s in evaluate_decision_signals("2211", events, as_of_date=date(2026, 11, 20))}
    assert ids == {"SIG_DATA_2211_2026-11-17"}
    ids2 = {s.signal_id for s in evaluate_decision_signals("2211", events + [ev("2026-11-19")], as_of_date=date(2026, 11, 20))}
    assert ids2 == {"SIG_DATA_2211_2026-11-19"}
    # 채워진 새 기록만 있으면 신호 없음
    assert not evaluate_decision_signals("2211", [ev("2026-11-17", "요구", "회피")], as_of_date=date(2026, 11, 20))
