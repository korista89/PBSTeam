# backend/app/adapters/sheets/client.py

import os
import json
import time
from typing import Optional, List, Dict, Any
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from app.core.config import settings

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
            _sheets_client = gspread.authorize(creds)
            return _sheets_client
        except Exception as e:
            print(f"Error loading credentials from env: {e}")
            return None

    # 2. Local credentials file (Development)
    if os.path.exists(settings.GOOGLE_CREDENTIALS_FILE):
        try:
            creds = ServiceAccountCredentials.from_json_keyfile_name(settings.GOOGLE_CREDENTIALS_FILE, scope)
            _sheets_client = gspread.authorize(creds)
            return _sheets_client
        except Exception as e:
            print(f"Error loading credentials file: {e}")
            return None
        
    print(f"Warning: Google credentials not found (Env var or {settings.GOOGLE_CREDENTIALS_FILE})")
    return None


def get_cached(key: str, ttl: int = CACHE_TTL) -> Optional[Any]:
    try:
        now = time.time()
        entry = _cache.get(key)
        if entry and (now - float(entry.get("timestamp", 0)) < ttl):
            return entry.get("data")
    except Exception as e:
        print(f"get_cached error: {e}")
    return None


def set_cached(key: str, data: Any):
    try:
        _cache[key] = {
            "data": data,
            "timestamp": time.time()
        }
    except Exception as e:
        print(f"set_cached error: {e}")


def invalidate_cache(key_prefix: str = ""):
    global _cache
    try:
        if not key_prefix:
            _cache.clear()
        else:
            keys_to_remove = [k for k in _cache if k.startswith(key_prefix)]
            for k in keys_to_remove:
                _cache.pop(k, None)
    except Exception as e:
        print(f"invalidate_cache error: {e}")


def safe_get_all_records(ws) -> List[Dict[str, Any]]:
    """
    Safely fetch all records from a worksheet.
    Falls back to get_all_values() if get_all_records() fails (e.g. duplicate headers).
    """
    try:
        return ws.get_all_records()
    except Exception as e:
        print(f"safe_get_all_records fallback: {e}")
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
        except Exception as e:
            if i == retries - 1:
                print(f"safe_get_all_values failed after {retries} retries: {e}")
                return []
            time.sleep(0.5)
    return []
