
import gspread
from gspread_formatting import *
from app.services.sheets import get_sheets_client, settings
from app.core.picture_word_data import DOMAINS, VBS, VOCAB_DATA, LESSON_DATA
from datetime import datetime
import time

def get_picture_word_sheet():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return None
    try:
        return client.open_by_url(settings.SHEET_URL)
    except Exception as e:
        print(f"Error opening sheet: {e}")
        return None

def init_picture_word_sheets():
    ss = get_picture_word_sheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    
    # 1. Lesson Guide Sheet
    try:
        guide_sheet = ss.worksheet("수업 가이드")
    except gspread.WorksheetNotFound:
        print("Creating '수업 가이드'...")
        guide_sheet = ss.add_worksheet(title="수업 가이드", rows=100, cols=12)
        # Header formatting
        format_cell_range(guide_sheet, 'A1:K1', CellFormat(
            backgroundColor=Color(0.08, 0.39, 0.75), # #1565C0
            textFormat=TextFormat(bold=True, foregroundColor=Color(1,1,1)),
            horizontalAlignment='CENTER'
        ))
        set_frozen(guide_sheet, rows=1)
        
        headers = ['차시','영역','언어행동','제재','목표','수업날짜','준비협의내용','협의날짜','수업자료1','수업자료2','수업자료3']
        guide_sheet.append_row(headers)
        
        # Populate lesson data
        data = []
        lesson_num = 1
        for domain in DOMAINS:
            lessons = LESSON_DATA.get(domain, [])
            for i, vb in enumerate(VBS):
                if i < len(lessons):
                    subj, goal = lessons[i]
                    data.append([lesson_num, domain, vb, subj, goal, '', '', '', '', '', ''])
                    lesson_num += 1
        
        guide_sheet.update(f'A2:K{len(data)+1}', data)
        time.sleep(1)

    # 2. Student Sheets (1-7)
    for i in range(1, 8):
        sheet_name = f"학생{i}"
        try:
            ss.worksheet(sheet_name)
        except gspread.WorksheetNotFound:
            print(f"Creating '{sheet_name}'...")
            st_sheet = ss.add_worksheet(title=sheet_name, rows=200, cols=15)
            headers = ['번호','범주','어휘','청자','모방','명명','매칭','대화','요구','합계','평가협의내용','협의날짜']
            st_sheet.append_row(headers)
            
            # Populate vocab data
            # VOCAB_DATA is [ [id, category, word], ... ]
            data = []
            for v in VOCAB_DATA:
                # Add checkboxes (False by default)
                # row structure: [id, category, word, False, False, False, False, False, False, sum, consult, date]
                # In GS rows, sum is J column (10th) which will be a formula
                row = [v[0], v[1], v[2], 'FALSE', 'FALSE', 'FALSE', 'FALSE', 'FALSE', 'FALSE', 0, '', '']
                data.append(row)
            
            st_sheet.update(f'A2:L{len(data)+1}', data)
            time.sleep(1)

    # 3. Overview Sheet
    try:
        ss.worksheet("학급현황")
    except gspread.WorksheetNotFound:
        print("Creating '학급현황'...")
        ov_sheet = ss.add_worksheet(title="학급현황", rows=30, cols=15)
        headers = ['영역', '학생1', '학생2', '학생3', '학생4', '학생5', '학생6', '학생7']
        ov_sheet.append_row(headers)
        
        data = [[d] + ['' for _ in range(7)] for d in DOMAINS]
        ov_sheet.update(f'A2:H{len(data)+1}', data)
        time.sleep(1)

    return {"message": "Picture-Word sheets initialized successfully"}

def fetch_student_vocab(student_num: int):
    ss = get_picture_word_sheet()
    if not ss: return []
    try:
        ws = ss.worksheet(f"학생{student_num}")
        records = ws.get_all_records()
        # Convert checkbox strings to booleans
        for r in records:
            for k in VBS:
                r[k] = str(r.get(k, '')).upper() == 'TRUE'
        return records
    except Exception as e:
        print(f"Error fetching student vocab: {e}")
        return []

def update_student_vocab(student_num: int, vocab_id: int, updates: dict):
    ss = get_picture_word_sheet()
    if not ss: return {"error": "Sheet not accessible"}
    try:
        ws = ss.worksheet(f"학생{student_num}")
        # Find row by ID (Column A)
        # Assuming ID matches row index for performance (id 1 is row 2)
        row_num = vocab_id + 1
        
        # Mapping VB names to column letters (D-I are columns 4-9)
        col_map = {
            '청자': 4, '모방': 5, '명명': 6, '매칭': 7, '대화': 8, '요구': 9,
            '평가협의내용': 11, '협의날짜': 12
        }
        
        cells_to_update = []
        for key, val in updates.items():
            if key in col_map:
                col = col_map[key]
                if isinstance(val, bool):
                    val_str = 'TRUE' if val else 'FALSE'
                    ws.update_cell(row_num, col, val_str)
                else:
                    ws.update_cell(row_num, col, str(val))
                    
        return {"message": "Updated successfully"}
    except Exception as e:
        print(f"Error updating vocab: {e}")
        return {"error": str(e)}

def fetch_lessons():
    ss = get_picture_word_sheet()
    if not ss: return []
    try:
        ws = ss.worksheet("수업 가이드")
        return ws.get_all_records()
    except Exception as e:
        print(f"Error fetching lessons: {e}")
        return []

def update_lesson(lesson_num: int, updates: dict):
    ss = get_picture_word_sheet()
    if not ss: return {"error": "Sheet not accessible"}
    try:
        ws = ss.worksheet("수업 가이드")
        row_num = lesson_num + 1
        
        col_map = {
            '수업날짜': 6, '준비협의내용': 7, '협의날짜': 8,
            '수업자료1': 9, '수업자료2': 10, '수업자료3': 11
        }
        
        for key, val in updates.items():
            if key in col_map:
                ws.update_cell(row_num, col_map[key], str(val))
        return {"message": "Lesson updated"}
    except Exception as e:
        print(f"Error updating lesson: {e}")
        return {"error": str(e)}

def fetch_overview():
    # Calculate progress for each student/domain
    # Certification criteria: domain-specific count of words with sum >= 2
    # But for raw overview, we just count words with at least 1 VB checked (>0)
    
    ss = get_picture_word_sheet()
    if not ss: return []
    
    results = []
    for i in range(1, 8):
        vocab = fetch_student_vocab(i)
        if not vocab: continue
        
        domain_counts = {}
        for domain in DOMAINS:
            # Count words in this domain that have at least one checkmark
            count = sum(1 for v in vocab if v['범주'] == domain and any(v.get(vb, False) for vb in VBS))
            domain_counts[domain] = count
            
        results.append({
            "student_name": f"학생{i}",
            "domain_progress": domain_counts,
            "total_learned": sum(domain_counts.values())
        })
    return results

def fetch_certification_status(student_num: int):
    # Logic: If a domain has >= 6 words with >= 2 VBs checked, it's "Achieved"
    vocab = fetch_student_vocab(student_num)
    if not vocab: return []
    
    cert_data = []
    for domain in DOMAINS:
        # Checkwords where at least 2 VBs are True
        met_words = 0
        for v in vocab:
            if v['범주'] == domain:
                vbs_checked = sum(1 for vb in VBS if v.get(vb, False))
                if vbs_checked >= 2:
                    met_words += 1
        
        is_achieved = met_words >= 6
        cert_data.append({
            "domain": domain,
            "met_words": met_words,
            "total_words": 12,
            "is_achieved": is_achieved
        })
    return cert_data

def fetch_picture_word_minutes():
    ss = get_picture_word_sheet()
    if not ss: return []
    
    entries = []
    
    # 1. From Students
    for i in range(1, 8):
        vocab = fetch_student_vocab(i)
        for v in vocab:
            if v.get('평가협의내용') and v.get('협의날짜'):
                entries.append({
                    "date": v['협의날짜'],
                    "source": f"학생{i} ({v['어휘']})",
                    "type": "평가협의",
                    "content": v['평가협의내용']
                })
                
    # 2. From Lessons
    lessons = fetch_lessons()
    for l in lessons:
        if l.get('준비협의내용') and l.get('협의날짜'):
            entries.append({
                "date": l['협의날짜'],
                "source": f"{l.get('차시', l.get('번호'))}차시: {l.get('제재')}",
                "type": "수업협의",
                "content": l['준비협의내용']
            })
            
    # Sort by date
    entries.sort(key=lambda x: str(x['date']), reverse=True)
    return entries
