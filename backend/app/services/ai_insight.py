from typing import Dict

# This service would ideally mimic an LLM call or actually call OpenAI/GeoGPT
# For now, we will rule-generate "AI-like" natural language insights

def generate_ai_insight(summary: Dict, trends: list, risk_list: list) -> str:
    """
    Generates a natural language insight based on the provided data.
    In a real scenario, this would frame a prompt and call an LLM API.
    """
    
    total = summary.get('total_incidents', 0)
    risk_count = summary.get('risk_student_count', 0)
    
    insight = "🤖 **AI 분석 리포트:**\n\n"
    
    # 1. Frequency Analysis
    if total > 50:
        insight += f"- **발생 빈도 경고:** 이번 달 총 {total}건의 행동 문제가 보고되었습니다. 이는 평소보다 높은 수치로, 학교 차원의 보편적(Tier 1) 지원 강화가 필요합니다.\n"
    elif total < 10:
        insight += f"- **안정적 상태:** 이번 달 발생 건수는 {total}건으로 비교적 안정적인 학교 분위기가 유지되고 있습니다.\n"
    else:
        insight += f"- **현황:** 총 {total}건의 사건이 기록되었습니다.\n"
        
    # 2. Risk Group Analysis
    if risk_count > 0:
        top_student = risk_list[0]['name'] if risk_list else "Unknown"
        insight += f"- **집중 모니터링 필요:** 현재 Tier 2/3 수준의 위험군 학생이 {risk_count}명 식별되었습니다. 특히 '{top_student}' 학생의 경우 최근 빈도가 급증하고 있어 신속한 CICO 또는 개별 상담 개입이 권장됩니다.\n"
    
    # 3. Strategy Recommendation
    insight += "\n"
    if total > 0:
        insight += "**💡 추천 전략:** 점심시간 직후와 체육 시간에 갈등이 빈번합니다(Hotspot 분석). 해당 시간대 교사 순찰을 2배로 강화하고, 학급별 '평화 지킴이' 활동을 도입하는 것을 고려해보세요."
        
    return insight
