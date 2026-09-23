"""_calculate_cico_rate must treat 감소 목표행동 (decrease-target) O/X entries as
attainment, not raw occurrence.

Regression: a 감소 목표행동 student recorded "X" (미발생/did not occur) every day.
The rate was computed as O-count/total (0%) and shown as a failing score, when a
month with zero occurrences of the target behavior is a perfect (100%) result.
"""
import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


class CicoRateCalcTests(unittest.TestCase):
    def _calc(self, overrides=None):
        from app.services.sheets import _calculate_cico_rate
        student = {
            "days": {"9-1": "X", "9-2": "X", "9-3": "X"},
            "척도": "O/X(발생)",
            "목표행동 유형": "감소 목표행동",
            "목표 달성 기준": "10% 이하",
        }
        student.update(overrides or {})
        return _calculate_cico_rate(student)

    def test_decrease_all_x_is_full_attainment(self):
        result = self._calc()
        self.assertEqual(result["rate_str"], "100%")
        self.assertEqual(result["rate_num"], 100.0)
        self.assertEqual(result["achieved"], "O")

    def test_decrease_all_o_is_zero_attainment_and_not_achieved(self):
        result = self._calc({"days": {"9-1": "O", "9-2": "O", "9-3": "O"}})
        self.assertEqual(result["rate_str"], "0%")
        self.assertEqual(result["rate_num"], 0.0)
        self.assertEqual(result["achieved"], "X")

    def test_decrease_mixed_respects_goal_threshold(self):
        # 1/10 days had the target behavior occur -> 90% attainment, meets "10% 이하".
        days = {f"9-{i}": ("O" if i == 1 else "X") for i in range(1, 11)}
        result = self._calc({"days": days})
        self.assertEqual(result["rate_num"], 90.0)
        self.assertEqual(result["achieved"], "O")

    def test_increase_behavior_unaffected(self):
        result = self._calc({
            "days": {"9-1": "O", "9-2": "O", "9-3": "X"},
            "목표행동 유형": "증가 목표행동",
            "목표 달성 기준": "80% 이상",
        })
        self.assertAlmostEqual(result["rate_num"], 66.7, places=1)
        self.assertEqual(result["achieved"], "X")

    def test_decrease_numeric_scale_still_inverted(self):
        # 0~5 intensity scale, lower score = less severe = better for a decrease goal.
        result = self._calc({
            "days": {"9-1": "0", "9-2": "0", "9-3": "1"},
            "척도": "0~5",
            "목표 달성 기준": "20% 이하",
        })
        # raw = (0+0+1)/(3*5) = 6.7% -> attainment = 93.3%
        self.assertAlmostEqual(result["rate_num"], 93.3, places=1)
        self.assertEqual(result["achieved"], "O")


if __name__ == "__main__":
    unittest.main()
