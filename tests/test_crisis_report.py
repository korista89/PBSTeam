"""위기행동 보고서: 기록 → 양식 항목, 한글 파일(체크박스·값·mimetype) 생성."""
import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.services.crisis_report import report_fields, build_hwpx, split_support_type
from app.services import hwpx_lib as H

REC = {"Log_ID": "abc", "학생명": "김O준", "학생코드": "1011", "행동발생날짜": "2026-10-20", "시간대": "2구간: 1교시", "장소": "교실",
       "제지유형_원문": "방어 및 보호를 위한 제지",
       "crisis_details": {"발생 시 지도교사": "홍교사", "관리자_보고_시간": "10:30", "관리자_보고_내용": "교감 보고"},
       "form_report_details": {"제지_경위": "자해 시도", "개별학생교육지원_경위": "[수업 중 교실 밖 분리] 이동"}}


def _entries(b):
    z = zipfile.ZipFile(io.BytesIO(b))
    assert z.infolist()[0].filename == "mimetype" and z.infolist()[0].compress_type == zipfile.ZIP_STORED
    return [{"name": i.filename, "data": z.read(i.filename), "ctype": i.compress_type} for i in z.infolist()]


def test_fields_and_hwpx():
    assert split_support_type("[수업 중 교실 내 분리] 내용") == ("수업 중 교실 내 분리", "내용")
    f = report_fields(REC, "초1-1")
    assert [k for k, v in f["보고사유"].items() if v] == ["방어 및 보호를 위한 제지", "수업 중 교실 밖 분리"]
    assert f["조치사항"][1] == {"구분": "관리자 보고", "일시": "10:30", "내용": "교감 보고"}
    e = _entries(build_hwpx(f))
    boxes = dict(H.list_checkboxes(e))
    assert boxes["CheckBox6"] == "CHECKED" and boxes["CheckBox1"] == "CHECKED" and boxes["CheckBox7"] == "UNCHECKED"
    x = H._dec(H.sections(e)[0]["data"])
    for s in ["김O준(1011)", "홍교사", "교감 보고", "PBST 기록번호: abc", "초1-1"]:
        assert s in x


def test_blank_template_has_no_values():
    e = _entries(build_hwpx())
    assert all(v == "UNCHECKED" for _, v in H.list_checkboxes(e))
    assert "PBST 기록번호" not in H._dec(H.sections(e)[0]["data"])
