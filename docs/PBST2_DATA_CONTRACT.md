# PBSTeam 2.0 — Protected Raw Data Contract

## 0. 절대적 데이터 보호 원칙 (Non-Negotiable)
다음 7개 Google Sheets 탭은 PBSTeam의 핵심 원자료이며, 어떠한 경우에도 스키마를 변경하거나 데이터를 삭제/강제 변환하지 않습니다.

1. **`Log_Main`**: 행동 발생 기록 메인 원자료
2. **`TierStatus`**: 전교 학생 명단 및 지원단계(Tier 1/2/3) 원자료
3. **`3월`**: 3월 CICO 일일 행동기록
4. **`4월`**: 4월 CICO 일일 행동기록
5. **`5월`**: 5월 CICO 일일 행동기록
6. **`6월`**: 6월 CICO 일일 행동기록
7. **`7월`**: 7월 CICO 일일 행동기록

---

## 1. Sheet별 Read-Only Data Contract

### 1.1 `Log_Main`
* **주요 컬럼 매핑**:
  - `타임스탬프` / `일시` / `날짜` ➔ `event_date`, `entered_at`
  - `학생코드` / `학번` ➔ `student_code`
  - `학생명` / `학생이름` ➔ `student_name`
  - `시간대` / `구간` ➔ `time_slot_codes`, `time_slot_labels`
  - `발생장소` / `장소` ➔ `location_codes`, `primary_location`
  - `행동유형` / `행동` ➔ `behavior_code`, `behavior_raw`
  - `행동강도` / `강도` (1~5) ➔ `intensity`
  - `발생횟수` ➔ `occurrence_count`
  - `선행사건` ➔ `antecedent`
  - `후속결과` ➔ `consequence`
  - `추정기능` ➔ `teacher_function_estimates` (주의: FBA 기능가설과 구분)
  - `특기사항` / `비고` ➔ `notes`
  - `물리적제지` / `상해` / `관리자보고` ➔ `safety` 플래그

### 1.2 `TierStatus`
* **Single Source of Truth for Student Tier**:
  - `학생코드`: Primary Key
  - `학생이름` / `학생명`: 표시용 이름
  - `과정` / `학급`: 유/초/중/고/전공과 및 학급명
  - `Tier1`, `Tier2`, `Tier3`, `Tier3+`: 활성 상태 (`O` / `X`)
  - `재학상태`: 재학 여부 (`재학` ➔ `enrolled=True`)

### 1.3 `3월` ~ `7월` (CICO Monthly Sheets)
* **Schema Drift 흡수**:
  - 3월: `[학생코드, 학생명, Tier2, 목표행동, ...일자별 컬럼]`
  - 4~7월: `[학생명(코드), Tier2, Tier3, 목표행동, ...일자별 컬럼]`
  - Adapter(`CicoMonthAdapter`)를 통해 헤더를 검사하여 `student_code`, `target_behavior`, `observations[]`로 안전하게 변환.

---

## 2. 쓰기 정책 (Write Policy)
* 정상적인 사용자 인터랙션(행동 기록 추가, CICO 점수 입력/수정, Tier 변경)만 기존 시트에 쓰기를 수행합니다.
* 시트 저장 성공 후 ➔ 대상 캐시 키만 정밀 무효화(`clear_cache`) ➔ 성공 응답 반환.
