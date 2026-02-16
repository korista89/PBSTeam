
import sys
import os
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

from app.services.sheets import get_monthly_cico_data

print("Fetching March data...")
data = get_monthly_cico_data(3)
if "error" in data:
    print("Error:", data["error"])
else:
    print("Keys:", data.keys())
    print("Day Columns Count:", len(data["day_columns"]))
    print("Day Columns Sample:", data["day_columns"][:5])
    print("First Student:", data["students"][0] if data["students"] else "No Data")
    
    # Try to access headers directly to debug
    from app.services.sheets import get_sheets_client, settings
    client = get_sheets_client()
    sheet = client.open_by_url(settings.SHEET_URL)
    ws = sheet.worksheet("3월")
    headers = ws.row_values(1)
    print("Actual Sheet Headers (First 20):", headers[:20])
