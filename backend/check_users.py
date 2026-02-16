
import sys
import os

# Create a mock settings object since app.core.config might require .env variables not present or loaded differently
# We will rely on service_account.json being present in the current directory as per sheets.py logic

# Add current directory to path so we can import app modules if needed
sys.path.append(os.getcwd())

# We need to mock settings or set env vars for sheets.py to work if it uses settings.GOOGLE_CREDENTIALS_FILE
# Let's inspect sheets.py again. It uses settings.GOOGLE_CREDENTIALS_FILE
# We should probably just set the environment variable to point to service_account.json if it exists

if os.path.exists("service_account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"

# We'll try to import the function directly.
# However, app.core.config might fail if .env is missing.
# Let's try to load .env first
from dotenv import load_dotenv
load_dotenv()

try:
    from app.services.sheets import get_users_worksheet
    
    ws = get_users_worksheet()
    if not ws:
        print("Error: Could not access Users worksheet.")
        sys.exit(1)
        
    records = ws.get_all_records()
    print(f"Found {len(records)} users.")
    for r in records[:5]:
        print(f"ID: {r.get('ID')}, Password: {r.get('Password')}, Role: {r.get('Role')}")
        
except Exception as e:
    print(f"Error: {e}")
