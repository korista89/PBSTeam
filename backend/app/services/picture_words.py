import gspread
from app.services.sheets import get_sheets_client, settings
from app.core.picture_word_data import DOMAINS, VBS, VOCAB_DATA, LESSON_DATA
import time

# ── 상수 ──────────────────────────────────────────────────────
VB_COLS = {'청자': 4, '모방': 5, '명명': 6, '매칭': 7, '대화': 8, '요구': 9}
VB_HEADERS = ['번호', '범주', '어휘', '청자', '모방', '명명', '매칭', '대화', '요구', '합계', '협의내용', '협의날짜']
LESSON_HEADERS = ['차시', '영역', '언어행동', '제재', '목표', '수업날짜', '준비협의내용', '협의날짜', '수업자료1', '수업자료2', '수업자료3']
MINUTES_HEADERS = ['날짜', '구분', '출처(학생/차시)', '내용', '학급ID', '학급명']
ROSTER_HEADERS = ['학급ID', '학급명', '학생번호', '학생이름']

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
# 1. Roster (학생 명부) 관리
# 시트명: PW_명부
# ─────────────────────────────────────────────────────────────
def get_roster_ws(ss):
    ws = get_or_create_worksheet(ss, 'PW_명부', rows=500, cols=10)
    # 헤더 없으면 추가
    first = ws.row_values(1)
    if not first or first[0] != '학급ID':
        ws.insert_row(ROSTER_HEADERS, 1)
    return ws

def fetch_all_students() -> list[dict]:
    """전체 학생 목록 반환"""
    ss = get_pw_spreadsheet()
    if not ss:
        return []
    ws = get_roster_ws(ss)
    return ws.get_all_records()

def fetch_students_by_class(class_id: str) -> list[dict]:
    """특정 학급의 학생 목록 반환"""
    all_students = fetch_all_students()
    return [s for s in all_students if str(s.get('학급ID', '')) == str(class_id)]

def add_student(class_id: str, class_name: str, student_num: int, student_name: str) -> dict:
    """학생 추가"""
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    ws = get_roster_ws(ss)
    ws.append_row([class_id, class_name, student_num, student_name])
    # 해당 학생 어휘 시트 자동 생성
    _ensure_student_vocab_sheet(ss, class_id, student_name)
    return {"message": f"{student_name} 추가 완료"}

def delete_student(class_id: str, student_name: str) -> dict:
    """학생 삭제 (명부에서만 제거, 시트는 보존)"""
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    ws = get_roster_ws(ss)
    records = ws.get_all_records()
    for idx, r in enumerate(records):
        if str(r.get('학급ID')) == str(class_id) and r.get('학생이름') == student_name:
            ws.delete_rows(idx + 2)  # +2: 헤더 1행 + 0-index
            return {"message": f"{student_name} 삭제 완료"}
    return {"error": "학생을 찾을 수 없습니다"}

def _sheet_name(class_id: str, student_name: str) -> str:
    """학생 어휘 시트 이름 규칙: PW_{학급ID}_{학생이름}"""
    return f"PW_{class_id}_{student_name}"

def _ensure_student_vocab_sheet(ss, class_id: str, student_name: str):
    """학생 어휘 시트가 없으면 생성"""
    name = _sheet_name(class_id, student_name)
    try:
        ws = ss.worksheet(name)
        return ws
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title=name, rows=200, cols=15)
        ws.append_row(VB_HEADERS)
        # 기본 어휘 데이터 입력
        data = [[v[0], v[1], v[2], '', '', '', '', '', '', 0, '', ''] for v in VOCAB_DATA]
        ws.update(f'A2:L{len(data)+1}', data)
        time.sleep(1)
        return ws

# ─────────────────────────────────────────────────────────────
# 2. 학생 체크리스트 (어휘 습득 현황)
# ─────────────────────────────────────────────────────────────
def fetch_student_vocab(class_id: str, student_name: str) -> list[dict]:
    """특정 학생의 어휘 체크리스트 반환"""
    ss = get_pw_spreadsheet()
    if not ss:
        return []
    ws = _ensure_student_vocab_sheet(ss, class_id, student_name)
    records = ws.get_all_records()
    for r in records:
        for vb in VBS:
            val = str(r.get(vb, '')).upper()
            r[vb] = val in ('TRUE', '1', 'YES', '✓', 'O', 'O')
        # 합계 재계산
        r['합계'] = sum(1 for vb in VBS if r[vb])
    return records

def update_student_vocab(class_id: str, student_name: str, vocab_id: int, updates: dict) -> dict:
    """학생 어휘 데이터 업데이트"""
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    ws = _ensure_student_vocab_sheet(ss, class_id, student_name)
    row_num = vocab_id + 1  # id=1 → row 2

    col_map = {
        '청자': 4, '모방': 5, '명명': 6, '매칭': 7, '대화': 8, '요구': 9,
        '협의내용': 11, '협의날짜': 12
    }
    for key, val in updates.items():
        if key in col_map:
            if isinstance(val, bool):
                val_str = 'TRUE' if val else 'FALSE'
            else:
                val_str = str(val)
            ws.update_cell(row_num, col_map[key], val_str)

    # 합계 자동 계산 후 업데이트
    row_data = ws.row_values(row_num)
    total = sum(1 for col in range(3, 9) if str(row_data[col]).upper() == 'TRUE')
    ws.update_cell(row_num, 10, total)

    return {"message": "업데이트 완료"}

# ─────────────────────────────────────────────────────────────
# 3. 수업 가이드
# 시트명: PW_수업가이드
# ─────────────────────────────────────────────────────────────
def get_lesson_ws(ss):
    try:
        return ss.worksheet('PW_수업가이드')
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title='PW_수업가이드', rows=100, cols=12)
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
# 컬럼: 날짜 | 구분(수업협의/평가협의) | 출처(학생명/차시) | 내용
# ─────────────────────────────────────────────────────────────
def get_minutes_ws(ss):
    try:
        return ss.worksheet('PW_협의록')
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title='PW_협의록', rows=500, cols=6)
        ws.append_row(MINUTES_HEADERS)
        return ws

def fetch_minutes(class_id: str = None) -> list[dict]:
    """협의록 조회 (class_id 있으면 해당 학급 필터)"""
    ss = get_pw_spreadsheet()
    if not ss:
        return []
    ws = get_minutes_ws(ss)
    records = ws.get_all_records()
    if class_id:
        records = [r for r in records if str(r.get('학급ID', '')) == str(class_id)]
    return sorted(records, key=lambda x: str(x.get('날짜', '')), reverse=True)

def add_minute_entry(date: str, kind: str, source: str, content: str, class_id: str = '', class_name: str = '') -> dict:
    """협의록 항목 추가"""
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    ws = get_minutes_ws(ss)
    ws.append_row([date, kind, source, content, class_id, class_name])
    return {"message": "협의록 추가 완료"}

def delete_minute_entry(row_index: int) -> dict:
    """협의록 항목 삭제 (row_index는 1-based, 헤더 제외)"""
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    ws = get_minutes_ws(ss)
    ws.delete_rows(row_index + 1)  # +1 for header
    return {"message": "삭제 완료"}

# ─────────────────────────────────────────────────────────────
# 5. 학급 현황 (Overview)
# ─────────────────────────────────────────────────────────────
def fetch_class_overview(class_id: str = None) -> list[dict]:
    """학급별 학생별 영역별 습득 현황 계산"""
    students = fetch_students_by_class(class_id) if class_id else fetch_all_students()
    results = []
    for s in students:
        cid = str(s.get('학급ID', ''))
        sname = s.get('학생이름', '')
        class_name = s.get('학급명', '')
        vocab = fetch_student_vocab(cid, sname)
        if not vocab:
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
def fetch_certification_status(class_id: str, student_name: str) -> list[dict]:
    """인증제: 영역별 달성 현황 계산 (기준: 영역당 VB합계≥2인 어휘 6개 이상)"""
    vocab = fetch_student_vocab(class_id, student_name)
    if not vocab:
        return []
    cert_data = []
    total_badges = 0
    for domain in DOMAINS:
        met = sum(
            1 for v in vocab
            if v.get('범주') == domain and sum(1 for vb in VBS if v.get(vb, False)) >= 2
        )
        achieved = met >= 6
        if achieved:
            total_badges += 1
        cert_data.append({
            "domain": domain,
            "met_words": met,
            "total_words": 12,
            "required": 6,
            "is_achieved": achieved,
            "progress_pct": min(100, int((met / 6) * 100))
        })
    # 요약 추가
    all_achieved = total_badges == len(DOMAINS)
    return {
        "domains": cert_data,
        "total_badges": total_badges,
        "max_badges": len(DOMAINS),
        "all_achieved": all_achieved
    }

# ─────────────────────────────────────────────────────────────
# 7. 초기화 (신규 학급/학생 시트 생성)
# ─────────────────────────────────────────────────────────────
def init_picture_word_system() -> dict:
    """PW_ 접두사 시트들 초기화 (없는 것만 생성)"""
    ss = get_pw_spreadsheet()
    if not ss:
        return {"error": "Sheet not accessible"}
    created = []
    # 명부
    ws = get_roster_ws(ss)
    created.append('PW_명부')
    # 수업가이드
    get_lesson_ws(ss)
    created.append('PW_수업가이드')
    time.sleep(0.5)
    # 협의록
    get_minutes_ws(ss)
    created.append('PW_협의록')
    return {"message": "초기화 완료", "sheets_created": created}
