import gspread
from app.core.config import settings
from app.services.sheets import get_sheets_client

client = get_sheets_client()
if client and settings.SHEET_URL:
    try:
        ss = client.open_by_url(settings.SHEET_URL)
        ws = ss.worksheet('Users')
        
        # Check if already exists (just in case)
        records = ws.get_all_records()
        if any(r.get('ID') == '초3-2관리자' for r in records):
            print("User '초3-2관리자' already exists.")
        else:
            # Find the position to insert (after 초3-1관리자)
            # 초3-1관리자 is ClassID 231
            # I can just append it or insert it correctly.
            # Append is safer if I don't want to mess up indexing.
            ws.append_row(['초3-2관리자', 'ges2811', 'class_teacher', '', 232, '초3-2관리자'])
            print("Added user '초3-2관리자' with ClassID 232.")
            
    except Exception as e:
        print(f"Error: {e}")
else:
    print("Client or URL missing")
