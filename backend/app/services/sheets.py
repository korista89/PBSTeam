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

def get_student_codes_worksheet():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return None
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        # Try to open "StudentCodes" tab, create if not exists
        try:
            return sheet.worksheet("StudentCodes")
        except gspread.WorksheetNotFound:
            print("Creating 'StudentCodes' worksheet...")
            # Create with headers: Code, Name, Memo
            ws = sheet.add_worksheet(title="StudentCodes", rows=300, cols=5)
            ws.append_row(["Code", "Name", "Memo"]) 
            return ws
    except Exception as e:
        print(f"Error accessing StudentCodes worksheet: {e}")
        return None

def fetch_student_codes():
    ws = get_student_codes_worksheet()
    if not ws:
        return {}
    
    try:
        records = ws.get_all_records()
        # Return dict: {Name: Code} for fast masking
        # Filter out empty names
        code_map = {}
        for r in records:
            name = str(r.get('Name', '')).strip()
            code = str(r.get('Code', '')).strip()
            if name and code:
                code_map[name] = code
        return code_map
    except Exception as e:
        print(f"Error fetching codes: {e}")
        return {}

def update_student_codes(new_codes: list):
    """
    new_codes: list of dicts [{'Code': '...', 'Name': '...', 'Memo': '...'}]
    Replaces the entire sheet content (simplest for now) or updates rows.
    For simplicity and reliability, we'll clear and re-write if the list is full.
    """
    ws = get_student_codes_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        # Prepare data for upload
        # Headers
        data = [["Code", "Name", "Memo"]]
        for item in new_codes:
            data.append([item.get('Code'), item.get('Name'), item.get('Memo', '')])
        
        ws.clear()
        ws.update(data)
        return {"message": "Codes updated successfully"}
    except Exception as e:
        print(f"Error updating codes: {e}")
        return {"error": str(e)}

