import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from app.services.sheets import get_sheets_client, settings, ensure_bip_sheet

def cleanup_bip():
    print("Cleaning up BIP test data...")
    ws = ensure_bip_sheet()
    if not ws:
        print("Error: Sheet not accessible")
        return

    try:
        cell = ws.find("TEST-9999", in_column=1)
        if cell:
            ws.delete_rows(cell.row)
            print(f"Deleted test row at {cell.row}")
        else:
            print("Test data not found.")
            
    except Exception as e:
        print(f"Error during cleanup: {e}")

if __name__ == "__main__":
    cleanup_bip()
