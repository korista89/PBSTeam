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
    "6001", "6002", "6003", "6004", "6005", "6006"
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
            print("Creating 'TierStatus' worksheet with 210 students (5 tier columns)...")
            ws = sheet.add_worksheet(title="TierStatus", rows=220, cols=12)
            # Header row with 5 separate tier columns
            # Columns: 번호, 학급, 학생코드, 재학여부, BeAble코드, Tier1, Tier2(CICO), Tier2(SST), Tier3, Tier3+, 변경일, 메모
            all_data = [["번호", "학급", "학생코드", "재학여부", "BeAble코드", "Tier1", "Tier2(CICO)", "Tier2(SST)", "Tier3", "Tier3+", "변경일", "메모"]]
            for idx, code in enumerate(STUDENT_CODES):
                class_name = code_to_class_name(code)
                # Default: Tier1=O, all others=X
                all_data.append([idx + 1, class_name, code, "O", "", "O", "X", "X", "X", "X", "", ""])
            ws.update(all_data, 'A1')
            return ws
    except Exception as e:
        print(f"Error accessing TierStatus worksheet: {e}")
        return None



def reset_tier_status_sheet():
    """Delete and recreate TierStatus sheet with all 210 students (5 tier columns)"""
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Cannot access Google Sheets"}
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        
        # Try to delete existing TierStatus sheet
        try:
            old_ws = sheet.worksheet("TierStatus")
            sheet.del_worksheet(old_ws)
            print("Deleted old TierStatus worksheet")
        except gspread.WorksheetNotFound:
            print("No existing TierStatus worksheet to delete")
        
        # Create new sheet with 210 students and 12 columns
        print(f"Creating new TierStatus worksheet with {len(STUDENT_CODES)} students (5 tier columns)...")
        ws = sheet.add_worksheet(title="TierStatus", rows=220, cols=12)
        
        # Prepare all data at once for batch update
        # Columns: 번호, 학급, 학생코드, 재학여부, BeAble코드, Tier1, Tier2(CICO), Tier2(SST), Tier3, Tier3+, 변경일, 메모
        all_data = [["번호", "학급", "학생코드", "재학여부", "BeAble코드", "Tier1", "Tier2(CICO)", "Tier2(SST)", "Tier3", "Tier3+", "변경일", "메모"]]
        for idx, code in enumerate(STUDENT_CODES):
            class_name = code_to_class_name(code)
            # Default: Tier1=O, all others=X
            all_data.append([idx + 1, class_name, code, "O", "", "O", "X", "X", "X", "X", "", ""])
        
        # Batch update all rows at once
        ws.update(all_data, 'A1')
        
        return {"message": f"TierStatus sheet reset with {len(STUDENT_CODES)} students (5 tier columns)", "count": len(STUDENT_CODES)}
    except Exception as e:
        print(f"Error resetting TierStatus sheet: {e}")
        return {"error": str(e)}


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


def update_student_tier(code: str, tier_values: dict, memo: str = ""):
    """
    Update a student's tier status with 5 separate O/X columns.
    tier_values: dict with keys 'Tier1', 'Tier2(CICO)', 'Tier2(SST)', 'Tier3', 'Tier3+'
    Each value should be 'O' or 'X'
    """
    ws = get_student_status_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        records = ws.get_all_records()
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Column mapping (1-indexed)
        tier_columns = {
            'Tier1': 6,
            'Tier2(CICO)': 7,
            'Tier2(SST)': 8,
            'Tier3': 9,
            'Tier3+': 10,
        }
        
        for idx, r in enumerate(records):
            if str(r.get('학생코드')) == str(code):
                row_num = idx + 2  # +2 for header and 1-indexing
                
                # Update each tier column
                for tier_name, col_num in tier_columns.items():
                    if tier_name in tier_values:
                        value = "O" if tier_values[tier_name] in ["O", True, "true", 1] else "X"
                        ws.update_cell(row_num, col_num, value)
                
                # Update 변경일 (column 11)
                ws.update_cell(row_num, 11, today)
                
                # Update 메모 (column 12)
                if memo:
                    ws.update_cell(row_num, 12, memo)
                
                return {"message": f"Tier updated for {code}", "code": code, "tiers": tier_values}
        
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
                # Determine highest tier for this student
                tiers = []
                if r.get('Tier3+') == 'O': tiers.append('Tier3+')
                if r.get('Tier3') == 'O': tiers.append('Tier3')
                if r.get('Tier2(SST)') == 'O': tiers.append('Tier2(SST)')
                if r.get('Tier2(CICO)') == 'O': tiers.append('Tier2(CICO)')
                if r.get('Tier1') == 'O': tiers.append('Tier1')
                
                mapping[beable] = {
                    'student_code': student_code,
                    'class': r.get('학급', ''),
                    'tiers': tiers,
                    'tier1': r.get('Tier1', 'O'),
                    'tier2_cico': r.get('Tier2(CICO)', 'X'),
                    'tier2_sst': r.get('Tier2(SST)', 'X'),
                    'tier3': r.get('Tier3', 'X'),
                    'tier3_plus': r.get('Tier3+', 'X')
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


def get_student_dashboard_analysis(student_code: str):
    """
    Fetch monthly CICO analysis data from 'Tier2_대시보드' (Fast & Optimized).
    Returns a list of dicts: [{ "month": "3월", "rate": "80%" }, ...]
    And current status/team talk.
    """
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        # Fallback for dev - return empty if not connected
        return {"error": "Sheet not accessible"}
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        # Try to open "Tier2_대시보드"
        try:
            ws = sheet.worksheet("Tier2_대시보드")
        except gspread.WorksheetNotFound:
            return {"error": "Dashboard sheet not found"}
            
        # Fetch all values
        # Headers are in Row 5, Data starts Row 6
        rows = ws.get_all_values()
        
        # Find Student Row
        # Column D (index 3) is Student Code
        student_row = None
        for r in rows:
            if len(r) > 3 and str(r[3]).strip() == str(student_code).strip():
                student_row = r
                break
        
        if not student_row:
            return {"error": "Student not found in dashboard"}
            
        # Extract Monthly Data (Columns J to S -> Indices 9 to 18)
        months = ["3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
        history = []
        
        for i, month_name in enumerate(months):
            col_idx = 9 + i
            val = student_row[col_idx] if col_idx < len(student_row) else ""
            
            # Format value
            # It might be empty, "-", or a number (0.8 or "80%")
            if not val or val == "":
                formatted_rate = "-"
            else:
                formatted_rate = str(val)
                # If it's a raw float like 0.8, convert to 80%
                try:
                    f_val = float(val)
                    if 0 <= f_val <= 1:
                        formatted_rate = f"{int(f_val * 100)}%"
                    elif f_val > 1: # Already percent-like number e.g. 80
                         formatted_rate = f"{int(f_val)}%"
                except ValueError:
                    pass
            
            history.append({
                "month": month_name,
                "rate": formatted_rate
            })
            
        # Extract Text Data
        # Team Talk: Column U (Index 20)
        team_talk = student_row[20] if 20 < len(student_row) else ""
        
        return {
            "history": history,
            "team_talk": team_talk
        }

    except Exception as e:
        print(f"Error fetching dashboard analysis: {e}")
        return {"error": str(e)}

def initialize_dashboard_if_missing():
    """
    Checks if 'Tier2_대시보드' exists. If not, creates it and populates it.
    This mimics the Apps Script 'createDashboard' and 'loadTier2Data' behavior.
    """
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Sheet not accessible"}
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        
        try:
            ws = sheet.worksheet("Tier2_대시보드")
            # If exists, assume it's fine for now.
            return {"message": "Dashboard exists"}
        except gspread.WorksheetNotFound:
            pass # Create it
            
        print("Creating Tier2_대시보드...")
        # Add worksheet
        ws = sheet.add_worksheet(title="Tier2_대시보드", rows=1000, cols=26)
        
        # 1. Setup Headers & Formatting
        months = ["3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
        
        # Row 2: Month Config
        ws.update_acell("B2", "월 선택:")
        ws.update_acell("C2", "3월") # Default
        
        # Row 4: Title
        ws.update_acell("B4", "📋 Tier2 CICO 학생 통합 대시보드")
        
        # Row 5: Headers
        headers = ["번호", "학급", "학생코드", "목표행동", "목표행동 유형", "척도", "입력 기준", "현재 상태"]
        headers.extend(months)
        headers.extend(["연간 추세(Trend)", "팀 협의 내용", "비고"])
        
        # Update range B5:V5
        # 1-based index: B is col 2.
        # Starting Cell: (5, 2)
        # Ending Cell: (5, 2 + len(headers) - 1)
        
        end_col = 2 + len(headers) - 1
        ws.update(range_name=f"B5", values=[headers])
        
        # 2. Load Data from Monthly Sheets
        refresh_dashboard_data(sheet, ws)
        
        return {"message": "Dashboard created and populated"}

    except Exception as e:
        print(f"Error initializing dashboard: {e}")
        return {"error": str(e)}

def refresh_dashboard_data(sheet, dashboard_ws):
    # Mimic loadTier2Data
    # 1. Get Target Month
    try:
        target_month_str = dashboard_ws.acell("C2").value or "3월"
    except:
        target_month_str = "3월"
    
    # 2. Get Student History (Monthly Rates)
    months = ["3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
    student_history = {} # {code: [rate, rate, ...]}
    
    for i, m_name in enumerate(months):
        try:
            m_ws = sheet.worksheet(m_name)
            m_rows = m_ws.get_all_values()
            if len(m_rows) < 2: continue
            
            headers = m_rows[0]
            try: tier_idx = headers.index("Tier2")
            except: tier_idx = -1
            try: code_idx = headers.index("학생코드")
            except: code_idx = -1
            
            rate_idx = -1
            if "수행/발생률" in headers: rate_idx = headers.index("수행/발생률")
            elif "성취율" in headers: rate_idx = headers.index("성취율")
            
            if tier_idx != -1 and code_idx != -1 and rate_idx != -1:
                for row in m_rows[1:]:
                    if len(row) > max(tier_idx, code_idx, rate_idx):
                        code = str(row[code_idx]).strip()
                        is_tier2 = row[tier_idx]
                        rate = row[rate_idx]
                        
                        if is_tier2 == "O":
                            if code not in student_history:
                                student_history[code] = [""] * 10
                            student_history[code][i] = rate
        except gspread.WorksheetNotFound:
            continue
            
    # 3. Get Current Month Data & Merge
    try:
        t_ws = sheet.worksheet(target_month_str)
        t_rows = t_ws.get_all_values()
        
        output_rows = []
        if len(t_rows) > 1:
            t_headers = t_rows[0]
            try: team_idx = t_headers.index("팀 협의 내용")
            except: team_idx = -1
            
            for row in t_rows[1:]:
                # Check Tier2 column (Index 3 usually)
                if len(row) > 3 and row[3] == "O":
                    code = str(row[2]).strip()
                    # Basic Info: No, Class, Code, Target, Type, Scale, Standard, Status(CICO)
                    basic_info = [
                        row[0], row[1], row[2], 
                        row[4] if len(row)>4 else "", 
                        row[5] if len(row)>5 else "", 
                        row[6] if len(row)>6 else "", 
                        row[7] if len(row)>7 else "", 
                        "CICO" # Status
                    ]
                    
                    # History
                    history = student_history.get(code, [""] * 10)
                    
                    # Team Talk
                    team_talk = row[team_idx] if team_idx != -1 and len(row) > team_idx else ""
                    
                    # Full Row
                    full_row = basic_info + history + ["", team_talk, ""]
                    output_rows.append(full_row)
        
        # 4. Write to Dashboard (starting Row 6)
        if output_rows:
            dashboard_ws.update(range_name="B6", values=output_rows)
            print(f"Updated Dashboard with {len(output_rows)} rows.")
            
    except gspread.WorksheetNotFound:
        print(f"Target month sheet {target_month_str} not found.")

def initialize_monthly_sheets():
    """
    Creates monthly sheets (3월~12월) and populates them with roster from TierStatus.
    """
    client = get_sheets_client()
    if not client: return {"error": "Client error"}
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        
        # 1. Get Roster from TierStatus
        try:
            status_ws = sheet.worksheet("TierStatus")
            status_rows = status_ws.get_all_values()
        except gspread.WorksheetNotFound:
            return {"error": "TierStatus sheet not found"}
            
        # Parse Roster: [No, Class, Code, ..., Tier2(CICO), ...]
        students = []
        if len(status_rows) > 1:
            for r in status_rows[1:]:
                if len(r) > 2:
                    no = r[0]
                    cls = r[1]
                    code = r[2]
                    is_cico = "X"
                    # Tier2(CICO) is index 6
                    if len(r) > 6 and r[6] == "O":
                        is_cico = "O"
                    
                    students.append({
                        "no": no, "class": cls, "code": code, "cico": is_cico
                    })
        
        if not students:
            return {"error": "No students found in TierStatus"}
            
        print(f"Found {len(students)} students in TierStatus.")

        # 2. Create/Update Monthly Sheets
        months = ["3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
        
        for m_name in months: # Using strings directly
            try:
                ws = sheet.worksheet(m_name)
                # If exists, skip to avoid overwrite
                continue 
            except gspread.WorksheetNotFound:
                print(f"Creating {m_name}...")
                ws = sheet.add_worksheet(title=m_name, rows=1000, cols=45)
            
            # Setup Headers
            days = [str(d) for d in range(1, 32)]
            headers = ["번호", "학급", "학생코드", "Tier2", "목표행동", "목표행동 유형", "척도", "입력 기준", "목표 달성 기준"]
            headers.extend(days)
            headers.extend(["수행/발생률", "성취도(추세)", "교사메모", "입력자", "목표 달성 여부", "팀 협의 내용", "차월 대상여부"])
            
            ws.update(range_name="A1", values=[headers])
            
            # Write Students
            rows_to_write = []
            for s in students:
                row = [
                    s['no'], s['class'], s['code'], s['cico'], 
                    "", "증가 목표행동", "O/X(발생)", "", "80% 이상" # Defaults
                ]
                # Pad for days (31)
                row.extend([""] * 31)
                # Pad for stats
                row.extend(["-", "", "", "", "-", "", ""])
                rows_to_write.append(row)
                
            if rows_to_write:
                ws.update(range_name="A2", values=rows_to_write)
            
            print(f"Initialized {m_name}")

        return {"message": "Monthly sheets initialized"}

    except Exception as e:
        print(f"Error initializing monthly sheets: {e}")
        return {"error": str(e)}
