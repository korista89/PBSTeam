"""CICO 판정 기준이 백엔드(단일 출처)와 화면 문구에서 어긋나지 않는지 확인."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, os.path.join(ROOT, "backend"))
from app.services.sheets import CICO_DEFAULT_GOAL, CICO_MID_RATE  # noqa: E402

CICO_PAGE = (ROOT / "frontend/src/app/cico-record/page.tsx").read_text(encoding="utf-8")
PROTOCOL = (ROOT / "frontend/src/app/protocol/page.tsx").read_text(encoding="utf-8")


def test_cico_page_threshold_and_help():
    assert f"RATE_THRESHOLDS = {{ mid: {CICO_MID_RATE} }}" in CICO_PAGE
    assert f"CICO수정: 수행률 {CICO_MID_RATE}~목표%" in CICO_PAGE
    assert f"Tier3 상향: 수행률 {CICO_MID_RATE}% 미만" in CICO_PAGE


def test_protocol_text():
    assert f"목표(기본 {CICO_DEFAULT_GOAL}%) 이상을 2개월 연속" in PROTOCOL
    assert f'"수행률 {CICO_MID_RATE}% 이상~목표 미만"' in PROTOCOL
    assert f'"수행률 {CICO_MID_RATE}% 미만 또는 위기행동 강도 5"' in PROTOCOL
