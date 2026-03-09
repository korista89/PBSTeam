import os
import sys
import time
import pandas as pd
from collections import defaultdict
import gspread

# Setup path so we can import app
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))
from app.services.sheets import get_sheets_client, settings
from app.core.picture_word_data import VBS

VB_HEADERS = ['학급ID', '학급명', '학생이름', '번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜']

def main():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        print("Failed to get google sheets client.")
        return
    ss = client.open_by_url(settings.SHEET_URL)
    
    try:
        ws_global = ss.worksheet('PW_어휘데이터')
    except gspread.WorksheetNotFound:
        print("PW_어휘데이터 sheet not found. Migration not needed.")
        return

    print("Fetching all records from PW_어휘데이터...")
    try:
        records = ws_global.get_all_records()
    except Exception as e:
        print(f"Fallback to get_all_values: {e}")
        all_vals = ws_global.get_all_values()
        if len(all_vals) < 2:
            records = []
        else:
            headers = all_vals[0]
            records = []
            for row in all_vals[1:]:
                rec = {}
                for ci, h in enumerate(headers):
                    if ci < len(row) and h:
                        rec[h] = row[ci]
                records.append(rec)

    if not records:
        print("No records found to migrate.")
        return

    print(f"Total raw records loaded: {len(records)}")

    # Deduplication logic
    # Group by (class_id, student_name, vocab_id)
    # We want to keep the "most checked" instance
    # i.e., OR operation on boolean columns, and keep the longest consultation text/date.
    
    # Structure: class_id -> student_name -> vocab_number -> record
    sharded_data = defaultdict(lambda: defaultdict(dict))

    def to_bool(val):
        return str(val).strip().upper() in ('TRUE', '1', 'YES', '✓', 'O')

    for r in records:
        cid = str(r.get('학급ID', '')).strip()
        sname = str(r.get('학생이름', '')).strip()
        
        # fallback: if no cid, try to deduce it or skip? We must have cid for sharding.
        if not cid:
            continue
            
        try:
            vnum = int(r.get('번호', -1))
        except:
            vnum = -1
        if vnum == -1:
            continue

        cname = r.get('학급명', '')
        category = r.get('범주', '')
        vocab_word = r.get('어휘', '')
        consult = str(r.get('협의내용', '')).strip()
        consult_date = str(r.get('협의날짜', '')).strip()

        # Build boolean array
        bools = {vb: to_bool(r.get(vb, '')) for vb in VBS}

        existing = sharded_data[cid][sname].get(vnum)
        if existing:
            # Merge
            for vb in VBS:
                existing['bools'][vb] = existing['bools'][vb] or bools[vb]
            
            # Use longer consultation
            if len(consult) > len(existing['consult']):
                existing['consult'] = consult
                existing['consult_date'] = consult_date
            
            # Also keep latest class name
            if cname and not existing['cname']:
                existing['cname'] = cname
        else:
            sharded_data[cid][sname][vnum] = {
                'cname': cname,
                'category': category,
                'vocab_word': vocab_word,
                'bools': bools,
                'consult': consult,
                'consult_date': consult_date
            }

    print("Data grouped and deduplicated. Processing sheets...")

    for cid, students in sharded_data.items():
        sheet_name = f"PW_어휘_{cid}"
        try:
            ws = ss.worksheet(sheet_name)
            print(f"Sheet {sheet_name} already exists. Skipping or clearing first.")
            # For safety, let's clear it and rewrite.
            ws.clear()
        except gspread.WorksheetNotFound:
            print(f"Creating sheet {sheet_name}...")
            ws = ss.add_worksheet(title=sheet_name, rows=2000, cols=16)
        
        # Prepare rows
        rows_to_insert = [VB_HEADERS]
        
        # Sort students by name, then by vocab id
        for sname in sorted(students.keys()):
            s_data = students[sname]
            for vnum in sorted(s_data.keys()):
                d = s_data[vnum]
                # '학급ID', '학급명', '학생이름', '번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜'
                
                b1 = 'TRUE' if d['bools'].get('청자') else 'FALSE'
                b2 = 'TRUE' if d['bools'].get('모방') else 'FALSE'
                b3 = 'TRUE' if d['bools'].get('명명') else 'FALSE'
                b4 = 'TRUE' if d['bools'].get('매칭') else 'FALSE'
                b5 = 'TRUE' if d['bools'].get('대화') else 'FALSE'
                b6 = 'TRUE' if d['bools'].get('요구') else 'FALSE'
                
                total = sum([d['bools'].get(vb, False) for vb in VBS])
                
                row = [
                    cid,
                    d['cname'],
                    sname,
                    vnum,
                    d['category'],
                    d['vocab_word'],
                    b1, b2, b3, b4, b5, b6,
                    total,
                    d['consult'],
                    d['consult_date']
                ]
                rows_to_insert.append(row)
        
        print(f"Writing {len(rows_to_insert)-1} rows to {sheet_name}...")
        ws.update(f'A1:O{len(rows_to_insert)}', rows_to_insert)
        time.sleep(1.5) # rate limit prevention

    print("Migration complete. Renaming old PW_어휘데이터 to PW_어휘데이터_BACKUP")
    try:
        ws_global.update_title('PW_어휘데이터_BACKUP')
    except Exception as e:
        print(f"Failed to rename old sheet: {e}")

if __name__ == '__main__':
    main()
