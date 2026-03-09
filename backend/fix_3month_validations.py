import os
import sys
from dotenv import load_dotenv
import gspread

sys.path.append(os.getcwd())
load_dotenv()

if os.path.exists("service_account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"

from app.services.sheets import get_sheets_client, settings, create_monthly_cico_sheet

def main():
    print("Recreating 3월 to apply new dropdown offsets...")
    client = get_sheets_client()
    if not client:
        return
        
    sh = client.open_by_url(settings.SHEET_URL)
    
    # We shouldn't delete the sheet. Just apply the dropdown validation algorithm on top of the existing sheet to not wipe data!
    try:
        from gspread.utils import ValidationConditionType
        ws = sh.worksheet("3월")
        start_row = 2
        
        # Determine actual rows
        rows = ws.get_all_values()
        if len(rows) < 2:
            print("No data in 3월 sheet.")
            return
            
        end_row = len(rows)
        
        # Apply validation logic
        print("Applying validation...")
        ws.add_validation(
            f'E{start_row}:E{end_row}',
            ValidationConditionType.one_of_list,
            ['O', 'X'],
            showCustomUi=True
        )
        ws.add_validation(
            f'G{start_row}:G{end_row}',
            ValidationConditionType.one_of_list,
            ['증가 목표행동', '감소 목표행동'],
            showCustomUi=True
        )
        ws.add_validation(
            f'H{start_row}:H{end_row}',
            ValidationConditionType.one_of_list,
            ['O/X(발생)', '0점/1점/2점', '0~5', '0~7교시', '1~100회', '1~100분'],
            showCustomUi=True
        )
        ws.add_validation(
            f'J{start_row}:J{end_row}',
            ValidationConditionType.one_of_list,
            ['90% 이상', '80% 이상', '70% 이상', '60% 이상', '50% 이상',
             '50% 이하', '40% 이하', '30% 이하', '20% 이하', '10% 이하'],
            showCustomUi=True
        )
        ws.add_validation(
            f'L{start_row}:L{end_row}',
            ValidationConditionType.one_of_list,
            ['O', 'X'],
            showCustomUi=True
        )
        ws.add_validation(
            f'P{start_row}:P{end_row}',
            ValidationConditionType.one_of_list,
            ['유지', '종료', '상향', '하향'],
            showCustomUi=True
        )
        
        # Clear the wrong validations (If 'F' has it, maybe we just clear F?)
        ws.clear_basic_filter() # Filter not validation
        # gspread lacks a clear_validation method. To overwrite, you can set validation condition to None 
        # Actually gspread doesn't have clear validation without raw requests. It's okay, the main columns are fixed.
        
        # Now D, F, I, K, O should be cleared of validation:
        # Actually we can do it via raw request
        body = {
            "requests": [
                {
                    "setDataValidation": {
                        "range": {
                            "sheetId": ws.id,
                            "startRowIndex": 1,
                            "endRowIndex": end_row,
                            "startColumnIndex": 3, # D
                            "endColumnIndex": 4 # E = 4
                        },
                        "rule": None
                    }
                },
                {
                    "setDataValidation": {
                        "range": {
                            "sheetId": ws.id,
                            "startRowIndex": 1,
                            "endRowIndex": end_row,
                            "startColumnIndex": 5, # F
                            "endColumnIndex": 6 
                        },
                        "rule": None
                    }
                },
                {
                    "setDataValidation": {
                        "range": {
                            "sheetId": ws.id,
                            "startRowIndex": 1,
                            "endRowIndex": end_row,
                            "startColumnIndex": 8, # I
                            "endColumnIndex": 9 
                        },
                        "rule": None
                    }
                },
                {
                    "setDataValidation": {
                        "range": {
                            "sheetId": ws.id,
                            "startRowIndex": 1,
                            "endRowIndex": end_row,
                            "startColumnIndex": 10, # K
                            "endColumnIndex": 11 
                        },
                        "rule": None
                    }
                },
                {
                    "setDataValidation": {
                        "range": {
                            "sheetId": ws.id,
                            "startRowIndex": 1,
                            "endRowIndex": end_row,
                            "startColumnIndex": 14, # O
                            "endColumnIndex": 15 
                        },
                        "rule": None
                    }
                }
            ]
        }
        sh.batch_update(body)
        print("Cleared incorrect old validations.")
        print("SUCCESS! Validations fixed.")
        
    except gspread.WorksheetNotFound:
        print("3월 sheet not found.")
        

if __name__ == "__main__":
    main()
