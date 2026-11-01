# backend/app/adapters/sheets/client.py

import logging
import os
import json
import time
from typing import Optional, List, Dict, Any
import gspread
from gspread.utils import extract_id_from_url
from oauth2client.service_account import ServiceAccountCredentials
from app.core.config import settings
from app.adapters.sheets.resilience import ResilientClient, SheetUnavailable

logger = logging.getLogger(__name__)

_sheets_client = None
_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 60  # 60 seconds default TTL

def get_sheets_client() -> Optional[gspread.Client]:
    """
    Authenticates with Google Sheets API and returns the authorized client.
    Prioritizes GOOGLE_SERVICE_ACCOUNT_JSON env var, fallbacks to local credentials file.
    """
    global _sheets_client
    if _sheets_client is not None:
        return _sheets_client

    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    
    # 1. Environment variable (Production / Vercel)
    env_creds = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if env_creds:
        try:
            creds_dict = json.loads(env_creds)
            creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
            _sheets_client = ResilientClient(gspread.authorize(creds))
            return _sheets_client
        except SheetUnavailable:
            raise
        except Exception as e:
            logger.error(f"Error loading credentials from env: {e}")
            return None

    # 2. Local credentials file (Development)
    if os.path.exists(settings.GOOGLE_CREDENTIALS_FILE):
        try:
            creds = ServiceAccountCredentials.from_json_keyfile_name(settings.GOOGLE_CREDENTIALS_FILE, scope)
            _sheets_client = ResilientClient(gspread.authorize(creds))
            return _sheets_client
        except SheetUnavailable:
            raise
        except Exception as e:
            logger.error(f"Error loading credentials file: {e}")
            return None
        
    logger.warning(f"Warning: Google credentials not found (Env var or {settings.GOOGLE_CREDENTIALS_FILE})")
    return None


def current_sheet_url() -> str:
    """이번 요청이 쓰는 스프레드시트 주소. 시트 접근은 모두 이 함수를 거친다.
    지금은 경은 시트 하나(SHEET_URL)뿐이다. 기관별 시트가 생기면 여기만 바꾼다."""
    return settings.SHEET_URL


def open_main_sheet(client=None):
    """현재 스프레드시트를 연다. 열린 객체는 ResilientClient가 인스턴스마다 재사용한다."""
    client = client or get_sheets_client()
    return client.open_by_url(current_sheet_url())


def open_pw_sheet(client=None):
    """그림말누리제 파일(PW_*·평가문장 탭)을 연다."""
    client = client or get_sheets_client()
    return client.open_by_url(settings.PW_SHEET_URL)


def _scope() -> str:
    # 캐시 열쇠 앞에 시트 ID를 붙여, 시트가 여러 개여도 서로의 캐시를 읽지 않게 한다.
    url = current_sheet_url() or ""
    try:
        return extract_id_from_url(url)
    except Exception:
        return url


def _scoped(key: str) -> str:
    return f"{_scope()}|{key}"


def get_cached(key: str, ttl: int = CACHE_TTL) -> Optional[Any]:
    entry = _cache.get(_scoped(key))
    if entry and (time.time() - float(entry.get("timestamp", 0)) < ttl):
        return entry.get("data")
    return None


def set_cached(key: str, data: Any):
    _cache[_scoped(key)] = {"data": data, "timestamp": time.time()}


def invalidate_cache(key_prefix: str = "", keep: tuple = (), max_age: Optional[float] = None):
    """현재 시트의 캐시 중 key_prefix로 시작하는 것을 지운다.
    keep에 든 접두어는 남기고, max_age를 주면 그보다 오래된 것만 지운다."""
    scope = _scope() + "|"
    cutoff = time.time() - max_age if max_age is not None else None
    for k in [k for k in _cache if k.startswith(scope + key_prefix)]:
        bare = k[len(scope):]
        if keep and bare.startswith(keep):
            continue
        if cutoff is not None and float(_cache[k].get("timestamp", 0) or 0) >= cutoff:
            continue
        _cache.pop(k, None)


def safe_get_all_records(ws) -> List[Dict[str, Any]]:
    """
    Safely fetch all records from a worksheet.
    Falls back to get_all_values() if get_all_records() fails (e.g. duplicate headers).
    """
    try:
        return ws.get_all_records()
    except SheetUnavailable:
        raise
    except Exception as e:
        logger.warning(f"safe_get_all_records fallback: {e}")
        all_vals = ws.get_all_values()
        if len(all_vals) < 2:
            return []
        headers = all_vals[0]
        records = []
        for row in all_vals[1:]:
            record = {}
            for ci, h in enumerate(headers):
                if ci < len(row) and h:
                    record[h] = row[ci]
            records.append(record)
        return records


def safe_get_all_values(ws, retries: int = 3) -> List[List[Any]]:
    """
    Safely fetch all raw rows from a worksheet with transient retry.
    """
    for i in range(retries):
        try:
            return ws.get_all_values()
        except SheetUnavailable:
            raise
        except Exception as e:
            if i == retries - 1:
                logger.error(f"safe_get_all_values failed after {retries} retries: {e}")
                return []
            time.sleep(0.5)
    return []
