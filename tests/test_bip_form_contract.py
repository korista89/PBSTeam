# BIP 양식 칸(시트 머리글)과 API 요청 모델이 어긋나면 저장 때 칸이 지워진다 — 둘이 같은지 확인한다.
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "backend"))

from app.services.sheets import BIP_REQUIRED_HEADERS
from app.api.endpoints.bip import BIPData


def test_bip_headers_match_request_model():
    assert set(BIP_REQUIRED_HEADERS) == set(BIPData.model_fields)


def test_form_rows_are_saved():
    for k in ("PlanStart", "OperationalDefinition", "MeasurementMethod", "CrisisNotify", "FBAReport", "ProgressReport"):
        assert k in BIP_REQUIRED_HEADERS


def test_function_read_from_sheet_column_named_기능():
    # 운영 시트의 추정 기능 칸 이름은 '기능' — 이 칸을 못 읽으면 FBA 근거·AI 초안에서 기능이 전부 '미상'이 된다.
    from app.services.normalize import normalize_behavior_log
    log = normalize_behavior_log({"학생코드": "S01", "기능": "과제 회피(사회적 부적강화)", "행동유형": "방해행동"}, {})
    assert log["function_labels"] and "미상" not in log["function_labels"][0]


def test_intensity_read_from_sheet_column_named_강도():
    # 운영 시트의 강도 칸 이름은 '강도' — 못 읽으면 모든 기록이 강도 1로 집계된다.
    from app.services.normalize import normalize_behavior_log
    log = normalize_behavior_log({"학생코드": "S01", "강도": "4(위기행동): 강한 공격"}, {})
    assert log["intensity"] == 4
