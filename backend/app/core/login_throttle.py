"""로그인 대입 공격 완화: 같은 계정이 15분 안에 10번 틀리면 남은 시간만큼 잠근다.

계정 단위로만 센다(학교 전체가 한 공인 IP를 쓰므로 IP 단위 잠금은 정상 사용자를 막는다).
# ponytail: 인스턴스 메모리 저장 — Vercel 인스턴스가 여러 개면 인스턴스마다 따로 센다.
#   더 엄격히 하려면 시트나 외부 저장소로 옮긴다.
"""
import time
from typing import Dict, List

MAX_FAILS = 10
WINDOW_SECONDS = 15 * 60
_MAX_KEYS = 5000
_fails: Dict[str, List[float]] = {}


def _key(user_id: str) -> str:
    return (user_id or "").strip().lower()[:100]


def _recent(key: str, now: float) -> List[float]:
    kept = [t for t in _fails.get(key, []) if now - t < WINDOW_SECONDS]
    if kept:
        _fails[key] = kept
    else:
        _fails.pop(key, None)
    return kept


def retry_after(user_id: str, now: float = None) -> int:
    """잠겨 있으면 남은 초, 아니면 0."""
    now = time.time() if now is None else now
    kept = _recent(_key(user_id), now)
    if len(kept) < MAX_FAILS:
        return 0
    return max(1, int(WINDOW_SECONDS - (now - kept[-MAX_FAILS])) + 1)


def record_failure(user_id: str, now: float = None) -> None:
    now = time.time() if now is None else now
    if len(_fails) >= _MAX_KEYS:
        _fails.clear()  # 무작위 계정 대량 시도로 메모리가 커지는 것 방지
    _fails.setdefault(_key(user_id), []).append(now)


def record_success(user_id: str) -> None:
    _fails.pop(_key(user_id), None)
