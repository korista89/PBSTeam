# backend/app/adapters/sheets/cico.py

from datetime import date
from typing import List, Dict, Any, Optional
import re
import pandas as pd
from app.core.config import settings
from app.domain.models import CicoObservation
from app.adapters.sheets.client import get_sheets_client, safe_get_all_values, get_cached, set_cached

class CicoMonthAdapter:
    @staticmethod
    def get_worksheet(month: int):
        client = get_sheets_client()
        if not client or not settings.SHEET_URL:
            return None
        try:
            sheet = client.open_by_url(settings.SHEET_URL)
            month_name = f"{month}월"
            return sheet.worksheet(month_name)
        except Exception as e:
            print(f"Error opening CICO worksheet for month {month}: {e}")
            return None

    @classmethod
    def fetch_observations(cls, month: int, force_refresh: bool = False) -> List[CicoObservation]:
        cache_key = f"sheet:cico:{month}"
        if not force_refresh:
            cached = get_cached(cache_key)
            if cached is not None:
                return cached

        ws = cls.get_worksheet(month)
        if not ws:
            return []

        all_values = safe_get_all_values(ws)
        if not all_values or len(all_values) < 2:
            return []

        headers = all_values[0]
        observations = []

        # Find column indices based on header names (flexible mapping)
        col_indices = {}
        for idx, h in enumerate(headers):
            h_clean = str(h).strip()
            if "학생코드" in h_clean or "(코드)" in h_clean:
                col_indices["code"] = idx
            elif "학생명" in h_clean or "이름" in h_clean:
                col_indices["name"] = idx
            elif "목표행동" in h_clean and "유형" not in h_clean:
                col_indices["target"] = idx
            elif "목표행동 유형" in h_clean or "목표행동유형" in h_clean:
                col_indices["target_type"] = idx
            elif "척도" in h_clean:
                col_indices["scale"] = idx
            elif "입력 기준" in h_clean or "입력기준" in h_clean:
                col_indices["baseline"] = idx
            elif "목표 달성 기준" in h_clean or "달성기준" in h_clean:
                col_indices["goal_rule"] = idx
            elif "수행/발생률" in h_clean or "수행률" in h_clean or "성취율" in h_clean:
                col_indices["rate"] = idx
            elif "목표 달성 여부" in h_clean or "달성여부" in h_clean:
                col_indices["achieved"] = idx

        # Detect daily date columns
        date_columns = []
        for idx, h in enumerate(headers):
            h_str = str(h).strip()
            # Match 03-03, 04-01, 1일, 1회차, etc.
            if re.match(r"^\d{2}-\d{2}$", h_str) or re.match(r"^\d{1,2}일?$", h_str) or "회차" in h_str:
                date_columns.append((idx, h_str))

        for row_idx, row in enumerate(all_values[1:], start=2):
            if not row or len(row) <= 2:
                continue

            # Extract student code
            raw_code = str(row[col_indices["code"]]).strip() if "code" in col_indices and col_indices["code"] < len(row) else ""
            raw_name = str(row[col_indices["name"]]).strip() if "name" in col_indices and col_indices["name"] < len(row) else ""
            
            # Handle format "Name(Code)" e.g. "김철수(2211)"
            if not raw_code and raw_name and "(" in raw_name and ")" in raw_name:
                match = re.search(r"\((.*?)\)", raw_name)
                if match:
                    raw_code = match.group(1).strip()
                    raw_name = raw_name[:raw_name.index("(")].strip()

            s_code = raw_code or raw_name
            if not s_code:
                continue

            target_beh = str(row[col_indices["target"]]).strip() if "target" in col_indices and col_indices["target"] < len(row) else "목표행동"
            target_type = str(row[col_indices["target_type"]]).strip() if "target_type" in col_indices and col_indices["target_type"] < len(row) else "증가"
            scale_val = str(row[col_indices["scale"]]).strip() if "scale" in col_indices and col_indices["scale"] < len(row) else "O/X"
            baseline_val = str(row[col_indices["baseline"]]).strip() if "baseline" in col_indices and col_indices["baseline"] < len(row) else ""
            goal_rule_val = str(row[col_indices["goal_rule"]]).strip() if "goal_rule" in col_indices and col_indices["goal_rule"] < len(row) else "80% 이상"

            # Create an observation per daily entry
            for col_i, date_label in date_columns:
                val = str(row[col_i]).strip() if col_i < len(row) else ""
                if not val or val in ["-", "·"]:
                    continue

                numeric_val = None
                goal_met = None

                if val in ["O", "o", "V", "v"]:
                    numeric_val = 1.0
                    goal_met = True
                elif val in ["X", "x"]:
                    numeric_val = 0.0
                    goal_met = False
                else:
                    try:
                        numeric_val = float(re.sub(r"[^\d.]+", "", val))
                    except Exception:
                        pass

                obs_id = f"CICO_{month}_{s_code}_{date_label}"
                observations.append(CicoObservation(
                    observation_id=obs_id,
                    student_code=s_code,
                    month=month,
                    session_label=date_label,
                    target_behavior=target_beh,
                    target_type=target_type,
                    scale=scale_val,
                    baseline_rule=baseline_val,
                    goal_rule=goal_rule_val,
                    raw_value=val,
                    numeric_value=numeric_val,
                    goal_met=goal_met,
                    source_sheet=f"{month}월",
                    source_row=row_idx,
                    source_column=col_i + 1
                ))

        set_cached(cache_key, observations)
        return observations
