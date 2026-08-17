import json
from typing import List, Dict, Any, Optional
from collections import Counter
from app.services.normalize import calculate_data_quality_report
from app.services.pattern_detector import detect_clinical_patterns
from app.services.contagion import analyze_peer_contagion

def build_evidence_packet(
    normalized_logs: List[dict],
    student_info: dict = None,
    period_label: str = "전체 기간",
    tier_info_list: list = None
) -> Dict[str, Any]:
    """
    1,557건의 원자료를 16K 컨텍스트 윈도우에 최적화된 초고밀도 'Evidence Packet'으로 압축:
    - 수치/비율/교차분석/결정론적 팩트는 Python 코드로 100% 사전 계산
    - LLM(Gemma 4 E4B)에는 임상적 추론과 가설 검증에 필요한 순수 에센스만 전달 (< 2,000 토큰)
    """
    total_logs = len(normalized_logs)
    if total_logs == 0:
        return {
            "period": period_label,
            "total_incidents": 0,
            "message": "데이터 없음"
        }

    # 1. 팩트 통계 사전 계산
    student_counts = Counter(l.get("student_name") for l in normalized_logs)
    unique_students = len(student_counts)
    
    # 2. Big 5 교차 분포
    slot_counter = Counter([s for l in normalized_logs for s in l.get("time_slots", [])])
    loc_counter = Counter(l.get("location") for l in normalized_logs)
    beh_counter = Counter(l.get("behavior_type") for l in normalized_logs)
    int_counter = Counter(l.get("intensity") for l in normalized_logs)
    
    func_labels_flat = []
    for l in normalized_logs:
        fl = l.get("function_labels", [])
        if fl:
            func_labels_flat.extend(fl)
        elif l.get("is_go_home"):
            func_labels_flat.append("귀가요구(GO_HOME)")
        else:
            func_labels_flat.append("불명(unknown)")
    func_counter = Counter(func_labels_flat)
    
    restr_count = sum(1 for l in normalized_logs if l.get("is_restrained"))
    high_int_count = sum(1 for l in normalized_logs if l.get("intensity", 1) >= 4)
    
    # 3. 데이터 품질 및 지연일
    quality = calculate_data_quality_report(normalized_logs)
    
    # 4. 임상 패턴 감지 (Pattern Detector)
    patterns = detect_clinical_patterns(normalized_logs)
    
    # 5. 또래 전염 요약 (Peer Contagion)
    contagion = analyze_peer_contagion(normalized_logs, tier_info_list or [])
    top_contagion_edges = contagion.get("edges", [])[:3]

    # 6. 상위 5명 위험 학생 프로파일 압축
    top_students = []
    for sname, cnt in student_counts.most_common(5):
        s_logs = [l for l in normalized_logs if l.get("student_name") == sname]
        s_code = s_logs[0].get("student_code", "") if s_logs else ""
        s_tier = s_logs[0].get("tier", 1) if s_logs else 1
        s_avg_int = round(sum(l.get("intensity", 1) for l in s_logs) / len(s_logs), 2)
        s_restr = sum(1 for l in s_logs if l.get("is_restrained"))
        s_top_beh = Counter(l.get("behavior_type") for l in s_logs).most_common(1)[0][0] if s_logs else ""
        s_top_loc = Counter(l.get("location") for l in s_logs).most_common(1)[0][0] if s_logs else ""
        
        top_students.append({
            "code": s_code,
            "name": sname,
            "tier": s_tier,
            "count": cnt,
            "rate_in_total": f"{round(cnt/total_logs*100, 1)}%",
            "avg_intensity": s_avg_int,
            "restraint_count": s_restr,
            "dominant_behavior": s_top_beh,
            "dominant_location": s_top_loc
        })

    evidence_packet = {
        "metadata": {
            "period": period_label,
            "total_incidents_n": total_logs,
            "unique_students_n": unique_students,
            "high_intensity_4_5_n": f"{high_int_count} ({round(high_int_count/total_logs*100, 1)}%)",
            "physical_restraint_n": f"{restr_count} ({round(restr_count/total_logs*100, 1)}%)",
            "avg_entry_lag_days": quality.get("entry_timeliness", {}).get("avg_lag_days", 0.0)
        },
        "deterministic_distributions": {
            "time_slots_n": dict(slot_counter.most_common(5)),
            "locations_n": dict(loc_counter.most_common(5)),
            "behavior_types_n": dict(beh_counter.most_common(6)),
            "functions_n": dict(func_counter.most_common(6))
        },
        "detected_clinical_patterns": {
            "top_risk_students": top_students,
            "fixed_routines": patterns.get("fixed_routine_patterns", []),
            "setting_events_impact": patterns.get("setting_event_analysis", {}),
            "high_risk_triads": patterns.get("high_risk_triads", [])[:3],
            "staff_injuries_n": patterns.get("staff_injury_summary", {}).get("total_injury_incidents", 0)
        },
        "peer_contagion_signals": [
            f"{e['source']} ➔ {e['reactor']} ({e['count']}회 촉발, 매개: {','.join(e['stimuli'])})"
            for e in top_contagion_edges
        ]
    }
    
    return evidence_packet


def format_evidence_packet_for_prompt(packet: dict) -> str:
    """
    Evidence Packet을 LLM이 한눈에 파악하기 쉬운 초압축 Markdown 텍스트로 렌더링
    """
    return json.dumps(packet, ensure_ascii=False, indent=2)
