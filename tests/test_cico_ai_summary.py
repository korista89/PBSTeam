"""_build_cico_summary_payload() (used by the CICO "AI 분석 받기" button) must
read the daily records the caller actually sends and count success in the
right direction for 감소 목표행동.

Regression: it looked up s["daily"], but get_cico_report_data() - and the
frontend's single-student request - both use the key "daily_data". Every
student therefore showed up as "0 recorded days" no matter how much CICO
data existed, so the AI analysis was useless (it fell back to generic
"CICO 기록이 없다" boilerplate instead of interpreting the student's actual
month). It also always counted "O" as success, which is backwards for a
감소 목표행동 where X (미발생) is the good outcome.
"""
import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _daily(values):
    return [{"date": f"09-{i+1:02d}", "value": v, "is_prev": False} for i, v in enumerate(values)]


class CicoAiSummaryTests(unittest.TestCase):
    def _summarize(self, student):
        from app.services.ai_insight import _build_cico_summary_payload
        return _build_cico_summary_payload([student])["students"][0]

    def test_reads_daily_data_key_not_daily(self):
        student = {
            "code": "2211",
            "class": "초1-1",
            "target_behavior": "수업참여",
            "behavior_type": "증가 목표행동",
            "goal_criteria": "80% 이상",
            "daily_data": _daily(["O"] * 15),
            "trend": [],
        }
        summary = self._summarize(student)
        self.assertEqual(summary["metrics"]["recorded_days"], 15)
        self.assertEqual(summary["metrics"]["overall_rate_pct"], 100.0)
        self.assertIn("양호", summary["decision"]["rule_result"])

    def test_decrease_behavior_counts_x_as_success(self):
        student = {
            "code": "2212",
            "class": "초1-1",
            "target_behavior": "공격행동",
            "behavior_type": "감소 목표행동",
            "goal_criteria": "10% 이하",
            "daily_data": _daily(["X"] * 15),
            "trend": [],
        }
        summary = self._summarize(student)
        self.assertEqual(summary["metrics"]["overall_rate_pct"], 100.0)
        self.assertIn("양호", summary["decision"]["rule_result"])


if __name__ == "__main__":
    unittest.main()
