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
# Student Status (Tier Tracking) Worksheet - REDESIGNED
# Columns: 번호, 학급, 학생코드, 재학여부, BeAble코드, 현재Tier, 변경일, 메모
# =============================

# 210 fixed student codes
STUDENT_CODES = [
    "1011", "1012", "1013", "1014", "1021", "1022", "1023", "1024",
    "2111", "2112", "2113", "2114", "2115", "2116", "2121", "2122", "2123", "2124", "2125", "2126",
    "2211", "2212", "2213", "2214", "2215", "2216", "2221", "2222", "2223", "2224", "2225", "2226",
    "2311", "2312", "2313", "2314", "2315", "2316", "2411", "2412", "2413", "2414", "2415", "2416",
    "2421", "2422", "2423", "2424", "2425", "2426", "2511", "2512", "2513", "2514", "2515", "2516",
    "2521", "2522", "2523", "2524", "2525", "2526", "2611", "2612", "2613", "2614", "2615", "2616",
    "2621", "2622", "2623", "2624", "2625", "2626",
    "3111", "3112", "3113", "3114", "3115", "3116", "3121", "3122", "3123", "3124", "3125", "3126",
    "3211", "3212", "3213", "3214", "3215", "3216", "3221", "3222", "3223", "3224", "3225", "3226",
    "3311", "3312", "3313", "3314", "3315", "3316", "3321", "3322", "3323", "3324", "3325", "3326",
    "3401", "3402", "3403", "3404", "3405",
    "4111", "4112", "4113", "4114", "4115", "4116", "4117", "4121", "4122", "4123", "4124", "4125", "4126", "4127",
    "4211", "4212", "4213", "4214", "4215", "4216", "4217", "4221", "4222", "4223", "4224", "4225", "4226", "4227",
    "4311", "4312", "4313", "4314", "4315", "4316", "4317", "4321", "4322", "4323", "4324", "4325", "4326", "4327",
    "4401", "4402", "4403", "4404", "4405",
    "5111", "5112", "5113", "5114", "5115", "5116", "5117", "5121", "5122", "5123", "5124", "5125", "5126", "5127",
    "5131", "5132", "5133", "5134", "5135", "5136", "5137",
    "5211", "5212", "5213", "5214", "5215", "5216", "5217", "5221", "5222", "5223", "5224", "5225", "5226", "5227",
    "5231", "5232", "5233", "5234", "5235", "5236", "5237",
    "6001", "6002", "6003", "6004", "6005"
]

def code_to_class_name(code: str) -> str:
    """Convert 4-digit student code to class name"""
    if len(code) != 4:
        return ""
    
    course = code[0]  # 천의 자리: 과정
    grade = code[1]   # 백의 자리: 학년
    cls = code[2]     # 십의 자리: 반
    
    course_names = {
        "1": "유치원",
        "2": "초등",
        "3": "중학교",
        "4": "고등",
        "5": "전공과",
        "6": "예비"
    }
    
    # Special cases for visiting classes
    if code[:2] == "34":
        return "중학교 순회학급"
    if code[:2] == "44":
        return "고등 순회학급"
    if code[0] == "6":
        return "예비"
    
    course_name = course_names.get(course, "")
    return f"{course_name} {grade}학년 {cls}반"


def get_student_status_worksheet():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return None
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        try:
            return sheet.worksheet("TierStatus")
        except gspread.WorksheetNotFound:
            print("Creating 'TierStatus' worksheet with 210 students...")
            ws = sheet.add_worksheet(title="TierStatus", rows=220, cols=8)
            # Header row
            ws.append_row(["번호", "학급", "학생코드", "재학여부", "BeAble코드", "현재Tier", "변경일", "메모"])
            # Initialize 210 students
            for idx, code in enumerate(STUDENT_CODES):
                class_name = code_to_class_name(code)
                ws.append_row([idx + 1, class_name, code, "O", "", "Tier 1", "", ""])
            return ws
    except Exception as e:
        print(f"Error accessing TierStatus worksheet: {e}")
        return None


def fetch_student_status():
    """Fetch all student tier status records"""
    ws = get_student_status_worksheet()
    if not ws:
        return []
    
    try:
        records = ws.get_all_records()
        # Add row_index for updates
        for idx, record in enumerate(records):
            record['row_index'] = idx + 2  # +2 for header and 1-indexing
        return records
    except Exception as e:
        print(f"Error fetching status: {e}")
        return []


def update_student_tier(code: str, new_tier: str, memo: str = ""):
    """Update a student's tier status"""
    ws = get_student_status_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        records = ws.get_all_records()
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        for idx, r in enumerate(records):
            if str(r.get('학생코드')) == str(code):
                row_num = idx + 2  # +2 for header and 1-indexing
                ws.update_cell(row_num, 6, new_tier)    # Column 6: 현재Tier
                ws.update_cell(row_num, 7, today)       # Column 7: 변경일
                if memo:
                    ws.update_cell(row_num, 8, memo)    # Column 8: 메모
                return {"message": f"Tier updated to {new_tier}", "code": code}
        
        return {"error": f"Student code {code} not found"}
    except Exception as e:
        print(f"Error updating tier: {e}")
        return {"error": str(e)}


def update_student_enrollment(code: str, enrolled: str):
    """Update student enrollment status (O/X)"""
    ws = get_student_status_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        records = ws.get_all_records()
        for idx, r in enumerate(records):
            if str(r.get('학생코드')) == str(code):
                row_num = idx + 2
                ws.update_cell(row_num, 4, enrolled)  # Column 4: 재학여부
                return {"message": f"Enrollment updated to {enrolled}"}
        return {"error": f"Student code {code} not found"}
    except Exception as e:
        return {"error": str(e)}


def update_student_beable_code(code: str, beable_code: str):
    """Update student's BeAble code for data linking"""
    ws = get_student_status_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        records = ws.get_all_records()
        for idx, r in enumerate(records):
            if str(r.get('학생코드')) == str(code):
                row_num = idx + 2
                ws.update_cell(row_num, 5, beable_code)  # Column 5: BeAble코드
                return {"message": f"BeAble code updated to {beable_code}"}
        return {"error": f"Student code {code} not found"}
    except Exception as e:
        return {"error": str(e)}


def get_beable_code_mapping():
    """Get mapping of BeAble codes to student codes for data analysis"""
    ws = get_student_status_worksheet()
    if not ws:
        return {}
    
    try:
        records = ws.get_all_records()
        mapping = {}
        for r in records:
            beable = str(r.get('BeAble코드', '')).strip()
            student_code = str(r.get('학생코드', '')).strip()
            enrolled = str(r.get('재학여부', 'O')).strip()
            
            # Only include enrolled students with BeAble codes
            if beable and enrolled == 'O':
                mapping[beable] = {
                    'student_code': student_code,
                    'class': r.get('학급', ''),
                    'tier': r.get('현재Tier', 'Tier 1')
                }
        return mapping
    except Exception as e:
        print(f"Error getting BeAble mapping: {e}")
        return {}


def get_enrolled_student_count():
    """Get count of enrolled students (재학여부 = O)"""
    ws = get_student_status_worksheet()
    if not ws:
        return 0
    
    try:
        records = ws.get_all_records()
        return sum(1 for r in records if str(r.get('재학여부', 'O')).strip() == 'O')
    except Exception as e:
        return 0


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

