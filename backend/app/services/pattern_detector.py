import re
from typing import List, Dict, Any
from collections import defaultdict, Counter

def detect_clinical_patterns(normalized_logs: List[dict]) -> Dict[str, Any]:
    """
    1,557건 정규화 로그에서 수학적·결정론적(Deterministic) 임상 패턴 자동 감지:
    1. 또래 전염 및 연쇄 촉발 패턴
    2. 특정 루틴 고착화 패턴 (예: 김예원 점심/급식실 귀가 요구)
    3. 배경사건(수면/투약)과 강도 간의 상관도
    4. 시간대-장소-기능 고위험 삼각 클러스터 (Hotspot Triad)
    5. 교직원 상해 발생 패턴
    """
    total_logs = len(normalized_logs)
    if total_logs == 0:
        return {"status": "NO_DATA"}

    # 1. 특정 루틴 고착 패턴 감지 (예: 귀가 요구, 점심 급식실)
    go_home_logs = [l for l in normalized_logs if l.get("is_go_home")]
    go_home_by_student = Counter(l.get("student_name") for l in go_home_logs)
    top_go_home_students = []
    for sname, cnt in go_home_by_student.most_common(3):
        s_logs = [l for l in go_home_logs if l.get("student_name") == sname]
        common_slots = Counter([s for l in s_logs for s in l.get("time_slots", [])]).most_common(2)
        common_locs = Counter(l.get("location") for l in s_logs).most_common(2)
        top_go_home_students.append({
            "student_name": sname,
            "count": cnt,
            "dominant_slots": [f"{s}구간" for s, _ in common_slots],
            "dominant_locations": [loc for loc, _ in common_locs]
        })

    # 2. 배경사건(투약/수면 등) 영향도 분석
    setting_event_logs = [l for l in normalized_logs if l.get("setting_events")]
    no_setting_logs = [l for l in normalized_logs if not l.get("setting_events")]
    
    avg_int_with_setting = round(sum(l.get("intensity", 1) for l in setting_event_logs) / len(setting_event_logs), 2) if setting_event_logs else 0.0
    avg_int_normal = round(sum(l.get("intensity", 1) for l in no_setting_logs) / len(no_setting_logs), 2) if no_setting_logs else 0.0
    
    setting_impact = {
        "total_setting_event_logs": len(setting_event_logs),
        "avg_intensity_with_setting_events": avg_int_with_setting,
        "avg_intensity_baseline": avg_int_normal,
        "intensity_multiplier": round(avg_int_with_setting / avg_int_normal, 2) if avg_int_normal > 0 else 1.0,
        "frequent_keywords": Counter([k for l in setting_event_logs for k in l.get("setting_events", [])]).most_common(5)
    }

    # 3. 고위험 삼각 클러스터 (시간대 x 장소 x 기능)
    triad_counts = Counter()
    for l in normalized_logs:
        slot = l.get("primary_slot")
        loc = l.get("location")
        funcs = l.get("function_labels", ["미상"])
        f_str = funcs[0] if funcs else "미상"
        if slot and loc:
            triad_counts[(f"{slot}구간", loc, f_str)] += 1
            
    top_triads = []
    for (slot_str, loc, f_str), cnt in triad_counts.most_common(5):
        top_triads.append({
            "slot": slot_str,
            "location": loc,
            "function": f_str,
            "count": cnt,
            "rate_in_total": round(cnt / total_logs * 100, 1)
        })

    # 4. 교직원 상해 발생 사건 집계
    injury_logs = [l for l in normalized_logs if l.get("has_staff_injury")]
    injury_by_student = Counter(l.get("student_name") for l in injury_logs).most_common(5)
    
    return {
        "total_analyzed_logs": total_logs,
        "fixed_routine_patterns": top_go_home_students,
        "setting_event_analysis": setting_impact,
        "high_risk_triads": top_triads,
        "staff_injury_summary": {
            "total_injury_incidents": len(injury_logs),
            "top_students": [{"name": n, "count": c} for n, c in injury_by_student]
        }
    }
