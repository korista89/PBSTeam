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
