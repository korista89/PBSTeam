import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services import access_log as al  # noqa: E402


def test_row_signature_detects_edit():
    row = al.make_row("초1-1", "teacher", "VIEW", "3124", "", "1.2.3.4", "/api/v1/bip/students/3124/bip")
    assert al.verify_row(row)
    row[4] = "9999"
    assert not al.verify_row(row)


def test_request_mapping():
    roster = {"3124"}
    assert al.student_in_request("/api/v1/bip/students/3124/bip", {}, roster) == "3124"
    assert al.student_in_request("/api/v1/auth/holidays/2026-03-01", {}, roster) == ""  # 연도는 학생이 아니다
    assert al.student_in_request("/api/v1/x", {"student_code": "3124"}, roster) == "3124"
    assert al.action_for("GET", 200) == "VIEW" and al.action_for("DELETE", 200) == "DELETE"
    assert al.action_for("GET", 403) == "DENIED" and al.action_for("GET", 500) is None


def test_view_dedupe_and_list_get_skipped(monkeypatch):
    monkeypatch.setattr(al, "_roster_codes", lambda: {"3124"})
    al._buffer.clear(); al._seen_view.clear()
    u = {"sub": "초1-1", "role": "teacher"}
    assert al.from_request("/api/v1/bip/students/3124/bip", "GET", 200, {}, u, "")
    assert not al.from_request("/api/v1/bip/students/3124/fba", "GET", 200, {}, u, "")  # 10분 안 같은 학생
    assert not al.from_request("/api/v1/analytics/summary", "GET", 200, {}, u, "")      # 목록·통계 GET
    assert al.from_request("/api/v1/behavior-log", "POST", 200, {}, u, "")               # 쓰기는 항상
    assert [r[3] for r in al._buffer] == ["VIEW", "CREATE"]
    al._buffer.clear()
