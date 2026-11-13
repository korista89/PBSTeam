"""협의회 초안: 차수 자동 선택·기본 기간·AI 실패 시 수치 초안."""
import os
import sys
from datetime import date
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
os.environ.setdefault("AUTH_SECRET", "test")

from app.services import meeting_draft as M


def test_pick_session_by_date():
    assert M.pick_session(date(2026, 3, 5)) == 1
    assert M.pick_session(date(2026, 3, 11)) == 2
    assert M.pick_session(date(2026, 8, 25)) == 8
    assert M.pick_session(date(2026, 11, 13)) == 11
    assert M.pick_session(date(2027, 1, 15)) == 12


def test_session_period_starts_after_previous_session():
    s = M.session_info(11, date(2026, 11, 13))
    assert s["period_start"] == "2026-11-01" and s["period_end"] == "2026-11-13"
    assert s["agenda"][1].startswith("SAS")
    assert M.session_info(1, date(2026, 3, 5))["period_start"] == "2026-03-01"


def test_ai_failure_falls_back_to_numbers_only_draft():
    facts = {"기간": "2026-11-01 ~ 2026-11-13", "위기행동": "12건", "CICO": []}
    with mock.patch("app.services.ai_insight._call_llm", return_value="⚠️ AI 응답 생성에 실패했습니다."):
        d = M.generate_draft("학급 협의회", M.CLASS_ATTENDEES, M.CLASS_AGENDA, facts, "학급")
    assert "위기행동: 12건" in d and "CICO: 없음" in d and "4. 다음 기간" in d
