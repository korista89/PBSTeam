
import sys
import os
import time
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

# Prioritize local service account if running locally
if os.path.exists("service_account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"

try:
    from app.services.sheets import get_sheets_client, settings
    from app.services.sheets import create_monthly_cico_sheet
    import gspread

    client = get_sheets_client()
    if not client:
        print("Error: Authentication failed. Cannot get sheets client.")
        sys.exit(1)
        
    print("Authenticated successfully.")
    
    if not settings.SHEET_URL:
        print("Error: SHEET_URL not set in environment.")
        sys.exit(1)

    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        print(f"Connected to Spreadsheet: {sheet.title}")
    except Exception as e:
        print(f"Error opening sheet by URL: {e}")
        sys.exit(1)

    # 1. Reset 'CICODaily'
    print("Resetting 'CICODaily'...")
    try:
        ws_daily = sheet.worksheet("CICODaily")
        sheet.del_worksheet(ws_daily)
        print("Deleted existing CICODaily.")
        time.sleep(1) # Rate limit safety
    except gspread.WorksheetNotFound:
        print("CICODaily not found (skipping delete).")
        pass
        
    # Recreate CICODaily
    try:
        # Columns based on app logic
        ws_daily = sheet.add_worksheet(title="CICODaily", rows=1000, cols=10)
        headers_daily = ["Date", "StudentCode", "Target1", "Target2", "AchievementRate", "Memo", "EnteredBy", "Timestamp"]
        ws_daily.append_row(headers_daily)
        print("Created 'CICODaily' with headers.")
    except Exception as e:
        print(f"Error creating CICODaily: {e}")

    # 2. Reset '3월' (March)
    print("Resetting '3월'...")
    try:
        ws_mar = sheet.worksheet("3월")
        sheet.del_worksheet(ws_mar)
        print("Deleted existing 3월.")
        time.sleep(1)
    except gspread.WorksheetNotFound:
        print("3월 not found (skipping delete).")
        pass
        
    # Recreate 3월
    try:
        # Check TierStatus first
        try:
            ts = sheet.worksheet("TierStatus")
        except gspread.WorksheetNotFound:
            print("Error: 'TierStatus' sheet not found! Cannot generate CICO sheets.")
            sys.exit(1)
            
        records = ts.get_all_records()
        cico_students = [r for r in records if str(r.get('Tier2(CICO)')).upper() == 'O']
        print(f"Found {len(cico_students)} CICO students in TierStatus.")
        
        if cico_students:
            print("Calling create_monthly_cico_sheet(2026, 3)...")
            result = create_monthly_cico_sheet(2026, 3) 
            print(f"Created '3월' Result: {result}")
        else:
            print("Warning: No CICO students found (Tier2(CICO) != 'O'). Skipping '3월' creation.")
            
    except Exception as e:
        print(f"Error recreating 3월: {e}")

    print("CICO Reset Complete.")

except Exception as e:
    print(f"Fatal Error: {e}")
