# backend/app/adapters/sheets/tier_status.py

from typing import List, Dict, Any, Optional
import gspread
from app.core.config import settings
from app.domain.models import StudentProfile, TierSnapshot, TierCode
from app.adapters.sheets.client import get_sheets_client, safe_get_all_records, get_cached, set_cached

CACHE_KEY_TIER_STATUS = "sheet:tier-status"

class TierStatusAdapter:
    @staticmethod
    def get_worksheet():
        client = get_sheets_client()
        if not client or not settings.SHEET_URL:
            return None
        try:
            sheet = client.open_by_url(settings.SHEET_URL)
            return sheet.worksheet(settings.STUDENT_STATUS_SHEET)
        except Exception as e:
            print(f"Error opening TierStatus worksheet: {e}")
            return None

    @classmethod
    def fetch_students(cls, force_refresh: bool = False) -> List[StudentProfile]:
        if not force_refresh:
            cached = get_cached(CACHE_KEY_TIER_STATUS)
            if cached is not None:
                return cached

        ws = cls.get_worksheet()
        if not ws:
            return []

        raw_records = safe_get_all_records(ws)
        students = []

        for row in raw_records:
            student = cls._normalize_student(row)
            if student:
                students.append(student)

        set_cached(CACHE_KEY_TIER_STATUS, students)
        return students

    @classmethod
    def _normalize_student(cls, row: Dict[str, Any]) -> Optional[StudentProfile]:
        s_code = str(row.get("학생코드") or row.get("Code") or row.get("학번") or "").strip()
        s_name = str(row.get("학생이름") or row.get("학생명") or row.get("Name") or s_code).strip()
        class_name = str(row.get("학급") or row.get("Class") or "").strip()

        if not s_code and not s_name:
            return None

        # Tier Extraction
        active_tiers = []
        if str(row.get("Tier1", "")).strip() in ["O", "o", "True", "true"]:
            active_tiers.append(TierCode.TIER_1)
        if str(row.get("Tier2(CICO)", "")).strip() in ["O", "o", "True", "true"]:
            active_tiers.append(TierCode.TIER_2_CICO)
        if str(row.get("Tier2(SST)", "")).strip() in ["O", "o", "True", "true"]:
            active_tiers.append(TierCode.TIER_2_SST)
        if str(row.get("Tier3", "")).strip() in ["O", "o", "True", "true"]:
            active_tiers.append(TierCode.TIER_3)
        if str(row.get("Tier3+", "")).strip() in ["O", "o", "True", "true"]:
            active_tiers.append(TierCode.TIER_3_PLUS)

        if not active_tiers:
            active_tiers.append(TierCode.TIER_1)

        tier_snap = TierSnapshot(
            active_tiers=active_tiers,
            memo=str(row.get("메모") or "")
        )

        is_enrolled = str(row.get("재학여부") or row.get("재학상태") or "O").strip() in ["O", "o", "재학", "True", "true"]
        beable_code = str(row.get("BeAble코드") or "").strip() or None

        return StudentProfile(
            student_code=s_code or s_name,
            display_name=s_name or s_code,
            class_name=class_name,
            enrolled=is_enrolled,
            beable_code=beable_code,
            tier=tier_snap,
            communication_modes=[],
            preferred_supports=[],
            preferences=[],
            challenge_contexts=[],
            early_signs=[],
            accessibility_notes=[]
        )
