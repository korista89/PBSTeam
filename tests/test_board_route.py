"""게시판 주소는 끝에 '/' 없이 바로 응답해야 한다(Vercel 이 '/' 를 지워 리다이렉트가 돌면 게시판이 안 열린다)."""
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
os.environ.setdefault("AUTH_SECRET", "test")

from fastapi.testclient import TestClient
from app.main import app
from app.api import deps
from app.api.endpoints import board


def test_board_without_trailing_slash_is_not_redirected():
    app.dependency_overrides[deps.require_authenticated_user] = lambda: {"id": "t", "role": "admin"}
    try:
        with mock.patch.object(board, "fetch_board_posts", return_value=[]):
            r = TestClient(app).get("/api/v1/board", follow_redirects=False)
        assert r.status_code == 200 and r.json() == []
    finally:
        app.dependency_overrides.clear()
