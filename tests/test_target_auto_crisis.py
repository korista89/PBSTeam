"""위기행동 기록 연동형 표적행동: 차트 자료가 위기행동 로그의 날짜별 건수로 채워진다."""
from app.api.endpoints import target_behavior as tb


def _run(measurement, monkeypatch):
    monkeypatch.setattr(tb, "check_student_scope", lambda *a, **k: None)
    monkeypatch.setattr(tb, "get_target_behavior_data", lambda b: [{"Date": "2026-03-02", "Value": "9"}])
    monkeypatch.setattr(tb, "get_target_behavior_fidelity", lambda b: [])
    monkeypatch.setattr(tb, "get_target_behaviors", lambda c: [{"BehaviorID": "b1", "MeasurementType": measurement}])
    monkeypatch.setattr(tb, "fetch_all_records", lambda force_refresh=False: [
        {"학생코드": "S01", "행동발생날짜": "2026-04-01"}, {"학생코드": "S01", "행동발생날짜": "2026-04-01"},
        {"학생코드": "S01", "행동발생날짜": "2026-04-03"}, {"학생코드": "S02", "행동발생날짜": "2026-04-01"},
    ])
    return tb.get_chart_data("b1", "S01", {})


def test_auto_mode_uses_crisis_logs(monkeypatch):
    r = _run(tb.AUTO_CRISIS_MEASUREMENT, monkeypatch)
    assert r["auto_from_crisis"] is True
    assert [(d["Date"], d["Value"]) for d in r["data_points"]] == [("2026-04-01", 2), ("2026-04-03", 1)]


def test_manual_mode_unchanged(monkeypatch):
    r = _run("빈도", monkeypatch)
    assert r["auto_from_crisis"] is False
    assert r["data_points"][0]["Value"] == "9"
