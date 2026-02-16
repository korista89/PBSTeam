import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from app.services.sheets import get_sheets_client, reset_users_sheet, get_holidays_from_config, settings
import gspread

def repair_system():
    print("Starting monthly sheet cleanup...")
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        print("Error: Sheet not accessible")
        return

    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        
        # Delete 3월 CICO ~ 12월 CICO
        for m in range(3, 13):
            month_name = f"{m}월"
            try:
                ws = sheet.worksheet(month_name)
                sheet.del_worksheet(ws)
                print(f"Deleted '{month_name}' sheet.")
            except gspread.WorksheetNotFound:
                pass
                
        print("\nSUCCESS: Monthly sheets deleted.")
        print("They will be regenerated automatically when you visit the CICO page.")

    except Exception as e:
        print(f"Error during cleanup: {e}")

if __name__ == "__main__":
    repair_system()
