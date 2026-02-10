from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.services.sheets import get_sheets_client, settings, refresh_dashboard_data
import gspread
import gspread.utils

router = APIRouter()

class CicoDailyUpdate(BaseModel):
    student_code: str
    goal_met: Optional[str] = None # O/X
    rate: Optional[str] = None # 80%
    memo: Optional[str] = None

class CicoBulkUpdateRequest(BaseModel):
    date: str # YYYY-MM-DD
    updates: List[CicoDailyUpdate]

@router.get("/daily")
async def get_cico_daily(date: str = Query(..., description="YYYY-MM-DD")):
    """
    Fetch CICO data for all Tier 2 students for a specific date.
    Reads from the corresponding Monthly Sheet.
    """
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        raise HTTPException(status_code=500, detail="Sheet not accessible")
    
    try:
        # Parse date
        # YYYY-MM-DD -> Month (int) -> "X월"
        y, m, d = date.split("-")
        month_name = f"{int(m)}월"
        day_str = str(int(d)) # Remove leading zero
        
        sheet = client.open_by_url(settings.SHEET_URL)
        try:
            ws = sheet.worksheet(month_name)
        except gspread.WorksheetNotFound:
            raise HTTPException(status_code=404, detail=f"Sheet {month_name} not found")
        
        rows = ws.get_all_values()
        if len(rows) < 2:
            return []
            
        headers = rows[0]
        
        # Find Columns
        try:
            code_col = headers.index("학생코드")
            tier_col = headers.index("Tier2")
            name_col = headers.index("번호") # Actually Name is usually not in monthly sheet? 
            # In initialize_monthly_sheets: Headers = ["번호", "학급", "학생코드", ...]
            # Wait, "번호" is Number. Name is not there?
            # User said "Input all targets in one window". Teacher needs to know WHO it is.
            # Roster in TierStatus has Name? "학생코드" is key.
            # Let's check TierStatus again.
            # ['1', '유치원 0학년 1반', '1011', ...] -> No name?
            # Analysis.py used "학생명" from raw data but TierStatus has "번호"?
            # Ah, `Config` usually has Name.
            # `TierStatus` row: [No, Class, Code, Enrolled, BeAble, T1, T2(CICO)...]
            # Where is Name?
            # Maybe column 0 is Name? No, `['1', '유치원...']`
            
            # If Name is missing, we must rely on Code or fetch Name from Config.
            # Let's assume we fetch Name from Config or TierStatus if available.
            # But wait, `initialize_monthly_sheets` wrote: `[s['no'], s['class'], s['code']...]`.
            # So monthly sheet has No, Class, Code. No Name.
            # We might need to join with TierStatus or just return what we have.
            
            # Find Date Column
            # Headers have "1", "2", ... "31"
            date_col = -1
            if day_str in headers:
                date_col = headers.index(day_str)
            
            # Find Memo/Goal Met/Rate (Daily)
            # Actually, the monthly sheet has columns for *each day*?
            # `headers.extend(days)` -> So we have columns "1", "2"...
            # The value in date column is "O/X" or rate/score?
            # In `CICO_System_v4_Updated.js`:
            # `sheet.getRange(row, col).setValue(val)` -> val is what?
            # Guide says: "빈도 체크면 숫자, 수행 여부면 O/X"
            # So the date cell contains the *primary data* (Rate or Check).
            
            # What about Goal Met and Memo?
            # In the *backend* monthly sheet structure I created:
            # Stats columns (Rate, GoalMet, Memo) are at the *end*.
            # This implies they are *Summary* stats for the month?
            # OR are they daily?
            # `CICO_System_v4_Updated.js` says:
            # "매 일... 해당 날짜 칸에 결과 입력"
            # It seems the *Daily* input is just ONE value per day (the date column).
            # The "Rate" at the end is the *Average* for the month.
            # Detailed daily breakdown (e.g. daily memo) might not be in the monthly sheet structure?
            # Protocol Says: "2. 실행/입력... 해당 날짜 칸에 결과 입력"
            
            # WAIT. The user wants "CICO Bulk Input".
            # If it's just one cell per day, that's easy.
            # But usually CICO has "Goal Met?" (O/X) AND "Percentage"?
            # The sheet structure has:
            # `headers.extend(days)` -> Cols 10...40
            # `headers.extend(["수행/발생률", "성취도(추세)", "교사메모"...])` -> Monthly Summary.
            
            # So, for a *specific day*, we only have ONE column.
            # So we can only input ONE value (e.g., "O", "X", "80%").
            # Is that enough?
            # Guide: "빈도 체크면 숫자, 수행 여부면 O/X"
            
            # Ok, so the API should allow updating that ONE cell for the date.
            
        except ValueError:
            raise HTTPException(status_code=500, detail="Sheet headers mismatch")

        result = []
        for i, row in enumerate(rows[1:], start=2): # 1-based index for GSheet update
            if len(row) > max(code_col, tier_col):
                if row[tier_col] == "O": # Tier 2 only
                    student_data = {
                        "row_idx": i,
                        "student_code": row[code_col],
                        "class": row[headers.index("학급")] if "학급" in headers else "",
                        "no": row[headers.index("번호")] if "번호" in headers else "",
                        "target_behavior": row[headers.index("목표행동")] if "목표행동" in headers else "",
                        "value": row[date_col] if date_col != -1 and date_col < len(row) else ""
                    }
                    result.append(student_data)
        
        return result

    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/daily")
async def update_cico_daily_bulk(request: CicoBulkUpdateRequest):
    client = get_sheets_client()
    if not client: raise HTTPException(status_code=500, detail="Client Error")
    
    y, m, d = request.date.split("-")
    month_name = f"{int(m)}월"
    day_str = str(int(d))
    
    try:
        sheet = client.open_by_url(settings.SHEET_URL)
        ws = sheet.worksheet(month_name)
        
        # We need to map student_code to Row Index
        # Reading all values again to be safe
        rows = ws.get_all_values()
        headers = rows[0]
        code_col = headers.index("학생코드")
        date_col = headers.index(day_str)
        # GSpread cols are 1-based. List index is 0-based.
        # So date_col index `k` means column `k+1`.
        
        # Create a batch update list
        batch_updates = []
        
        # Map code to row index
        code_row_map = {}
        for idx, row in enumerate(rows):
            if len(row) > code_col:
                code_row_map[str(row[code_col]).strip()] = idx + 1 # 1-based row
        
        for update in request.updates:
            if update.student_code in code_row_map:
                row_num = code_row_map[update.student_code]
                # Update the Date Cell
                # Cell (row_num, date_col + 1)
                if update.rate is not None:
                     batch_updates.append({
                         'range': gspread.utils.rowcol_to_a1(row_num, date_col + 1),
                         'values': [[update.rate]]
                     })
        
        if batch_updates:
            ws.batch_update(batch_updates)
            
            # Post-update: Refresh Dashboard?
            # Since dashboard depends on monthly data, we should refresh it.
            # But refreshing full dashboard is heavy.
            # Maybe async background task? 
            # For now, let's just do it.
            try:
                dash_ws = sheet.worksheet("Tier2_대시보드")
                refresh_dashboard_data(sheet, dash_ws)
            except:
                pass

        return {"message": f"Updated {len(batch_updates)} records"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
