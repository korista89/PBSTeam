import os
import openai
from dotenv import load_dotenv
from typing import Dict, List, Optional

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

def generate_ai_insight(summary: dict, trends: list, risk_list: list) -> str:
    """
    Generate AI insight using OpenAI API.
    """
    try:
        if not openai.api_key:
            return "OpenAI API Key가 설정되지 않았습니다."

        prompt = f"""
        당신은 특수학교의 행동중재지원팀(PBIS Team) 코디네이터이자 행동 분석 전문가입니다.
        다음 데이터를 바탕으로 교직원 회의에서 사용할 '행동 중재 회의 브리핑'을 작성해주세요.
        
        [데이터 요약]
        - 총 행동 발생 건수: {summary.get('total_incidents', 0)}건
        - 고위험 학생 수: {len(risk_list)}명
        
        [고위험 학생 목록 (Top 3)]
        {', '.join([f"{r.get('name', r.get('학생명', 'N/A'))} ({r.get('count', 0)}건)" for r in risk_list[:3]])}
        
        [지시사항]
        1. 학교 전체의 행동 발생 추이와 심각도를 분석하고, 긍정적인 변화나 우려되는 점을 명확히 짚어주세요.
        2. 고위험 학생들에 대해 구체적인 중재 방향(기능 평가 필요성, 환경 수정 등)을 제안하세요.
        3. 선생님들에게 격려와 구체적인 행동 가이드(예: 칭찬 강화, 예방적 접근)를 포함하세요.
        4. 말투는 정중하고 전문적인 '해요체'를 사용하세요.
        5. 분량은 300~500자 내외로 핵심만 요약하세요.
        """
        
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a specialized AI assistant for School Wide PBIS (Positive Behavior Interventions and Supports)."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=600
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"AI Insight Error: {e}")
        return "AI 분석을 생성하는 도중 오류가 발생했습니다."

def generate_meeting_agent_report(
    summary: dict,
    trends: list,
    risk_list: list,
    tier_stats: Optional[dict] = None,
    cico_summary: Optional[dict] = None,
    tier3_students: Optional[list] = None
) -> dict:
    """
    Generate a comprehensive meeting agent report for the School Behavior Intervention Team.
    
    Returns structured data:
    - briefing_text: Full text briefing (Korean)
    - sections: Parsed sections for frontend rendering
    """
    total_incidents = summary.get("total_incidents", 0)
    risk_count = len(risk_list) if risk_list else 0
    
    # Default tier stats if not provided
    if not tier_stats:
        tier_stats = {
            "enrolled": 210,
            "tier1": {"count": 200, "pct": 95.2},
            "tier2_cico": {"count": 5, "pct": 2.4, "pure": 3},
            "tier2_sst": {"count": 2, "pct": 1.0},
            "tier3": {"count": 2, "pct": 1.0},
            "tier3_plus": {"count": 1, "pct": 0.5},
        }
    
    enrolled = tier_stats.get("enrolled", 210)
    t1 = tier_stats.get("tier1", {})
    t2c = tier_stats.get("tier2_cico", {})
    t2s = tier_stats.get("tier2_sst", {})
    t3 = tier_stats.get("tier3", {})
    t3p = tier_stats.get("tier3_plus", {})
    
    # ===== Section 1: Briefing =====
    briefing_lines = []
    briefing_lines.append("## 📋 주요 현황 브리핑")
    briefing_lines.append("")
    briefing_lines.append(f"### 전교생 현황 (재학생 {enrolled}명 기준)")
    briefing_lines.append("")
    briefing_lines.append("| Tier | 인원 | 비율 | 비고 |")
    briefing_lines.append("|------|------|------|------|")
    briefing_lines.append(f"| Tier 1 (보편적 지원) | {t1.get('count', 0)}명 | {t1.get('pct', 0)}% | 일반 학생 |")
    briefing_lines.append(f"| Tier 2 CICO | {t2c.get('count', 0)}명 | {t2c.get('pct', 0)}% | 순수 {t2c.get('pure', t2c.get('count', 0))}명 |")
    briefing_lines.append(f"| Tier 2 SST | {t2s.get('count', 0)}명 | {t2s.get('pct', 0)}% | 사회기술훈련 |")
    briefing_lines.append(f"| Tier 3 (집중지원) | {t3.get('count', 0)}명 | {t3.get('pct', 0)}% | FBA/BIP 대상 |")
    briefing_lines.append(f"| Tier 3+ (외부연계) | {t3p.get('count', 0)}명 | {t3p.get('pct', 0)}% | 위기 지원 |")
    briefing_lines.append("")
    
    # Behavior summary
    briefing_lines.append(f"### 행동 발생 현황")
    briefing_lines.append(f"- 분석 기간 내 총 행동 발생 건수: **{total_incidents}건**")
    if risk_count > 0:
        briefing_lines.append(f"- 주의 요망 학생: **{risk_count}명**")
        top_risk = risk_list[:3] if risk_list else []
        for r in top_risk:
            name = r.get("name", r.get("학생명", ""))
            count = r.get("count", r.get("건수", 0))
            briefing_lines.append(f"  - {name}: {count}건")
    briefing_lines.append("")
    
    # CICO Summary
    if cico_summary:
        briefing_lines.append("### CICO 수행 현황")
        briefing_lines.append(f"- CICO 대상 학생: {cico_summary.get('total_students', 0)}명")
        briefing_lines.append(f"- 평균 수행률: {cico_summary.get('avg_rate', 0)}%")
        briefing_lines.append(f"- 목표 달성: {cico_summary.get('achieved_count', 0)}명 / 미달성: {cico_summary.get('not_achieved_count', 0)}명")
        briefing_lines.append("")
    
    # ===== Section 2: Agenda =====
    agenda_lines = []
    agenda_lines.append("## 📌 회의 안건")
    agenda_lines.append("")
    agenda_lines.append("### 안건 1: Tier 1 보편적 지원 현황 보고")
    agenda_lines.append(f"- 전체 행동 발생 추이 및 Big 5 분석 결과 공유")
    agenda_lines.append(f"- 학교 차원 행동 지원 전략 평가")
    agenda_lines.append("")
    agenda_lines.append("### 안건 2: Tier 2 (CICO) 학생별 수행 점검")
    if cico_summary:
        achieved = cico_summary.get("achieved_count", 0)
        not_achieved = cico_summary.get("not_achieved_count", 0)
        agenda_lines.append(f"- 목표 달성 학생 ({achieved}명): Tier 1 하향 여부 논의")
        agenda_lines.append(f"- 미달성 학생 ({not_achieved}명): CICO 수정 또는 Tier 3 상향 검토")
    else:
        agenda_lines.append("- 학생별 수행률 및 달성 여부 점검")
        agenda_lines.append("- Tier 조정 필요 학생 논의")
    agenda_lines.append("")
    agenda_lines.append("### 안건 3: Tier 3 집중지원 학생 점검")
    if tier3_students:
        for s in tier3_students[:5]:
            code = s.get("code", "")
            incidents = s.get("incidents", 0)
            agenda_lines.append(f"- 학생 {code}: {incidents}건 발생, FBA/BIP 적절성 검토")
    else:
        agenda_lines.append("- Tier 3 학생 행동 추이 및 BIP 적절성 검토")
        agenda_lines.append("- 외부 연계(Tier 3+) 필요 여부 논의")
    agenda_lines.append("")
    
    # Emergency agenda
    if risk_count > 0:
        agenda_lines.append("### ⚠️ 긴급 안건")
        for r in risk_list[:3]:
            name = r.get("name", r.get("학생명", ""))
            count = r.get("count", r.get("건수", 0))
            agenda_lines.append(f"- **{name}** ({count}건): 즉각적 개입 방안 논의 필요")
        agenda_lines.append("")
    
    # ===== Section 3: Meeting Order =====
    order_lines = []
    order_lines.append("## 🔄 안건 진행 순서")
    order_lines.append("")
    order_lines.append("```")
    order_lines.append("1️⃣ Tier 1 보편적 지원 보고 (10분)")
    order_lines.append("   → 전체 데이터 리뷰 → 학교 차원 개선 사항 논의")
    order_lines.append("")
    order_lines.append("2️⃣ Tier 2 (CICO) 학생별 점검 (15분)")
    order_lines.append("   → 수행률 리뷰 → 담임 의견 → Tier 조정 결정")
    order_lines.append("")
    order_lines.append("3️⃣ Tier 3 집중지원 점검 (15분)")
    order_lines.append("   → 행동 추이 리뷰 → BIP 적절성 → 외부연계 필요성")
    order_lines.append("")
    order_lines.append("4️⃣ 긴급 안건 (필요 시)")
    order_lines.append("   → 위기 학생 → 즉각 개입 방안 → 담당자 배정")
    order_lines.append("")
    order_lines.append("5️⃣ 종합 결정 및 차기 계획 (5분)")
    order_lines.append("```")
    order_lines.append("")
    
    # ===== Section 4: Decision Methods =====
    decision_lines = []
    decision_lines.append("## 🗳️ 의사결정 방법")
    decision_lines.append("")
    decision_lines.append("| Tier 전환 | 기준 | 결정 방법 |")
    decision_lines.append("|----------|------|----------|")
    decision_lines.append("| Tier1 → Tier2(CICO) | 주 2회 이상 2주 연속 | 담임 + 팀 합의 |")
    decision_lines.append("| Tier2 → Tier1 (하향) | 목표 달성 기준 2개월 연속 충족 | 데이터 기반 자동 권고 |")
    decision_lines.append("| Tier2 → Tier3 (상향) | 3개월 미달성 또는 위기 행동 | 팀 전원 합의 |")
    decision_lines.append("| Tier3 → Tier3+ | 자·타해 위험 또는 FBA/BIP 효과 없음 | 학교장 승인 필요 |")
    decision_lines.append("")
    
    # ===== Section 5: Checklist =====
    checklist_lines = []
    checklist_lines.append("## ☑️ 회의 체크리스트")
    checklist_lines.append("")
    checklist_lines.append("- [ ] Tier 1: 이번 달 전체 행동 발생 추이 검토 완료")
    checklist_lines.append("- [ ] Tier 1: 학교 차원 보편적 지원 전략 점검")
    
    if t2c.get("count", 0) > 0:
        checklist_lines.append(f"- [ ] Tier 2 CICO: {t2c.get('count', 0)}명 학생별 수행률 점검 완료")
        checklist_lines.append("- [ ] Tier 2 CICO: Tier 조정 대상 학생 결정")
    
    if t3.get("count", 0) > 0:
        checklist_lines.append(f"- [ ] Tier 3: {t3.get('count', 0)}명 학생 BIP 적절성 검토")
        checklist_lines.append("- [ ] Tier 3: 외부 연계 필요 학생 파악")
    
    if t3p.get("count", 0) > 0:
        checklist_lines.append(f"- [ ] Tier 3+: {t3p.get('count', 0)}명 학생 위기 지원 계획 수립")
    
    checklist_lines.append("- [ ] 담임교사/담당자 의견 기록 완료")
    checklist_lines.append("- [ ] 차기 회의 일정 및 과제 확정")
    checklist_lines.append("")
    
    # Combine all sections
    full_text = "\n".join(
        briefing_lines + agenda_lines + order_lines + decision_lines + checklist_lines
    )
    
    return {
        "briefing_text": full_text,
        "sections": {
            "briefing": "\n".join(briefing_lines),
            "agenda": "\n".join(agenda_lines),
            "order": "\n".join(order_lines),
            "decision": "\n".join(decision_lines),
            "checklist": "\n".join(checklist_lines),
        },
        "tier_stats": tier_stats,
        "summary": {
            "total_incidents": total_incidents,
            "risk_count": risk_count,
            "cico_students": cico_summary.get("total_students", 0) if cico_summary else 0,
        }
    }
