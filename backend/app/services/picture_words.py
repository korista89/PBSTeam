import gspread
from app.services.sheets import get_sheets_client, settings, fetch_student_status
from app.core.picture_word_data import DOMAINS, VBS, VOCAB_DATA, LESSON_DATA
import time

# ── 상수 ──────────────────────────────────────────────────────
VB_COLS = {'청자': 7, '모방': 8, '명명': 9, '매칭': 10, '대화': 11, '요구': 12}
# 통합 시트 헤더 (학생 식별 정보 추가)
# 이전: ['번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜']
# 신규: ['학급ID', '학급명', '학생이름', '번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜']
VB_HEADERS = ['학급ID', '학급명', '학생이름', '번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜']
LESSON_HEADERS = ['차시', '영역', '언어행동', '제재', '목표', '수업날짜', '준비협의내용', '협의날짜', '수업자료1', '수업자료2', '수업자료3']
MINUTES_HEADERS = ['날짜', '구분', '출처(학생/차시)', '내용', '학급ID', '학급명']

# ── 시트 접근 헬퍼 ────────────────────────────────────────────
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
            # 학생코드가 4자리인 경우에만 처리
            if len(code) >= 3:
                class_id = code[:3]
            else:
                class_id = ''
            
            # 학생 이름은 TierStatus에 명시되어 있지 않다면 학생코드나 다른 식별자로 표기
            # * TierStatus 시트 구조상 학생 개인 이름이 없고 학생코드로 관리됨
            # 사용자 요구사항대로 "학생이름" 필드는 "학생코드"로 대체
            students.append({
                '학급ID': class_id,
                '학급명': r.get('학급', ''),
                '학생번호': code,
                '학생이름': code  # 이름 필드에 코드 저장
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

def get_global_vocab_ws(ss):
    """글로벌 어휘 데이터 시트 확보 및 초기화"""
    try:
        ws = ss.worksheet('PW_어휘데이터')
        return ws
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title='PW_어휘데이터', rows=25000, cols=16)
        ws.append_row(VB_HEADERS)
        time.sleep(1)
        return ws

def fetch_student_vocab(class_id: str, student_name: str) -> list[dict]:
    """특정 학생의 어휘 체크리스트 반환. 데이터 없으면 초기 데이터 주입."""
    ss = get_pw_spreadsheet()
    if not ss:
        return []
        
    ws = get_global_vocab_ws(ss)
    
    # 캐시/최적화 없이 전체 가져오기.
    # TODO: 데이터가 25,000줄이 넘어가면 get_all_records() 호출에 시간이 걸릴 수 있습니다.
    records = ws.get_all_records()
    
    student_records = []
    max_row_idx = 1 # 헤더 1번
    
    # Filter specific student
    for idx, r in enumerate(records):
        max_row_idx = max(max_row_idx, idx + 2) # +2 for 1-based and header
        
        if str(r.get('학급ID', '')) == str(class_id) and str(r.get('학생이름', '')) == str(student_name):
            # 체크리스트 값 가공
            for vb in VBS:
                val = str(r.get(vb, '')).strip().upper()
                r[vb] = val in ('TRUE', '1', 'YES', '✓', 'O')
            # 합계 재계산
            r['합계'] = sum(1 for vb in VBS if r[vb])
            r['row_index'] = idx + 2 # 업데이트를 위한 실제 시트 행 번호
            student_records.append(r)
            
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
    """통합 시트 기반 학생 어휘 데이터 업데이트"""
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
        
    ws = get_global_vocab_ws(ss)
    records = ws.get_all_records()
    
    target_row = None
    # 업데이트할 행 번호 찾기 (선형 탐색 - 나중에 최적화 포인트)
    for idx, r in enumerate(records):
        if str(r.get('학급ID', '')) == str(class_id) and str(r.get('학생이름', '')) == str(student_name) and int(r.get('번호', -1)) == vocab_id:
            target_row = idx + 2
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

    return {"message": "업데이트 완료", "total_badges": cert_status["total_badges"]}
    row_data = ws.row_values(target_row) # 0-based 리스트 반환
    total = 0
    # 열 범위: D~I 가 아니고 G~L 이므로 cols index = 6~11
    for col in range(6, 12):
        if col < len(row_data) and str(row_data[col]).upper() == 'TRUE':
            total += 1
            
    ws.update_cell(target_row, 13, total) # 13: 합계 열

    return {"message": "업데이트 완료"}

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
    ws = get_minutes_ws(ss)
    records = ws.get_all_records()
    if class_id:
        records = [r for r in records if str(r.get('학급ID', '')) == str(class_id)]
    return sorted(records, key=lambda x: str(x.get('날짜', '')), reverse=True)

def add_minute_entry(date: str, kind: str, source: str, content: str, class_id: str = '', class_name: str = '') -> dict:
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    ws = get_minutes_ws(ss)
    ws.append_row([date, kind, source, content, class_id, class_name])
    return {"message": "협의록 추가 완료"}

def delete_minute_entry(row_index: int) -> dict:
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    ws = get_minutes_ws(ss)
    ws.delete_rows(row_index + 1)
    return {"message": "삭제 완료"}

# ─────────────────────────────────────────────────────────────
# 5. 학급 현황 (Overview)
# ─────────────────────────────────────────────────────────────
def fetch_class_overview(class_id: str = None) -> list[dict]:
    """TierStatus에 등록된 재학 학생 기준으로 현황 계산"""
    students = fetch_students_by_class(class_id) if class_id else fetch_all_students()
    results = []
    
    # 미리 모든 데이터를 한 번 읽어옵니다. (매 학생마다 API 호출을 피하기 위함)
    ss = get_pw_spreadsheet()
    if not ss:
        return []
        
    try:
        # DB에서 어휘 시트를 로드하고 한방에 캐싱
        ws = ss.worksheet('PW_어휘데이터')
        all_vocab_records = ws.get_all_records()
    except gspread.WorksheetNotFound:
        # 데이터가 아직 아예 없으면
        all_vocab_records = []
        
    for s in students:
        cid = str(s.get('학급ID', ''))
        sname = s.get('학생이름', '')
        class_name = s.get('학급명', '')
        
        # 필터
        vocab = [r for r in all_vocab_records if str(r.get('학급ID', '')) == cid and str(r.get('학생이름', '')) == sname]
        
        if not vocab:
            # 아직 데이터 활성화가 안된 학생 (한번도 클릭조차 안한 상태)
            continue
            
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
    
    # 더이상 PW_명부 시트는 사용하지 않지만, 기본 틀을 위해 통합 DB 초기화
    try:
        ss.worksheet('PW_어휘데이터')
    except gspread.WorksheetNotFound:
        get_global_vocab_ws(ss)
        created.append('PW_어휘데이터')
        
    get_lesson_ws(ss)
    time.sleep(0.5)
    get_minutes_ws(ss)
    return {"message": "초기화 완료 (단일 통합 시트 기반)", "sheets_created": created}
