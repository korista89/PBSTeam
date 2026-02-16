
import sys
import os
import time
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

# Prioritize local service account if exists
if os.path.exists("service_account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"

try:
    from app.services.sheets import get_sheets_client, settings
    import gspread

    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        print("Error: Cannot connect to sheets.")
        sys.exit(1)

    sheet = client.open_by_url(settings.SHEET_URL)
    worksheets = sheet.worksheets()
    
    # 1. Handle "BehaviorLogs" vs "시트1"
    behavior_logs = None
    sheet1 = None
    
    for ws in worksheets:
        if ws.title == "BehaviorLogs":
            behavior_logs = ws
        if ws.title == "시트1":
            sheet1 = ws
            
    if behavior_logs:
        print("Found existing 'BehaviorLogs' sheet.")
    elif sheet1:
        print("Renaming '시트1' to 'BehaviorLogs'...")
        try:
            sheet1.update_title("BehaviorLogs")
            behavior_logs = sheet1
            print("Renamed successfully.")
        except Exception as e:
            print(f"Error renaming sheet: {e}")
    else:
        print("Creating 'BehaviorLogs' sheet...")
        try:
            # Create with standard headers
            behavior_logs = sheet.add_worksheet(title="BehaviorLogs", rows=1000, cols=20)
            headers = ["행동발생 날짜", "시간대", "장소", "강도", "행동유형", "기능", "배경", "결과", "학생명", "학생코드", "코드번호", "입력자", "입력일", "비고"]
            behavior_logs.append_row(headers)
            print("Created successfully.")
        except Exception as e:
             print(f"Error creating sheet: {e}")

    # 2. Delete Unnecessary Sheets
    print("Deleting unnecessary sheets (3월~12월, Tier2_대시보드, 날짜 관리)...")
    months = [f"{i}월" for i in range(1, 13)] # 1월..12월
    targets = months + ["Tier2_대시보드", "날짜 관리"]
    
    # Refresh worksheets list in case of rename/create
    worksheets = sheet.worksheets()
    
    for ws in worksheets:
        if ws.title in targets:
            print(f"Deleting '{ws.title}'...")
            try:
                sheet.del_worksheet(ws)
                print("Deleted.")
                time.sleep(1) # Rate limit safety
            except Exception as e:
                print(f"Error deleting '{ws.title}': {e}")
                
    print("Sheet cleanup complete.")

except Exception as e:
    print(f"Fatal Error: {e}")
