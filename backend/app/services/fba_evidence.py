"""Deterministic evidence preparation for AI-assisted FBA/BIP features.

The operational behavior form does not require separate A-B-C fields for every
record.  Teachers primarily document context in ``특기사항(기타)``.  This module
therefore treats explicit A/C values as optional corroborating evidence and
always analyzes the complete set of available structured fields plus narrative
notes.  It never manufactures missing antecedents or consequences.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any, Dict, Iterable, List


MIN_FBA_RECORDS = 3

SETTING_EVENT_KEYWORDS = (
    "수면", "잠을 못", "피곤", "투약", "약 안먹", "약을 안먹",
    "배고픔", "식사 거부", "통증", "컨디션", "가정사", "일과 변경",
)


def fba_data_gate(record_count: int) -> Dict[str, Any]:
    """Return the single source of truth for the minimum-data contract."""
    eligible = record_count >= MIN_FBA_RECORDS
    notice = ""
    if not eligible:
        notice = (
            "⚠️ 기능 추정을 위해 최소 3건 이상의 위기행동 데이터가 필요합니다. "
            f"현재 {record_count}건입니다. 위기행동 데이터를 추가로 입력한 뒤 다시 시도해 주세요."
        )
    return {
        "eligible": eligible,
        "record_count": record_count,
        "required_count": MIN_FBA_RECORDS,
        "notice": notice,
    }


def _clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _as_list(value: Any) -> List[str]:
    if isinstance(value, (list, tuple, set)):
        return [text for item in value if (text := _clean(item))]
    text = _clean(value)
    return [text] if text else []


def _first(log: dict, *keys: str) -> str:
    for key in keys:
        text = _clean(log.get(key))
        if text:
            return text
    return ""


def _ranked(counter: Counter, top_k: int = 6) -> List[dict]:
    total = sum(counter.values())
    return [
        {
            "item": item,
            "count": count,
            "pct": round(count / total * 100, 1) if total else 0.0,
        }
        for item, count in counter.most_common(top_k)
    ]


def _cross_ranked(cross: Dict[str, Counter], top_k: int = 5) -> List[dict]:
    rows = []
    for context, functions in cross.items():
        for function, count in functions.items():
            rows.append({"context": context, "function": function, "count": count})
    rows.sort(key=lambda row: row["count"], reverse=True)
    return rows[:top_k]


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _clip(text: str, limit: int = 240) -> str:
    text = _clean(text)
    return text if len(text) <= limit else text[: limit - 3] + "..."


def _format_evidence(log: dict, reason: str) -> dict:
    time_labels = _as_list(log.get("time_slot_labels"))
    if not time_labels:
        time_labels = _as_list(log.get("time_slots"))
    if not time_labels:
        time_labels = _as_list(log.get("time_slot") or log.get("시간대"))

    functions = _as_list(log.get("function_labels"))
    if not functions:
        functions = _as_list(
            log.get("raw_function") or log.get("function") or log.get("기능")
        )

    note_text = _first(log, "notes", "특기사항", "raw_notes")
    setting_cues = _as_list(log.get("setting_events"))
    for keyword in SETTING_EVENT_KEYWORDS:
        if keyword in note_text and keyword not in setting_cues:
            setting_cues.append(keyword)

    return {
        "selection_reason": reason,
        "date": _first(log, "date", "발생날짜", "행동발생날짜"),
        "time_slot": ", ".join(time_labels),
        "location": _first(log, "location", "장소", "행동 발생 장소"),
        "behavior_type": _first(log, "behavior_type", "행동유형"),
        "behavior_description": _clip(
            _first(log, "behavior_description", "B_나타난_위기행동")
        ),
        "intensity": _safe_int(log.get("intensity") or log.get("강도")),
        "occurrence_count": _safe_int(
            log.get("occurrence_count") or log.get("발생횟수"), 1
        ),
        "physical_restraint_or_safety_event": _first(
            log, "restraint", "physical_restraint", "물리적제지"
        ) or "X",
        "teacher_inferred_function": functions or ["미상"],
        "narrative_notes": _clip(note_text),
        # Optional corroborating fields. Empty means not separately recorded.
        "explicit_antecedent_if_any": _clip(
            _first(log, "antecedent", "A_배경_선행사건", "선행사건")
        ),
        "explicit_consequence_if_any": _clip(
            _first(log, "consequence", "C_후속결과", "후속결과")
        ),
        "setting_event_cues": setting_cues,
        "staff_injury_cue": bool(log.get("has_staff_injury")),
        "sensory_room_used": bool(log.get("used_sensory_room")),
        "sensory_room_recovery_cue": bool(log.get("sensory_room_success")),
    }


def build_fba_evidence_summary(
    student_info: dict,
    student_logs: Iterable[dict],
    all_notes: Iterable[dict] | None = None,
) -> dict:
    """Aggregate all available crisis-record fields into a compact AI payload."""
    logs = list(student_logs or [])
    student_info = student_info or {}
    all_notes = list(all_notes or [])

    behavior_counts: Counter = Counter()
    location_counts: Counter = Counter()
    time_counts: Counter = Counter()
    function_counts: Counter = Counter()
    setting_event_counts: Counter = Counter()
    behavior_function: Dict[str, Counter] = defaultdict(Counter)
    location_function: Dict[str, Counter] = defaultdict(Counter)
    time_function: Dict[str, Counter] = defaultdict(Counter)

    intensities: List[int] = []
    total_occurrences = 0
    unique_dates = set()
    restraint_count = 0
    staff_injury_count = 0
    sensory_room_count = 0
    sensory_room_recovery_count = 0
    notes_present_count = 0
    explicit_antecedent_count = 0
    explicit_behavior_description_count = 0
    explicit_consequence_count = 0
    explicit_abc_complete_count = 0
    function_unknown_count = 0

    for log in logs:
        behavior = _first(log, "behavior_type", "행동유형") or "기타"
        location = _first(log, "location", "장소", "행동 발생 장소") or "미상"
        time_labels = _as_list(log.get("time_slot_labels"))
        if not time_labels:
            time_labels = _as_list(log.get("time_slot") or log.get("시간대"))
        if not time_labels:
            time_labels = ["미상"]

        functions = _as_list(log.get("function_labels"))
        if not functions:
            raw_function = _first(log, "raw_function", "function", "기능")
            if raw_function:
                functions = [raw_function]
            else:
                function_unknown_count += 1

        behavior_counts[behavior] += 1
        location_counts[location] += 1
        for time_label in time_labels:
            time_counts[time_label] += 1

        for function in functions:
            function_counts[function] += 1
            behavior_function[behavior][function] += 1
            location_function[location][function] += 1
            for time_label in time_labels:
                time_function[time_label][function] += 1

        intensity = _safe_int(log.get("intensity") or log.get("강도"))
        if intensity:
            intensities.append(intensity)
        total_occurrences += _safe_int(
            log.get("occurrence_count") or log.get("발생횟수"), 1
        )

        date_text = _first(log, "date", "발생날짜", "행동발생날짜")
        if date_text:
            unique_dates.add(date_text)

        if str(log.get("restraint") or log.get("physical_restraint") or "").upper().startswith("O") or log.get("is_restrained"):
            restraint_count += 1
        staff_injury_count += int(bool(log.get("has_staff_injury")))
        sensory_room_count += int(bool(log.get("used_sensory_room")))
        sensory_room_recovery_count += int(bool(log.get("sensory_room_success")))
        notes_present_count += int(bool(_first(log, "notes", "특기사항", "raw_notes")))

        antecedent = _first(log, "antecedent", "A_배경_선행사건", "선행사건")
        behavior_description = _first(log, "behavior_description", "B_나타난_위기행동")
        consequence = _first(log, "consequence", "C_후속결과", "후속결과")
        explicit_antecedent_count += int(bool(antecedent))
        explicit_behavior_description_count += int(bool(behavior_description))
        explicit_consequence_count += int(bool(consequence))
        explicit_abc_complete_count += int(bool(antecedent and behavior_description and consequence))

        setting_cues = _as_list(log.get("setting_events"))
        note_text = _first(log, "notes", "특기사항", "raw_notes")
        for keyword in SETTING_EVENT_KEYWORDS:
            if keyword in note_text and keyword not in setting_cues:
                setting_cues.append(keyword)
        for cue in setting_cues:
            setting_event_counts[cue] += 1

    avg_intensity = round(sum(intensities) / len(intensities), 1) if intensities else 0.0
    max_intensity = max(intensities) if intensities else 0
    high_intensity_count = sum(1 for value in intensities if value >= 4)

    # Keep at most five information-rich, non-duplicated events.
    selected: List[dict] = []
    selected_ids = set()

    def add(log: dict, reason: str) -> bool:
        if len(selected) >= 5:
            return False
        key = (
            _first(log, "date", "발생날짜"),
            _first(log, "behavior_type", "행동유형"),
            _first(log, "notes", "특기사항", "raw_notes")[:40],
        )
        if key in selected_ids:
            return False
        selected_ids.add(key)
        selected.append(_format_evidence(log, reason))
        return True

    if logs:
        add(max(logs, key=lambda item: _safe_int(item.get("intensity") or item.get("강도"))), "최고 강도 사건")
        add(logs[-1], "가장 최근 관찰 사건")

    dominant_behavior = behavior_counts.most_common(1)[0][0] if behavior_counts else ""
    dominant_location = location_counts.most_common(1)[0][0] if location_counts else ""
    for log in logs:
        if _first(log, "behavior_type", "행동유형") == dominant_behavior and _first(log, "location", "장소", "행동 발생 장소") == dominant_location:
            if add(log, "최다 빈도 전형적 패턴"):
                break
    for log in logs:
        note_text = _first(log, "notes", "특기사항", "raw_notes")
        if _as_list(log.get("setting_events")) or any(keyword in note_text for keyword in SETTING_EVENT_KEYWORDS):
            if add(log, "배경사건(Setting Event) 기록 사건"):
                break
    for log in logs:
        if _first(log, "behavior_type", "행동유형") != dominant_behavior:
            if add(log, "주요 패턴 외 반례 사건"):
                break
    for log in logs:
        add(log, "추가 참고 관찰 사건")

    gate = fba_data_gate(len(logs))
    return {
        "student_profile": {
            "code": student_info.get("code", "N/A"),
            "name": student_info.get("name", "N/A"),
            "class": student_info.get("class", "N/A"),
            "course_level": student_info.get("course_level", "미상"),
            "tier": student_info.get("tier", 1),
        },
        "deterministic_metrics": {
            "total_episodes_n": len(logs),
            "total_reported_occurrences": total_occurrences,
            "observation_days_count": len(unique_dates),
            "average_intensity_1_to_5": avg_intensity,
            "max_intensity": max_intensity,
            "high_intensity_4_5_count": high_intensity_count,
            "physical_restraint_or_safety_event_count": restraint_count,
            # Legacy key retained for callers/tests.
            "physical_restraint_count": restraint_count,
            "staff_injury_cue_count": staff_injury_count,
            "sensory_room_use_count": sensory_room_count,
            "sensory_room_recovery_cue_count": sensory_room_recovery_count,
            "behavior_type_distribution": _ranked(behavior_counts),
            "location_hotspot_distribution": _ranked(location_counts),
            "time_slot_distribution": _ranked(time_counts),
            "teacher_inferred_function_distribution": _ranked(function_counts),
            "function_unknown_count": function_unknown_count,
            "setting_event_cue_distribution": _ranked(setting_event_counts),
            "function_by_behavior_top": _cross_ranked(behavior_function),
            "function_by_location_top": _cross_ranked(location_function),
            "function_by_time_top": _cross_ranked(time_function),
        },
        "narrative_and_abc_coverage": {
            "operational_source_of_context": "특기사항(기타) 서술식 기록",
            "narrative_notes_present_count": notes_present_count,
            "explicit_antecedent_present_count": explicit_antecedent_count,
            "explicit_behavior_description_present_count": explicit_behavior_description_count,
            "explicit_consequence_present_count": explicit_consequence_count,
            "explicit_abc_complete_count": explicit_abc_complete_count,
            "rule": "특기사항에서 A/B/C 단서를 구분하되, 없는 선행사건·후속결과를 추정 사실로 만들지 않음",
        },
        "representative_evidence_samples": selected[:5],
        "additional_notes_samples": [
            {"date": _clean(note.get("date")), "content": _clip(_clean(note.get("content")))}
            for note in all_notes[:5]
            if _clean(note.get("content"))
        ],
        "data_quality_and_guards": {
            "sample_size_n": len(logs),
            "minimum_required_n": MIN_FBA_RECORDS,
            "is_insufficient_sample": not gate["eligible"],
            "analysis_status": "ANALYSIS_ALLOWED" if gate["eligible"] else "INSUFFICIENT_DATA",
            "recorded_function_notice": "교사 추정 분포이며, 기능분석(FA) 결과나 실제 기능 확률이 아님.",
            "abc_notice": "별도 ABC 기록이 없는 경우 특기사항과 구조화 필드의 반복 패턴으로 잠정 기능가설만 제시함.",
            "interpretation_limit": "관찰 기회수 미통제 빈도 데이터이므로 단순 증감이나 단일 기능 확정을 지양함.",
        },
    }
