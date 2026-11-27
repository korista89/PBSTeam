"""오래된 화면에서 저장해도 시트에만 있는 문서(학생정보·인수인계·FBA)를 지우지 않는다."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.services.sheets import _keep_documents


def test_stale_save_keeps_sheet_documents():
    old = {"ProgressReport": json.dumps({"handover": {"summary": "시트에 저장된 초안"}, "profile": {"learning": "- 읽기"}}),
           "FBAReport": json.dumps({"sections": {"기능 가설": "관심"}})}
    new = {"ProgressReport": json.dumps({"profile": {"learning": "- 고친 내용"}}), "FBAReport": ""}
    out = _keep_documents(new, old)
    pr = json.loads(out["ProgressReport"])
    assert pr["handover"]["summary"] == "시트에 저장된 초안"   # 화면에 없던 문서는 남김
    assert pr["profile"]["learning"] == "- 고친 내용"          # 화면에서 고친 문서는 화면 값
    assert json.loads(out["FBAReport"])["sections"]["기능 가설"] == "관심"


def test_nothing_to_keep_returns_same():
    new = {"ProgressReport": json.dumps({"profile": {"learning": "a"}})}
    assert _keep_documents(new, {"ProgressReport": ""}) == new
