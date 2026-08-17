# backend/app/adapters/sheets/log_main.py

from datetime import date, datetime
from typing import List, Dict, Any, Optional
import re
import pandas as pd
from app.core.config import settings
from app.domain.models import BehaviorEvent, SafetyFlags, FunctionEstimate, FunctionCode
from app.adapters.sheets.client import get_sheets_client, safe_get_all_records, get_cached, set_cached
from app.services.normalize import (
    parse_time_slots,
    normalize_location,
    normalize_behavior_type,
    normalize_function,
    parse_occurrence
)

CACHE_KEY_LOG_MAIN = "sheet:log-main"

LEGACY_TO_CANONICAL_FUNCTION = {
    "ESCAPE_DEMAND": FunctionCode.ESCAPE_DEMAND,
    "ESCAPE_AVERSIVE": FunctionCode.DISCOMFORT_RELIEF,
    "TANGIBLE": FunctionCode.TANGIBLE_ACTIVITY,
    "ATTENTION": FunctionCode.ATTENTION,
    "SENSORY": FunctionCode.AUTOMATIC_SENSORY,
}

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
        # 1. Date extraction - do NOT forge date.today() on parse failure
        raw_date = (
            row.get("발생날짜")
            or row.get("행동발생날짜")
            or row.get("행동발생 날짜")
            or row.get("날짜")
            or row.get("일시")
            or row.get("타임스탬프")
            or row.get("Timestamp")
            or ""
        )
        clean_date_str = re.sub(r"[^\d]+", "-", str(raw_date).strip()).strip("-")
        if not clean_date_str:
            return None

        try:
            event_date = pd.to_datetime(clean_date_str).date()
        except Exception:
            return None

        # 2. Student Code & Name
        s_code = str(
            row.get("학생코드")
            or row.get("코드번호")
            or row.get("학번")
            or row.get("학생명")
            or row.get("이름")
            or row.get("학생")
            or f"UNKNOWN_{row_idx}"
        ).strip()
        if not s_code:
            s_code = f"ROW_{row_idx}"

        # 3. Time slots
        raw_time = str(row.get("시간대") or row.get("시간대(복수)") or row.get("구간") or "").strip()
        slot_codes = parse_time_slots(raw_time)
        slot_labels = [f"{c}구간" for c in slot_codes] if slot_codes else ["시간미상"]

        # 4. Location (normalize_location returns dict: {"code": str, "codes": list[str], "original": str})
        raw_loc = str(row.get("행동 발생 장소") or row.get("발생장소") or row.get("장소") or "").strip()
        loc_res = normalize_location(raw_loc)
        location_codes = loc_res.get("codes", ["기타"])
        primary_loc = loc_res.get("code", "기타")

        # 5. Behavior Type
        raw_beh = str(
            row.get("B_나타난_위기행동")
            or row.get("행동유형(핵심행동으로택1)")
            or row.get("행동유형")
            or row.get("(주요)행동유형")
            or row.get("주요행동유형")
            or row.get("행동")
            or ""
        ).strip()
        norm_beh = normalize_behavior_type(raw_beh)

        # 6. Intensity (1~5)
        raw_int = str(
            row.get("강도(1~5점 척도)")
            or row.get("강도(1~5)")
            or row.get("강도")
            or row.get("행동강도")
            or "1"
        ).strip()
        try:
            m = re.search(r"(\d+)", raw_int)
            intensity_val = max(1, min(5, int(m.group(1)))) if m else 1
        except Exception:
            intensity_val = 1

        # 7. Occurrence count (parse_occurrence returns dict: {"count": Optional[int], "note": str})
        raw_freq = (
            row.get("발생횟수(한 에피소드 당 1회로 입력 권장)")
            or row.get("발생횟수")
            or row.get("빈도")
            or row.get("발생빈도")
        )
        occ_res = parse_occurrence(raw_freq)
        occ_count = occ_res.get("count")

        # 8. Function Estimate (normalize_function returns dict: {"codes": list[str], "labels": list[str], ...})
        raw_func = str(
            row.get("추정기능(이번 행동을 통해 파악된 기능)")
            or row.get("기능(이번 행동을 통해 파악된 기능)")
            or row.get("추정기능")
            or row.get("기능")
            or ""
        ).strip()
        
        estimates: List[FunctionEstimate] = []
        if raw_func:
            func_res = normalize_function(raw_func)
            matched_legacy_codes = func_res.get("codes", [])
            
            if len(matched_legacy_codes) == 1:
                canon_fn = LEGACY_TO_CANONICAL_FUNCTION.get(matched_legacy_codes[0], FunctionCode.UNKNOWN)
                estimates.append(FunctionEstimate(function_code=canon_fn, source="teacher_estimate", raw_label=raw_func))
            elif len(matched_legacy_codes) > 1:
                for lc in matched_legacy_codes:
                    canon_fn = LEGACY_TO_CANONICAL_FUNCTION.get(lc, FunctionCode.UNKNOWN)
                    estimates.append(FunctionEstimate(function_code=canon_fn, source="teacher_estimate", raw_label=raw_func))
            else:
                estimates.append(FunctionEstimate(function_code=FunctionCode.UNKNOWN, source="teacher_estimate", raw_label=raw_func))

        # 9. Safety Flags (Based on explicit safety fields and crisis records)
        raw_safety = str(
            row.get("물리적제지, 3/4호분리지도,본인/타인상해 발생 여부")
            or row.get("물리적제지")
            or row.get("위기행동여부")
            or ""
        ).strip()
        injury_treatment = str(row.get("부상자_치료_내용") or "").strip()
        admin_report = str(row.get("관리자_보고_시간") or "").strip()

        safety = SafetyFlags(
            self_injury="자해" in raw_safety or "본인상해" in raw_safety,
            injury_to_others="타인상해" in raw_safety,
            staff_injury="교사상해" in raw_safety or "지도사상해" in raw_safety or bool(injury_treatment),
            physical_restraint="제지" in raw_safety or raw_safety.startswith("O") or "물리적제지(O)" in raw_safety,
            separation_support="분리지도" in raw_safety or "3호" in raw_safety or "4호" in raw_safety,
            emergency_response="긴급" in raw_safety or "위기" in raw_safety or bool(admin_report)
        )

        event_id = str(row.get("Log_ID") or f"LOG_{event_date}_{s_code}_{row_idx}")
        antecedent = str(row.get("A_배경_선행사건") or row.get("선행사건") or row.get("선행") or "")
        consequence = str(row.get("C_후속결과") or row.get("후속결과") or row.get("후속") or "")
        setting_ev_raw = row.get("배경사건") or row.get("배경") or ""
        setting_events = [str(setting_ev_raw)] if setting_ev_raw else []

        notes = str(
            row.get("특기사항(기타)")
            or row.get("특기사항")
            or row.get("비고")
            or row.get("1차_경위")
            or row.get("2차_경위")
            or ""
        )

        return BehaviorEvent(
            event_id=event_id,
            source_log_id=str(row.get("Log_ID") or ""),
            student_code=s_code,
            event_date=event_date,
            entered_by=str(row.get("입력교사명") or row.get("교사명") or row.get("발생 시 지도교사") or ""),
            time_slot_codes=slot_codes,
            time_slot_labels=slot_labels,
            location_codes=location_codes,
            primary_location=primary_loc,
            behavior_code=norm_beh,
            behavior_raw=raw_beh or norm_beh,
            intensity=intensity_val,
            occurrence_count=occ_count,
            antecedent=antecedent or None,
            consequence=consequence or None,
            setting_events=setting_events,
            teacher_function_estimates=estimates,
            safety=safety,
            notes=notes or None,
            source="Log_Main"
        )

