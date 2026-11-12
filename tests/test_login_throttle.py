import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.core import login_throttle as t


def test_throttle():
    t._fails.clear()
    now = 1000.0
    for _ in range(t.MAX_FAILS - 1):
        t.record_failure("Teacher1", now)
    assert t.retry_after("teacher1", now) == 0          # 9번까지는 정상 시도 가능(대소문자 무관)
    t.record_failure("teacher1", now)
    assert t.retry_after("TEACHER1", now) > 0           # 10번째에서 잠김
    assert t.retry_after("other", now) == 0             # 다른 계정은 영향 없음
    assert t.retry_after("teacher1", now + t.WINDOW_SECONDS + 5) == 0  # 15분 뒤 해제
    t.record_success("teacher1")
    assert t.retry_after("teacher1", now) == 0          # 성공하면 초기화
