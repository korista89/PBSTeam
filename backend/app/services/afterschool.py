"""늘봄(교내 방과후) 참여 학생 명단.

- 저장: 운영 시트 숨김 탭 '늘봄_참여학생'(처음 저장할 때 앱이 만든다). 학생 한 줄.
- 늘봄실장 계정은 이 명단의 학생만 기록·조회한다(deps.check_student_scope).
- 늘봄 시간 기록은 시간대 '11구간: 늘봄(교내 방과후)'로 남겨 정규 일과 기록과 나눠 본다.
"""

import gspread
import logging
from typing import Dict, List

from app.adapters.sheets.client import get_cached, set_cached, invalidate_cache, open_main_sheet, safe_get_all_values
from app.core.privacy import mask_name
from app.core.time import now_kst

logger = logging.getLogger(__name__)

TAB = "늘봄_참여학생"
HEADERS = ["학생코드", "학생명", "학급", "수정시각", "수정자"]
CACHE_KEY = "sheet:afterschool:rows"
SLOT = "11구간: 늘봄(교내 방과후)"


def _ws():
    ss = open_main_sheet()
    try:
        return ss.worksheet(TAB)
    except gspread.WorksheetNotFound:  # 없을 때만 만든다(일시 장애에 같은 이름 탭을 또 만들지 않게)
        ws = ss.add_worksheet(title=TAB, rows=300, cols=len(HEADERS))
        ws.update(range_name="A1", values=[HEADERS])
        try:
            ws.hide()
        except Exception:
            logger.warning("늘봄_참여학생 탭 숨기기 실패", exc_info=True)
        return ws


def participants() -> List[Dict[str, str]]:
    cached = get_cached(CACHE_KEY, ttl=60)
    if cached is not None:
        return cached
    try:
        values = safe_get_all_values(open_main_sheet().worksheet(TAB))
    except Exception:
        values = []
    out = [{"code": r[0].strip(), "name": r[1] if len(r) > 1 else "", "class": r[2] if len(r) > 2 else ""}
           for r in values[1:] if r and r[0].strip()]
    set_cached(CACHE_KEY, out)
    return out


def participant_codes() -> set:
    return {p["code"] for p in participants()}


def save_participants(codes: List[str], author: str) -> Dict[str, object]:
    """명단을 통째로 바꾼다(재학 중인 학생코드만 남긴다)."""
    from app.adapters.sheets.tier_status import TierStatusAdapter
    roster = {s.student_code.strip(): s for s in TierStatusAdapter.fetch_students()}
    stamp = now_kst().replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
    keep = []
    for c in dict.fromkeys(str(c).strip() for c in codes):
        s = roster.get(c)
        if s and s.enrolled:
            keep.append([c, mask_name(s.display_name), s.class_name, stamp, author])
    ws = _ws()
    ws.batch_clear(["A2:E"])
    if keep:
        ws.update(range_name="A2", values=keep)
    invalidate_cache(CACHE_KEY)
    return {"success": True, "count": len(keep), "skipped": len(codes) - len(keep)}
