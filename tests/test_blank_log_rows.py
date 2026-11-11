"""Log_Main의 빈 행(내용 없이 Log_ID만 남은 행 포함)은 기록으로 세지 않는다."""
from app.services.sheets import is_blank_log_row


def test_blank_rows_are_skipped():
    assert is_blank_log_row("", "", "", "") is True


def test_any_identifying_field_keeps_row():
    assert is_blank_log_row("김O준", "", "", "") is False
    assert is_blank_log_row("", "2513", "", "") is False
    assert is_blank_log_row("", "", "2026-11-10", "") is False
    assert is_blank_log_row("", "", "", "2026. 11. 10 오후 1:29:29") is False
