"""본인 비밀번호 변경: 현재 비밀번호가 맞아야 바뀐다."""
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
os.environ.setdefault("AUTH_SECRET", "test")

import pytest
from fastapi import HTTPException
from app.api.endpoints import auth as A
from app.core.security import hash_password

T = {"id": "초1-1", "role": "class_teacher"}


def test_change_my_password_checks_current():
    stored = hash_password("old1")
    with mock.patch("app.services.sheets.get_user_by_id", return_value={"ID": "초1-1", "Password": stored}), \
         mock.patch("app.services.sheets.update_user_password_cas", return_value=True) as cas:
        with pytest.raises(HTTPException) as e:
            A.change_my_password(A.MyPasswordRequest(current_password="wrong", new_password="new12"), current_user=T)
        assert e.value.status_code == 400 and not cas.called
        assert A.change_my_password(A.MyPasswordRequest(current_password="old1", new_password="new12"), current_user=T)["success"]
        cas.assert_called_once_with("초1-1", stored, "new12")
