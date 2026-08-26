import os
import sys
import asyncio
from unittest import mock


sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.fba_evidence import (  # noqa: E402
    MIN_FBA_RECORDS,
    build_fba_evidence_summary,
    fba_data_gate,
)
from app.services.ai_insight import generate_full_bip  # noqa: E402
from app.api.endpoints.bip import BIPData  # noqa: E402
from app.api.endpoints import bip as bip_endpoint  # noqa: E402


def _logs(count=3):
    return [
        {
            "date": f"2026-08-0{i + 1}",
            "time_slot_labels": ["2구간: 1교시"],
            "location": "교실",
            "behavior_type": "비협조적행동",
            "intensity": 3 + (i % 2),
            "occurrence_count": 1,
            "function_labels": ["과제회피"],
            "function_confidence": "coded",
            "notes": "쓰기 과제가 시작된 뒤 자리에서 일어나 교실 뒤로 이동했고 과제가 잠시 중단됨.",
            "restraint": "X",
            "setting_events": [],
            "has_staff_injury": False,
            "used_sensory_room": False,
            "sensory_room_success": False,
        }
        for i in range(count)
    ]


def test_three_record_gate_is_unambiguous():
    assert MIN_FBA_RECORDS == 3
    assert fba_data_gate(2)["eligible"] is False
    assert fba_data_gate(3)["eligible"] is True


def test_narrative_notes_are_primary_and_missing_abc_is_not_fabricated():
    summary = build_fba_evidence_summary({"code": "21101"}, _logs())
    coverage = summary["narrative_and_abc_coverage"]
    assert coverage["operational_source_of_context"] == "특기사항(기타) 서술식 기록"
    assert coverage["narrative_notes_present_count"] == 3
    assert coverage["explicit_antecedent_present_count"] == 0
    assert coverage["explicit_consequence_present_count"] == 0
    assert coverage["explicit_abc_complete_count"] == 0
    assert "없는 선행사건·후속결과" in coverage["rule"]


def test_bip_prompt_has_all_11_sections_and_crisis_subfields_in_both_modes():
    required = [
        "### 1. 표적행동",
        "### 2. 가설(기능)",
        "### 3. 목표",
        "### 4. 예방 전략",
        "### 5. 교수 전략",
        "### 6. 강화 전략",
        "### 7. 위기행동지원 전략",
        "### 8. 평가 계획(Tier3 졸업 기준 포함)",
        "### 9. 약물 복용 현황",
        "### 10. 강화제 정보",
        "### 11. 기타 고려사항",
        "#### 📚 EBP 추가",
        "#### 🚨 위기행동지원절차",
        "**전조:**",
        "**고조:**",
        "**알림:**",
        "**장소/이동방법:**",
        "**관찰 방법:**",
        "**호명반응 확인 방법:**",
        "**지시 목록:**",
        "**회복대화 방법:**",
        "**복귀의사 방법:**",
        "**복귀 후 반응:**",
    ]

    captured_prompts = []

    def capture(_system, user, _max_tokens):
        captured_prompts.append(user)
        return user

    with mock.patch("app.services.ai_insight._call_llm", side_effect=capture):
        compact = generate_full_bip(
            {"code": "21101"}, "자리이탈", "과제회피 잠정", "", behavior_logs=_logs(), mode="compact"
        )
        detailed = generate_full_bip(
            {"code": "21101"}, "자리이탈", "과제회피 잠정", "", behavior_logs=_logs(), mode="detailed"
        )

    for marker in required:
        assert marker in compact
        assert marker in detailed
    assert "짧은 AI 초안" in captured_prompts[0]
    assert "쉽고 상세한 제안" in captured_prompts[1]


def test_bip_generation_is_blocked_below_three_records_without_llm_call():
    with mock.patch("app.services.ai_insight._call_llm") as mocked:
        result = generate_full_bip(
            {"code": "21101"}, "자리이탈", "과제회피 잠정", "", behavior_logs=_logs(2), mode="detailed"
        )
    assert "최소 3건 이상" in result
    assert "현재 2건" in result
    mocked.assert_not_called()


def test_truncated_bip_response_is_completed_without_inventing_user_fields():
    truncated = """### 1. 표적행동
- 자리이탈

### 2. 가설(기능)
- 과제회피 잠정

### 7. 위기행동지원 전략
#### 🚨 위기행동지원절차
- **전조:** 몸을 뒤로 젖힘
- **고조:** 안전거리 확보
"""
    with mock.patch("app.services.ai_insight._call_llm", return_value=truncated):
        result = generate_full_bip(
            {"code": "21101"},
            "자리이탈",
            "과제회피 잠정",
            "",
            behavior_logs=_logs(),
            mode="detailed",
            medication_status="복용 정보 미확인",
            reinforcer_info="블록 놀이",
        )

    positions = [result.index(f"### {i}.") for i in range(1, 12)]
    assert positions == sorted(positions)
    for label in [
        "전조", "고조", "알림", "장소/이동방법", "관찰 방법",
        "호명반응 확인 방법", "지시 목록", "회복대화 방법",
        "복귀의사 방법", "복귀 후 반응",
    ]:
        assert f"**{label}:**" in result
    assert "복용 정보 미확인" in result
    assert "블록 놀이" in result


def test_bip_save_schema_preserves_all_frontend_fields():
    payload = {
        "StudentCode": "21101",
        "TargetBehavior": "1",
        "Hypothesis": "2",
        "Goals": "3",
        "PreventionStrategies": "4",
        "TeachingStrategies": "5",
        "ReinforcementStrategies": "6",
        "CrisisPlan": "7",
        "EvaluationPlan": "8",
        "MedicationStatus": "9",
        "ReinforcerInfo": "10",
        "OtherConsiderations": "11",
        "UpdatedAt": "2026-08-26",
        "Author": "Teacher",
    }
    saved = BIPData(**payload).model_dump()
    for key, value in payload.items():
        assert saved[key] == value


def test_ai_bip_api_boundary_returns_gate_metadata_and_forwards_mode():
    raw_logs = [
        {
            "학생코드": "21101",
            "행동발생날짜": f"2026-08-0{i + 1}",
            "시간대": "2구간: 1교시",
            "행동 발생 장소": "교실",
            "행동유형": "자리이탈",
            "강도(1~5)": "3",
            "추정기능": "과제회피",
            "특기사항(기타)": "쓰기활동 시작 뒤 자리에서 일어나 교실 뒤로 이동함.",
        }
        for i in range(3)
    ]
    status = [{"학생코드": "21101", "학생명": "테스트", "학급": "초1-1", "Tier": 3}]

    with mock.patch.object(bip_endpoint, "check_student_scope"), \
         mock.patch.object(bip_endpoint, "_resolve_beable_code", return_value="21101"), \
         mock.patch("app.services.sheets.fetch_all_records", return_value=raw_logs), \
         mock.patch("app.services.sheets.fetch_student_status", return_value=status), \
         mock.patch.object(bip_endpoint, "generate_full_bip", return_value="### 1. 표적행동\n초안") as generator:
        response = asyncio.run(
            bip_endpoint.ai_bip_full(
                "21101",
                bip_endpoint.AIBIPFullRequest(mode="compact"),
                current_user={"role": "admin", "id": "admin"},
            )
        )

    assert response["eligible"] is True
    assert response["record_count"] == 3
    assert response["mode"] == "compact"
    assert generator.call_args.kwargs["mode"] == "compact"

    with mock.patch.object(bip_endpoint, "check_student_scope"), \
         mock.patch.object(bip_endpoint, "_resolve_beable_code", return_value="21101"), \
         mock.patch("app.services.sheets.fetch_all_records", return_value=raw_logs[:2]), \
         mock.patch("app.services.sheets.fetch_student_status", return_value=status), \
         mock.patch.object(bip_endpoint, "generate_full_bip") as blocked_generator:
        blocked = asyncio.run(
            bip_endpoint.ai_bip_full(
                "21101",
                bip_endpoint.AIBIPFullRequest(mode="detailed"),
                current_user={"role": "admin", "id": "admin"},
            )
        )

    assert blocked["eligible"] is False
    assert blocked["record_count"] == 2
    assert "최소 3건 이상" in blocked["analysis"]
    blocked_generator.assert_not_called()
