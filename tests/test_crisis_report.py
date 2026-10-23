"""위기행동 보고서: 기록 → 양식 항목, 한글 파일(체크박스·값·mimetype) 생성, 작성 화면 입력 → 인쇄 1:1 왕복."""
import io
import json
import os
import shutil
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
import pytest
from app.services.crisis_report import report_fields, build_hwpx, split_tags
from app.services.sheets import map_log_row
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
    assert split_tags("[수업 중 교실 내 분리] 내용") == (["수업 중 교실 내 분리"], "내용")
    assert split_tags("[방어 및 보호를 위한 제지][본인/타인 상해 발생]\n10:20 침") == (["방어 및 보호를 위한 제지", "본인/타인 상해 발생"], "10:20 침")
    assert split_tags("[수업 중 교실 밖 분리][담임교사:정담임]\n10:20 [메모] 침") == (["수업 중 교실 밖 분리", "담임교사:정담임"], "10:20 [메모] 침")
    f = report_fields(REC, "초1-1")
    assert [k for k, v in f["보고사유"].items() if v] == ["방어 및 보호를 위한 제지", "수업 중 교실 밖 분리"]
    assert f["조치사항"][1] == {"구분": "관리자 보고", "일시": "10:30", "내용": "교감 보고"}
    e = _entries(build_hwpx(f))
    boxes = dict(H.list_checkboxes(e))
    assert boxes["CheckBox6"] == "CHECKED" and boxes["CheckBox1"] == "CHECKED" and boxes["CheckBox7"] == "UNCHECKED"
    x = H._dec(H.sections(e)[0]["data"])
    for s in ["김O준", "홍교사", "교감 보고", "PBST 기록번호: abc", "초1-1"]:
        assert s in x


def test_blank_template_has_no_values():
    e = _entries(build_hwpx())
    assert all(v == "UNCHECKED" for _, v in H.list_checkboxes(e))
    assert "PBST 기록번호" not in H._dec(H.sections(e)[0]["data"])


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Log_Main 실제 헤더 중 보고서 관련 열(2026-10-23 운영 시트에서 확인). 화면이 없는 열에 쓰면 저장이 조용히 사라지므로 검사한다.
LOG_MAIN_REPORT_HEADERS = {
    "방어 및 보호를 위한 제지 / 개별학생교육지원 / 본인·타인 상해 발생 여부", "발생 시 지도교사",
    "1차_개별학생교육지원_시간", "1차_개별학생교육지원_장소", "1차_개별학생교육지원_교사",
    "A_배경_선행사건", "B_나타난_위기행동", "C_후속결과", "1차_경위", "1차_관찰기록",
    *[f"{k}_{s}" for k in ["부상자_치료", "관리자_보고", "학부모_알림", "학생_상담", "학부모_상담", "긴급회의"] for s in ["시간", "내용"]],
}
SCREEN = {  # 작성 화면에 교사가 쓴 값
    "사유": ["방어 및 보호를 위한 제지", "수업 중 교실 밖 분리"], "담임교사": "정담임", "지도교사": "홍교사",
    "지원시간": "11:30~12:10 (40분)", "지원장소": "심리안정실", "지원교사": "박교사(40분)",
    "A": "활동 전환 안내 직후", "B": "책상을 3회 내리침", "C": "활동 중단",
    "경위": [{"t": "11:20", "s": "학습지를 찢음"}, {"t": "", "s": ""}, {"t": "11:25", "s": "두 교사가 손목을 잡아 제지함(30초)"}],
    "관찰기록": [{"t": "11:32", "s": "도착 후 바닥에 누움"}, {"t": "12:05", "s": "교실로 복귀함"}],
    "조치": {"부상자_치료": {"일시": "", "내용": ""}, "관리자_보고": {"일시": "10/23 12:20", "내용": "교감 구두 보고"},
             "학부모_알림": {"일시": "10/23 13:00", "내용": "전화 안내"}, "학생_상담": {"일시": "", "내용": ""},
             "학부모_상담": {"일시": "", "내용": ""}, "긴급회의": {"일시": "", "내용": ""}},
}


def _screen_columns():
    """프런트 crisisReport.ts 의 reportColumns 를 그대로 실행해 화면 입력 → 시트 열 값을 얻는다."""
    if not shutil.which("node"):
        pytest.skip("node 없음")
    js = ("import {reportColumns} from './frontend/src/app/crisisReport.ts';"
          f"console.log(JSON.stringify(reportColumns({json.dumps(SCREEN, ensure_ascii=False)})))")
    out = subprocess.run(["node", "--no-warnings", "--experimental-strip-types", "--input-type=module", "-e", js],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def test_screen_to_print_roundtrip():
    cols = _screen_columns()
    assert set(cols) <= LOG_MAIN_REPORT_HEADERS
    row = {**cols, "Log_ID": "x1", "학생명": "김O준-1011", "학생코드": "1011", "행동발생날짜": "2026. 10. 23", "시간대(위기행동 시작 시간 기준)": "4구간: 3교시",
           "행동 발생 장소(위기행동 시작 장소 기준)": "교실"}
    f = report_fields(map_log_row(row), "초1-1")
    assert [k for k, v in f["보고사유"].items() if v] == SCREEN["사유"]
    expect = {"지도교사": "홍교사", "지원시간": "11:30~12:10 (40분)", "지원장소": "심리안정실", "지원교사": "박교사(40분)",
              "A": "활동 전환 안내 직후", "B": "책상을 3회 내리침", "C": "활동 중단",
              "경위": "11:20 학습지를 찢음\n11:25 두 교사가 손목을 잡아 제지함(30초)",  # 빈 줄은 빠지고 [사유] 표시는 안 보인다
              "관찰기록": "11:32 도착 후 바닥에 누움\n12:05 교실로 복귀함",
              "발생일시": "2026-10-23 4구간: 3교시", "발생장소": "교실", "학생": "김O준", "담임교사": "정담임"}
    for k, v in expect.items():
        assert f[k] == v, k
    assert f["조치사항"][1] == {"구분": "관리자 보고", "일시": "10/23 12:20", "내용": "교감 구두 보고"}
    x = H._dec(H.sections(_entries(build_hwpx(f)))[0]["data"])
    for v in ["정담임", "홍교사", "심리안정실", "박교사(40분)", "책상을 3회 내리침", "11:20 학습지를 찢음", "12:05 교실로 복귀함", "교감 구두 보고", "전화 안내"]:
        assert v in x, v
    boxes = dict(H.list_checkboxes(_entries(build_hwpx(f))))
    assert boxes["CheckBox6"] == "CHECKED" and boxes["CheckBox1"] == "CHECKED" and boxes["CheckBox8"] == "UNCHECKED"


def test_google_form_record_prints():
    """구글 폼 옛 기록(1차_* 열 비어 있음)도 [제지]·[상해] 열로 칸이 채워진다."""
    row = {"Log_ID": "g1", "학생명": "이O", "학생코드": "2002", "방어 및 보호를 위한 제지 / 개별학생교육지원 / 본인·타인 상해 발생 여부": "본인/타인상해만 발생",
           "[상해] 상해를 입은 사람": "또래", "[상해]  상해가 발생하게 된 경위": "급식실에서 밀침", "발생 시 지도교사": "최교사"}
    f = report_fields(map_log_row(row))
    assert [k for k, v in f["보고사유"].items() if v] == ["본인/타인 상해 발생"]
    assert f["경위"] == "[상해 경위] 급식실에서 밀침 (상해 입은 사람: 또래)" and f["지도교사"] == "최교사"
    build_hwpx(f)


def test_auto_fill_and_duplicate_check():
    """'위 내용 자동 반영'은 빈 칸만 채우고, 경위는 'B 참조'로 시작해 B와 겹치지 않는다."""
    if not shutil.which("node"):
        pytest.skip("node 없음")
    js = """import {autoFill, emptyReport, duplicatesB, STORY_START} from './frontend/src/app/crisisReport.ts';
const d = {배경: ['수면 부족', '특이사항 없음'], 선행: ['활동 전환'], 후속: ['교실 밖 공간 이동'],
  행동유형: '물건파괴행동: 물건 던지기 및 시설물 파손', 강도: '3(위기행동): 신체 흔적', 특기사항: '의자 2회 던짐'};
const a = autoFill(emptyReport(), d);
const kept = autoFill({...emptyReport(), A: '직접 쓴 A'}, d);
console.log(JSON.stringify({A: a.A, B: a.B, C: a.C, s: a.경위[0].s, start: STORY_START, keptA: kept.A,
  dup: duplicatesB([{t: '', s: '의자를 2회 던짐'}], '의자를 2회 던짐'), nodup: duplicatesB([{t: '', s: STORY_START}], a.B)}));"""
    out = json.loads(subprocess.run(["node", "--no-warnings", "--experimental-strip-types", "--input-type=module", "-e", js],
                                    cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    assert out["A"] == "수면 부족인 날, 활동 전환 직후 발생함"
    assert out["B"] == "물건파괴행동 (강도 3) — 의자 2회 던짐"
    assert out["C"] == "교실 밖 공간 이동" and out["s"] == out["start"] and out["keptA"] == "직접 쓴 A"
    assert out["dup"] is True and out["nodup"] is False
