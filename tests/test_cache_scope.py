"""캐시는 시트(기관)마다 따로 쓰인다: 다른 시트의 캐시를 읽거나 지우지 않는다."""
from unittest import mock

from app.adapters.sheets import client

A = "https://docs.google.com/spreadsheets/d/sheetA/edit"
B = "https://docs.google.com/spreadsheets/d/sheetB/edit"


def _on(url):
    return mock.patch.object(client, "current_sheet_url", return_value=url)


def test_cache_is_isolated_per_sheet():
    with _on(A):
        client.set_cached("svc:users", ["a학교"])
    with _on(B):
        assert client.get_cached("svc:users") is None
        client.set_cached("svc:users", ["b학교"])
        client.invalidate_cache()
        assert client.get_cached("svc:users") is None
    with _on(A):
        assert client.get_cached("svc:users") == ["a학교"]
        client.invalidate_cache()


def test_keep_and_max_age():
    with _on(A):
        client.set_cached("svc:users", [1])
        client.set_cached("svc:board", [2])
        client.invalidate_cache(keep=("svc:users",))
        assert client.get_cached("svc:users") == [1]
        assert client.get_cached("svc:board") is None
        client.invalidate_cache(max_age=60)
        assert client.get_cached("svc:users") == [1]  # 방금 쓴 것은 남는다
        client.invalidate_cache()
