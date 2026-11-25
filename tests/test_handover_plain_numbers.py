# 인수인계 자료: 통계 표기를 새 담임이 읽기 쉬운 말로 바꾸는지 확인
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.ai_insight import plain_numbers  # noqa: E402


def test_plain_numbers():
    assert plain_numbers("신체적 공격행동(42.1%, n=24/57)을 보임.") == "신체적 공격행동(57번 중 24번)을 보임."
    assert plain_numbers("교사 추정 기준 56.9%(n=29/51)로 가장 많음.") == "교사 추정 기준 51번 중 29번으로 가장 많음."
    assert plain_numbers("교실에서 40건(70%)으로") == "교실에서 40건으로"
    assert plain_numbers("약 30%임") == "약 10번 중 3번꼴임"
    assert plain_numbers("총 24건(절반 가까이)") == "총 24건(절반 가까이)"
    assert plain_numbers("2교시(14.7%, n=11/75)로 많음") == "2교시(75번 중 11번)로 많음"
