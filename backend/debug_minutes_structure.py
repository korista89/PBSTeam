import gspread
import os
import sys
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from app.services.sheets import get_sheets_client
from app.core.config import settings

client = get_sheets_client()
ss = client.open_by_url(settings.SHEET_URL)

def check_ws(title):
    try:
        ws = ss.worksheet(title)
        print(f"\n--- {title} ---")
        headers = ws.row_values(1)
        print(f"Headers: {headers}")
        last_row = ws.get_all_values()[-1] if ws.get_all_values() else "Empty"
        print(f"Num Rows: {len(ws.get_all_values())}")
        print(f"Sample Row (Last): {last_row}")
        
        # Test mapping
        if title == 'PW_협의록':
            col_map = {"날짜": 1, "구분": 2, "출처(학생/차시)": 3, "내용": 4, "학급ID": 5, "학급명": 6}
            for k, v in col_map.items():
                if v <= len(headers):
                    print(f"Map Check: {k} -> Col {v} ({headers[v-1]})")
                else:
                    print(f"Map Check: {k} -> Col {v} (OUT OF RANGE)")
        elif title == 'PW_수업가이드':
            col_map = {"내용": 7, "날짜": 8}
            for k, v in col_map.items():
                if v <= len(headers):
                    print(f"Map Check: {k} -> Col {v} ({headers[v-1]})")
                else:
                    print(f"Map Check: {k} -> Col {v} (OUT OF RANGE)")
    except Exception as e:
        print(f"Error checking {title}: {e}")

check_ws('PW_협의록')
check_ws('PW_수업가이드')
