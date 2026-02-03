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


# =============================
# Users (Authentication) Worksheet
# =============================
def get_users_worksheet():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return None
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        try:
            return sheet.worksheet("Users")
        except gspread.WorksheetNotFound:
            print("Creating 'Users' worksheet...")
            ws = sheet.add_worksheet(title="Users", rows=110, cols=5)
            ws.append_row(["ID", "Password", "Role", "LastLogin"])
            # Initialize admin accounts (1-10)
            for i in range(1, 11):
                ws.append_row([str(i), "admin123", "admin", ""])
            # Initialize teacher accounts (11-100)
            for i in range(11, 101):
                ws.append_row([str(i), "teacher123", "teacher", ""])
            return ws
    except Exception as e:
        print(f"Error accessing Users worksheet: {e}")
        return None

def get_user_by_id(user_id: str):
    ws = get_users_worksheet()
    if not ws:
        return None
    
    try:
        records = ws.get_all_records()
        for r in records:
            if str(r.get('ID')) == str(user_id):
                return r
        return None
    except Exception as e:
        print(f"Error fetching user: {e}")
        return None

def update_user_password(user_id: str, new_password: str):
    ws = get_users_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        records = ws.get_all_records()
        for idx, r in enumerate(records):
            if str(r.get('ID')) == str(user_id):
                # Row index is idx + 2 (1 for header, 1 for 0-index)
                ws.update_cell(idx + 2, 2, new_password)  # Column 2 is Password
                return {"message": "Password updated"}
        return {"error": "User not found"}
    except Exception as e:
        print(f"Error updating password: {e}")
        return {"error": str(e)}

def get_all_users():
    ws = get_users_worksheet()
    if not ws:
        return []
    
    try:
        records = ws.get_all_records()
        # Don't return passwords
        return [{"ID": r.get("ID"), "Role": r.get("Role"), "LastLogin": r.get("LastLogin")} for r in records]
    except Exception as e:
        print(f"Error fetching users: {e}")
        return []


# =============================
# Student Status (Tier Tracking) Worksheet
# =============================
def get_student_status_worksheet():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return None
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        try:
            return sheet.worksheet("StudentStatus")
        except gspread.WorksheetNotFound:
            print("Creating 'StudentStatus' worksheet...")
            ws = sheet.add_worksheet(title="StudentStatus", rows=220, cols=6)
            ws.append_row(["Code", "Name", "Class", "CurrentTier", "ChangedDate", "Memo"])
            return ws
    except Exception as e:
        print(f"Error accessing StudentStatus worksheet: {e}")
        return None

def fetch_student_status():
    ws = get_student_status_worksheet()
    if not ws:
        return []
    
    try:
        return ws.get_all_records()
    except Exception as e:
        print(f"Error fetching status: {e}")
        return []

def update_student_tier(code: str, new_tier: str, memo: str = ""):
    ws = get_student_status_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        records = ws.get_all_records()
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        for idx, r in enumerate(records):
            if str(r.get('Code')) == str(code):
                ws.update_cell(idx + 2, 4, new_tier)  # Column 4 is CurrentTier
                ws.update_cell(idx + 2, 5, today)     # Column 5 is ChangedDate
                if memo:
                    ws.update_cell(idx + 2, 6, memo)  # Column 6 is Memo
                return {"message": f"Tier updated to {new_tier}"}
        
        # If not found, add new row
        ws.append_row([code, "", "", new_tier, today, memo])
        return {"message": "Student added with tier"}
    except Exception as e:
        print(f"Error updating tier: {e}")
        return {"error": str(e)}


# =============================
# CICO Daily Tracking Worksheet
# =============================
def get_cico_daily_worksheet():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return None
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        try:
            return sheet.worksheet("CICODaily")
        except gspread.WorksheetNotFound:
            print("Creating 'CICODaily' worksheet...")
            ws = sheet.add_worksheet(title="CICODaily", rows=1000, cols=8)
            ws.append_row(["Date", "StudentCode", "TargetBehavior1", "TargetBehavior2", "AchievementRate", "TeacherMemo", "EnteredBy"])
            return ws
    except Exception as e:
        print(f"Error accessing CICODaily worksheet: {e}")
        return None

def fetch_cico_daily(student_code: str = None, start_date: str = None, end_date: str = None):
    ws = get_cico_daily_worksheet()
    if not ws:
        return []
    
    try:
        records = ws.get_all_records()
        filtered = records
        
        if student_code:
            filtered = [r for r in filtered if str(r.get('StudentCode')) == str(student_code)]
        
        if start_date:
            filtered = [r for r in filtered if r.get('Date', '') >= start_date]
        
        if end_date:
            filtered = [r for r in filtered if r.get('Date', '') <= end_date]
        
        return filtered
    except Exception as e:
        print(f"Error fetching CICO daily: {e}")
        return []

def add_cico_daily(data: dict):
    ws = get_cico_daily_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        from datetime import datetime
        row = [
            data.get('date', datetime.now().strftime("%Y-%m-%d")),
            data.get('student_code'),
            data.get('target1', ''),
            data.get('target2', ''),
            data.get('achievement_rate', 0),
            data.get('memo', ''),
            data.get('entered_by', '')
        ]
        ws.append_row(row)
        return {"message": "CICO daily record added"}
    except Exception as e:
        print(f"Error adding CICO daily: {e}")
        return {"error": str(e)}

