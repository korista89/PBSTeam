"""위기행동관리 회의 메모 열람 범위: 담임은 자기 학생의 팀 결정만, 전체 메모 목록에서는 crisis를 못 본다."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "backend"))
from app.api.endpoints import meeting_notes as M

NOTES = [{"meeting_type": "crisis", "student_code": "S01", "content": "결정: 가"},
         {"meeting_type": "crisis", "student_code": "", "content": "전체 메모"},
         {"meeting_type": "tier3", "student_code": "", "content": "일반"}]


def test_scope(monkeypatch):
    monkeypatch.setattr(M, "fetch_meeting_notes", lambda t, c: [n for n in NOTES if (not t or n["meeting_type"] == t) and (not c or n["student_code"] == c)])
    monkeypatch.setattr(M, "check_student_scope", lambda c, u: None)
    monkeypatch.setattr(M, "user_scope", lambda u: "초등 1학년 1반")
    monkeypatch.setattr(M, "student_in_scope", lambda c, s: True)
    teacher = {"role": "class_teacher", "id": "t"}
    assert [n["content"] for n in M.get_meeting_notes("crisis", "S01", teacher)["notes"]] == ["결정: 가"]
    assert M.get_meeting_notes("crisis", None, teacher)["notes"] == []
    assert len(M.get_meeting_notes("crisis", None, {"role": "admin"})["notes"]) == 2


def test_tier3_read_failure_not_cached_as_empty(monkeypatch):
    """시트 읽기가 실패하면(할당량 초과 등) 빈 표로 캐시하지 않고 올린다 — Tier3 학생이 Tier2로 잘못 보이던 문제."""
    import pytest
    from app.services import tier3_monthly as t3
    monkeypatch.setattr(t3, "get_cached", lambda k, ttl=None: None)
    saved = []
    monkeypatch.setattr(t3, "set_cached", lambda k, v: saved.append(v))
    def boom():
        raise RuntimeError("429 quota")
    monkeypatch.setattr(t3, "open_main_sheet", boom)
    with pytest.raises(RuntimeError):
        t3._rows()
    assert saved == []
