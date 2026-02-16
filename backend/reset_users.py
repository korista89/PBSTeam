
import sys
import os
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

if os.path.exists("service_account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"

try:
    from app.services.sheets import reset_users_sheet
    print("Resetting users sheet...")
    result = reset_users_sheet()
    print(f"Result: {result}")
except Exception as e:
    print(f"Error: {e}")
