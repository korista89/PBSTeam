
import sys
import os
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

if os.path.exists("service_account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"

try:
    from app.services.sheets import get_sheets_client, settings
    
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        print("Error: Cannot connect to sheets.")
        sys.exit(1)
        
    sheet = client.open_by_url(settings.SHEET_URL)
    worksheets = sheet.worksheets()
    
    print("=== Current Worksheets ===")
    for ws in worksheets:
        print(f"- {ws.title} (ID: {ws.id})")
        
except Exception as e:
    print(f"Error: {e}")
