import sys
import os

# Set path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.services.normalize import (
    parse_time_slots, resolve_slot_label, normalize_location,
    normalize_function, parse_occurrence, compute_entry_lag,
    extract_clinical_signals, normalize_behavior_log,
    calculate_data_quality_report
)
from app.services.contagion import analyze_peer_contagion

print("=" * 60)
print("🧪 [경은PBS] 데이터 정규화 레이어 및 임상 규칙 단위 테스트")
print("=" * 60)

# 1. 시간대 다중값 테스트
t1 = parse_time_slots("2구간: 1교시, 5구간: 초등점심/중등4교시")
print(f"1. 시간대 다중값 파싱: {t1} (기대: [2, 5]) -> {'✅ 통과' if t1 == [2, 5] else '❌ 실패'}")

# 2. 과정별 5/6구간 역전 테스트
elem_5 = resolve_slot_label(5, "초")
mid_5 = resolve_slot_label(5, "중")
elem_6 = resolve_slot_label(6, "초")
mid_6 = resolve_slot_label(6, "중")
print(f"2-1. 초등 5구간: '{elem_5}' (기대: 점심시간) -> {'✅ 통과' if '점심' in elem_5 else '❌ 실패'}")
print(f"2-2. 중등 5구간: '{mid_5}' (기대: 4교시) -> {'✅ 통과' if '4교시' in mid_5 else '❌ 실패'}")
print(f"2-3. 초등 6구간: '{elem_6}' (기대: 4교시) -> {'✅ 통과' if '4교시' in elem_6 else '❌ 실패'}")
print(f"2-4. 중등 6구간: '{mid_6}' (기대: 점심시간) -> {'✅ 통과' if '점심' in mid_6 else '❌ 실패'}")

# 3. 장소 오타 및 정규화 테스트
loc1 = normalize_location("금식실: 친쿠 귀 잡아당김")
print(f"3. 장소 오타 교정: '{loc1['code']}' (기대: 급식실) -> {'✅ 통과' if loc1['code'] == '급식실' else '❌ 실패'}")

# 4. 기능 필드 오염 및 GO_HOME 태깅 테스트
func_gohome = normalize_function("귀가 요구, 집에 가고 싶어함")
func_multi = normalize_function("감각추구, 불편해소")
func_desc = normalize_function("심리안정실 방향을 가리키며 '저기 가자'라는 말로 요구함.")
print(f"4-1. 귀가 요구 태깅: is_go_home={func_gohome['is_go_home']} -> {'✅ 통과' if func_gohome['is_go_home'] else '❌ 실패'}")
print(f"4-2. 복수 기능 파싱: labels={func_multi['labels']} -> {'✅ 통과' if len(func_multi['labels']) == 2 else '❌ 실패'}")
print(f"4-3. 20자 초과 서술문 unknown: confidence={func_desc['confidence']} -> {'✅ 통과' if func_desc['confidence'] == 'unknown' else '❌ 실패'}")

# 5. 발생횟수 파싱 테스트
occ1 = parse_occurrence("4회, 10~15초 동안 강도가 심했음")
print(f"5. 발생횟수 및 비고 분리: count={occ1['count']}, note='{occ1['note']}' -> {'✅ 통과' if occ1['count'] == 4 and '10~15초' in occ1['note'] else '❌ 실패'}")

# 6. 임상 신호(교직원 상해, 배경사건, 심리안정실) 테스트
sig1 = extract_clinical_signals("특수교육지도사 오른쪽 어깨 뒤쪽 깨물음. 약을 안먹음. 심리안정실에서 20분 후 진정됨.")
print(f"6-1. 교직원 상해 검출: {sig1['has_staff_injury']} -> {'✅ 통과' if sig1['has_staff_injury'] else '❌ 실패'}")
print(f"6-2. 배경사건 검출: {sig1['setting_events']} -> {'✅ 통과' if '약을 안먹음' in sig1['setting_events'] else '❌ 실패'}")
print(f"6-3. 심리안정실 복귀 성공: {sig1['sensory_room_success']} -> {'✅ 통과' if sig1['sensory_room_success'] else '❌ 실패'}")

# 7. 또래 전염 분석 엔진 테스트
mock_logs = [
    {"student_name": "이한결", "notes": "승현이의 짜증과 울음 소리로 인해 울고 소리 지름", "date": "2026-07-08", "class_name": "초6-2", "primary_slot": 3},
    {"student_name": "조성우", "notes": "승현이와 한결이의 울음 소리가 자극이 되었음.", "date": "2026-07-08", "class_name": "초6-2", "primary_slot": 3},
    {"student_name": "이엘", "notes": "정재민 학생의 울음 소리를 많이 힘들어 함", "date": "2026-07-10", "class_name": "초2-2", "primary_slot": 2}
]
contagion = analyze_peer_contagion(mock_logs, [{"name": "곽승현", "class": "초6-2"}, {"name": "이한결", "class": "초6-2"}, {"name": "정재민", "class": "초2-2"}])
print(f"7. 또래 전염 엣지 수: {len(contagion['edges'])}개 (기대: >=2) -> {'✅ 통과' if len(contagion['edges']) >= 2 else '❌ 실패'}")

print("=" * 60)
print("🎉 모든 정규화 및 임상 분석 엔진 단위 테스트 완료!")
print("=" * 60)
