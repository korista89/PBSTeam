from typing import Optional
import gspread
from app.services.sheets import get_sheets_client, settings, fetch_student_status
from app.core.picture_word_data import DOMAINS, VBS, VOCAB_DATA, LESSON_DATA
import time
import threading

# ── 상수 ──────────────────────────────────────────────────────
VB_COLS = {'청자': 7, '모방': 8, '명명': 9, '매칭': 10, '대화': 11, '요구': 12}
# 통합 시트 헤더 (학생 식별 정보 추가)
# 이전: ['번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜']
# 신규: ['학급ID', '학급명', '학생이름', '번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜']
VB_HEADERS = ['학급ID', '학급명', '학생이름', '번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜']
LESSON_HEADERS = ['차시', '영역', '언어행동', '제재', '목표', '수업날짜', '준비협의내용', '협의날짜', '수업자료1', '수업자료2', '수업자료3']
MINUTES_HEADERS = ['날짜', '구분', '출처(학생/차시)', '내용', '학급ID', '학급명']

# ── 시트 접근 헬퍼 ────────────────────────────────────────────
def get_all_records_with_row_index(ws) -> list[dict]:
    """get_all_records()와 유사하지만, 각 레코드에 '_row_index' 필드를 추가하여 반환함."""
    all_vals = ws.get_all_values()
    if not all_vals:
        return []
    headers = [h.strip() for h in all_vals[0]]
    records = []
    for r_idx, row in enumerate(all_vals[1:], start=2):
        if not any(str(cell).strip() for cell in row):
            continue
        record = dict(zip(headers, row))
        record['_row_index'] = r_idx
        records.append(record)
    return records

def get_pw_spreadsheet():
    client = get_sheets_client()
    if not client or not settings.SHEET_URL:
        return None
    try:
        return client.open_by_url(settings.SHEET_URL)
    except Exception as e:
        print(f"[PW] 시트 접근 오류: {e}")
        return None

def get_or_create_worksheet(ss, title: str, rows=200, cols=20):
    try:
        return ss.worksheet(title)
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title=title, rows=rows, cols=cols)
        return ws

# ─────────────────────────────────────────────────────────────
# 1. Roster (학생 명부) 관리 기반 - TierStatus 연동으로 변경
# ─────────────────────────────────────────────────────────────

_pw_cache = {"vocab": {}}
PW_CACHE_TTL = 60

def clear_pw_cache(class_id: Optional[str] = None):
    global _pw_cache
    if class_id:
        _pw_cache["vocab"][class_id] = {"data": [], "timestamp": 0}
    else:
        _pw_cache["vocab"] = {}

def get_global_vocab_ws(ss):
    """글로벌 통합 어휘 데이터 시트 (PW_어휘데이터) 확보 및 초기화"""
    title = 'PW_어휘데이터'
    try:
        return ss.worksheet(title)
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title=title, rows=15000, cols=16)
        ws.append_row(VB_HEADERS)
        time.sleep(1)
        return ws

def fetch_global_vocab_records():
    global _pw_cache
    now = time.time()
    
    cache_entry = _pw_cache["vocab"].get("GLOBAL")
    if cache_entry and cache_entry["data"] and (now - cache_entry["timestamp"] < PW_CACHE_TTL):
        return cache_entry["data"]
        
    ss = get_pw_spreadsheet()
    if not ss:
        return []
    ws = get_global_vocab_ws(ss)
    
    try:
        records = get_all_records_with_row_index(ws)
        _pw_cache["vocab"]["GLOBAL"] = {"data": records, "timestamp": now}
        return records
    except Exception as e:
        print(f"[PW] Error fetching global vocab: {e}")
        return []


def fetch_all_students() -> list[dict]:
    """TierStatus 시트에서 전체 재학 중인 학생 목록 반환"""
    # TierStatus 데이터 가져오기 (sheets.py 함수 활용)
    all_status = fetch_student_status()
    # 재학여부 'O'인 학생 매핑
    students = []
    
    # TierStatus의 학급 정보 ('초등 1학년 1반' 형태)를 학급 ID ('211')로 변환
    # 간단 매핑 또는 실제 ID가 필요함.
    for r in all_status:
        if str(r.get('재학여부', 'O')).strip().upper() == 'O':
            code = str(r.get('학생코드', ''))
            name = str(r.get('학생이름', code))
            # 학생코드가 4자리인 경우에만 처리
            if len(code) >= 3:
                class_id = code[:3]
            else:
                class_id = ''
            
            students.append({
                '학급ID': class_id,
                '학급명': r.get('학급', ''),
                '학생번호': code,
                '학생이름': name
            })
    return students

def fetch_students_by_class(class_id: str) -> list[dict]:
    """특정 학급의 재학 중인 학생 목록 반환"""
    all_students = fetch_all_students()
    return [s for s in all_students if str(s.get('학급ID', '')) == str(class_id)]

# 명부 관련 CRUD 액션 (추가/삭제)은 TierStatus 기준이 되었으므로 동작하지 않음
def add_student(class_id: str, class_name: str, student_num: int, student_name: str) -> dict:
    return {"message": "학생 관리는 TierStatus에서 자동으로 연동됩니다."}

def delete_student(class_id: str, student_name: str) -> dict:
    return {"message": "학생 관리는 TierStatus에서 자동으로 연동됩니다."}


# ─────────────────────────────────────────────────────────────
# 2. 통합 학생 체크리스트 (어휘 습득 현황) 
# 시트명: PW_어휘데이터
# ─────────────────────────────────────────────────────────────

_vocab_lock = threading.Lock()

def fetch_student_vocab(class_id: str, student_name: str) -> list[dict]:
    """특정 학생의 어휘 체크리스트 반환. 데이터 없으면 초기 데이터 주입."""
    with _vocab_lock:
        return _fetch_student_vocab_internal(class_id, student_name)

def _fetch_student_vocab_internal(class_id: str, student_name: str) -> list[dict]:
    ss = get_pw_spreadsheet()
    if not ss:
        return []
        
    ws = get_global_vocab_ws(ss)
    
    # Use centralized cache to avoid OOM and timeout
    records = fetch_global_vocab_records()
    
    student_records = []
    max_row_idx = 1 # 헤더 1번
    
    # Filter specific student
    for r in records:
        r_idx = r.get('_row_index', 0)
        max_row_idx = max(max_row_idx, r_idx)
        
        if str(r.get('학급ID', '')) == str(class_id) and str(r.get('학생이름', '')) == str(student_name):
            # 체크리스트 값 가공
            r_copy = dict(r) # Don't mutate the cached dictionary
            for vb in VBS:
                val = str(r_copy.get(vb, '')).strip().upper()
                r_copy[vb] = val in ('TRUE', '1', 'YES', '✓', 'O')
            # 합계 재계산
            r_copy['합계'] = sum(1 for vb in VBS if r_copy[vb])
            r_copy['row_index'] = r_idx # 업데이트를 위한 실제 시트 행 번호
            student_records.append(r_copy)
            
    # 데이터가 없다면 초기 어휘 123개 주입
    if not student_records:
        new_data = []
        cname = "Unknown"  # 가능하면 실제 학급명을 넣지만 일단 빈칸 허용
        for v in VOCAB_DATA:
            # ['학급ID', '학급명', '학생이름', '번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜']
            new_data.append([class_id, cname, student_name, v[0], v[1], v[2], '', '', '', '', '', '', 0, '', ''])
            
        # Bulk append
        ws.append_rows(new_data)
        
        # 다시 읽어옴 (막 추가했으니 O/X 전처리 필요없이 False로 반환 형태 맞춤)
        for idx, row in enumerate(new_data):
            r = dict(zip(VB_HEADERS, row))
            for vb in VBS:
                r[vb] = False
            r['row_index'] = max_row_idx + 1 + idx
            student_records.append(r)
            
    # 번호 순으로 정렬
    return sorted(student_records, key=lambda x: int(x.get('번호', 0)))

def update_student_vocab(class_id: str, student_name: str, vocab_id: int, updates: dict) -> dict:
    """통합 시트 기반 학생 어휘 데이터 단건 업데이트"""
    with _vocab_lock:
        ss = get_pw_spreadsheet()
        if not ss:
            return {"error": "Sheet not accessible"}
            
        ws = get_global_vocab_ws(ss)
        records = fetch_global_vocab_records()
    
    target_row = None
    # 검색
    for r in records:
        if str(r.get('학급ID', '')) == str(class_id) and str(r.get('학생이름', '')) == str(student_name) and int(r.get('번호', 0)) == int(vocab_id):
            target_row = r.get('_row_index')
            break
            
    if not target_row:
        return {"error": "단어 데이터를 찾을 수 없습니다."}

    # VB_COLS (1-based col index) mapping
    # 7:청자, 8:모방, ... 14:협의내용, 15:협의날짜
    col_map = {
        '청자': 7, '모방': 8, '명명': 9, '매칭': 10, '대화': 11, '요구': 12,
        '협의내용': 14, '협의날짜': 15
    }
    
    for key, val in updates.items():
        if key in col_map:
            if isinstance(val, bool):
                val_str = 'TRUE' if val else 'FALSE'
            else:
                val_str = str(val)
            ws.update_cell(target_row, col_map[key], val_str)

    # 합계 자동 계산 기능 (7~12 열)
    row_data = ws.row_values(target_row) # 0-based 리스트 반환
    total = 0
    # 열 범위: D~I 가 아니고 G~L 이므로 cols index = 6~11
    for col in range(6, 12):
        if col < len(row_data) and str(row_data[col]).upper() == 'TRUE':
            total += 1
            
    ws.update_cell(target_row, 13, total) # 13: 합계 열

    # [NEW RULE] 어휘 업데이트 후 인증제 배지 개수 계산 및 TierStatus 연동
    from app.services.sheets import update_tierstatus_certification
    cert_status = fetch_certification_status(class_id, student_name)
    update_tierstatus_certification(student_name, cert_status["total_badges"])

    clear_pw_cache()
    return {"message": "업데이트 완료", "total_badges": cert_status["total_badges"]}

def batch_update_student_vocab(class_id: str, student_name: str, payload: list[dict]) -> dict:
    """통합 시트 기반 학생 어휘 데이터 일괄 업데이트 (Debouncing용)
    payload = [{"vocab_id": 1, "updates": {"청자": True}}, ...]
    """
    with _vocab_lock:
        ss = get_pw_spreadsheet()
        if not ss:
            return {"error": "Sheet not accessible"}
            
        ws = get_global_vocab_ws(ss)
        records = fetch_global_vocab_records()
        
    # VB_COLS (1-based col index) mapping
    col_map = {
        '청자': 7, '모방': 8, '명명': 9, '매칭': 10, '대화': 11, '요구': 12,
        '협의내용': 14, '협의날짜': 15
    }
    
    batch_requests = []
    
    for item in payload:
        vocab_id = item["vocab_id"]
        updates = item["updates"]
        
        target_row_idx = None
        target_record = None
        for r in records:
            if str(r.get('학급ID', '')) == str(class_id) and str(r.get('학생이름', '')) == str(student_name) and int(r.get('번호', 0)) == int(vocab_id):
                target_row_idx = r.get('_row_index')
                target_record = r
                break
                
        if not target_row_idx or not target_record:
            continue
            
        # 1. Update individual fields
        for key, val in updates.items():
            if key in col_map:
                col_idx = col_map[key]
                
                # Fix: Strictly check boolean type so text strings don't turn into 'TRUE'
                if isinstance(val, bool):
                    val_str = 'TRUE' if val else 'FALSE'
                else:
                    val_str = str(val) if val is not None else ""
                
                # Apply locally to memory to compute the new total right after
                target_record[key] = val_str
                
                col_letter = chr(64 + col_idx) # works up to Z
                batch_requests.append({
                    "range": f"{col_letter}{target_row_idx}",
                    "values": [[val_str]]
                })
                
        # 2. Recalculate and append "합계" (Total) column (Col 13 / M)
        calculated_total = 0
        for b_key in ['청자', '모방', '명명', '매칭', '대화', '요구']:
            if str(target_record.get(b_key, '')).upper() == 'TRUE':
                calculated_total += 1
                
        batch_requests.append({
            "range": f"M{target_row_idx}",
            "values": [[calculated_total]]
        })
                
    if batch_requests:
        # Note: Depending on the gspread version, batch_update might complain if the ranges are completely out of order?
        # Actually gspread batch_update just sends all "updateCells" requests sequentially to the Google API.
        ws.batch_update(batch_requests)
        
    clear_pw_cache()
    
    from app.services.sheets import update_tierstatus_certification
    cert_status = fetch_certification_status(class_id, student_name)
    update_tierstatus_certification(student_name, cert_status["total_badges"])
    
    return {"message": f"{len(batch_requests)} cells updated via batch", "total_badges": cert_status["total_badges"]}


# ─────────────────────────────────────────────────────────────
# 3. 수업 가이드
# 시트명: PW_수업가이드
# ─────────────────────────────────────────────────────────────
def get_lesson_ws(ss):
    try:
        return ss.worksheet('PW_수업가이드')
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title='PW_수업가이드', rows=300, cols=12)
        ws.append_row(LESSON_HEADERS)
        # 기본 수업 데이터 입력
        data = []
        lesson_num = 1
        for domain in DOMAINS:
            lessons = LESSON_DATA.get(domain, [])
            for i, vb in enumerate(VBS):
                if i < len(lessons):
                    subj, goal = lessons[i]
                    data.append([lesson_num, domain, vb, subj, goal, '', '', '', '', '', ''])
                    lesson_num += 1
        ws.update(f'A2:K{len(data)+1}', data)
        time.sleep(1)
        return ws


def fetch_lessons() -> list[dict]:
    ss = get_pw_spreadsheet()
    if not ss:
        return []
    ws = get_lesson_ws(ss)
    return ws.get_all_records()

def update_lesson(lesson_num: int, updates: dict) -> dict:
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    ws = get_lesson_ws(ss)
    row_num = lesson_num + 1
    col_map = {
        '수업날짜': 6, '준비협의내용': 7, '협의날짜': 8,
        '수업자료1': 9, '수업자료2': 10, '수업자료3': 11
    }
    for key, val in updates.items():
        if key in col_map:
            ws.update_cell(row_num, col_map[key], str(val))
    return {"message": "수업 정보 업데이트 완료"}

# ─────────────────────────────────────────────────────────────
# 4. 협의록 (통합)
# 시트명: PW_협의록
# ─────────────────────────────────────────────────────────────
def get_minutes_ws(ss):
    try:
        return ss.worksheet('PW_협의록')
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title='PW_협의록', rows=500, cols=6)
        ws.append_row(MINUTES_HEADERS)
        return ws

def fetch_minutes(class_id: str = None) -> list[dict]:
    ss = get_pw_spreadsheet()
    if not ss:
        return []
    
    # 1. PW_협의록 데이터
    ws_min = get_minutes_ws(ss)
    all_vals_min = ws_min.get_all_values()
    minutes = []
    
    if len(all_vals_min) > 1:
        headers = [h.strip() for h in all_vals_min[0]]
        for r_idx, row in enumerate(all_vals_min[1:], start=2):
            # 행을 dict로 변환 (헤더 길이만큼만 취함)
            r = dict(zip(headers, row))
            # 내용이 없으면 스킵 고려 가능하나, 일단 행 인덱스 유지를 위해 모두 가져옴
            if any(row):
                minutes.append({
                    "날짜": str(r.get('날짜', '')),
                    "구분": str(r.get('구분', '')),
                    "출처(학생/차시)": str(r.get('출처(학생/차시)', '')),
                    "내용": str(r.get('내용', '')),
                    "학급ID": str(r.get('학급ID', '')),
                    "학급명": str(r.get('학급명', '')),
                    "source_type": "minutes",
                    "row_index": r_idx
                })
    
    # 2. PW_수업가이드의 '준비협의내용' 가져오기
    ws_lesson = get_lesson_ws(ss)
    all_vals_lesson = ws_lesson.get_all_values()
    if len(all_vals_lesson) > 1:
        headers = [h.strip() for h in all_vals_lesson[0]]
        for r_idx, row in enumerate(all_vals_lesson[1:], start=2):
            r = dict(zip(headers, row))
            prep_content = str(r.get('준비협의내용', '')).strip()
            if prep_content:
                minutes.append({
                    "날짜": str(r.get('협의날짜', '')),
                    "구분": "수업준비",
                    "출처(학생/차시)": f"{r.get('차시', '')}차시({r.get('영역','')})",
                    "내용": prep_content,
                    "학급ID": "G",
                    "학급명": "수업가이드",
                    "source_type": "lessons",
                    "row_index": r_idx,
                    "lesson_num": str(r.get('차시', '')) # ID 기반 업데이트를 위해 추가
                })

    if class_id:
        minutes = [r for r in minutes if str(r.get('학급ID', '')) == str(class_id) or r.get("source_type") == "lessons"]
    
    return sorted(minutes, key=lambda x: str(x.get('날짜', '')), reverse=True)

def add_minute_entry(date: str, kind: str, source: str, content: str, class_id: str = '', class_name: str = '') -> dict:
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    ws = get_minutes_ws(ss)
    ws.append_row([date, kind, source, content, class_id, class_name])
    clear_pw_cache()
    return {"message": "협의록 추가 완료"}

def update_minute_entry(source_type: str, row_index: int, updates: dict) -> dict:
    import time
    max_retries = 2
    last_error = None
    
    print(f"[PW] update_minute_entry(source_type={source_type}, row_index={row_index}, updates_keys={list(updates.keys())})")
    
    for attempt in range(max_retries + 1):
        try:
            ss = get_pw_spreadsheet()
            if not ss:
                return {"error": "구글 시트에 접근할 수 없습니다."}
                
            if source_type == "minutes":
                ws = get_minutes_ws(ss)
                col_map = {"날짜": 1, "구분": 2, "출처(학생/차시)": 3, "내용": 4, "학급ID": 5, "학급명": 6}
                target_row = row_index
            elif source_type == "lessons":
                ws = get_lesson_ws(ss)
                col_map = {"내용": 7, "날짜": 8}
                
                lesson_num = updates.get("lesson_num")
                if lesson_num:
                    records = get_all_records_with_row_index(ws)
                    target_row = next((r["_row_index"] for r in records if str(r.get("차시")).strip() == str(lesson_num).strip()), None)
                    if not target_row:
                        print(f"[PW] Lesson {lesson_num} not found. Fallback to row_index {row_index}")
                        target_row = row_index
                else:
                    target_row = row_index
            else:
                return {"error": f"지원하지 않는 소스 타입입니다: {source_type}"}

            if not target_row or target_row < 2:
                return {"error": f"유효하지 않은 행 번호입니다: {target_row}"}

            print(f"[PW] Updating {source_type} at absolute row {target_row}...")
            
            for key, val in updates.items():
                if key in col_map:
                    col_idx = col_map[key]
                    print(f"[PW]   -> col {col_idx} ({key}) = '{val}'")
                    ws.update_cell(target_row, col_idx, str(val))
            
            clear_pw_cache()
            return {"message": "업데이트 완료", "row": target_row}
            
        except Exception as e:
            last_error = e
            print(f"[PW] Update Error (Attempt {attempt+1}): {e}")
            if attempt < max_retries:
                time.sleep(1)
                continue
            break
            
    return {
        "error": f"업데이트 실패: {str(last_error)}", 
        "details": {
            "source": source_type,
            "tried_row": target_row if 'target_row' in locals() else row_index,
            "updates_count": len(updates)
        }
    }

def delete_minute_entry(source_type: str, row_index: int) -> dict:
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
        
    if source_type == "minutes":
        ws = get_minutes_ws(ss)
        ws.delete_rows(row_index)
    elif source_type == "lessons":
        ws = get_lesson_ws(ss)
        # 수업가이드는 행 자체를 지우면 안됨. 내용만 비움.
        ws.update_cell(row_index, 7, "")
        ws.update_cell(row_index, 8, "")
    else:
        return {"error": "Invalid source_type"}
        
    return {"message": "삭제/초기화 완료"}

# ─────────────────────────────────────────────────────────────
# 5. 학급 현황 (Overview)
# ─────────────────────────────────────────────────────────────
def fetch_class_overview(class_id: str = None) -> list[dict]:
    """TierStatus에 등록된 재학 학생 기준으로 현황 계산"""
    students = fetch_students_by_class(class_id) if class_id else fetch_all_students()
    results = []
    
    # class_id 없으면 전체 재학생 학급들 각각 로드 (비추천이나, 이전 호환용으로 유지)
    # Overview는 보통 특정 학급만 보게 되므로 class_id를 우선시.
    class_ids_to_fetch = [class_id] if class_id else list(set(str(s.get('학급ID', '')) for s in students if s.get('학급ID')))
    
    all_vocab_records = fetch_global_vocab_records()
        
    for s in students:
        cid = str(s.get('학급ID', ''))
        sname = s.get('학생이름', '')
        class_name = s.get('학급명', '')
        
        # 필터
        vocab = [r for r in all_vocab_records if str(r.get('학급ID', '')) == cid and str(r.get('학생이름', '')) == sname]
        
        if not vocab:
            # 아직 데이터 활성화가 안된 학생도 Overview에 포함 (진행률 0%)
            domain_counts = {domain: 0 for domain in DOMAINS}
        else:
            domain_counts = {}
            for domain in DOMAINS:
                count = sum(1 for v in vocab if v.get('범주') == domain and any(v.get(vb, False) for vb in VBS))
                domain_counts[domain] = count
            
        results.append({
            "class_id": cid,
            "class_name": class_name,
            "student_name": sname,
            "domain_progress": domain_counts,
            "total_learned": sum(domain_counts.values())
        })
    return results

# ─────────────────────────────────────────────────────────────
# 6. 인증제 현황
# ─────────────────────────────────────────────────────────────
def fetch_certification_status(class_id: str, student_name: str) -> dict:
    vocab = fetch_student_vocab(class_id, student_name)
    if not vocab:
        return {"domains": [], "total_badges": 0, "max_badges": len(DOMAINS), "all_achieved": False}
        
    cert_data = []
    total_badges = 0
    for domain in DOMAINS:
        met = sum(
            1 for v in vocab
            if v.get('범주') == domain and sum(1 for vb in VBS if v.get(vb, False)) >= 1
        )
        # [NEW RULE] 영역당 최소 8개 이상 (기존 6개에서 상향)
        achieved = met >= 8
        if achieved:
            total_badges += 1
        cert_data.append({
            "domain": domain,
            "met_words": met,
            "total_words": 12,
            "required": 8,
            "is_achieved": achieved,
            "progress_pct": min(100, int((met / 8) * 100))
        })
    all_achieved = total_badges == len(DOMAINS)
    return {
        "domains": cert_data,
        "total_badges": total_badges,
        "max_badges": len(DOMAINS),
        "all_achieved": all_achieved
    }

# ─────────────────────────────────────────────────────────────
# 7. 초기화
# ─────────────────────────────────────────────────────────────
def init_picture_word_system() -> dict:
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    created = []
    
    # 개별 시트이므로 초기화 시엔 따로 생성 체크를 안함 (각 학급별 접근 시 생성됨)
    # 기존 PW_어휘데이터 가 있으면 무시.
    # 단지 수업가이드와 협의록만 초기화.
        
    get_lesson_ws(ss)
    time.sleep(0.5)
    get_minutes_ws(ss)
    return {"message": "초기화 완료 (단일 통합 시트 기반)", "sheets_created": created}
