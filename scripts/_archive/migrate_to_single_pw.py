import time
import gspread
from app.services.sheets import get_sheets_client, settings
from app.services.picture_words import VB_HEADERS

def main():
    print("Starting PW Database Consolidation Migration...")
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        print("Failed to init API client")
        return
        
    ss = client.open_by_url(settings.SHEET_URL)
    
    # 1. Create or get PW_어휘데이터
    try:
        global_ws = ss.worksheet("PW_어휘데이터")
        print("PW_어휘데이터 already exists.")
    except gspread.WorksheetNotFound:
        global_ws = ss.add_worksheet(title="PW_어휘데이터", rows=15000, cols=16)
        global_ws.append_row(VB_HEADERS)
        print("Created PW_어휘데이터.")
        time.sleep(2)
        
    # 2. Delete all PW_어휘_* tabs
    deleted_count = 0
    worksheets = ss.worksheets()
    for ws in worksheets:
        # ignore PW_어휘데이터 itself, only delete PW_어휘_{id}
        if ws.title.startswith("PW_어휘_"):
            print(f"Deleting tab: {ws.title} ...")
            try:
                ss.del_worksheet(ws)
                deleted_count += 1
                time.sleep(1) # avoid rate limit on delete
            except Exception as e:
                print(f"Error deleting {ws.title}: {e}")
                
    print(f"Migration Complete! Deleted {deleted_count} sharded tabs.")
    
if __name__ == "__main__":
    main()
