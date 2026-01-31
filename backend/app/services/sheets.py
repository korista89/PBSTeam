import gspread
from oauth2client.service_account import ServiceAccountCredentials
from app.core.config import settings
import os
import json

def get_sheets_client():
    """
    Auhtenticates with Google Sheets API and returns the client.
    Prioritizes 'GOOGLE_SERVICE_ACCOUNT_JSON' env var (for Production/Render).
    Fallbacks to 'service_account.json' file (for Local Dev).
    """
    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    
    # 1. Try Environment Variable (Production)
    env_creds = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if env_creds:
        try:
            creds_dict = json.loads(env_creds)
            creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
            return gspread.authorize(creds)
        except Exception as e:
            print(f"Error loading credentials from env: {e}")
            return None

    # 2. Try Local File (Development)
    if os.path.exists(settings.GOOGLE_CREDENTIALS_FILE):
        creds = ServiceAccountCredentials.from_json_keyfile_name(settings.GOOGLE_CREDENTIALS_FILE, scope)
        return gspread.authorize(creds)
        
    print(f"Warning: Credentials not found (Env var or {settings.GOOGLE_CREDENTIALS_FILE})")
    return None

def get_main_worksheet():
    client = get_sheets_client()
    if not client:
        return None
    
    if not settings.SHEET_URL:
        # Fallback or error
        return None
        
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        return sheet.sheet1 
    except Exception as e:
        print(f"Error connecting to sheet: {e}")
        return None

def fetch_all_records():
    worksheet = get_main_worksheet()
    if not worksheet:
        return []
    
    # Get all values including headers
    # expected_headers argument can be used to validate, but for now we trust `get_all_records`
    try:
        all_values = worksheet.get_all_records()
        return all_values
    except Exception as e:
        print(f"Error fetching records: {e}")
        return []

