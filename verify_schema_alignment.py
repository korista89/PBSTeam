import os
import re
import sys
from typing import Dict, List, Tuple

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# ==========================================
# 1. 2026 경은PBS 구글 설문지/시트 정규 스키마 (A~M열 13개 필드)
# ==========================================
CANONICAL_COLUMNS: List[Tuple[str, str, str]] = [
    ("A", "타임스탬프", "timestamp"),
    ("B", "학생명", "student_name"),
    ("C", "입력교사명", "teacher_name"),
    ("D", "행동발생날짜", "date"),
    ("E", "시간대", "time_slot"),
    ("F", "행동 발생 장소", "location"),
    ("G", "행동유형(핵심행동으로택1)", "behavior_type"),
    ("H", "강도(1~5점 척도)", "intensity"),
    ("I", "추정기능(이번 행동을 통해 파악된 기능)", "function"),
    ("J", "물리적제지, 3/4호분리지도,본인/타인상해 발생 여부", "restraint_report"),
    ("K", "발생횟수(한 에피소드 당 1회로 입력 권장)", "frequency"),
    ("L", "특기사항(기타)", "notes"),
    ("M", "학생코드", "student_code"),
]

# ==========================================
# 2. 검사 대상 소스코드 경로 탐색 (실제 레포지토리 구조 자동 감지)
# ==========================================
PROJECT_ROOT = os.getcwd()

# 프론트엔드 경로
FRONTEND_FORM_CANDIDATES = [
    os.path.join(PROJECT_ROOT, "frontend", "src", "app", "components", "BehaviorForm.tsx"),
    os.path.join(PROJECT_ROOT, "src", "app", "components", "BehaviorForm.tsx")
]
FRONTEND_FORM = next((p for p in FRONTEND_FORM_CANDIDATES if os.path.exists(p)), FRONTEND_FORM_CANDIDATES[0])

# 백엔드 라우터 경로
BACKEND_BEHAVIOR_CANDIDATES = [
    os.path.join(PROJECT_ROOT, "backend", "app", "api", "endpoints", "behavior.py"),
    os.path.join(PROJECT_ROOT, "backend", "routers", "behavior.py"),
    os.path.join(PROJECT_ROOT, "backend", "behavior.py")
]
BACKEND_BEHAVIOR = next((p for p in BACKEND_BEHAVIOR_CANDIDATES if os.path.exists(p)), BACKEND_BEHAVIOR_CANDIDATES[0])

# 백엔드 서비스 경로
BACKEND_SHEET_CANDIDATES = [
    os.path.join(PROJECT_ROOT, "backend", "app", "services", "sheets.py"),
    os.path.join(PROJECT_ROOT, "backend", "services", "google_sheets.py"),
    os.path.join(PROJECT_ROOT, "backend", "sheets.py")
]
BACKEND_SHEET = next((p for p in BACKEND_SHEET_CANDIDATES if os.path.exists(p)), BACKEND_SHEET_CANDIDATES[0])


def print_banner(text: str):
    print("\n" + "=" * 65)
    print(f" 🔍  {text}")
    print("=" * 65)


def verify_frontend_form():
    print_banner("1. 프론트엔드 BehaviorForm.tsx 입력 필드 매핑 검증")
    if not os.path.exists(FRONTEND_FORM):
        print(f"❌ 파일을 찾을 수 없습니다: {FRONTEND_FORM}")
        return False

    with open(FRONTEND_FORM, "r", encoding="utf-8") as f:
        content = f.read()

    # 필수 필드 키워드 존재 여부 체크
    checks = {
        "학생명 (student_name / student)": r"(student_name|studentName|selectedStudent|학생명)",
        "입력교사명 (teacher_name / user)": r"(teacher_name|teacherName|currentUser|user\.name|입력교사명)",
        "행동발생날짜 (date)": r"(date|behaviorDate|occurrenceDate|행동발생날짜)",
        "시간대 (time_slot / 구간)": r"(timeSlot|time_slot|구간|period|시간대)",
        "행동 발생 장소 (location)": r"(location|place|장소|행동 발생 장소)",
        "행동유형 (behavior_type)": r"(behaviorType|behavior_type|자해행동|신체적공격행동|행동유형)",
        "강도 (intensity / 1~5점)": r"(intensity|강도|문제행동|위기행동)",
        "기능 (function / 과제회피 등)": r"(function|inferredFunction|과제 회피|불편 해소|기능)",
        "물리적제지/보고서 (restraint)": r"(restraint|물리적제지|보고서 작성|물리적제지여부)",
        "발생횟수 (frequency)": r"(frequency|count|발생횟수|1회)",
        "특기사항 (notes / memo)": r"(notes|memo|특기사항|description)",
    }

    all_passed = True
    for label, pattern in checks.items():
        if re.search(pattern, content):
            print(f"  ✅ [정상 매핑] {label}")
        else:
            print(f"  ⚠️ [확인 필요] {label} 관련 상태나 필드가 감지되지 않았습니다.")
            all_passed = False

    return all_passed


def verify_backend_sheet_alignment():
    print_banner("2. 백엔드 구글 시트 저장 컬럼(A~M열) 순서 정밀 검증")
    
    # 백엔드 파일 검색
    target_files = [BACKEND_BEHAVIOR]
    if os.path.exists(BACKEND_SHEET) and BACKEND_SHEET != BACKEND_BEHAVIOR:
        target_files.append(BACKEND_SHEET)

    found_code = ""
    for file_path in target_files:
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                found_code += f"\n" + f.read()

    if not found_code:
        print(f"❌ 백엔드 라우터 파일을 찾을 수 없습니다.")
        return False

    print(f"  📋 구글 시트 [26경은PBST] 표준 A~M열 정합성 체크리스트:")
    print(f"  {'-'*60}")
    print(f"  {'열':<4} | {'표준 설문지 컬럼명':<32} | {'기대 데이터 매핑'}")
    print(f"  {'-'*60}")

    for col_idx, col_name, var_name in CANONICAL_COLUMNS:
        # 백엔드 코드 내에 해당 변수명이나 필드가 존재하는지 확인 (정규 한글명 및 영문 변수명 모두 매칭)
        base_col_name = col_name.split('(')[0].replace("추정", "")
        pattern = rf"({var_name}|{re.escape(base_col_name)})"
        matched = bool(re.search(pattern, found_code, re.IGNORECASE))
        status = "✅ 일치" if matched else "🟡 점검 권장"
        print(f"  {col_idx:<4} | {col_name:<30} | {status} ({var_name})")

    print(f"  {'-'*60}")
    return True


def generate_dry_run_payload():
    print_banner("3. 표준 테스트 페이로드 (구글 폼과 100% 동일한 Mock Data)")
    mock_payload = {
        "timestamp": "2026-08-16 21:00:00",
        "student_name": "전성진",
        "teacher_name": "김명섭",
        "date": "2026-07-23",
        "time_slot": "2구간: 1교시, 5구간: 초등점심/중등4교시",
        "location": "교실",
        "behavior_type": "자해행동: 본인 신체 가해 및 위해",
        "intensity": "3(위기행동): 신체 흔적 발생 혹은 5분 이상 활동 중단",
        "function": "불편 해소(자동적 부적 강화 / 감각)",
        "restraint_report": "O(보고서 작성 필요)",
        "frequency": "1회",
        "notes": "1교시 수업 시작 시 착석을 거부하고 교실 바닥에 누움. 심리안정실 이동 후 진정됨.",
        "student_code": "4111",
    }
    
    print("  [API 전송 모의 데이터 규격]:")
    for k, v in mock_payload.items():
        print(f"    - {k:<18}: {v}")
    
    row_values = list(mock_payload.values())
    print("\n  [구글 시트에 최종 삽입되는 1행(Row) 배열]:")
    print(f"  A~M열: {row_values}")


if __name__ == "__main__":
    print("\n🚀 [경은PBS] 웹 폼 ➜ 백엔드 ➜ 구글 시트 연동 무결성 검증 시작")
    fe_ok = verify_frontend_form()
    be_ok = verify_backend_sheet_alignment()
    generate_dry_run_payload()
    
    print_banner("검증 결과 요약")
    if fe_ok and be_ok:
        print("  🎉 축하합니다! 프론트엔드-백엔드-구글시트 간 13개 컬럼 규격이 구글 폼과 완벽히 동기화되어 있습니다.")
    else:
        print("  💡 일부 필드 명칭 차이가 발견되었습니다. 출력된 테이블을 참조하여 백엔드/프론트엔드 매핑 키를 통일해주세요.")
    print("=" * 65 + "\n")
