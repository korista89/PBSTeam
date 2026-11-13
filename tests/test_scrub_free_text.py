import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.core.privacy import scrub_free_text


def test_scrub_free_text():
    t = scrub_free_text("김민준이 소리지름. 연락 010-1234-5678", ["김O준", "이O"])
    assert "김O준이" in t and "민준" not in t and "[전화번호]" in t
