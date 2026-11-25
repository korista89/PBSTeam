"""일시 장애(읽기 한도 초과)를 '탭 없음'으로 보고 같은 이름 탭을 또 만들려다 500이 나던 문제 방지."""
import os
import sys

import gspread
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.adapters.sheets.resilience import SheetUnavailable  # noqa: E402
from app.services import tier3_monthly  # noqa: E402


class FakeSS:
    def __init__(self, exc):
        self.exc, self.created = exc, False

    def worksheet(self, title):
        raise self.exc

    def add_worksheet(self, **kw):
        self.created = True
        raise AssertionError("일시 장애에 탭을 만들면 안 된다")


def test_unavailable_does_not_create(monkeypatch):
    ss = FakeSS(SheetUnavailable("Tier3_월별"))
    monkeypatch.setattr(tier3_monthly, "open_main_sheet", lambda: ss)
    with pytest.raises(SheetUnavailable):
        tier3_monthly._ws()
    assert not ss.created


def test_missing_tab_is_created(monkeypatch):
    ss = FakeSS(gspread.WorksheetNotFound("Tier3_월별"))
    monkeypatch.setattr(tier3_monthly, "open_main_sheet", lambda: ss)
    with pytest.raises(AssertionError):
        tier3_monthly._ws()
    assert ss.created
