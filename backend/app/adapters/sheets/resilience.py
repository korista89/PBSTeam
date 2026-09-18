# backend/app/adapters/sheets/resilience.py
"""Quota-aware layer between the app and gspread.

Every Sheets access in the backend goes through a gspread client obtained from
get_sheets_client(); wrapping that client here covers all call sites at once:

- Spreadsheet objects are opened once per instance, and worksheet lookups are
  cached, so a data read no longer costs 2 extra metadata reads.
- Worksheet reads keep their last successful result. When Google answers 429/5xx
  during a GET request, that copy is served and the request is marked stale
  (X-PBST-Data-Stale response header) instead of silently returning empty data.
- Without a copy, one short retry is made; then the failure is remembered for a
  few seconds so a loop over students cannot re-hit a throttled API dozens of
  times, and SheetUnavailable is raised (mapped to HTTP 503 in main.py).
- Mutating requests never get stale reads: a read-modify-write on stale data
  could overwrite newer values in the sheet.
"""

import copy
import threading
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Hashable, Optional, Set, Tuple

import gspread
from gspread.utils import extract_id_from_url

RETRY_DELAY_SECONDS = 1.0
FAILURE_WINDOW_SECONDS = 10.0
LAST_GOOD_MAX_AGE_SECONDS = 6 * 3600
WORKSHEET_LOOKUP_TTL_SECONDS = 300.0
WORKSHEET_LIST_TTL_SECONDS = 60.0

_READ_METHODS = {
    "get_all_records", "get_all_values", "get_values", "get", "batch_get",
    "col_values", "row_values", "find", "findall", "acell", "cell",
}
_STRUCTURE_METHODS = {"add_worksheet", "del_worksheet", "duplicate_sheet", "reorder_worksheets"}


class SheetUnavailable(Exception):
    """Google Sheets could not be read (quota/outage) and no usable copy exists."""

    def __init__(self, source: str, cause: Optional[BaseException] = None):
        super().__init__(f"Sheet '{source}' is temporarily unavailable: {cause}")
        self.source = source
        self.cause = cause


@dataclass
class _RequestState:
    allow_stale: bool
    stale_sources: Set[str] = field(default_factory=set)


_request_state: ContextVar[Optional[_RequestState]] = ContextVar("pbst_sheet_request", default=None)


def begin_request(allow_stale: bool):
    """Called by the HTTP middleware. The state object is shared by reference with the
    endpoint's threadpool context, so stale marks made there are visible afterwards."""
    return _request_state.set(_RequestState(allow_stale=allow_stale))


def end_request(token) -> Set[str]:
    state = _request_state.get()
    _request_state.reset(token)
    return set(state.stale_sources) if state else set()


_lock = threading.Lock()
_last_good: Dict[Hashable, Tuple[float, Any]] = {}
_failed_until: Dict[Hashable, float] = {}


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, gspread.exceptions.APIError):
        code = getattr(exc, "code", None)
        if code is None:
            code = getattr(getattr(exc, "response", None), "status_code", None)
        return code == 429 or (isinstance(code, int) and code >= 500)
    try:
        import requests
        return isinstance(exc, (requests.ConnectionError, requests.Timeout))
    except Exception:
        return False


def resilient_call(key: Hashable, source: str, fn: Callable[[], Any], mark_stale: bool = True) -> Any:
    now = time.time()
    with _lock:
        in_failure_window = _failed_until.get(key, 0.0) > now
        good = _last_good.get(key)

    last_exc: Optional[BaseException] = None
    if not in_failure_window:
        attempts = 1 if good else 2  # with a copy on hand, don't make the user wait
        for attempt in range(attempts):
            try:
                value = fn()
                with _lock:
                    _last_good[key] = (time.time(), value)
                    _failed_until.pop(key, None)
                return value
            except Exception as exc:
                if not _is_transient(exc):
                    raise
                last_exc = exc
                if attempt + 1 < attempts:
                    time.sleep(RETRY_DELAY_SECONDS)
        with _lock:
            _failed_until[key] = time.time() + FAILURE_WINDOW_SECONDS
        print(f"Sheets read failed for '{source}': {last_exc}")

    state = _request_state.get()
    if good and state is not None and state.allow_stale and (now - good[0]) < LAST_GOOD_MAX_AGE_SECONDS:
        if mark_stale:
            state.stale_sources.add(source)
        return copy.deepcopy(good[1]) if mark_stale else good[1]
    raise SheetUnavailable(source, last_exc)


class ResilientWorksheet:
    def __init__(self, ws: gspread.Worksheet):
        self._ws = ws

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._ws, name)
        if name not in _READ_METHODS or not callable(attr):
            return attr

        def read(*args, **kwargs):
            key = ("read", self._ws.spreadsheet_id, self._ws.id, name, repr(args), repr(sorted(kwargs.items())))
            return resilient_call(key, self._ws.title, lambda: attr(*args, **kwargs))
        return read

    def __repr__(self) -> str:
        return f"ResilientWorksheet({self._ws!r})"


class ResilientSpreadsheet:
    def __init__(self, ss: gspread.Spreadsheet):
        self._ss = ss
        self._by_title: Dict[str, Tuple[float, ResilientWorksheet]] = {}
        self._list: Optional[Tuple[float, list]] = None

    def invalidate(self) -> None:
        self._by_title.clear()
        self._list = None

    def worksheet(self, title: str) -> ResilientWorksheet:
        hit = self._by_title.get(title)
        if hit and time.time() - hit[0] < WORKSHEET_LOOKUP_TTL_SECONDS:
            return hit[1]
        ws = resilient_call(("ws", self._ss.id, title), title, lambda: self._ss.worksheet(title), mark_stale=False)
        wrapped = ResilientWorksheet(ws)
        self._by_title[title] = (time.time(), wrapped)
        return wrapped

    def worksheets(self, *args, **kwargs) -> list:
        if not args and not kwargs and self._list and time.time() - self._list[0] < WORKSHEET_LIST_TTL_SECONDS:
            return list(self._list[1])
        raw = resilient_call(("ws-list", self._ss.id, repr(args), repr(kwargs)), "worksheet list",
                             lambda: self._ss.worksheets(*args, **kwargs), mark_stale=False)
        wrapped = [ResilientWorksheet(w) for w in raw]
        if not args and not kwargs:
            self._list = (time.time(), wrapped)
        return list(wrapped)

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._ss, name)
        if name not in _STRUCTURE_METHODS or not callable(attr):
            return attr

        def structural(*args, **kwargs):
            args = tuple(a._ws if isinstance(a, ResilientWorksheet) else a for a in args)
            try:
                result = attr(*args, **kwargs)
            finally:
                self.invalidate()
            return ResilientWorksheet(result) if isinstance(result, gspread.Worksheet) else result
        return structural


class ResilientClient:
    def __init__(self, client: gspread.Client):
        self._client = client
        self._opened: Dict[str, ResilientSpreadsheet] = {}

    def open_by_key(self, key: str) -> ResilientSpreadsheet:
        cached = self._opened.get(key)
        if cached is not None:
            return cached
        ss = resilient_call(("open", key), "spreadsheet", lambda: self._client.open_by_key(key), mark_stale=False)
        wrapped = ResilientSpreadsheet(ss)
        self._opened[key] = wrapped
        _registered.add(wrapped)
        return wrapped

    def open_by_url(self, url: str) -> ResilientSpreadsheet:
        return self.open_by_key(extract_id_from_url(url))

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)


_registered: Set[ResilientSpreadsheet] = set()


def invalidate_worksheet_lookups() -> None:
    """Drop cached worksheet lookups so sheets created elsewhere become visible."""
    for ss in list(_registered):
        ss.invalidate()


def reset_for_tests() -> None:
    with _lock:
        _last_good.clear()
        _failed_until.clear()
    _registered.clear()
