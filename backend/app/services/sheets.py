import gspread
from oauth2client.service_account import ServiceAccountCredentials
from app.core.config import settings
import os

def get_sheets_client():
    """
    Auhtenticates with Google Sheets API and returns the client.
    Requires 'service_account.json' to be present in the root or specified path.
    """
    if not os.path.exists(settings.GOOGLE_CREDENTIALS_FILE):
        print(f"Warning: Credentials file not found at {settings.GOOGLE_CREDENTIALS_FILE}")
        return None

    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    creds = ServiceAccountCredentials.from_json_keyfile_name(settings.GOOGLE_CREDENTIALS_FILE, scope)
    client = gspread.authorize(creds)
    return client

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

