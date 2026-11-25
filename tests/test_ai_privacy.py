import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest

from app.services.ai_privacy import (  # noqa: E402
    PIIBlocked, assert_aggregate_only, chart_payload, pseudonymize, restore,
)

NAMES, CODES = {"김O준", "이O"}, {"3124", "2111"}


def test_forbidden_fields_are_blocked():
    for bad in ({"memo": "x"}, {"rows": [{"notes": "x"}]}, {"raw_학생명": "x"}, {"label": "가" * 41}):
        with pytest.raises(PIIBlocked):
            assert_aggregate_only(bad)


def test_chart_payload_keeps_numbers_and_labels_drops_text():
    data = {"chart_data": [{"name": "신체적공격", "value": 3, "memo": "점심시간에 친구를 때림"}],
            "top_items": [{"name": "교실", "count": 5, "description": "가" * 60}], "rate": 0.4}
    out = chart_payload(data)
    assert out == {"chart_data": [{"name": "신체적공격", "value": 3}], "top_items": [{"name": "교실", "count": 5}], "rate": 0.4}


def test_pseudonymize_hides_alias_and_code_and_restores():
    (s, u), m = pseudonymize(["시스템", "김O준(3124) 이O 31240건 김O준"], NAMES, CODES)
    assert "김O준" not in u and "3124)" not in u and "이O" not in u
    assert "31240건" in u  # 코드가 다른 숫자의 일부면 건드리지 않는다
    assert restore(u, m) == "김O준(3124) 이O 31240건 김O준"
