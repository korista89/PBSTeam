import re
import datetime
from typing import List, Dict, Any, Optional, Tuple

# ==============================================================================
# 정규 코드 및 매핑 사전 정의
# ==============================================================================

# 1. 정규 장소 10대 코드
STANDARD_LOCATIONS = [
    "교실", "복도·계단", "급식실", "강당", "특별실", 
    "심리안정실", "운동장", "통학로", "방과후", "기타"
]

# 2. 정규 5대 추정 기능 코드
FUNCTION_CODES = {
    "ESCAPE_DEMAND": "과제회피",
    "ESCAPE_AVERSIVE": "불편해소",
    "TANGIBLE": "물건·활동획득",
    "ATTENTION": "관심끌기",
    "SENSORY": "감각추구"
}

# 3. 6종 정규 행동 유형 (원자료 6종 전체 지원)
STANDARD_BEHAVIORS = [
    "신체적공격행동",
    "자해행동",
    "물건파괴행동",
    "방해행동",
    "비협조적행동",
    "반복적행동",
    "기타"
]

# ==============================================================================
# 1. 시간대 다중값 파싱 및 과정별(초등/중등) 구간 라벨 해석
# ==============================================================================

def parse_time_slots(raw: str) -> List[int]:
    """
    시간대 필드가 쉼표로 다중 선택된 경우 (예: '2구간: 1교시, 5구간: 초등점심/중등4교시')
    각 구간 번호(1~10)를 정수 배열로 파싱합니다.
    """
    if not raw:
        return []
    
    raw_str = str(raw).strip()
    slots = set()
    
    # 1) 'N구간' 패턴 추출
    matches = re.findall(r'(\d{1,2})\s*구간', raw_str)
    for m in matches:
        try:
            val = int(m)
            if 1 <= val <= 10:
                slots.add(val)
        except ValueError:
            pass
            
    # 2) 'N교시' 패턴 직접 매핑 (구간 표기가 없는 경우 폴백)
    if not slots:
        if "등교" in raw_str:
            slots.add(1)
        if "1교시" in raw_str:
            slots.add(2)
        if "2교시" in raw_str:
            slots.add(3)
        if "3교시" in raw_str:
            slots.add(4)
        if "4교시" in raw_str:
            slots.add(5)
        if "점심" in raw_str or "급식" in raw_str:
            slots.add(5)
        if "5교시" in raw_str:
            slots.add(7)
        if "6교시" in raw_str:
            slots.add(8)
        if "7교시" in raw_str or "방과후" in raw_str:
            slots.add(9)
        if "하교" in raw_str or "종례" in raw_str:
            slots.add(10)

    # 3) 단순 숫자 나열 (예: '2, 5')
    if not slots:
        parts = re.split(r'[,/;\s]+', raw_str)
        for p in parts:
            if p.isdigit():
                val = int(p)
                if 1 <= val <= 10:
                    slots.add(val)

    return sorted(list(slots))


def resolve_course_level(student_code: str, class_name: str = "") -> str:
    """
    학생코드 앞자리 및 학급명을 통해 과정(유/초/중/고/전공과) 판정
    """
    code_str = str(student_code or "").strip()
    class_str = str(class_name or "").strip()
    
    if class_str:
        if class_str.startswith("초") or "초등" in class_str:
            return "초"
        if class_str.startswith("중") or "중등" in class_str:
            return "중"
        if class_str.startswith("고") or "고등" in class_str:
            return "고"
        if class_str.startswith("전") or "전공" in class_str:
            return "전공과"
        if class_str.startswith("유") or "유치" in class_str:
            return "유"
            
    if code_str:
        first_digit = code_str[0]
        if first_digit in ['1', '2']:
            return "초"
        elif first_digit == '3':
            return "중"
        elif first_digit == '4':
            return "고"
        elif first_digit == '5':
            return "전공과"
        elif first_digit == '0':
            return "유"

    return "미상"


def resolve_slot_label(slot_no: int, course_level: str = "초") -> str:
    """
    5구간/6구간 역전 현상을 반영한 정확한 시간대 라벨 반환
    초등: 5구간=점심, 6구간=4교시
    중등/고등: 5구간=4교시, 6구간=점심
    """
    slot_map = {
        1: "1구간: 등교 및 아침활동",
        2: "2구간: 1교시",
        3: "3구간: 2교시",
        4: "4구간: 3교시",
        7: "7구간: 5교시",
        8: "8구간: 6교시",
        9: "9구간: 7교시/방과후",
        10: "10구간: 하교 및 종례"
    }
    
    if slot_no in slot_map:
        return slot_map[slot_no]
        
    if slot_no == 5:
        if course_level in ["초", "유"]:
            return "5구간: 점심시간(초등)"
        elif course_level in ["중", "고", "전공과"]:
            return "5구간: 4교시(중/고등)"
        else:
            return "5구간: 초등점심/중등4교시"
            
    if slot_no == 6:
        if course_level in ["초", "유"]:
            return "6구간: 4교시(초등)"
        elif course_level in ["중", "고", "전공과"]:
            return "6구간: 점심시간(중/고등)"
        else:
            return "6구간: 초등4교시/중등점심"
            
    return f"{slot_no}구간"


# ==============================================================================
# 2. 장소 필드 정규화
# ==============================================================================

def normalize_location(raw: str) -> Dict[str, Any]:
    """
    오타('금식실'), 복합 장소('교실. 복도'), 교시 혼입 텍스트 정규화
    """
    if not raw:
        return {"code": "기타", "codes": ["기타"], "original": ""}
        
    raw_str = str(raw).strip()
    found_codes = []
    
    cleaned = raw_str.replace("금식실", "급식실").replace("심리 안정실", "심리안정실")
    
    if "급식실" in cleaned or "식당" in cleaned:
        found_codes.append("급식실")
    if "교실" in cleaned or "반" in cleaned:
        found_codes.append("교실")
    if "복도" in cleaned or "계단" in cleaned or "엘리베이터" in cleaned:
        found_codes.append("복도·계단")
    if "강당" in cleaned or "체육관" in cleaned:
        found_codes.append("강당")
    if "특별실" in cleaned or "음악실" in cleaned or "미술실" in cleaned or "과학실" in cleaned or "도서관" in cleaned or "컴퓨터실" in cleaned:
        found_codes.append("특별실")
    if "심리안정실" in cleaned or "안정실" in cleaned:
        found_codes.append("심리안정실")
    if "운동장" in cleaned or "놀이터" in cleaned:
        found_codes.append("운동장")
    if "통학로" in cleaned or "오르막길" in cleaned or "교문" in cleaned or "등교" in cleaned or "스쿨버스" in cleaned:
        found_codes.append("통학로")
    if "방과후" in cleaned or "늘봄" in cleaned:
        found_codes.append("방과후")
        
    if not found_codes:
        primary_code = "기타"
        codes_list = ["기타"]
    else:
        primary_code = found_codes[0]
        codes_list = list(dict.fromkeys(found_codes))

    return {
        "code": primary_code,
        "codes": codes_list,
        "original": raw_str
    }


# ==============================================================================
# 3. 추정기능 필드 정규화 및 '귀가 요구(GO_HOME)' 독립 태깅
# ==============================================================================

def normalize_function(raw: str) -> Dict[str, Any]:
    """
    자유서술 오염을 해결하고 정규 5종 + GO_HOME 독립 태그 분류
    """
    if not raw:
        return {
            "codes": [],
            "labels": [],
            "confidence": "unknown",
            "is_go_home": False,
            "original": ""
        }
        
    raw_str = str(raw).strip()
    codes = []
    labels = []
    is_go_home = False
    
    go_home_keywords = ["귀가", "집에 가", "엄마 차", "신발 신을까", "집에 가고", "하교 요구"]
    if any(k in raw_str for k in go_home_keywords):
        is_go_home = True
        
    if "회피" in raw_str or "과제 회피" in raw_str or "도망" in raw_str:
        codes.append("ESCAPE_DEMAND")
        labels.append("과제회피")
    if "불편" in raw_str or "불편해소" in raw_str or "짜증" in raw_str or "통증" in raw_str or "배고픔" in raw_str:
        codes.append("ESCAPE_AVERSIVE")
        labels.append("불편해소")
    if "획득" in raw_str or "물건" in raw_str or "활동" in raw_str or "음식 요구" in raw_str or "간식" in raw_str:
        codes.append("TANGIBLE")
        labels.append("물건·활동획득")
    if "관심" in raw_str or "주목" in raw_str or "애정" in raw_str or "교사 반응" in raw_str:
        codes.append("ATTENTION")
        labels.append("관심끌기")
    if "감각" in raw_str or "감각추구" in raw_str or "자기자극" in raw_str:
        codes.append("SENSORY")
        labels.append("감각추구")
        
    exact_standards = ["과제회피", "불편해소", "물건·활동획득", "물건/활동획득", "관심끌기", "감각추구"]
    if raw_str in exact_standards:
        confidence = "coded"
    elif len(codes) > 0 or is_go_home:
        confidence = "inferred"
    elif any(u in raw_str for u in ["파악이 어려움", "알 수 없음", "모르겠음", "불명", "어려움"]):
        confidence = "unknown"
    elif len(raw_str) > 20:
        confidence = "unknown"
    else:
        confidence = "unknown"

    return {
        "codes": codes,
        "labels": labels,
        "confidence": confidence,
        "is_go_home": is_go_home,
        "original": raw_str
    }


# ==============================================================================
# 4. 발생횟수 및 지속시간 파싱
# ==============================================================================

def parse_occurrence(raw: str) -> Dict[str, Any]:
    """
    발생횟수 필드에서 선두 숫자 추출 (예: '4회, 10~15초 동안 강도가 심했음' -> count=4)
    """
    if raw is None or raw == "":
        return {"count": 1, "note": ""}
        
    raw_str = str(raw).strip()
    
    match = re.match(r'^\s*(\d+)\s*(?:회|번|건)?(?:\s*[,/;\-]\s*(.*))?$', raw_str)
    if match:
        count = int(match.group(1))
        note = match.group(2) or ""
        return {"count": count, "note": note.strip()}
        
    num_match = re.search(r'(\d+)\s*(?:회|번)', raw_str)
    if num_match:
        count = int(num_match.group(1))
        return {"count": count, "note": raw_str}
        
    return {"count": None, "note": raw_str}


# ==============================================================================
# 5. 행동유형 6종 정규화
# ==============================================================================

def normalize_behavior_type(raw: str) -> str:
    """
    원자료 6종 행동유형 매핑
    """
    if not raw:
        return "기타"
    raw_str = str(raw).strip()
    
    if "공격" in raw_str or "폭력" in raw_str or "타해" in raw_str:
        return "신체적공격행동"
    if "자해" in raw_str:
        return "자해행동"
    if "파괴" in raw_str or "부숨" in raw_str or "던짐" in raw_str:
        return "물건파괴행동"
    if "방해" in raw_str or "소리지름" in raw_str or "울음" in raw_str:
        return "방해행동"
    if "비협조" in raw_str or "거부" in raw_str or "불응" in raw_str or "이탈" in raw_str:
        return "비협조적행동"
    if "반복" in raw_str or "상동" in raw_str:
        return "반복적행동"
        
    return raw_str if raw_str in STANDARD_BEHAVIORS else "기타"


# ==============================================================================
# 6. 기록 지연 일수 (Entry Lag) 계산
# ==============================================================================

def compute_entry_lag(ts_str: str, occurred_date_str: str) -> Optional[int]:
    """
    타임스탬프와 발생날짜를 비교하여 지연 일수를 계산합니다.
    """
    if not ts_str or not occurred_date_str:
        return None
        
    try:
        occ_parts = [int(p) for p in re.findall(r'\d+', str(occurred_date_str))]
        if len(occ_parts) >= 3:
            occ_dt = datetime.date(occ_parts[0], occ_parts[1], occ_parts[2])
        elif len(occ_parts) == 2:
            occ_dt = datetime.date(2026, occ_parts[0], occ_parts[1])
        else:
            return None
            
        ts_parts = [int(p) for p in re.findall(r'\d+', str(ts_str))]
        if len(ts_parts) >= 3:
            ts_dt = datetime.date(ts_parts[0], ts_parts[1], ts_parts[2])
        else:
            return None
            
        lag = (ts_dt - occ_dt).days
        return max(0, lag)
    except Exception:
        return None


# ==============================================================================
# 7. 임상 신호(교직원 상해, 배경사건, 심리안정실) 정밀 추출
# ==============================================================================

def extract_clinical_signals(text: str, restraint_val: str = "") -> Dict[str, Any]:
    """
    특기사항 텍스트 및 물리적 제지 필드에서 임상 핵심 신호 추출
    """
    t = str(text or "")
    r = str(restraint_val or "").strip().upper()
    
    injury_keywords = ["깨물음", "물기", "물음", "발로 참", "발차기", "밀침", "할큄", "꼬집", "때림", "타격", "쇄골", "어깨 깨물"]
    has_staff_injury = any(k in t for k in injury_keywords)
    
    setting_keywords = ["약을 안먹음", "약 안먹", "투약", "수면", "잠을 못", "배고픔", "식사 거부", "컨디션", "날씨", "가정사"]
    setting_events = [k for k in setting_keywords if k in t]
    
    used_sensory_room = any(k in t for k in ["심리안정실", "안정실", "감각안정실"])
    sensory_room_success = used_sensory_room and any(s in t for s in ["진정", "웃으며", "복귀", "안정", "회복"])
    
    is_restrained = (r == "O" or "O" in r or "제지" in t or "분리지도" in t)
    
    return {
        "has_staff_injury": has_staff_injury,
        "setting_events": setting_events,
        "used_sensory_room": used_sensory_room,
        "sensory_room_success": sensory_room_success,
        "is_restrained": is_restrained
    }


# ==============================================================================
# 8. 개별 레코드 종합 정규화 함수
# ==============================================================================

def normalize_behavior_log(raw_row: dict, tier_info_map: dict = None) -> dict:
    """
    원자료 1건을 분석용 정규 객체로 변환하고 raw_* 원본 필드를 완벽히 보존합니다.
    """
    tier_info_map = tier_info_map or {}
    
    name = str(raw_row.get("student_name", raw_row.get("학생명", ""))).strip()
    code = str(raw_row.get("student_code", raw_row.get("학생코드", ""))).strip()
    date_val = str(raw_row.get("date", raw_row.get("발생날짜", raw_row.get("행동발생날짜", "")))).strip()
    time_val = str(raw_row.get("time_slot", raw_row.get("시간대", ""))).strip()
    loc_val = str(raw_row.get("location", raw_row.get("행동 발생 장소", raw_row.get("장소", "")))).strip()
    type_val = str(raw_row.get("behavior_type", raw_row.get("행동유형(핵심행동으로택1)", raw_row.get("행동유형", "")))).strip()
    int_val = str(raw_row.get("intensity", raw_row.get("강도(1~5)", raw_row.get("강도(1~5점 척도)", "1")))).strip()
    func_val = str(raw_row.get("function", raw_row.get("추정기능(이번 행동을 통해 파악된 기능)", raw_row.get("추정기능", "")))).strip()
    restr_val = str(raw_row.get("restraint_report", raw_row.get("물리적제지, 3/4호분리지도,본인/타인상해 발생 여부", raw_row.get("물리적제지", "X")))).strip()
    freq_val = str(raw_row.get("frequency", raw_row.get("발생횟수(한 에피소드 당 1회로 입력 권장)", raw_row.get("발생횟수", "1")))).strip()
    notes_val = str(raw_row.get("notes", raw_row.get("특기사항(기타)", raw_row.get("특기사항", "")))).strip()
    ts_val = str(raw_row.get("timestamp", raw_row.get("타임스탬프", ""))).strip()
    teacher_val = str(raw_row.get("teacher_name", raw_row.get("입력교사명", ""))).strip()
    
    student_meta = tier_info_map.get(code, tier_info_map.get(name, {}))
    class_name = student_meta.get("class", student_meta.get("학급", ""))
    course_level = resolve_course_level(code, class_name)
    tier = student_meta.get("tier", student_meta.get("Tier", 1))
    
    slot_numbers = parse_time_slots(time_val)
    slot_labels = [resolve_slot_label(s, course_level) for s in slot_numbers]
    
    loc_norm = normalize_location(loc_val)
    func_norm = normalize_function(func_val)
    occ_norm = parse_occurrence(freq_val)
    beh_norm = normalize_behavior_type(type_val)
    lag_days = compute_entry_lag(ts_val, date_val)
    signals = extract_clinical_signals(notes_val, restr_val)
    
    try:
        intensity_num = int(re.search(r'\d+', int_val).group(1)) if re.search(r'\d+', int_val) else 1
    except Exception:
        intensity_num = 1
        
    return {
        # 정규화된 필드
        "student_name": name,
        "student_code": code,
        "class_name": class_name,
        "course_level": course_level,
        "tier": tier,
        "date": date_val,
        "time_slots": slot_numbers,
        "time_slot_labels": slot_labels,
        "primary_slot": slot_numbers[0] if slot_numbers else None,
        "location": loc_norm["code"],
        "locations": loc_norm["codes"],
        "behavior_type": beh_norm,
        "intensity": intensity_num,
        "function_codes": func_norm["codes"],
        "function_labels": func_norm["labels"],
        "function_confidence": func_norm["confidence"],
        "is_go_home": func_norm["is_go_home"],
        "occurrence_count": occ_norm["count"] if occ_norm["count"] is not None else 1,
        "restraint": "O" if signals["is_restrained"] else "X",
        "is_restrained": signals["is_restrained"],
        "notes": notes_val,
        "teacher_name": teacher_val,
        "entry_lag_days": lag_days,
        "has_staff_injury": signals["has_staff_injury"],
        "setting_events": signals["setting_events"],
        "used_sensory_room": signals["used_sensory_room"],
        "sensory_room_success": signals["sensory_room_success"],
        
        # 원본 필드 보존 (raw_*)
        "raw_time_slot": time_val,
        "raw_location": loc_val,
        "raw_behavior_type": type_val,
        "raw_function": func_val,
        "raw_frequency": freq_val,
        "raw_timestamp": ts_val,
        "raw_notes": notes_val
    }


# ==============================================================================
# 9. 데이터 품질 보고서 (Data Quality Report)
# ==============================================================================

def calculate_data_quality_report(normalized_logs: List[dict]) -> dict:
    """
    전체 정규화 로그에 대한 오염률, 매핑 실패율, 기록 지연일 통계 산출
    """
    total = len(normalized_logs)
    if total == 0:
        return {"total_records": 0, "pollution_rate": 0.0, "status": "NO_DATA"}
        
    func_unknown_cnt = sum(1 for l in normalized_logs if l["function_confidence"] == "unknown")
    func_go_home_cnt = sum(1 for l in normalized_logs if l["is_go_home"])
    loc_etc_cnt = sum(1 for l in normalized_logs if l["location"] == "기타")
    multi_slot_cnt = sum(1 for l in normalized_logs if len(l["time_slots"]) > 1)
    staff_injury_cnt = sum(1 for l in normalized_logs if l["has_staff_injury"])
    
    lags = [l["entry_lag_days"] for l in normalized_logs if l["entry_lag_days"] is not None]
    avg_lag = round(sum(lags) / len(lags), 1) if lags else 0.0
    max_lag = max(lags) if lags else 0
    lag_over_3days = sum(1 for lag in lags if lag >= 3)
    
    return {
        "total_records": total,
        "function_quality": {
            "unknown_count": func_unknown_cnt,
            "unknown_rate": round(func_unknown_cnt / total * 100, 1),
            "go_home_count": func_go_home_cnt,
            "go_home_rate": round(func_go_home_cnt / total * 100, 1)
        },
        "location_quality": {
            "unmapped_etc_count": loc_etc_cnt,
            "unmapped_rate": round(loc_etc_cnt / total * 100, 1)
        },
        "time_slot_quality": {
            "multi_slot_count": multi_slot_cnt,
            "multi_slot_rate": round(multi_slot_cnt / total * 100, 1)
        },
        "entry_timeliness": {
            "avg_lag_days": avg_lag,
            "max_lag_days": max_lag,
            "lag_over_3days_count": lag_over_3days,
            "lag_over_3days_rate": round(lag_over_3days / total * 100, 1) if lags else 0.0
        },
        "safety_indicators": {
            "staff_injury_count": staff_injury_cnt
        }
    }
