"""위기행동 기록 권한·상태 규칙: 관리자 전체, 교사는 본인 것만, 보고서 수정 시 재승인, 삭제는 Status=Deleted."""
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
os.environ.setdefault("AUTH_SECRET", "test")

import pytest
from fastapi import HTTPException
from app.api.endpoints import behavior as B

ACTION = B.ACTION_HEADER
HEAD = ["Log_ID", "Status", "Approval_Meta", "입력교사명", "학생코드", ACTION, "특기사항(기타)"]


class WS:
    def __init__(self, rows):
        self.vals = [HEAD] + rows
        self.updated = []
        self.appended = []

    def get_all_values(self):
        return self.vals

    def update_cells(self, cells):
        for c in cells:
            row = self.vals[c.row - 1]
            row[c.col - 1] = c.value
        self.updated += cells

    def row_values(self, i):
        return HEAD

    def append_row(self, r, table_range=None):
        self.appended.append(r)


def _patch(ws):
    client = mock.MagicMock()
    client.open_by_url.return_value.worksheet.return_value = ws
    return mock.patch.object(B, "get_sheets_client", return_value=client)


ADMIN = {"id": "admin", "role": "admin", "name": ""}
T1 = {"id": "초1-1", "role": "class_teacher", "name": ""}
T2 = {"id": "초1-2", "role": "class_teacher", "name": ""}


def rows():
    return [["a", "Approved", "", "초1-1", "1011", "X - 보고서 작성 불필요", ""],
            ["b", "Approved", "", "초1-1", "1011", "방어 및 보호를 위한 제지", ""],
            ["c", "Revision Requested", "", "초1-1", "1011", "개별학생교육지원", ""]]


def status(ws, log_id):
    return next(r[1] for r in ws.vals[1:] if r[0] == log_id)


def test_teacher_cannot_touch_others_log():
    ws = WS(rows())
    with _patch(ws):
        with pytest.raises(HTTPException) as e:
            B.update_behavior_log("a", {"특기사항": "x"}, current_user=T2)
        assert e.value.status_code == 403
        with pytest.raises(HTTPException):
            B.delete_behavior_log("a", current_user=T2)


def test_author_edit_data_only_stays_approved_report_goes_pending():
    ws = WS(rows())
    with _patch(ws):
        B.update_behavior_log("a", {"특기사항": "보완"}, current_user=T1)
        B.update_behavior_log("b", {"특기사항": "보완"}, current_user=T1)
        B.update_behavior_log("c", {"특기사항": "재작성"}, current_user=T1)
    assert status(ws, "a") == "Approved"
    assert status(ws, "b") == "Pending"
    assert status(ws, "c") == "Pending"


def test_status_not_editable_via_patch_and_admin_edit_keeps_status():
    ws = WS(rows())
    with _patch(ws):
        B.update_behavior_log("b", {"Status": "Approved", "특기사항": "관리자 수정"}, current_user=ADMIN)
    assert status(ws, "b") == "Approved"


def test_delete_is_soft_and_hides_row():
    ws = WS(rows())
    with _patch(ws):
        B.delete_behavior_log("a", current_user=T1)
        assert status(ws, "a") == "Deleted"
        with pytest.raises(HTTPException) as e:
            B.update_behavior_log("a", {"특기사항": "x"}, current_user=ADMIN)
        assert e.value.status_code == 404


def test_admin_revise_then_approve():
    ws = WS(rows())
    with _patch(ws):
        B.revise_behavior_log({"log_id": "a", "memo": "보완"}, current_admin=ADMIN)
        assert status(ws, "a") == "Revision Requested"
        B.approve_behavior_log({"log_id": "a"}, current_admin=ADMIN)
        assert status(ws, "a") == "Approved"


def test_crisis_without_report_rejected_and_author_from_session():
    ws = WS([])
    with mock.patch("app.services.sheets.get_main_worksheet", return_value=ws), \
         mock.patch.object(B, "check_student_scope"):
        with pytest.raises(HTTPException) as e:
            B.submit_behavior_log({"학생코드": "1011", ACTION: "방어 및 보호를 위한 제지"}, current_user=T1)
        assert e.value.status_code == 400
        r = B.submit_behavior_log({"학생코드": "1011", "입력교사명": "남의이름", ACTION: "X - 보고서 작성 불필요"}, current_user=T1)
    assert r["status"] == "Approved"
    assert ws.appended[0][HEAD.index("입력교사명")] == "초1-1"


def test_sign_needs_all_three_any_order_and_cancel_reopens():
    ws = WS([["p", "Pending", "", "초1-1", "1011", "방어 및 보호를 위한 제지", ""]])
    signed = {}

    def add(log_id, step, by, cancel=False, memo=""):
        (signed.pop(step, None) if cancel else signed.__setitem__(step, {"by": by}))

    with _patch(ws), mock.patch("app.services.sheets.add_approval_step", side_effect=add), \
         mock.patch("app.services.sheets.fetch_approval_states", side_effect=lambda force_refresh=False: {"p": dict(signed)}):
        B.sign_behavior_log({"log_id": "p", "step": "학교장확인"}, current_admin=ADMIN)   # 순서 무관: 학교장 먼저
        B.sign_behavior_log({"log_id": "p", "step": "담당자확인"}, current_admin=ADMIN)
        assert status(ws, "p") == "Pending"                                              # 2/3 은 미완료
        B.sign_behavior_log({"log_id": "p", "step": "학교장보고요청"}, current_admin=ADMIN)
        assert status(ws, "p") == "Pending"                                              # 보고요청은 완료 조건 아님
        r = B.sign_behavior_log({"log_id": "p", "step": "교감확인"}, current_admin=ADMIN)
        assert r["complete"] is True and status(ws, "p") == "Approved"
        B.sign_behavior_log({"log_id": "p", "step": "교감확인", "cancel": True}, current_admin=ADMIN)
        assert status(ws, "p") == "Pending"                                              # 취소하면 다시 대기
        with pytest.raises(HTTPException):
            B.sign_behavior_log({"log_id": "p", "step": "아무거나"}, current_admin=ADMIN)


def test_inbox_lists_both_kinds_and_pending_only():
    recs = [{"Log_ID": "r", "행동발생날짜": "2099-01-01", "물리적제지여부": "O(제지)", "Status": "Pending"},
            {"Log_ID": "d", "행동발생날짜": "2099-01-01", "물리적제지여부": "X(보고서 작성 불필요)", "Status": "Approved"},
            {"Log_ID": "", "행동발생날짜": "2099-01-01", "Status": "Approved"}]
    stud = [mock.Mock(student_code="1011", class_name="초1-1"), mock.Mock(student_code="2022", class_name="초2-2")]
    recs[0]["학생코드"], recs[1]["학생코드"] = "1011", "2022"
    with mock.patch.object(B.TierStatusAdapter, "fetch_students", return_value=stud), \
         mock.patch.object(B, "fetch_all_records", return_value=recs), \
         mock.patch("app.services.sheets.fetch_approval_states", return_value={"d": {k: {"by": "a", "at": "x"} for k in ("담당자확인", "교감확인", "학교장확인")}}):
        allr = B.get_approval_inbox(kind="all", days=30, pending_only=False, current_user=ADMIN)["logs"]
        assert {(r["Log_ID"], r["kind"]) for r in allr} == {("r", "report"), ("d", "data")}
        assert [r["Log_ID"] for r in B.get_approval_inbox(kind="all", days=30, pending_only=True, current_user=ADMIN)["logs"]] == ["r"]
        assert [r["Log_ID"] for r in B.get_approval_inbox(kind="data", days=30, pending_only=False, current_user=ADMIN)["logs"]] == ["d"]
        # 담임은 자기 학급(초1-1) 기록만 본다
        mine = B.get_approval_inbox(kind="all", days=30, pending_only=False, current_user=T1)["logs"]
        assert [r["Log_ID"] for r in mine] == ["r"] and mine[0]["학급"] == "초1-1"
