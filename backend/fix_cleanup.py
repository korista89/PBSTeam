import gspread
from app.services.sheets import get_sheets_client, settings

client = get_sheets_client()
if client and settings.SHEET_URL:
    try:
        ss = client.open_by_url(settings.SHEET_URL)
        try:
            ws = ss.worksheet('BehaviorLogs')
            ss.del_worksheet(ws)
            print('Deleted BehaviorLogs')
        except gspread.WorksheetNotFound:
            print('BehaviorLogs not found, skip deletion')
    except Exception as e:
        print(f"Error: {e}")
