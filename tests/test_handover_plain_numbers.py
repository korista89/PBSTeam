# 인수인계 자료: 통계 표기를 새 담임이 읽기 쉬운 말로 바꾸는지 확인
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.ai_insight import plain_numbers  # noqa: E402


def test_plain_numbers():
    assert plain_numbers("신체적 공격행동(42.1%, n=24/57)을 보임.") == "신체적 공격행동(57번 중 24번)을 보임."
    assert plain_numbers("교사 추정 기준 56.9%(n=29/51)로 가장 많음.") == "교사 추정 기준 51번 중 29번으로 가장 많음."
    assert plain_numbers("교실에서 40건(70%)으로") == "교실에서 40건으로"
    assert plain_numbers("약 30%임") == "약 10번 중 3번꼴임"
    assert plain_numbers("총 24건(절반 가까이)") == "총 24건(절반 가까이)"
    assert plain_numbers("2교시(14.7%, n=11/75)로 많음") == "2교시(75번 중 11번)로 많음"


def test_handover_strips_slot_numbers(monkeypatch):
    from app.services import ai_insight
    seen = {}
    monkeypatch.setattr(ai_insight, "_call_llm", lambda sys_p, prompt, n: seen.setdefault("p", prompt) and "1. 한눈에 보는 학생\n- a")
    ai_insight.generate_document_draft("handover", {"code": "S01"}, {"time": [{"item": "3구간: 2교시", "count": 11}]}, "", 50)
    assert "3구간" not in seen["p"] and "2교시" in seen["p"]


def test_handover_sections_match_frontend_order():
    """AI 절 순서와 ⑧ 탭 칸 순서(Docs.tsx)가 어긋나면 칸이 엉뚱하게 채워진다."""
    from pathlib import Path
    from app.services.ai_insight import DOCUMENT_SPECS
    secs = DOCUMENT_SPECS["handover"][1]
    assert len(secs) == 19 and secs[14] == "행동 단계별 대응"
    src = (Path(__file__).resolve().parents[1] / "frontend/src/app/target-behavior/Docs.tsx").read_text(encoding="utf-8")
    body = src[src.index("export const HANDOVER_P1"):src.index("const STAGE_TITLE")]
    pos = [body.find(f'["{t}"') for t in secs if t != "행동 단계별 대응"]
    assert -1 not in pos and pos == sorted(pos)


def test_handover_long_draft_is_shrunk_once(monkeypatch):
    """2쪽을 넘길 분량이면 한 번 더 줄인 결과를 쓰고, 꼬리말·통계 표기도 정리한다."""
    from app.services import ai_insight
    long = "1. 한눈에 보는 학생\n- " + "가" * 1200 + "\n15. 행동 단계별 대응\n- 전조 | 확인 필요 | 쉬기\n\n---\n> ☁️ AI 모델: x"
    short = "1. 한눈에 보는 학생\n- 짧음(42.1%, n=24/57)\n15. 행동 단계별 대응\n- 전조 | 확인 필요 | 쉬기"
    calls = []
    monkeypatch.setattr(ai_insight, "_call_llm", lambda s, p, n: (calls.append(p), long if len(calls) == 1 else short)[1])
    out = ai_insight.generate_document_draft("handover", {"code": "S01"}, {}, "", 50)
    assert len(calls) == 2 and "1,200" not in calls[1] and out.startswith("1. 한눈에 보는 학생\n- 짧음(57번 중 24번)")
    assert ai_insight.handover_lengths(long.split("\n\n---")[0]) == (1202, len("- 전조 | 확인 필요 | 쉬기"))


def test_student_year_months_in_school_order(monkeypatch):
    """3월부터 이번 달까지 학년도 순서로, 그 달 단계(CICO·SST·Tier3)를 돌려준다."""
    from app.services import tier_monthly as tm
    monkeypatch.setattr(tm, "current_month", lambda: 5)
    states = {3: {"cico": {"S01"}, "sst": {}, "t3": {}, "ready": {"cico": True, "sst": False, "t3": True}},
              4: {"cico": set(), "sst": {"S01": ["사회성"]}, "t3": {"S01": "Tier3"}, "ready": {"cico": True, "sst": True, "t3": True}},
              5: {"cico": set(), "sst": {}, "t3": {"S01": "Tier3+"}, "ready": {"cico": True, "sst": True, "t3": True}}}
    monkeypatch.setattr(tm, "month_state", lambda m: states[m])
    out = tm.student_year("S01")
    assert [m["month"] for m in out] == [3, 4, 5]
    assert out[0]["cico"] and out[1]["sst"] == ["사회성"] and out[2]["t3"] == "Tier3+"
