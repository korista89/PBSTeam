
import sys
import os
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

from app.services.sheets import get_sheets_client, settings

client = get_sheets_client()
sheet = client.open_by_url(settings.SHEET_URL)
try:
    ws = sheet.worksheet("TierStatus")
    print("Headers:", ws.row_values(1))
except Exception as e:
    print("Error:", e)
