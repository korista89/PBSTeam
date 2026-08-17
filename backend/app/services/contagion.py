import re
from typing import List, Dict, Any
from collections import defaultdict

def analyze_peer_contagion(normalized_logs: List[dict], tier_info_list: List[dict] = None) -> Dict[str, Any]:
    """
    학급 단위 또래 행동 전염(Behavioral Contagion) 및 상호작용 네트워크 정밀 분석
    """
    tier_info_list = tier_info_list or []
    
    # 1. 학생별 학급 및 기본 정보 매핑
    student_map = {}
    class_students = defaultdict(set)
    for s in tier_info_list:
        name = str(s.get("name", s.get("학생명", ""))).strip()
        code = str(s.get("code", s.get("학생코드", ""))).strip()
        cls = str(s.get("class", s.get("학급", ""))).strip()
        if name:
            student_map[name] = {"code": code, "class": cls}
            if cls:
                class_students[cls].add(name)
                
    # 로그에서 누락된 학생 정보 보완
    for log in normalized_logs:
        name = log.get("student_name", "").strip()
        cls = log.get("class_name", "").strip()
        code = log.get("student_code", "").strip()
        if name:
            if name not in student_map:
                student_map[name] = {"code": code, "class": cls}
            if cls:
                class_students[cls].add(name)

    # 2. 방향성 상호작용 (Source -> Reactor) 엣지 추출
    # log의 주인(학생 B)의 특기사항에 학생 A의 이름이 언급된 경우: A(자극원/Source) -> B(반응자/Reactor)
    edges = defaultdict(lambda: {"count": 0, "quotes": [], "stimuli": set(), "dates": set()})
    node_stats = defaultdict(lambda: {"as_source": 0, "as_reactor": 0, "class": "", "code": ""})
    
    auditory_stimulus_keywords = ["울음", "소리", "비명", "짜증", "박수", "소음", "불안", "괴성", "두드림", "발구름"]

    for log in normalized_logs:
        reactor = log.get("student_name", "").strip()
        notes = log.get("notes", "")
        log_date = log.get("date", "")
        reactor_class = log.get("class_name", "") or student_map.get(reactor, {}).get("class", "")
        
        if not reactor or not notes:
            continue
            
        # 같은 학급 동급생(또는 전교생) 중 텍스트에 언급된 학생 탐색
        candidates = class_students.get(reactor_class, set())
        if not candidates:
            candidates = set(student_map.keys())
            
        for source in candidates:
            if source == reactor:
                continue
            # 이름 2자 이상 매칭 (예: '승현', '곽승현')
            first_name = source[1:] if len(source) >= 3 else source
            if source in notes or (len(first_name) >= 2 and first_name in notes):
                edge_key = (source, reactor)
                edges[edge_key]["count"] += 1
                if len(edges[edge_key]["quotes"]) < 5:
                    edges[edge_key]["quotes"].append(f"[{log_date}] {notes[:120]}")
                edges[edge_key]["dates"].add(log_date)
                
                # 매개 청각 자극 추출
                for stim in auditory_stimulus_keywords:
                    if stim in notes:
                        edges[edge_key]["stimuli"].add(stim)
                        
                node_stats[source]["as_source"] += 1
                node_stats[source]["class"] = reactor_class
                node_stats[source]["code"] = student_map.get(source, {}).get("code", "")
                
                node_stats[reactor]["as_reactor"] += 1
                node_stats[reactor]["class"] = reactor_class
                node_stats[reactor]["code"] = student_map.get(reactor, {}).get("code", "")

    # 3. 같은 날짜/구간/학급 동시 발생(Co-occurrence) 분석
    co_occurrences = defaultdict(list)
    for log in normalized_logs:
        cls = log.get("class_name", "")
        date = log.get("date", "")
        slot = log.get("primary_slot")
        name = log.get("student_name", "")
        if cls and date and slot and name:
            co_key = f"{cls}_{date}_{slot}구간"
            co_occurrences[co_key].append({
                "student": name,
                "behavior": log.get("behavior_type", ""),
                "intensity": log.get("intensity", 1),
                "notes": log.get("notes", "")[:80]
            })
            
    significant_clusters = []
    for co_key, logs in co_occurrences.items():
        unique_students = list(dict.fromkeys([l["student"] for l in logs]))
        if len(unique_students) >= 2:
            significant_clusters.append({
                "cluster_key": co_key,
                "students": unique_students,
                "count": len(logs),
                "episodes": logs
            })

    # 4. 포맷팅 및 네트워크 데이터 빌드
    formatted_edges = []
    for (src, rec), data in edges.items():
        formatted_edges.append({
            "source": src,
            "reactor": rec,
            "count": data["count"],
            "stimuli": list(data["stimuli"]),
            "quotes": data["quotes"],
            "class": student_map.get(src, {}).get("class", student_map.get(rec, {}).get("class", ""))
        })
    formatted_edges.sort(key=lambda x: x["count"], reverse=True)

    formatted_nodes = []
    for name, stats in node_stats.items():
        formatted_nodes.append({
            "name": name,
            "code": stats["code"],
            "class": stats["class"],
            "as_source_count": stats["as_source"],
            "as_reactor_count": stats["as_reactor"],
            "primary_role": "촉발원(Source)" if stats["as_source"] > stats["as_reactor"] else "반응자(Reactor)"
        })
    formatted_nodes.sort(key=lambda x: (x["as_source_count"] + x["as_reactor_count"]), reverse=True)

    dynamic_findings = []
    if formatted_edges:
        top_edge = formatted_edges[0]
        dynamic_findings.append(f"상호작용 빈발 패턴: {top_edge['source']} ➔ {top_edge['target']} (총 {top_edge['count']}회 공동발생/언급)")
    if significant_clusters:
        top_cluster = significant_clusters[0]
        dynamic_findings.append(f"학급 내 동시 사건 클러스터: {top_cluster.get('date', '')} ({top_cluster.get('time_slot', '')}) - 참여 학생 {top_cluster.get('count', 0)}명")
    if not dynamic_findings:
        dynamic_findings.append("현재 기간 내 뚜렷한 또래 상호작용 연쇄 패턴이 확인되지 않았습니다.")

    return {
        "total_contagion_events": sum(e["count"] for e in formatted_edges),
        "involved_students_count": len(formatted_nodes),
        "edges": formatted_edges,
        "nodes": formatted_nodes,
        "co_occurrence_clusters": significant_clusters[:10],
        "key_findings": dynamic_findings
    }
