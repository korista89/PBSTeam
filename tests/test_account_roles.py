import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.api import deps  # noqa: E402


def _user(**row):
    p = deps.account_profile(row)
    return {**p, "class_id": str(row.get("ClassID", "")), "id": row.get("ID", "")}


def test_profiles():
    assert deps.account_profile({"Role": "admin"})["account_admin"] is True
    staff = deps.account_profile({"Role": "pbst_staff"})
    assert staff["role"] == "admin" and staff["group"] == "PBST_STAFF" and not staff["account_admin"]
    t3 = deps.account_profile({"Role": "pbst_staff", "AssignedClasses": "초1-1, 211"})
    assert t3["role"] == "teacher" and t3["assigned"] == ["초1-1", "초1-1"]
    both = deps.account_profile({"Role": "class_teacher", "Roles": "division_head"})
    assert both["role"] == "division_head" and both["group"] == "DEPT_HEAD"


def test_scopes():
    assert deps.user_scope(_user(Role="pbst_staff")) is None
    assert deps.user_scope(_user(Role="class_teacher", ClassID="211", ID="초1-1")) == "초1-1"
    multi = deps.user_scope(_user(Role="class_teacher", ID="중학교교과전담교사1", AssignedClasses="중1-1,중1-2"))
    assert multi == "중1-1,중1-2"
    assert deps.in_scope("중1-2", multi) and not deps.in_scope("중2-1", multi)
    assert deps.narrow_scope(_user(Role="class_teacher", ID="x", AssignedClasses="중1-1,중1-2"), "중1-2") == "중1-2"
    assert deps.narrow_scope(_user(Role="class_teacher", ID="x", AssignedClasses="중1-1,중1-2"), "고1-1") == multi
