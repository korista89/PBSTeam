"""약물 변경 전후 교실 행동 비교 리포트 (generate_medication_response_report).

Checks: (1) periods of unequal length are compared on a weekly rate, not raw
totals, and (2) the prompt sent to the LLM explicitly forbids diagnosing or
recommending a medication change - this report is a teacher's classroom
observation letter for the treating physician, not a diagnosis/prescription.
"""
import os
import sys
import unittest
from unittest import mock

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _period_data(total_incidents, avg_intensity=2.0):
    return {
        "profile": {"total_incidents": total_incidents, "avg_intensity": avg_intensity},
        "weekday_dist": [{"name": "월", "value": total_incidents}],
        "behavior_types": [{"name": "공격행동", "value": total_incidents}],
    }


class MedicationReportTests(unittest.TestCase):
    def test_weekly_rate_normalizes_unequal_period_lengths(self):
        from app.services.ai_insight import _summarize_medication_period

        # 14-day period with 14 incidents -> 1/day -> 7/week.
        before = _summarize_medication_period("변경 전", "2026-03-01", "2026-03-14", _period_data(14))
        # 28-day period with 14 incidents -> 0.5/day -> 3.5/week.
        after = _summarize_medication_period("변경 후", "2026-04-01", "2026-04-28", _period_data(14))

        self.assertEqual(before["total_incidents"], after["total_incidents"])
        self.assertGreater(before["avg_weekly_incidents"], after["avg_weekly_incidents"])
        self.assertEqual(before["avg_weekly_incidents"], 7.0)
        self.assertEqual(after["avg_weekly_incidents"], 3.5)

    def test_prompt_forbids_diagnosis_and_medication_change_suggestions(self):
        from app.services.ai_insight import generate_medication_response_report

        captured = {}

        def fake_call_llm(system_prompt, user_prompt, max_tokens=2000):
            captured["system"] = system_prompt
            captured["user"] = user_prompt
            return "담임교사 관찰 의견서 (테스트)"

        with mock.patch("app.services.ai_insight._call_llm", side_effect=fake_call_llm):
            result = generate_medication_response_report(
                student_info={"code": "2211", "class": "초1-1"},
                before_medications=[],
                after_medications=[{"name": "메틸페니데이트", "dose": "10mg"}],
                before_period={"start": "2026-03-01", "end": "2026-03-31"},
                after_period={"start": "2026-04-01", "end": "2026-04-30"},
                before_data=_period_data(10),
                after_data=_period_data(3),
            )

        self.assertEqual(result, "담임교사 관찰 의견서 (테스트)")
        self.assertIn("진단명을 추정하거나 단정하지 마라", captured["user"])
        self.assertIn("증량·감량·교체·중단을 제안하지 마라", captured["user"])
        self.assertIn("진단서나 처방전이 아니며", captured["user"])
        self.assertIn("의학적 진단명 추정, 약물 조정 제안", captured["system"])
        self.assertIn("변경 전 복용: 미복용", captured["user"])
        self.assertIn("변경 후 복용: 메틸페니데이트 10mg", captured["user"])

    def test_multiple_medications_per_period_are_listed(self):
        from app.services.ai_insight import generate_medication_response_report

        captured = {}

        def fake_call_llm(system_prompt, user_prompt, max_tokens=2000):
            captured["user"] = user_prompt
            return "테스트"

        with mock.patch("app.services.ai_insight._call_llm", side_effect=fake_call_llm):
            generate_medication_response_report(
                student_info={"code": "2211", "class": "초1-1"},
                before_medications=[{"name": "리스페리돈", "dose": "0.5mg"}],
                after_medications=[
                    {"name": "리스페리돈", "dose": "0.5mg"},
                    {"name": "아리피프라졸", "dose": "2mg"},
                ],
                before_period={"start": "2026-03-01", "end": "2026-03-31"},
                after_period={"start": "2026-04-01", "end": "2026-04-30"},
                before_data=_period_data(10),
                after_data=_period_data(3),
            )

        self.assertIn("변경 전 복용: 리스페리돈 0.5mg", captured["user"])
        self.assertIn("변경 후 복용: 리스페리돈 0.5mg, 아리피프라졸 2mg", captured["user"])


if __name__ == "__main__":
    unittest.main()
