import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from app.services.sheets import get_sheets_client, reset_users_sheet, get_holidays_from_config, settings
import gspread

def repair_system():
    print("Starting system repair...")
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        print("Error: Sheet not accessible")
        return

    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        
        # 1. Delete 'Users' sheet
        try:
            ws = sheet.worksheet("Users")
            sheet.del_worksheet(ws)
            print("Deleted 'Users' sheet.")
        except gspread.WorksheetNotFound:
            print("'Users' sheet not found (skipping delete).")
            
        # 2. Delete '날짜 관리' sheet
        try:
            ws = sheet.worksheet("날짜 관리")
            sheet.del_worksheet(ws)
            print("Deleted '날짜 관리' sheet.")
        except gspread.WorksheetNotFound:
            print("'날짜 관리' sheet not found (skipping delete).")

        # 3. Delete 'CICODaily' sheet
        try:
            ws = sheet.worksheet("CICODaily")
            sheet.del_worksheet(ws)
            print("Deleted 'CICODaily' sheet.")
        except gspread.WorksheetNotFound:
            print("'CICODaily' sheet not found (skipping delete).")

        # 4. Recreate Users sheet
        print("Recreating 'Users' sheet...")
        reset_users_sheet()
        
        # 5. Recreate Holidays sheet
        print("Recreating '날짜 관리' sheet...")
        # get_holidays_from_config will create the sheet if missing and populate defaults
        get_holidays_from_config() 
        
        print("\nSUCCESS: System repair complete.")
        print("Please log in with 'admin/admin123'.")

    except Exception as e:
        print(f"Error during repair: {e}")

if __name__ == "__main__":
    repair_system()
