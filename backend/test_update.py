import gspread
import os
import sys
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from app.services.picture_words import update_minute_entry
from app.core.config import settings

# Test update to row 2 of PW_협의록
# Original: ['2026-03-18', '평가협의', '박종호', '잘했음.', '101', '유치원 0학년 1반']
result = update_minute_entry("minutes", 2, {"내용": "수정 테스트 (Agent)"})
print(f"Update Minutes Result: {result}")

# Test update to row 2 of PW_수업가이드
result = update_minute_entry("lessons", 2, {"내용": "가이드 수정 테스트 (Agent)"})
print(f"Update Lessons Result: {result}")
