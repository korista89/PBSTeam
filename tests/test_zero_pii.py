import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.core.privacy import is_anon_code, mask_name, new_anon_code  # noqa: E402
from app.services import zero_pii as Z  # noqa: E402


def test_anon_code_rules():
    c = new_anon_code([], 2027)
    assert is_anon_code(c) and c.startswith("K27-")
    assert mask_name(c) == c  # 익명코드는 별칭 규칙에 다시 걸리지 않는다
    assert new_anon_code([f"K27-{n:03d}" for n in range(1, 999)], 2027) == "K27-999"


def test_code_map_and_plan():
    students = [{"학생이름": "김O준"}, {"학생이름": "이O-2513"}, {"학생이름": "K27-100"}]
    cm = Z.build_code_map(students, 2027)
    assert set(cm) == {"김O준", "이O-2513"} and len(set(cm.values())) == 2
    tabs = {"Log_Main": [["학생명", "입력교사명", "특기사항(기타)"],
                         ["김O준(3124)", "김O준", "김O준이 이O에게 물건을 던짐"]],
            "Users": [["ID"], ["김O준"]]}
    ch = Z.plan_changes(tabs, cm)
    cells = {(r, c): new for r, c, old, new in ch["Log_Main"]}
    assert cells[(1, 0)] == cm["김O준"] + "(3124)"          # 이름 칸
    assert (1, 1) not in cells                                 # 교사 칸은 그대로
    assert cells[(1, 2)] == f"{cm['김O준']}이 {cm['이O-2513']}에게 물건을 던짐"  # 서술 속 표기
    assert "Users" not in ch


def test_purge_keeps_stats():
    tabs = {"Log_Main": [["학생명", "행동발생날짜", "강도(1~5점 척도)", "특기사항(기타)", "[상해]  상해가 발생하게 된 경위"],
                         ["K27-001", "2026-05-01", "3", "물건 던짐", "넘어짐"],
                         ["K27-002", "2026-05-02", "2", "재학생 기록", ""]],
            "BIP": [["StudentCode", "Hypothesis", "UpdatedAt"], ["3124", "회피", "2026-05-01"]]}
    ch = Z.plan_purge(tabs, {"3124"}, {"K27-001"})
    log = {(r, c): new for r, c, old, new in ch["Log_Main"]}
    assert log == {(1, 3): Z.PURGED, (1, 4): Z.PURGED, (1, 0): "졸업·전출"}  # 날짜·강도는 남는다, 재학생 행은 그대로
    assert [(r, c, new) for r, c, old, new in ch["BIP"]] == [(1, 1, Z.PURGED)]


def test_consent_excluded_only_in_2027(monkeypatch):
    monkeypatch.setattr(Z, "consent_map", lambda: {"1": {"동의상태": "미동의"}, "2": {"동의상태": "동의"}, "3": {"동의상태": "철회"}})
    monkeypatch.setattr(Z.settings, "PRIVACY_MODE", "2026_HYBRID_RBAC")
    assert Z.excluded_codes() == set()
    monkeypatch.setattr(Z.settings, "PRIVACY_MODE", Z.ZERO_PII)
    assert Z.excluded_codes() == {"1", "3"}


def test_rollback_map_restores():
    cm = Z.build_code_map([{"학생이름": "김O준"}], 2027)
    code = cm["김O준"]
    tabs = {"Log_Main": [["학생명", "특기사항(기타)"], [code + "(3124)", f"{code}이 울음"]]}
    back = {(r, c): new for r, c, old, new in Z.plan_changes(tabs, {code: "김O준"})["Log_Main"]}
    assert back == {(1, 0): "김O준(3124)", (1, 1): "김O준이 울음"}
