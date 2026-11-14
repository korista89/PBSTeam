"""월별 Tier 정합성 점검(읽기 전용, 시트에 쓰지 않음).

실행: cd backend && PYTHONPATH=. .venv/bin/python ../scripts/audit_tier_monthly.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.services.tier_audit import run_audit  # noqa: E402

problems = run_audit(verbose=True)
print("\n=== 문제", len(problems), "건 ===")
for p in problems:
    print(p)
