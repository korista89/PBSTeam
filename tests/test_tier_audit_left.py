"""재학 X 학생: 떠난 달(메모 M/D)까지는 대상이 맞다. 그 뒤 달만 문제로 센다(날짜가 없으면 이번 달부터)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.services.tier_audit import left_month, _after_left


def test_left_month():
    assert left_month("11/27 자퇴") == 11
    assert left_month("3 / 5 전출") == 3
    assert left_month("") is None


def test_after_left():
    assert not _after_left(11, 11, 11) and not _after_left(3, 11, 11)
    assert _after_left(12, 11, 12)
    assert _after_left(3, None, 3) and _after_left(2, None, 3)  # 날짜 없으면 이번 달부터(2월은 학년도 끝이라 뒤)
    assert _after_left(11, None, 11) and not _after_left(10, None, 11)
