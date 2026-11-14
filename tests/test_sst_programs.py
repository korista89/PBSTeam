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
    with mock.patch.object(sst, "list_programs", return_value=[_p(i, 3, 4, ["1"]) for i in range(2, 8)]):
        ok = {"name": "의사소통", "start": 3, "end": 5, "targets": ["2211"]}
        assert "6개" in sst.validate(ok, 2026)                     # 이미 6개 → 새로 못 만듦
        assert sst.validate(ok, 2026, editing_id=2) is None          # 고치기는 가능
        assert "앞" in sst.validate({**ok, "start": 5, "end": 3}, 2026, editing_id=2)
        assert sst.validate({**ok, "start": 12, "end": 2}, 2026, editing_id=2) is None  # 12월~2월은 정상
        assert "대상" in sst.validate({**ok, "targets": []}, 2026, editing_id=2)

