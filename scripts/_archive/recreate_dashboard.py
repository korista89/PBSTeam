import os
import sys
from dotenv import load_dotenv
import gspread

sys.path.append(os.getcwd())
load_dotenv()

if os.path.exists("service_account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"

from app.services.sheets import get_sheets_client, settings, refresh_dashboard_data, initialize_dashboard_if_missing

def main():
    print("Recreating Tier2_대시보드...")
    client = get_sheets_client()
    if not client:
        return
        
    sh = client.open_by_url(settings.SHEET_URL)
    
    try:
        ws = sh.worksheet("Tier2_대시보드")
        sh.del_worksheet(ws)
        print("Deleted old Dashboard.")
    except gspread.WorksheetNotFound:
        pass
        
    res = initialize_dashboard_if_missing()
    print("Result:", res)

if __name__ == "__main__":
    main()
