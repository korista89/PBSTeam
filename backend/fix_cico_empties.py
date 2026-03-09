import os
import sys
from dotenv import load_dotenv
import gspread

sys.path.append(os.getcwd())
load_dotenv()

if os.path.exists("service_account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"

from app.services.sheets import get_sheets_client, settings

def main():
    print("Fixing existing empty strings causing validation errors...")
    client = get_sheets_client()
    if not client:
        return
        
    sh = client.open_by_url(settings.SHEET_URL)
    
    # Process 3월 (and any other month sheets if they exist)
    for ws in sh.worksheets():
        if ws.title.endswith("월"):
            print(f"Checking {ws.title}...")
            # We want to clear cells that are just "" to remove validation red triangles
            # The columns causing trouble are typically E, G, H, I, J, K, L etc
            # But we can just find any cell that has an empty string "" value (or is just whitespace)
            # Actually, gspread get_all_values() returns "" for both completely empty cells and cells with actual empty strings.
            # However, if we write None to a cell that is already "", it clears it.
            # To be safe, let's just rewrite empty strings as None? 
            # batch_clear can clear specific ranges.
            
            # An easier way is just to read the sheet. If a row has empty data in specific columns, we clear them.
            # Wait, batch_clear takes a list of ranges: ws.batch_clear(['E2:E1000']) clears everything!
            # We only want to clear cells that are EMPTY but throwing validation errors.
            
            all_values = ws.get_all_values()
            if not all_values:
                continue
                
            headers = all_values[0]
            # columns to check for empty strings
            cols_to_check = ["Tier2", "목표행동 유형", "척도", "입력 기준", "목표 달성 기준", "수행/발생률", "목표 달성 여부"]
            col_indices = []
            for i, h in enumerate(headers):
                if h in cols_to_check:
                    col_indices.append(i)
                    
            updates = []
            for r_idx, row in enumerate(all_values[1:], start=2):
                for col_idx in col_indices:
                    # if the cell is empty or space
                    val = row[col_idx] if col_idx < len(row) else ""
                    if str(val).strip() == "" or str(val).strip() == "-":
                        # We will write None (null) to clear it, but wait, `gspread` update with None clears it?
                        # ACTUALLY, in gspread batch_update, sending '' might write empty string. 
                        # `gspread` documentation: "To clear a cell, update it with an empty string ''."
                        # Wait! Updating with '' is what caused it? 
                        # Let's use batch_clear instead!
                        from app.services.sheets import _col_letter
                        col_letter = _col_letter(col_idx + 1)
                        cell_range = f"{col_letter}{r_idx}"
                        updates.append(cell_range)
                        
            if updates:
                print(f"Clearing {len(updates)} empty cells to fix validation in {ws.title}...")
                # chunk batch_clear into 100 cells at a time
                import time
                for i in range(0, len(updates), 100):
                    ws.batch_clear(updates[i:i+100])
                    time.sleep(0.5)
            print(f"Done for {ws.title}")

if __name__ == "__main__":
    main()
