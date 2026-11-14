"""SST 프로그램: 기간·개수 검증, 학년도 순서(3월~2월), Tier현황 맞춤 비교."""
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))


def _p(i, start, end, targets, name="P"):
    return {"id": i, "year": 2026, "name": f"{name}{i}", "type": "", "start": start, "end": end,
            "targets": targets, "skills": "", "staff": "", "memo": "", "deleted": False}


def test_months_follow_school_year_order():
    from app.services import sst
    assert sst.program_months(_p(1, 11, 2, [])) == [11, 12, 1, 2]
    assert sst.runs_in(_p(1, 3, 5, []), 4) and not sst.runs_in(_p(1, 3, 5, []), 9)


def test_validate_period_targets_and_max_six():
    from app.services import sst
    with mock.patch.object(sst.SST, "list_programs", return_value=[_p(i, 3, 4, ["1"]) for i in range(2, 8)]):
        ok = {"name": "의사소통", "start": 3, "end": 5, "targets": ["2211"]}
        assert "6개" in sst.validate(ok, 2026)                     # 이미 6개 → 새로 못 만듦
        assert sst.validate(ok, 2026, editing_id=2) is None          # 고치기는 가능
        assert "앞" in sst.validate({**ok, "start": 5, "end": 3}, 2026, editing_id=2)
        assert sst.validate({**ok, "start": 12, "end": 2}, 2026, editing_id=2) is None  # 12월~2월은 정상
        assert "대상" in sst.validate({**ok, "targets": []}, 2026, editing_id=2)



def test_tier3plus_book_single_student_max_20_and_agency_column():
    from app.services import tier3plus as t3p
    book = t3p.BOOK
    assert book.max == 20 and book.headers[-3] == "연계기관"
    ok = {"name": "의료 협력", "start": 9, "end": 12, "targets": ["3124"], "agency": "OO병원"}
    with mock.patch.object(book, "list_programs", return_value=[]):
        assert book.validate(ok, 2026) is None
        assert "한 명" in book.validate({**ok, "targets": ["3124", "2211"]}, 2026)
    with mock.patch.object(book, "list_programs", return_value=[_p(i, 3, 4, ["1"]) for i in range(2, 22)]):
        assert "20개" in book.validate(ok, 2026)
    row = book._row_values(ok, 2026)
    assert row[book.headers.index("연계기관")] == "OO병원" and row[book.headers.index("대상학생")] == "3124"
    parsed = book._parse_row(5, dict(zip(book.headers, row)))
    assert parsed["agency"] == "OO병원" and parsed["targets"] == ["3124"]
