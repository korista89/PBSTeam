# backend/app/adapters/sheets/log_main.py

from datetime import date, datetime
from typing import List, Dict, Any, Optional
import re
import pandas as pd
from app.core.config import settings
from app.domain.models import BehaviorEvent, SafetyFlags, FunctionEstimate, FunctionCode
from app.adapters.sheets.client import get_sheets_client, safe_get_all_records, get_cached, set_cached
from app.services.normalize import parse_time_slots, normalize_location, normalize_behavior_type, normalize_function_code, parse_occurrence_count

CACHE_KEY_LOG_MAIN = "sheet:log-main"

class LogMainAdapter:
    @staticmethod
    def get_worksheet():
        client = get_sheets_client()
        if not client or not settings.SHEET_URL:
            return None
        try:
            sheet = client.open_by_url(settings.SHEET_URL)
            for title in ["Log_Main", "BehaviorLogs1", "BehaviorLogs", "설문지 응답 시트1"]:
                try:
                    return sheet.worksheet(title)
                except Exception:
                    pass
            print("CRITICAL_DATA_CONTRACT_ERROR: Log_Main worksheet not found.")
            return None
        except Exception as e:
            print(f"Error opening spreadsheet for Log_Main: {e}")
            return None

    @classmethod
    def fetch_events(cls, force_refresh: bool = False) -> List[BehaviorEvent]:
        if not force_refresh:
            cached = get_cached(CACHE_KEY_LOG_MAIN)
            if cached is not None:
                return cached

        ws = cls.get_worksheet()
        if not ws:
            return []

        raw_records = safe_get_all_records(ws)
        events = []

        for idx, row in enumerate(raw_records):
            event = cls._normalize_row(row, row_idx=idx + 2)
            if event:
                events.append(event)

        set_cached(CACHE_KEY_LOG_MAIN, events)
        return events

    @classmethod
    def _normalize_row(cls, row: Dict[str, Any], row_idx: int) -> Optional[BehaviorEvent]:
        # 1. Date extraction
        raw_date = row.get("행동발생날짜") or row.get("행동발생 날짜") or row.get("날짜") or row.get("일시") or row.get("타임스탬프", "")
        clean_date_str = re.sub(r"[^\d]+", "-", str(raw_date).strip()).strip("-")
        try:
            event_date = pd.to_datetime(clean_date_str).date()
        except Exception:
            event_date = date.today()

        # 2. Student Code & Name
        s_code = str(row.get("학생코드") or row.get("코드번호") or row.get("학번") or row.get("학생명") or f"UNKNOWN_{row_idx}").strip()
        if not s_code:
            s_code = f"ROW_{row_idx}"

        # 3. Time slots
        raw_time = str(row.get("시간대") or row.get("구간") or "").strip()
        slot_codes = parse_time_slots(raw_time)
        slot_labels = [f"{c}구간" for c in slot_codes] if slot_codes else ["시간미상"]

        # 4. Location
        raw_loc = str(row.get("행동 발생 장소") or row.get("발생장소") or row.get("장소") or "").strip()
        norm_loc = normalize_location(raw_loc)

        # 5. Behavior Type
        raw_beh = str(row.get("행동유형(핵심행동으로택1)") or row.get("행동유형") or row.get("행동") or "").strip()
        norm_beh = normalize_behavior_type(raw_beh)

        # 6. Intensity (1~5)
        raw_int = str(row.get("강도(1~5점 척도)") or row.get("강도") or row.get("행동강도") or "1").strip()
        try:
            m = re.search(r"(\d+)", raw_int)
            intensity_val = max(1, min(5, int(m.group(1)))) if m else 1
        except Exception:
            intensity_val = 1

        # 7. Occurrence count
        raw_freq = row.get("발생횟수(한 에피소드 당 1회로 입력 권장)") or row.get("발생횟수") or row.get("빈도")
        occ_count = parse_occurrence_count(raw_freq)

        # 8. Function Estimate
        raw_func = str(row.get("기능(이번 행동을 통해 파악된 기능)") or row.get("기능") or row.get("추정기능") or "").strip()
        fn_code_str, fn_label = normalize_function_code(raw_func)
        fn_enum = FunctionCode(fn_code_str) if fn_code_str in FunctionCode.__members__ else FunctionCode.UNKNOWN
        estimates = [FunctionEstimate(function_code=fn_enum, source="teacher_estimate", raw_label=raw_func)] if raw_func else []

        # 9. Safety Flags
        raw_safety = str(row.get("물리적제지, 3/4호분리지도,본인/타인상해 발생 여부") or row.get("물리적제지") or row.get("특기사항(기타)") or "")
        safety = SafetyFlags(
            self_injury="자해" in raw_safety or "본인상해" in raw_safety,
            injury_to_others="타인상해" in raw_safety or "공격" in raw_safety,
            staff_injury="교사상해" in raw_safety or "지도사상해" in raw_safety,
            physical_restraint="제지" in raw_safety or "물리적제지(O)" in raw_safety or raw_safety.startswith("O"),
            separation_support="분리지도" in raw_safety or "3호" in raw_safety or "4호" in raw_safety,
            emergency_response="긴급" in raw_safety or "위기" in raw_safety
        )

        event_id = str(row.get("Log_ID") or f"LOG_{event_date}_{s_code}_{row_idx}")

        return BehaviorEvent(
            event_id=event_id,
            source_log_id=str(row.get("Log_ID") or ""),
            student_code=s_code,
            event_date=event_date,
            entered_by=str(row.get("입력교사명") or row.get("교사명") or ""),
            time_slot_codes=slot_codes,
            time_slot_labels=slot_labels,
            location_codes=[norm_loc],
            primary_location=norm_loc,
            behavior_code=norm_beh,
            behavior_raw=raw_beh,
            intensity=intensity_val,
            occurrence_count=occ_count,
            antecedent=str(row.get("선행사건") or ""),
            consequence=str(row.get("후속결과") or ""),
            setting_events=[str(row.get("배경사건") or "")] if row.get("배경사건") else [],
            teacher_function_estimates=estimates,
            safety=safety,
            notes=str(row.get("특기사항(기타)") or row.get("비고") or ""),
            source="Log_Main"
        )
