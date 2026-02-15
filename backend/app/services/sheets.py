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
        # Fix: Use explicit "BehaviorLogs" sheet for 2-way sync
        try:
            return sheet.worksheet("BehaviorLogs")
        except gspread.WorksheetNotFound:
            # Fallback creation if not exists (should be handled by setup script but good for safety)
            print("Creating 'BehaviorLogs' worksheet...")
            headers = ["행동발생 날짜", "시간대", "장소", "강도", "행동유형", "기능", "배경", "결과", "학생명", "학생코드", "코드번호", "입력자", "입력일", "비고"]
            ws = sheet.add_worksheet(title="BehaviorLogs", rows=1000, cols=20)
            ws.append_row(headers)
            return ws
    except Exception as e:
        print(f"Error connecting to sheet: {e}")
        return None

import time

# Simple in-memory cache
_cache = {
    "records": {"data": [], "timestamp": 0},
    "users": {"data": [], "timestamp": 0},
    "board": {"data": [], "timestamp": 0}
}
CACHE_TTL = 10  # 10 seconds for near real-time

def clear_cache(key: str = None):
    if key and key in _cache:
        _cache[key] = {"data": [], "timestamp": 0}
    elif key is None:
        for k in _cache:
            _cache[k] = {"data": [], "timestamp": 0}

def fetch_all_records(force_refresh: bool = False):
    global _cache
    now = time.time()
    
    if not force_refresh and _cache["records"]["data"] and (now - _cache["records"]["timestamp"] < CACHE_TTL):
        return _cache["records"]["data"]

    worksheet = get_main_worksheet()
    if not worksheet:
        return []
    
    try:
        all_values = worksheet.get_all_records()
        _cache["records"] = {"data": all_values, "timestamp": now}
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

def fetch_all_users():
    global _cache
    now = time.time()
    
    # Check cache
    if _cache["users"]["data"] and (now - _cache["users"]["timestamp"] < CACHE_TTL):
        return _cache["users"]["data"]

    ws = get_users_worksheet()
    if not ws:
        return []
    
    try:
        records = ws.get_all_records()
        _cache["users"] = {"data": records, "timestamp": now}
        return records
    except Exception as e:
        print(f"Error fetching users: {e}")
        return []

def get_user_by_id(user_id: str):
    users = fetch_all_users()
    for r in users:
        if str(r.get('ID')) == str(user_id):
            return r
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
                clear_cache("users")
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

def get_unique_class_info() -> dict:
    """
    Extract unique class IDs and Names from STUDENT_CODES.
    Returns dict: { '211': '초등 1학년 1반', ... }
    Class ID is the first 3 digits of student code (e.g. 2111 -> 211)
    """
    classes = {}
    for code in STUDENT_CODES:
        if len(code) < 3: continue
        
        # Determine Class ID (Provisional: first 3 digits)
        # For special classes (34xx, 44xx), we still use first 3 distinct digits if they distinguish classes
        # 3401 -> 340 (Visiting)
        class_id = code[:3]
        class_name = code_to_class_name(code)
        
        if class_id not in classes:
            classes[class_id] = class_name
            
    return classes



def _generate_teacher_id(class_name: str) -> str:
    """
    Generate Korean ID from class name.
    Ex: "초등 1학년 1반" -> "초1-1관리자"
        "유치원 1반" -> "유1관리자" (Grade is often integrated or 0)
        "중학교 1학년 1반" -> "중1-1관리자"
        "고등 3학년 1반" -> "고3-1관리자"
        "전공과 1학년 1반" -> "전1-1관리자"
    """
    try:
        if "유치원" in class_name:
            # "유치원 1반" -> extract numbers
            parts = class_name.split()
            # Find class num
            cls_num = parts[-1].replace("반", "")
            return f"유{cls_num}관리자"
        
        prefix_map = {
            "초등": "초", "중학교": "중", "고등": "고", "전공과": "전", "예비": "예비"
        }
        
        # Standard format: "Process Grade학년 Class반"
        # "초등 1학년 1반" -> ["초등", "1학년", "1반"]
        parts = class_name.split()
        if len(parts) >= 3:
            process = parts[0]
            grade = parts[1].replace("학년", "")
            cls = parts[2].replace("반", "")
            
            p_char = prefix_map.get(process, process[0])
            return f"{p_char}{grade}-{cls}관리자"
            
        return class_name.replace(" ", "") + "관리자"
    except:
        return class_name + "관리자"

def reset_users_sheet():
    """
    Re-initialize Users sheet.
    Admin: admin (System Admin)
    Teachers: Korean Style IDs (e.g., 초1-1관리자)
    """
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Cannot access Google Sheets"}
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        
        # Delete old if exists
        try:
            old_ws = sheet.worksheet("Users")
            sheet.del_worksheet(old_ws)
        except gspread.WorksheetNotFound:
            pass
            
        print("Creating new 'Users' worksheet...")
        ws = sheet.add_worksheet(title="Users", rows=150, cols=6)
        ws.append_row(["ID", "Password", "Role", "LastLogin", "ClassID", "ClassName"])
        
        all_rows = []
        
        # 1. System Admin
        all_rows.append(["admin", "admin123", "admin", "", "", "전체관리자"])
            
        # 2. Class Teachers
        class_info = get_unique_class_info()
        sorted_ids = sorted(class_info.keys())
        
        for cid in sorted_ids:
            cname = class_info[cid]
            korean_id = _generate_teacher_id(cname)
            all_rows.append([korean_id, "teacher123", "class_teacher", "", cid, cname])
            
        ws.update(all_rows, 'A2')
        clear_cache("users")
        return {"message": f"Users sheet reset. {len(all_rows)} users created. (Admin: 'admin', Teachers: '초1-1관리자' style)"}
    except Exception as e:
        print(f"Error resetting Users sheet: {e}")
        return {"error": str(e)}


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
            # Ensure student code is string
            if '학생코드' in record:
                record['학생코드'] = str(record['학생코드'])
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


def update_student_tier_unified(code: str, tier_values: dict, enrolled: str = None, beable_code: str = None, memo: str = ""):
    """
    Unified update: tier status + enrollment + beable code in a single batch.
    Reduces Google Sheets API calls from 3 separate requests to 1 batch.
    """
    ws = get_student_status_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        records = ws.get_all_records()
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        tier_columns = {
            'Tier1': 6,
            'Tier2(CICO)': 7,
            'Tier2(SST)': 8,
            'Tier3': 9,
            'Tier3+': 10,
        }
        
        for idx, r in enumerate(records):
            if str(r.get('학생코드')) == str(code):
                row_num = idx + 2
                
                # Build batch update
                batch_updates = []
                
                # Update tier columns
                for tier_name, col_num in tier_columns.items():
                    if tier_name in tier_values:
                        value = "O" if tier_values[tier_name] in ["O", True, "true", 1] else "X"
                        batch_updates.append({
                            "range": f"{_col_letter(col_num)}{row_num}",
                            "values": [[value]]
                        })
                
                # Update enrollment (column 4)
                if enrolled is not None:
                    batch_updates.append({
                        "range": f"D{row_num}",
                        "values": [[enrolled]]
                    })
                
                # Update BeAble code (column 5)
                if beable_code is not None:
                    batch_updates.append({
                        "range": f"E{row_num}",
                        "values": [[beable_code]]
                    })
                
                # Update 변경일 (column 11)
                batch_updates.append({
                    "range": f"K{row_num}",
                    "values": [[today]]
                })
                
                # Update 메모 (column 12)
                if memo:
                    batch_updates.append({
                        "range": f"L{row_num}",
                        "values": [[memo]]
                    })
                
                # Execute batch update
                if batch_updates:
                    ws.batch_update(batch_updates)
                
                return {"message": f"Student {code} updated successfully", "code": code}
        
        return {"error": f"Student code {code} not found"}
    except Exception as e:
        print(f"Error in unified update: {e}")
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
        date_str = data.get('date', datetime.now().strftime("%Y-%m-%d"))
        row = [
            date_str,
            data.get('student_code'),
            data.get('target1', ''),
            data.get('target2', ''),
            data.get('achievement_rate', 0),
            data.get('memo', ''),
            data.get('entered_by', '')
        ]
        ws.append_row(row)
        
        # Trigger recalculation
        try:
            sync_result = sync_daily_entry_to_monthly(
                student_code=str(data.get('student_code')),
                date_str=date_str,
                target1=data.get('target1', ''),
                target2=data.get('target2', '')
            )
            print(f"DEBUG: Sync result: {sync_result}")
        except Exception as e:
            print(f"DEBUG: Failed to sync to monthly sheet: {e}")

        return {"message": "CICO daily record added"}
    except Exception as e:
        print(f"Error adding CICO daily: {e}")
        return {"error": str(e)}

def sync_daily_entry_to_monthly(student_code: str, date_str: str, target1: str, target2: str):
    """
    Update the corresponding cell in the monthly sheet based on daily input.
    """
    try:
        month = int(date_str.split("-")[1])
        day = int(date_str.split("-")[2])
        
        # Determine Daily Outcome (O/X) for the cell
        # Logic: If both O -> O? Or if valid data exists?
        # The user said "Rate calculation not working".
        # We need to mark the day as something to count it.
        
        t1 = target1.upper() == 'O'
        t2 = target2.upper() == 'O'
        
        daily_val = ""
        # If at least one target is present
        if target1 or target2:
            daily_val = "O" if (t1 and t2) else "X"
            if not target2 and target1: daily_val = target1.upper()
            if not target1 and target2: daily_val = target2.upper()
        
        if not daily_val:
            return {"message": "No targets to sync"}

        # Now update monthly sheet
        updates = [{
            "row": None, # Will be found by student_code
            "col": str(day),
            "value": daily_val
        }]
        
        print(f"DEBUG: Syncing Daily {date_str} for {student_code} -> {daily_val}")
        return update_monthly_cico_cells(month, updates, student_code_override=student_code)
        
    except Exception as e:
        print(f"DEBUG: Sync Error: {e}")
        return {"error": str(e)}


def update_user_role(user_id: str, new_role: str, new_class: str = ""):
    """Update user role and class in Users sheet"""
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Sheet not available"}
        
    try:
        sh = client.open_by_url(settings.SHEET_URL)
        ws = sh.worksheet("Users")
        records = ws.get_all_records()
        
        cell = ws.find(user_id)
        if not cell:
            return {"error": "User not found"}
            
        # Headers: ID, Password, Role, ClassID, ClassName, Name, LastLogin
        # We need to find column indices for Role and ClassID
        headers = ws.row_values(1)
        role_col = headers.index("Role") + 1
        class_id_col = headers.index("ClassID") + 1
        class_name_col = headers.index("ClassName") + 1
        
        ws.update_cell(cell.row, role_col, new_role)
        ws.update_cell(cell.row, class_id_col, new_class)
        ws.update_cell(cell.row, class_name_col, new_class) # Use ID as Name for simplicity or lookup
        
        clear_cache("users")
        return {"message": f"User {user_id} updated"}
    except Exception as e:
        return {"error": str(e)}



# =============================
# Meeting Notes Worksheet
# =============================
def get_meeting_notes_worksheet():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return None
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        try:
            return sheet.worksheet("MeetingNotes")
        except gspread.WorksheetNotFound:
            print("Creating 'MeetingNotes' worksheet...")
            ws = sheet.add_worksheet(title="MeetingNotes", rows=500, cols=8)
            # Headers including StudentCode for individual consultation logs
            ws.append_row(["Date", "MeetingType", "Content", "Author", "CreatedAt", "StudentCode", "PeriodStart", "PeriodEnd"])
            return ws
    except Exception as e:
        print(f"Error accessing MeetingNotes worksheet: {e}")
        return None

def fetch_meeting_notes(meeting_type: str = None, student_code: str = None):
    ws = get_meeting_notes_worksheet()
    if not ws:
        return []
    
    try:
        records = ws.get_all_records()
        # sort by CreatedAt desc
        valid_records = []
        for r in records:
            # Filter by meeting_type if provided
            if meeting_type and str(r.get('MeetingType')) != str(meeting_type):
                continue
            # Filter by student_code if provided
            if student_code and str(r.get('StudentCode')) != str(student_code):
                continue
            
            valid_records.append({
                "id": str(r.get('CreatedAt')), # Use CreatedAt as ID for now
                "date": r.get('Date'),
                "meeting_type": r.get('MeetingType'),
                "content": r.get('Content'),
                "author": r.get('Author'),
                "created_at": r.get('CreatedAt'),
                "student_code": r.get('StudentCode', ''),
                "period_start": r.get('PeriodStart', ''),
                "period_end": r.get('PeriodEnd', '')
            })
            
        # Sort descending by CreatedAt
        valid_records.sort(key=lambda x: x['created_at'], reverse=True)
        return valid_records
    except Exception as e:
        print(f"Error fetching meeting notes: {e}")
        return []

def add_meeting_note(data: dict):
    ws = get_meeting_notes_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        from datetime import datetime
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        row = [
            data.get('date', datetime.now().strftime("%Y-%m-%d")),
            data.get('meeting_type', 'tier1'),
            data.get('content', ''),
            data.get('author', ''),
            created_at,
            data.get('student_code', ''),
            data.get('period_start', ''),
            data.get('period_end', '')
        ]
        print(f"DEBUG: Appending meeting note: {row}")
        ws.append_row(row)
        clear_cache("meeting_notes") # Invalidate cache
        print("DEBUG: Meeting note added successfully")
        return {"message": "Meeting note added", "created_at": created_at}
    except Exception as e:
        print(f"Error adding meeting note: {e}")
        return {"error": str(e)}


# =============================
# CICO Monthly Grid APIs
# =============================

def get_holidays_from_config():
    """Get holidays list from '날짜 관리' sheet (fallback to '설정(Config)')"""
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return []
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        
        # Try '날짜 관리' sheet first
        config_ws = None
        try:
            config_ws = sheet.worksheet("날짜 관리")
        except gspread.WorksheetNotFound:
            # Create '날짜 관리' sheet with instructions
            try:
                config_ws = sheet.add_worksheet(title="날짜 관리", rows=100, cols=3)
                config_ws.update('A1', [
                    ["공휴일 날짜 (YYYY-MM-DD)", "공휴일 이름", "비고"],
                    ["※ 아래에 공휴일을 입력하세요", "", ""],
                ])
                print("Created '날짜 관리' sheet")
            except Exception as create_err:
                print(f"Error creating 날짜 관리 sheet: {create_err}")
                # Fallback to 설정(Config)
                try:
                    config_ws = sheet.worksheet("설정(Config)")
                except gspread.WorksheetNotFound:
                    return []
        
        if not config_ws:
            return []
        
        raw = config_ws.col_values(1)  # Column A = holiday dates
        holidays = []
        for val in raw[2:]:  # Skip header rows
            val = str(val).strip()
            if val and not val.startswith("※"):
                holidays.append(val)
        return holidays
    except Exception as e:
        print(f"Error getting holidays: {e}")
        return []


def get_business_days(year: int, month: int, holidays: list = None):
    """Get list of business day strings (MM-DD) for a given month, excluding weekends and holidays."""
    import datetime
    if holidays is None:
        holidays = []
    
    # Normalize holidays to support both YYYY-MM-DD and MM-DD formats
    holiday_full = set()
    holiday_short = set()
    for h in holidays:
        h = h.strip()
        if len(h) == 10:  # YYYY-MM-DD
            holiday_full.add(h)
            holiday_short.add(h[5:])  # MM-DD
        elif len(h) == 5:  # MM-DD
            holiday_short.add(h)
    
    dates = []
    
    try:
        d = datetime.date(year, month, 1)
    except ValueError:
        return []
    
    while d.month == month:
        day_of_week = d.weekday()  # 0=Mon, 5=Sat, 6=Sun
        date_str = d.strftime("%Y-%m-%d")
        short_date = d.strftime("%m-%d")
        
        if day_of_week < 5 and date_str not in holiday_full and short_date not in holiday_short:
            dates.append(short_date)
        
        d += datetime.timedelta(days=1)
    
    return dates


def _calculate_cico_rate(student: dict) -> dict:
    """
    Calculate 수행/발생률 and 달성여부 from daily input data.
    Supports multiple scale types: O/X, 0/1/2점, 0~5, 0~7교시, 회/분.
    Handles both 증가(increase) and 감소(decrease) target behaviors.
    """
    days = student.get("days", {})
    scale = student.get("척도", "O/X(발생)")
    behavior_type = student.get("목표행동 유형", "증가 목표행동")
    goal_criteria = student.get("목표 달성 기준", "80% 이상")
    
    # Collect non-empty day values
    filled_values = []
    for day_label, val in days.items():
        val = str(val).strip()
        if val and val != "-" and val != "·":
            filled_values.append(val)
    
    if not filled_values:
        return {"rate_str": "-", "achieved": "-", "rate_num": None, "input_days": 0, "total_days": len(days)}
    
    input_days = len(filled_values)
    total_days = len(days)
    
    # Calculate rate based on scale type
    rate_num = None
    
    if scale == "O/X(발생)":
        # Count O's and X's
        o_count = sum(1 for v in filled_values if v.upper() == "O")
        total = len(filled_values)
        if total > 0:
            if behavior_type == "증가 목표행동":
                # O = success for increase targets
                rate_num = (o_count / total) * 100
            else:
                # X = success for decrease targets (no occurrence)
                x_count = total - o_count
                rate_num = (x_count / total) * 100
    
    elif scale == "0점/1점/2점":
        # Max per entry = 2
        total_score = 0
        count = 0
        for v in filled_values:
            try:
                s = float(v)
                total_score += s
                count += 1
            except (ValueError, TypeError):
                continue
        if count > 0:
            max_possible = count * 2
            if behavior_type == "증가 목표행동":
                rate_num = (total_score / max_possible) * 100
            else:
                rate_num = ((max_possible - total_score) / max_possible) * 100
    
    elif scale == "0~5":
        total_score = 0
        count = 0
        for v in filled_values:
            try:
                s = float(v)
                total_score += s
                count += 1
            except (ValueError, TypeError):
                continue
        if count > 0:
            max_possible = count * 5
            if behavior_type == "증가 목표행동":
                rate_num = (total_score / max_possible) * 100
            else:
                rate_num = ((max_possible - total_score) / max_possible) * 100
    
    elif scale == "0~7교시":
        total_score = 0
        count = 0
        for v in filled_values:
            try:
                s = float(v)
                total_score += s
                count += 1
            except (ValueError, TypeError):
                continue
        if count > 0:
            max_possible = count * 7
            if behavior_type == "증가 목표행동":
                rate_num = (total_score / max_possible) * 100
            else:
                rate_num = ((max_possible - total_score) / max_possible) * 100
    
    else:
        # Free input (1~100회 or 1~100분) — use average directly as rate
        total_score = 0
        count = 0
        for v in filled_values:
            try:
                s = float(v)
                total_score += s
                count += 1
            except (ValueError, TypeError):
                continue
        if count > 0:
            avg = total_score / count
            rate_num = avg  # The average IS the rate for free-input scales
    
    # Format rate string
    if rate_num is not None:
        rate_str = f"{round(rate_num)}%"
    else:
        rate_str = "-"
    
    # Determine achievement (달성 여부)
    achieved = "-"
    if rate_num is not None and goal_criteria:
        # Parse goal criteria: "80% 이상", "20% 이하", etc.
        try:
            goal_str = goal_criteria.replace("%", "").replace("이상", "").replace("이하", "").strip()
            goal_val = float(goal_str)
            
            if "이하" in goal_criteria:
                achieved = "O" if rate_num <= goal_val else "X"
            else:  # 이상 (default)
                achieved = "O" if rate_num >= goal_val else "X"
        except (ValueError, TypeError):
            achieved = "-"
    
    return {
        "rate_str": rate_str,
        "achieved": achieved,
        "rate_num": round(rate_num, 1) if rate_num is not None else None,
        "input_days": input_days,
        "total_days": total_days
    }



def create_monthly_cico_sheet(year: int, month: int):
    """
    Create a new monthly CICO sheet with dropdowns and student data from TierStatus.
    """
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Sheet not available"}
        
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        month_name = f"{month}월"
        
        # Check if exists
        try:
            ws = sheet.worksheet(month_name)
            return {"message": f"Sheet '{month_name}' already exists.", "exists": True}
        except gspread.WorksheetNotFound:
            pass
            
        # 1. Fetch CICO Students (Tier2(CICO) == 'O')
        status_records = fetch_student_status()
        cico_students = [s for s in status_records if s.get('Tier2(CICO)') == 'O']
        
        if not cico_students:
            return {"error": "No students marked for CICO in TierStatus."}
            
        # 2. Prepare Rows
        # Fixed cols: 15
        fixed_headers = ["번호", "학급", "학생코드", "Tier2", "목표행동", "목표행동 유형", "척도", "입력 기준", "목표 달성 기준", "수행/발생률", "목표 달성 여부", "교사메모", "입력자", "팀 협의 내용", "차월 대상여부"]
        
        # Day cols
        import calendar
        num_days = calendar.monthrange(year, month)[1]
        day_headers = [str(d) for d in range(1, num_days + 1)]
        
        headers = fixed_headers + day_headers
        
        rows = [headers]
        
        for s in cico_students:
            row = [
                s.get('번호', ''),
                s.get('학급', ''),
                s.get('학생코드', ''),
                "O", # Tier2
                "", # Target Behavior
                "증가 목표행동", # Type
                "0/1/2점", # Scale
                "", # Input Criteria
                "80% 이상", # Goal Criteria
                "", # Rate
                "", # Achieved
                "", # Memo
                "", # Entered By
                "", # Team Discussion
                ""  # Next Month
            ]
            # Add empty days make sure length matches
            row += [""] * num_days
            rows.append(row)
            
        # 3. Create Sheet
        ws = sheet.add_worksheet(title=month_name, rows=len(rows)+20, cols=len(headers)+5)
        ws.update(rows)
        
        # 4. Add Dropdowns (Data Validation) - DISABLED due to import error
        # try:
        #      # Requires gspread-formatting
        #      # pip install gspread-formatting
        #      from gspread_formatting import DataValidationRule, ConditionType, set_data_validation_for_cell_range
        #      
        #      start_row = 2
        #      end_row = len(rows)
        #      
        #      # ... (Disabled) ...
        #      
        # except Exception as e:
        #     print(f"Warning: Failed to set data validation: {e}")
        #     import traceback
        #     traceback.print_exc()
        
        return {"message": f"Created sheet '{month_name}' with {len(cico_students)} students."}
        
    except Exception as e:
        return {"error": str(e)}


def get_monthly_cico_data(month: int):
    """
    Get all student data from a monthly sheet for the CICO grid view.
    Returns structured data with headers, students, and day columns.
    """
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Sheet not accessible"}
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        month_name = f"{month}월"
        
        try:
            ws = sheet.worksheet(month_name)
        except gspread.WorksheetNotFound:
            return {"error": f"'{month_name}' 시트가 없습니다."}
        
        all_values = ws.get_all_values()
        if not all_values:
            return {"error": "Empty sheet"}
        
        headers = all_values[0]
        
        # Find key column indices
        col_map = {}
        key_cols = ["번호", "학급", "학생코드", "Tier2", "목표행동", "목표행동 유형", "척도", "입력 기준", "목표 달성 기준", "수행/발생률", "목표 달성 여부", "교사메모", "입력자", "팀 협의 내용", "차월 대상여부"]
        for col_name in key_cols:
            if col_name in headers:
                col_map[col_name] = headers.index(col_name)
        
        # Find day columns (columns between "목표 달성 기준" and "수행/발생률")
        goal_criteria_idx = col_map.get("목표 달성 기준", 8)
        rate_idx = col_map.get("수행/발생률", -1)
        
        day_columns = []
        if rate_idx > goal_criteria_idx + 1:
            for i in range(goal_criteria_idx + 1, rate_idx):
                day_columns.append({
                    "index": i,
                    "label": headers[i] if i < len(headers) else str(i)
                })
        
        # Build student rows (only Tier2='O')
        students = []
        tier2_idx = col_map.get("Tier2", 3)
        
        for row_idx, row in enumerate(all_values[1:], start=2):  # row_idx = sheet row (1-based)
            if len(row) <= tier2_idx:
                continue
            
            is_tier2 = str(row[tier2_idx]).strip()
            
            student = {
                "row": row_idx,
                "번호": row[col_map.get("번호", 0)] if col_map.get("번호", 0) < len(row) else "",
                "학급": row[col_map.get("학급", 1)] if col_map.get("학급", 1) < len(row) else "",
                "학생코드": row[col_map.get("학생코드", 2)] if col_map.get("학생코드", 2) < len(row) else "",
                "Tier2": is_tier2,
                "목표행동": row[col_map.get("목표행동", 4)] if col_map.get("목표행동", 4) < len(row) else "",
                "목표행동 유형": row[col_map.get("목표행동 유형", 5)] if col_map.get("목표행동 유형", 5) < len(row) else "",
                "척도": row[col_map.get("척도", 6)] if col_map.get("척도", 6) < len(row) else "",
                "입력 기준": row[col_map.get("입력 기준", 7)] if col_map.get("입력 기준", 7) < len(row) else "",
                "목표 달성 기준": row[col_map.get("목표 달성 기준", 8)] if col_map.get("목표 달성 기준", 8) < len(row) else "",
                "수행_발생률": row[col_map.get("수행/발생률", -1)] if col_map.get("수행/발생률", -1) >= 0 and col_map.get("수행/발생률", -1) < len(row) else "",
                "목표_달성_여부": row[col_map.get("목표 달성 여부", -1)] if col_map.get("목표 달성 여부", -1) >= 0 and col_map.get("목표 달성 여부", -1) < len(row) else "",
                "days": {}
            }
            
            # Fill day values
            for dc in day_columns:
                idx = dc["index"]
                val = row[idx] if idx < len(row) else ""
                student["days"][dc["label"]] = val
            
            # ===== Auto-calculate 수행/발생률 and 달성 여부 =====
            calc_result = _calculate_cico_rate(student)
            student["수행_발생률"] = calc_result["rate_str"]
            student["목표_달성_여부"] = calc_result["achieved"]
            student["rate_num"] = calc_result["rate_num"]
            student["input_days"] = calc_result["input_days"]
            student["total_days"] = calc_result["total_days"]
            
            if is_tier2 == "O":
                students.append(student)
        
        return {
            "month": month_name,
            "day_columns": [dc["label"] for dc in day_columns],
            "students": students,
            "col_map": {k: v for k, v in col_map.items()}
        }
    
    except Exception as e:
        print(f"Error getting monthly CICO data: {e}")
        return {"error": str(e)}


def update_monthly_cico_cells(month: int, updates: list, student_code_override: str = None):
    """
    Batch update cells in a monthly sheet.
    updates = [{"row": 5, "col": 12, "value": "O"}, ...]
    col can be a column index (1-based) or a header name.
    """
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Sheet not accessible"}
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        month_name = f"{month}월"
        
        try:
            ws = sheet.worksheet(month_name)
        except gspread.WorksheetNotFound:
            return {"error": f"'{month_name}' 시트가 없습니다."}
        
        headers = ws.row_values(1)
        all_values = ws.get_all_values() 
        
        # Determine student_code column index for override lookup
        # Look for "학생코드", "Student Code", "Code"
        code_col_idx = -1
        for idx, h in enumerate(headers):
            if "학생코드" in str(h) or "Code" in str(h):
                code_col_idx = idx # 0-based
                break
        
        # Build batch update
        cells_to_update = []
        rows_to_recalc = set()

        for u in updates:
            row = u.get("row")
            col = u.get("col")
            value = u.get("value", "")
            
            # If row is None, try to find by student_code_override
            if row is None and student_code_override and code_col_idx != -1:
                # Search for student code in the code column
                found_row = -1
                for r_idx, r_val in enumerate(all_values):
                    # headers is r_idx 0 (row 1)
                    if r_idx == 0: continue
                    
                    if len(r_val) > code_col_idx:
                        # Compare stringified codes
                        if str(r_val[code_col_idx]).strip() == str(student_code_override).strip():
                            found_row = r_idx + 1 # 1-based row
                            break
                
                if found_row != -1:
                    row = found_row
                    print(f"DEBUG: Found row {row} for student {student_code_override}")
                else:
                    print(f"DEBUG: Student code {student_code_override} not found in monthly sheet")
                    continue
            
            if not row:
                print("DEBUG: Row not specified and could not be resolved.")
                continue

            # If col is a string (header name), convert to column index
            if isinstance(col, str):
                col_idx = -1
                # 1. Exact match
                if col in headers:
                    col_idx = headers.index(col) + 1
                else:
                    # 2. Flexible match for Days (1, 1일, 01, 1(월)) using Regex
                    import re
                    # Check if col is a day number
                    if col.isdigit():
                        day_num = int(col)
                        for idx, h in enumerate(headers):
                            # Extract first number from header
                            match = re.search(r'^(\d+)', str(h))
                            if match and int(match.group(1)) == day_num:
                                col_idx = idx + 1
                                break
                
                if col_idx != -1:
                    col = col_idx
                else:
                    print(f"DEBUG: Column '{col}' not found in headers")
                    continue  # Skip unknown columns
            
            if row and col:
                cells_to_update.append({
                    "range": f"{_col_letter(col)}{row}",
                    "values": [[value]]
                })
                rows_to_recalc.add(row)
        
        # Recalculate Logic
        try:
            # Identify columns using Regex loose matching
            def find_col_regex(pattern):
                import re
                for idx, h in enumerate(headers):
                    if re.search(pattern, str(h)):
                        return idx
                return -1

            rate_idx = find_col_regex(r'수행.*률|발생.*률|Rate')
            achieved_idx = find_col_regex(r'달성.*여부|성공.*여부')
            goal_idx = find_col_regex(r'달성.*기준|목표.*기준')
            type_idx = find_col_regex(r'행동.*유형')
            
            if rate_idx == -1:
                print("DEBUG: '수행/발생률' column missing, skipping calculation")
            
            day_cols = []
            import re
            for idx, h in enumerate(headers):
                # Assume day columns start with a number and are roughly in the middle
                # Simple heuristic: header is just digits or digits+"일"
                # But headers can be anything.
                # Let's rely on range 1-31.
                match = re.search(r'^(\d+)(일)?$', str(h).strip())
                if match:
                   day = int(match.group(1))
                   if 1 <= day <= 31:
                       day_cols.append(idx)
            
            if rate_idx != -1:
                print(f"DEBUG: Recalculating {len(rows_to_recalc)} rows...")
                for r_idx in rows_to_recalc:
                    # 0-based index for python list
                    row_data_idx = r_idx - 1
                    if row_data_idx < len(all_values):
                        row_data = list(all_values[row_data_idx])
                    else:
                        print(f"DEBUG: Row {r_idx} out of bounds")
                        continue
                    
                    # Apply pending updates to memory for accurate calculation
                    for u in updates:
                        # Logic to find if this update applies to current row
                        # 'u' has 'row' (1-based)
                        if u.get("row") == r_idx:
                            c = u.get("col")
                            # Resolve column index again
                            c_idx = -1
                            if isinstance(c, int): c_idx = c - 1
                            elif isinstance(c, str):
                                if c in headers: c_idx = headers.index(c)
                                elif f"{c}일" in headers: c_idx = headers.index(f"{c}일")
                            
                            if c_idx != -1 and 0 <= c_idx < len(row_data):
                                row_data[c_idx] = u.get("value", "")
                                
                    # Calculate Rate
                    target_type = row_data[type_idx] if (type_idx != -1 and len(row_data) > type_idx) else "증가 목표행동"
                    goal_criteria = row_data[goal_idx] if (goal_idx != -1 and len(row_data) > goal_idx) else "80% 이상"
                    
                    total_days = 0
                    success_days = 0
                    
                    for dc in day_cols:
                        if dc < len(row_data):
                            val = str(row_data[dc]).strip()
                            if val in ["O", "X"]:
                                total_days += 1
                                if "감소" in str(target_type):
                                    if val == "X": success_days += 1
                                else:
                                    # Default to Increase
                                    if val == "O": success_days += 1
                    
                    rate_val = 0
                    if total_days > 0:
                        rate_val = (success_days / total_days) * 100
                        
                    final_rate_str = f"{int(rate_val)}%" if total_days > 0 else "-"
                    
                    # Achievement
                    is_achieved = "X"
                    try:
                        # Extract number from criteria
                        import re
                        match = re.search(r'\d+', str(goal_criteria))
                        criteria_num = int(match.group()) if match else 80
                        
                        if "이하" in str(goal_criteria):
                            if rate_val <= criteria_num: is_achieved = "O"
                        else: # 이상
                            if rate_val >= criteria_num: is_achieved = "O"
                    except:
                        pass
                    
                    if total_days == 0: is_achieved = "-"
                    
                    cells_to_update.append({
                        "range": f"{_col_letter(rate_idx + 1)}{r_idx}",
                        "values": [[final_rate_str]]
                    })
                    if achieved_idx != -1:
                        cells_to_update.append({
                            "range": f"{_col_letter(achieved_idx + 1)}{r_idx}",
                            "values": [[is_achieved]]
                        })
                    print(f"DEBUG: Row {r_idx} Calculated - Rate: {final_rate_str}, Achieved: {is_achieved}")

        except Exception as e:
            print(f"DEBUG: Error in recalculation loop: {e}")
            pass # Continue to update whatever we have

        # Batch update using gspread
        if cells_to_update:
            ws.batch_update([{
                "range": c["range"],
                "values": c["values"]
            } for c in cells_to_update])
        
        return {"message": f"{len(cells_to_update)} cells updated"}
    
    except Exception as e:
        print(f"Error updating monthly CICO cells: {e}")
        return {"error": str(e)}


def update_student_cico_settings(month: int, student_code: str, settings_data: dict):
    """
    Update CICO settings for a student in a monthly sheet.
    settings_data can include: 목표행동, 목표행동 유형, 척도, 입력 기준, 목표 달성 기준
    """
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Sheet not accessible"}
    
    try:
        sh = client.open_by_url(settings.SHEET_URL)
        month_name = f"{month}월"
        
        try:
            ws = sh.worksheet(month_name)
        except gspread.WorksheetNotFound:
            return {"error": f"'{month_name}' 시트가 없습니다."}
        
        all_values = ws.get_all_values()
        headers = all_values[0]
        
        # Find student row
        code_idx = headers.index("학생코드") if "학생코드" in headers else 2
        target_row = None
        for i, row in enumerate(all_values[1:], start=2):
            if len(row) > code_idx and str(row[code_idx]).strip() == str(student_code).strip():
                target_row = i
                break
        
        if not target_row:
            return {"error": f"학생코드 {student_code}를 찾을 수 없습니다."}
        
        # Update settings columns
        updates = []
        for key, value in settings_data.items():
            if key in headers:
                col = headers.index(key) + 1  # 1-based
                updates.append({"range": f"{_col_letter(col)}{target_row}", "values": [[value]]})
        
        if updates:
            ws.batch_update(updates)
        
        return {"message": f"Settings updated for {student_code}"}
    
    except Exception as e:
        print(f"Error updating CICO settings: {e}")
        return {"error": str(e)}


def toggle_tier2_status(month: int, student_code: str, status: str):
    """Toggle Tier2 status (O/X) for a student in a monthly sheet."""
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Sheet not accessible"}
    
    try:
        sh = client.open_by_url(settings.SHEET_URL)
        month_name = f"{month}월"
        
        try:
            ws = sh.worksheet(month_name)
        except gspread.WorksheetNotFound:
            return {"error": f"'{month_name}' 시트가 없습니다."}
        
        all_values = ws.get_all_values()
        headers = all_values[0]
        
        code_idx = headers.index("학생코드") if "학생코드" in headers else 2
        tier2_idx = headers.index("Tier2") if "Tier2" in headers else 3
        
        for i, row in enumerate(all_values[1:], start=2):
            if len(row) > code_idx and str(row[code_idx]).strip() == str(student_code).strip():
                ws.update_cell(i, tier2_idx + 1, status)  # 1-based column
                return {"message": f"Tier2 status for {student_code} → {status}"}
        
        return {"error": f"학생코드 {student_code}를 찾을 수 없습니다."}
    
    except Exception as e:
        print(f"Error toggling Tier2: {e}")
        return {"error": str(e)}


def _col_letter(col_num: int) -> str:
    """Convert 1-based column number to letter (1=A, 2=B, ..., 27=AA)."""
    result = ""
    while col_num > 0:
        col_num, remainder = divmod(col_num - 1, 26)
        result = chr(65 + remainder) + result
    return result



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


def get_cico_report_data(month: int):
    """
    Get T2 CICO report data for decision making.
    Returns per-student data with monthly trends and system recommendations.
    """
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return {"error": "Sheet not accessible"}
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        month_name = f"{month}월"
        
        # Get current month data
        try:
            ws = sheet.worksheet(month_name)
        except gspread.WorksheetNotFound:
            return {"error": f"'{month_name}' 시트가 없습니다."}
        
        all_values = ws.get_all_values()
        if not all_values or len(all_values) < 2:
            return {"students": [], "summary": {}}
        
        headers = all_values[0]
        
        # Column indices
        col_idx = {}
        for name in ["번호", "학급", "학생코드", "Tier2", "목표행동", "목표행동 유형", "척도",
                      "입력 기준", "목표 달성 기준", "수행/발생률", "목표 달성 여부", "팀 협의 내용"]:
            if name in headers:
                col_idx[name] = headers.index(name)
        
        # Get multi-month trends (last 3 months including current)
        months_list = ["3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
        month_idx = months_list.index(month_name) if month_name in months_list else -1
        
        # Collect rates from previous months
        prev_rates = {}  # {code: [rate_list]}
        if month_idx >= 0:
            start_m = max(0, month_idx - 2)
            for mi in range(start_m, month_idx):
                m_name = months_list[mi]
                try:
                    m_ws = sheet.worksheet(m_name)
                    m_rows = m_ws.get_all_values()
                    if len(m_rows) < 2:
                        continue
                    m_headers = m_rows[0]
                    m_tier_idx = m_headers.index("Tier2") if "Tier2" in m_headers else -1
                    m_code_idx = m_headers.index("학생코드") if "학생코드" in m_headers else -1
                    m_rate_idx = m_headers.index("수행/발생률") if "수행/발생률" in m_headers else -1
                    
                    if m_tier_idx >= 0 and m_code_idx >= 0 and m_rate_idx >= 0:
                        for row in m_rows[1:]:
                            if len(row) > max(m_tier_idx, m_code_idx, m_rate_idx):
                                if row[m_tier_idx] == "O":
                                    code = str(row[m_code_idx]).strip()
                                    rate = row[m_rate_idx]
                                    if code not in prev_rates:
                                        prev_rates[code] = []
                                    prev_rates[code].append({"month": m_name, "rate": rate})
                except gspread.WorksheetNotFound:
                    continue
        
        # Build student report data
        tier2_idx = col_idx.get("Tier2", -1)
        students = []
        total_rate_sum = 0
        total_rate_count = 0
        achieved_count = 0
        
        for row in all_values[1:]:
            if tier2_idx < 0 or len(row) <= tier2_idx:
                continue
            if str(row[tier2_idx]).strip() != "O":
                continue
            
            code = str(row[col_idx.get("학생코드", 2)]).strip() if col_idx.get("학생코드", 2) < len(row) else ""
            rate_str = row[col_idx["수행/발생률"]] if "수행/발생률" in col_idx and col_idx["수행/발생률"] < len(row) else ""
            achieved = row[col_idx["목표 달성 여부"]] if "목표 달성 여부" in col_idx and col_idx["목표 달성 여부"] < len(row) else ""
            goal_str = row[col_idx["목표 달성 기준"]] if "목표 달성 기준" in col_idx and col_idx["목표 달성 기준"] < len(row) else ""
            team_talk = row[col_idx["팀 협의 내용"]] if "팀 협의 내용" in col_idx and col_idx["팀 협의 내용"] < len(row) else ""
            
            # Parse rate
            rate_num = None
            if rate_str and rate_str != "-":
                try:
                    r = float(rate_str.replace("%", ""))
                    if r <= 1:
                        rate_num = r * 100
                    else:
                        rate_num = r
                except ValueError:
                    pass
            
            if rate_num is not None:
                total_rate_sum += rate_num
                total_rate_count += 1
            
            if achieved == "O":
                achieved_count += 1
            
            # Monthly trend (prev months + current)
            trend = list(prev_rates.get(code, []))
            trend.append({"month": month_name, "rate": rate_str})
            
            # Decision recommendation
            decision = "CICO 유지"
            decision_color = "#3b82f6"
            
            if rate_num is not None:
                # Check consecutive months of high performance
                all_rates = []
                for t in trend:
                    try:
                        r = float(t["rate"].replace("%", ""))
                        if r <= 1:
                            r = r * 100
                        all_rates.append(r)
                    except (ValueError, AttributeError):
                        all_rates.append(None)
                
                recent_high = all(r is not None and r >= 80 for r in all_rates[-2:]) if len(all_rates) >= 2 else False
                
                if recent_high:
                    decision = "Tier1 하향 권장"
                    decision_color = "#10b981"
                elif rate_num >= 80:
                    decision = "CICO 유지 (양호)"
                    decision_color = "#3b82f6"
                elif rate_num >= 50:
                    decision = "CICO 수정 검토"
                    decision_color = "#f59e0b"
                elif rate_num < 50:
                    decision = "Tier3 상향 검토"
                    decision_color = "#ef4444"
            
            students.append({
                "code": code,
                "class": row[col_idx.get("학급", 1)] if col_idx.get("학급", 1) < len(row) else "",
                "target_behavior": row[col_idx.get("목표행동", 4)] if col_idx.get("목표행동", 4) < len(row) else "",
                "behavior_type": row[col_idx.get("목표행동 유형", 5)] if col_idx.get("목표행동 유형", 5) < len(row) else "",
                "scale": row[col_idx.get("척도", 6)] if col_idx.get("척도", 6) < len(row) else "",
                "goal_criteria": goal_str,
                "rate": rate_str,
                "rate_num": rate_num,
                "achieved": achieved,
                "trend": trend,
                "decision": decision,
                "decision_color": decision_color,
                "team_talk": team_talk,
            })
        
        avg_rate = round(total_rate_sum / total_rate_count, 1) if total_rate_count > 0 else 0
        
        return {
            "month": month_name,
            "students": students,
            "summary": {
                "total_students": len(students),
                "avg_rate": avg_rate,
                "achieved_count": achieved_count,
                "not_achieved_count": len(students) - achieved_count,
            }
        }
    
    except Exception as e:
        print(f"Error getting CICO report data: {e}")
        return {"error": str(e)}


def get_tier3_report_data(start_date: str = None, end_date: str = None):
    """
    Get Tier3 report data for decision making.
    Returns Tier3 student list with crisis behavior stats.
    """
    # 1. Get Tier3 students from TierStatus
    ws = get_student_status_worksheet()
    if not ws:
        return {"error": "TierStatus sheet not accessible"}
    
    try:
        records = ws.get_all_records()
    except Exception as e:
        return {"error": str(e)}
    
    tier3_students = []
    for r in records:
        if str(r.get("Tier3", "X")).strip() == "O" or str(r.get("Tier3+", "X")).strip() == "O":
            is_tier3_plus = str(r.get("Tier3+", "X")).strip() == "O"
            tier3_students.append({
                "code": str(r.get("학생코드", "")),
                "class": str(r.get("학급", "")),
                "tier": "Tier3+" if is_tier3_plus else "Tier3",
                "beable_code": str(r.get("BeAble코드", "")),
                "memo": str(r.get("메모", "")),
            })
    
    if not tier3_students:
        return {
            "students": [],
            "summary": {"total_students": 0, "total_incidents": 0, "avg_intensity": 0},
        }
    
    # 2. Get behavior data from main sheet
    import pandas as pd
    raw_data = fetch_all_records()
    if not raw_data:
        # Return students without behavior data
        for s in tier3_students:
            s.update({"incidents": 0, "max_intensity": 0, "avg_intensity": 0,
                      "behavior_types": [], "decision": "Tier3 유지", "decision_color": "#ef4444"})
        return {
            "students": tier3_students,
            "summary": {"total_students": len(tier3_students), "total_incidents": 0, "avg_intensity": 0},
        }
    
    df = pd.DataFrame(raw_data)
    
    # Date filtering
    if '행동발생 날짜' in df.columns:
        df['date_obj'] = pd.to_datetime(df['행동발생 날짜'], errors='coerce')
        if start_date:
            df = df[df['date_obj'] >= pd.to_datetime(start_date)]
        if end_date:
            df = df[df['date_obj'] <= pd.to_datetime(end_date)]
    
    if '강도' in df.columns:
        df['강도'] = pd.to_numeric(df['강도'], errors='coerce').fillna(0)
    
    # Map BeAble codes to student codes
    beable_mapping = get_beable_code_mapping()
    beable_to_code = {k: v['student_code'] for k, v in beable_mapping.items()}
    
    # Build code set for Tier3 students
    tier3_codes = {s["code"] for s in tier3_students}
    tier3_beable = {b for b, info in beable_mapping.items() if info['student_code'] in tier3_codes}
    
    total_incidents = 0
    total_intensity_sum = 0
    total_intensity_count = 0
    
    for student in tier3_students:
        code = student["code"]
        beable = student["beable_code"]
        
        # Filter behavior data for this student
        if '코드번호' in df.columns and beable:
            s_df = df[df['코드번호'].astype(str) == beable]
        else:
            s_df = pd.DataFrame()
        
        incidents = len(s_df)
        max_intensity = int(s_df['강도'].max()) if not s_df.empty and '강도' in s_df.columns else 0
        avg_intensity = round(float(s_df['강도'].mean()), 1) if not s_df.empty and '강도' in s_df.columns else 0
        
        # Behavior type breakdown
        behavior_types = []
        if not s_df.empty and '행동유형' in s_df.columns:
            bt_counts = s_df['행동유형'].value_counts()
            behavior_types = [{"name": k, "value": int(v)} for k, v in bt_counts.items()]
        
        # Weekly trend
        weekly_trend = []
        if not s_df.empty and 'date_obj' in s_df.columns:
            s_df_copy = s_df.copy()
            s_df_copy['week'] = s_df_copy['date_obj'].dt.isocalendar().week.astype(int)
            s_df_copy['year'] = s_df_copy['date_obj'].dt.year
            w_counts = s_df_copy.groupby(['year', 'week']).size().reset_index(name='count')
            for _, row in w_counts.iterrows():
                weekly_trend.append({"week": f"{int(row['year'])}-W{int(row['week']):02d}", "count": int(row['count'])})
        
        total_incidents += incidents
        if incidents > 0:
            total_intensity_sum += avg_intensity * incidents
            total_intensity_count += incidents
        
        # Decision logic
        decision = "Tier3 유지"
        decision_color = "#ef4444"
        
        if incidents == 0:
            decision = "Tier2(CICO) 하향 검토"
            decision_color = "#10b981"
        elif max_intensity >= 5 or incidents >= 10:
            if student["tier"] == "Tier3+":
                decision = "Tier3+ 유지 (위기)"
                decision_color = "#7c3aed"
            else:
                decision = "Tier3+ 상향 검토"
                decision_color = "#7c3aed"
        elif incidents <= 2 and max_intensity < 3:
            decision = "Tier2(CICO) 하향 검토"
            decision_color = "#10b981"
        elif incidents <= 4:
            decision = "Tier3 유지 (관찰)"
            decision_color = "#f59e0b"
        
        student.update({
            "incidents": incidents,
            "max_intensity": max_intensity,
            "avg_intensity": avg_intensity,
            "behavior_types": behavior_types,
            "weekly_trend": weekly_trend,
            "decision": decision,
            "decision_color": decision_color,
        })
    
    # Sort: Tier3+ first, then by incidents desc
    tier3_students.sort(key=lambda x: (0 if x["tier"] == "Tier3+" else 1, -x["incidents"]))
    
    overall_avg = round(total_intensity_sum / total_intensity_count, 1) if total_intensity_count > 0 else 0
    
    return {
        "students": tier3_students,
        "summary": {
            "total_students": len(tier3_students),
            "total_incidents": total_incidents,
            "avg_intensity": overall_avg,
        },
    }


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

        clear_cache() # Invalidate all caches after refresh
        return {"message": "Monthly sheets initialized"}

    except Exception as e:
        print(f"Error initializing monthly sheets: {e}")
        return {"error": str(e)}


# =============================
# Board Worksheet (Notices)
# =============================
def get_board_worksheet():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return None
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        try:
            return sheet.worksheet("Board")
        except gspread.WorksheetNotFound:
            print("Creating 'Board' worksheet...")
            ws = sheet.add_worksheet(title="Board", rows=100, cols=6)
            ws.append_row(["ID", "Title", "Content", "Author", "CreatedAt", "Views"])
            return ws
    except Exception as e:
        print(f"Error accessing Board worksheet: {e}")
        return None

def fetch_board_posts():
    global _cache
    now = time.time()
    
    if _cache["board"]["data"] and (now - _cache["board"]["timestamp"] < CACHE_TTL):
        return _cache["board"]["data"]

    ws = get_board_worksheet()
    if not ws:
        return []
    
    try:
        records = ws.get_all_records()
        valid_records = []
        for r in records:
            valid_records.append({
                "id": str(r.get("ID")),
                "title": r.get("Title"),
                "content": r.get("Content"),
                "author": r.get("Author"),
                "created_at": r.get("CreatedAt"),
                "views": r.get("Views")
            })
            
        valid_records.sort(key=lambda x: x["created_at"], reverse=True)
        _cache["board"] = {"data": valid_records, "timestamp": now}
        return valid_records
    except Exception as e:
        print(f"Error fetching board posts: {e}")
        return []

def add_board_post(title: str, content: str, author: str):
    ws = get_board_worksheet()
    if not ws:
        print("DEBUG: Board sheet not accessible")
        return {"error": "Sheet not accessible"}
    
    try:
        from datetime import datetime
        import uuid
        
        post_id = str(uuid.uuid4())[:8]
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        row = [post_id, title, content, author, created_at, 0]
        print(f"DEBUG: Appending board post: {row}")
        ws.append_row(row)
        clear_cache("board") # Invalidate cache
        print(f"DEBUG: Board post added {post_id}")
        return {"message": "Post added", "post_id": post_id}
    except Exception as e:
        print(f"Error adding board post: {e}")
        return {"error": str(e)}

def delete_board_post(post_id: str):
    ws = get_board_worksheet()
    if not ws:
        return {"error": "Sheet not accessible"}
    
    try:
        cell = ws.find(post_id)
        if cell:
            ws.delete_rows(cell.row)
            clear_cache("board") # Invalidate cache
            return {"message": "Post deleted"}
        return {"error": "Post not found"}
    except Exception as e:
        print(f"Error deleting board post: {e}")
        return {"error": str(e)}
