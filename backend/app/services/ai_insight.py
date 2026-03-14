import os
from dotenv import load_dotenv
from typing import Dict, List, Optional

load_dotenv()

# Google Gemini API setup
try:
    import google.generativeai as genai
    _GENAI_AVAILABLE = True
except ImportError:
    genai = None
    _GENAI_AVAILABLE = False
    print("WARNING: google-generativeai not installed. AI features will be unavailable.")

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
if GOOGLE_API_KEY and _GENAI_AVAILABLE:
    genai.configure(api_key=GOOGLE_API_KEY)

BCBA_SYSTEM_PROMPT = """당신은 BCBA(Board Certified Behavior Analyst) 자격을 가진 특수교육 및 행동 분석 전문가입니다.
학교차원 긍정적 행동지원(SW-PBIS) 프레임워크와 ABA(응용행동분석) 원리에 기반하여 정밀하게 데이터를 분석합니다. 
학교 행동중재지원팀(SST)의 의사결정을 돕기 위해 데이터 기반의 실제적이고 전문적인 분석 결과를 제공하는 것이 목표입니다.

[작성 가이드라인]
1. 어조: 전문적이고 객관적이되, 현장 교사들이 이해하기 쉬운 한국어(정중한 '해요체')로 작성합니다.
2. 핵심: 현상 나열보다는 '왜(기능)' 그런 일이 일어나는지, 어떤 '증거기반실제(EBP)'를 적용해야 하는지에 집중합니다.
3. 근거: 반드시 제공된 수치와 데이터를 근거로 분석을 수행합니다.
4. 구조: 가독성을 위해 Markdown 서식(볼드, 목록, 필요시 테이블)을 적극적으로 활용합니다."""

def _call_gemini(system_prompt: str, user_prompt: str, max_tokens: int = 800) -> str:
    """Shared Google Gemini API call wrapper."""
    try:
        if not _GENAI_AVAILABLE:
            return "⚠️ AI 모듈(google-generativeai)이 설치되지 않았습니다. 서버 관리자에게 문의하세요."
        if not GOOGLE_API_KEY:
            return "⚠️ Google API Key가 설정되지 않았습니다. Vercel 환경변수에 GOOGLE_API_KEY를 추가해주세요."
        
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=system_prompt,
            generation_config=genai.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=0.7,
            )
        )
        
        response = model.generate_content(user_prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return f"⚠️ AI 분석 중 오류가 발생했습니다: {str(e)}"


def generate_ai_insight(summary: dict, trends: list, risk_list: list) -> str:
    """Generate professional BCBA insight for school-wide dashboard."""
    risk_text = ", ".join([f"{r.get('name', r.get('학생명', 'N/A'))} ({r.get('count', 0)}건)" for r in risk_list[:3]]) if risk_list else "없음"
    
    prompt = f"""[학교 전체 데이터 요약]
- 분석 기간 총 행동 발생: {summary.get('total_incidents', 0)}건
- 일평균 발생율: {summary.get('daily_avg', '데이터 없음')}
- 고위험(Risk) 학생군: {summary.get('risk_student_count', 0)}명
- 집중 관리 대상자: {risk_text}

[지시사항]
BCBA로서 위 데이터를 바탕으로 '학교 행동중재지원팀(SST) 주간 브리핑'을 작성하세요.

1. **상태 진단**: 전체적인 행동 발생 현황이 안정적인지, 아니면 특정 요인(날짜, 이벤트 등)으로 인해 악화 중인지 진단하세요.
2. **패턴 분석**: 고위험 학생들의 발생 빈도와 심각도를 고려할 때, 학급 차원의 환경 수정이 필요한지 아니면 개별화된 FBA(기능평가)가 우선인지 제안하세요.
3. **EBP 제안**: 교직원이 즉시 실천할 수 있는 보편적 지원(Tier 1) 전략(예: 칭찬 강화 비율 확대, 시각적 일과표 정비 등)을 전문 용어와 함께 제시하세요.
4. **결론**: 이번 주 가장 시급하게 추진해야 할 행동 지원 액션 플랜을 1가지만 명확히 짚어주세요.

*분량: 400~600자 내외 핵심 요약*"""
    
    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 600)


def generate_meeting_agent_report(
    summary: dict,
    trends: list,
    risk_list: list,
    tier_stats: Optional[dict] = None,
    cico_summary: Optional[dict] = None,
    tier3_students: Optional[list] = None
) -> dict:
    """Generate a comprehensive meeting agent report for the School Behavior Intervention Team."""
    total_incidents = summary.get("total_incidents", 0)
    risk_count = len(risk_list) if risk_list else 0
    
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
    
    briefing_lines.append(f"### 행동 발생 현황")
    briefing_lines.append(f"- 분석 기간 내 총 행동 발생 건수: **{total_incidents}건**")
    if risk_count > 0:
        briefing_lines.append(f"- 주의 요망 학생: **{risk_count}명**")
        for r in risk_list[:3]:
            name = r.get("name", r.get("학생명", ""))
            count = r.get("count", r.get("건수", 0))
            briefing_lines.append(f"  - {name}: {count}건")
    briefing_lines.append("")
    
    if cico_summary:
        briefing_lines.append("### CICO 수행 현황")
        briefing_lines.append(f"- CICO 대상 학생: {cico_summary.get('total_students', 0)}명")
        briefing_lines.append(f"- 평균 수행률: {cico_summary.get('avg_rate', 0)}%")
        briefing_lines.append(f"- 목표 달성: {cico_summary.get('achieved_count', 0)}명 / 미달성: {cico_summary.get('not_achieved_count', 0)}명")
        briefing_lines.append("")
    
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
    
    if risk_count > 0:
        agenda_lines.append("### ⚠️ 긴급 안건")
        for r in risk_list[:3]:
            name = r.get("name", r.get("학생명", ""))
            count = r.get("count", r.get("건수", 0))
            agenda_lines.append(f"- **{name}** ({count}건): 즉각적 개입 방안 논의 필요")
        agenda_lines.append("")
    
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


# ============================================================
# BCBA Analysis Functions (Google Gemini)
# ============================================================

def generate_bcba_section_analysis(section_name: str, data_context: dict) -> str:
    """Generate professional BCBA analysis for school-wide report sections."""
    prompt = f"""[분석 대상 섹션]: {section_name}
[관련 데이터]:
{_format_dict(data_context)}

[지시사항]
BCBA로서 학급 및 학교 전체 보고서의 해당 섹션에 대한 임상적 분석을 수행하세요.

1. **데이터 인사이트**: 단순히 수치를 나열하지 말고, 해당 데이터가 학교 차원의 PBIS 운영에 주는 의미를 찾으세요. (예: 특정 시간대 집중 발생 시 인력 배치 이슈 제안)
2. **EBP 연계**: 분석 결과를 바탕으로 T1(보편), T2(선별) 단계에서 적용할 수 있는 증거기반실제(EBP) 전략을 권고하세요.
3. **의사결정 가이드**: 관리자와 교사들이 어떤 방향으로 중재 계획을 수정해야 할지 2~3가지 핵심 포인트로 정리하세요.

*정교한 한국어로 400~600자 분량으로 작성하세요.*"""
    
    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 600)


def generate_bcba_cico_analysis(students_data: list, behavior_logs: list = None, tier_info: list = None) -> str:
    """Generate clinical BCBA analysis for CICO (Tier 2) reports."""
    student_summaries = []
    for s in students_data[:15]:
        student_summaries.append(
            f"- {s.get('code','?')}: 목표={s.get('target_behavior','')}, 수행률={s.get('rate','')}, 달성={s.get('achieved','')}"
        )
    
    behavior_context = ""
    if behavior_logs:
        from collections import Counter
        types = Counter(str(r.get("행동유형", r.get("type", ""))) for r in behavior_logs)
        behavior_context = f"\n[CICO 학생들의 병행 행동 기록]\n- 빈발 유형: {dict(types.most_common(5))}\n"
    
    prompt = f"""[이번 달 CICO 대상자 데이터]
{chr(10).join(student_summaries)}
{behavior_context}

[지시사항]
BCBA로서 이번 달 CICO 성과를 분석하고 Tier 조정 및 중재 수정을 제안하세요.

1. **성과 평가**: 목표 달성률과 실제 행동 발생 기록 간의 상관관계를 분석하세요. (CICO 만족도는 높은데 행동 발생이 여전하다면 중재 수정 필요)
2. **트렌드 분류**: 학생들을 '자력 회복(Tier 1 복귀 가능)', '유지/정체', '심화(Tier 3 검토)' 그룹으로 분류하고 근거를 제시하세요.
3. **Tier 조정 권고**: 
   - 2개월 연속 목표 80% 이상 달성 시: Tier 1 하향 및 사후 관리 전환
   - 3개월 연속 미달성 시: 중재 강화(Intensification) 또는 FBA 실시 후 Tier 3 상향
4. **결론**: 담당 교사들을 위한 CICO 운영 팁을 간략히 포함하세요."""
    
    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 1200)


def generate_bcba_meeting_minutes(
    start_date: str,
    end_date: str,
    summary: dict,
    risk_list: list,
    cico_stats: dict = None,
    tier3_stats: list = None,
    context_start: str = None,
    context_end: str = None,
    context_summary: dict = None,
    context_risk_list: list = None
) -> str:
    """Generate professional comparative meeting minutes for the principal and behavior team."""
    focus_risk_text = "\n".join([f"- {r.get('name', '')}: {r.get('count', 0)}건 (Tier {r.get('tier', '?')})" for r in risk_list[:5]]) if risk_list else "없음"
    
    cico_total = cico_stats.get('total_students', 0) if cico_stats else 0
    cico_avg = cico_stats.get('avg_rate', 0) if cico_stats else 0
    cico_text = f"- CICO 대상: {cico_total}명, 달성률 {cico_avg}%" if cico_stats else "데이터 없음"
    
    t3_text = "\n".join([f"- {s.get('code', '')}: {s.get('incidents', 0)}건, 기능={s.get('top_function', '')}" for s in tier3_stats[:5]]) if tier3_stats else "데이터 없음"

    context_text = ""
    if context_summary:
        f_avg = summary.get('daily_avg', 0)
        c_avg = context_summary.get('daily_avg', 0)
        trend = "안정"
        try:
            f_avg_val = float(f_avg)
            c_avg_val = float(c_avg)
            if f_avg_val > c_avg_val * 1.1: trend = "상승(우려)"
            elif f_avg_val < c_avg_val * 0.9: trend = "하락(개선)"
        except:
            pass
        context_text = f"\n[비교 데이터 ({context_start} ~ {context_end})]\n- 일평균 발생 비교: {c_avg} -> {f_avg} ({trend})\n"

    prompt = f"""[분석 대상 기간]: {start_date} ~ {end_date}
{context_text}
[주요 데이터 현황]
- 총 행동 발생: {summary.get('total_incidents', 0)}건
- 고위험군: {focus_risk_text}
- CICO(Tier 2): {cico_text}
- 집중지원(Tier 3): {t3_text}

[지시사항]
BCBA이자 학교행동중재지원팀(SST) 전문가로서 학교장 보고용 '정기 행동중재 협의록'을 작성하세요.

1. **종합 총평**: 비교 기간 대비 행동 발생 추이의 변화를 데이터 기반으로 분석하고, 전반적인 PBIS 운영 상태를 평가하세요.
2. **Tier별 성과**: 보편적 지원(T1)의 효과성과 소집단/개별 중재(T2/T3)의 성과를 구분하여 기술하세요.
3. **핵심 안건**: 고위험 학생들에 대한 개별 중재 현황과 향후 추진 계획을 명시하세요.
4. **종합 추천**: 학교 환경 수정이나 인력 배치 등 행정적 지원이 필요한 포인트가 있다면 제안하세요.

*형식: 공문서 스타일로 개조식 구성 (수치를 적극 활용하여 1500자 내외로 상세히 작성)*"""

    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 3000)


def generate_bcba_tier3_analysis(tier3_students: list, behavior_logs: list, cico_data: list = None) -> str:
    """Generate professional BCBA analysis for individual intensive (Tier 3) reports."""
    student_info = "\n".join([f"- {s.get('code','')}: 빈도 {s.get('incidents',0)}건, 강도 {s.get('max_intensity','')}, 기능 {s.get('top_function','')}" for s in tier3_students[:10]])
    log_summary = _summarize_behavior_logs(behavior_logs)
    
    prompt = f"""[Tier 3 관리 대상자 현황]
{student_info}

[행동 패턴 요약]
{log_summary}

[지시사항]
BCBA로서 이번 달 Tier 3 학생들의 행동 양상을 정밀 분석하고 임상적 의견을 제시하세요.

1. **개별 맞춤 분석**: 각 학생의 행동 형태와 기능, 발생 패턴(Context)을 교차 분석하여 BIP의 유효성을 평가하세요.
2. **중재 정교화**: 데이터상 BIP가 효과적이지 않은 학생(빈도/강도 유지 또는 상승)을 식별하고, 특정 EBP(예: 기능적 의사소통 훈련, 환경의 정비 등) 보완을 권고하세요.
3. **위기 관리**: 자·타해 등 위험도가 높은 학생의 고수위 행동에 대한 위기관리 계획(Crisis Plan)의 적절성을 검토하세요.
4. **졸업 및 전환**: 중재 효과가 뚜렷하여 Tier 2로 하향 조정이 가능하거나, 반대로 외부 연계(Tier 3+)가 필요한 학생을 선별하세요.

*전문가적인 식견이 담긴 한국어로 상세히 작성하세요(1000자 내외).*"""

    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 1500)


def generate_bcba_student_analysis(
    student_info: dict, 
    behavior_logs: list, 
    cico_data: list = None,
    teacher_notes: list = None,
    meeting_notes: list = None
) -> str:
    """Generate a deep BCBA clinical analysis for an individual student."""
    log_summary = _summarize_behavior_logs(behavior_logs)
    all_notes = (teacher_notes or []) + (meeting_notes or [])
    notes_text = ""
    if all_notes:
        notes_lines = []
        for n in all_notes[:10]:
            notes_lines.append(f"- [{n.get('date', '')}] {n.get('content', '')[:150]}")
        notes_text = "\n[교사/상담 기록 서술형 정보]\n" + "\n".join(notes_lines)
    
    prompt = f"""[학생 정밀 데이터]
- 학생: {student_info.get('code', '')} (Tier {student_info.get('tier', '')})
- 학급: {student_info.get('class', '')}

[행동 데이터 패턴 요약]
{log_summary}

{f"[CICO 수행 데이터]{chr(10)}{_format_list(cico_data[:5])}" if cico_data else ""}
{notes_text}

[지시사항]
BCBA 전문가로서 이 학생의 중재 전략 수립을 위한 심층 분석을 수행하세요.

1. **기능적 가설(Functional Hypothesis)**: 행동의 형태(Topography)가 아닌 기능(Function: 정적/부적 강화)에 집중하여 가설을 도출하세요. 상담 기록에 나타난 전조(Antecedent)와 결과를 데이터와 연결하세요.
2. **트렌드 및 상관분석**: 시간대별, 요일별 발생 패턴과 CICO 수행률 및 교사 기록 사이의 상관관계가 있는지 분석하세요.
3. **증거기반실제(EBP) 추천**: 
   - 예방: 선행사건 수정(NCR, 환경 재구조화 등)
   - 기술: 대체행동 교수(BST, 사회적 상황 이야기 등)
   - 결과: 차별강화(DRA, DRO 등)
4. **Tier 조정 제안**: 현재의 지원 단계(Tier)가 적절한지, 아니면 위기 대응(Tier 3+)이나 단계적 하향이 필요한지 근거와 함께 제시하세요.

*정교한 한국어로 가독성 있게 작성하세요(800~1000자).*"""

    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 1500)


def generate_bip_hypothesis(
    student_code: str,
    behavior_logs: list,
    tier_data: dict = None,
    cico_data: list = None
) -> str:
    """Generate BIP hypothesis based on comprehensive data analysis."""
    log_summary = _summarize_behavior_logs(behavior_logs)
    
    prompt = f"""[학생 코드]: {student_code}
{f"[Tier 정보]: {tier_data}" if tier_data else ""}

[행동 기록 분석]
{log_summary}

{f"[CICO 데이터]{chr(10)}{_format_list(cico_data[:5])}" if cico_data else ""}

[지시사항]
BCBA로서 위 데이터를 종합적으로 분석하여 BIP(행동중재계획)의 가설을 수립하세요.

다음 형식으로 작성해주세요:

**[표적행동]**
(현재 나타나는 행동을 구체적이고 관찰 가능한 용어로 정의)

**[가설]**
(배경사건-선행사건-행동-후속결과 패턴을 기반으로, 행동의 기능을 파악한 가설)
형식: "(배경)일 때, (선행사건)이 발생하면, (학생이름)은/는 (행동)을 하고, 그 결과 (기능/강화)를 얻는다."

**[목표 (수치화)]**
(구체적이고 측정 가능한 목표를 작성)
예: "주 5회 → 주 2회 이하로 감소" 또는 "착석 시간 3분 → 10분으로 증가"
"""
    
    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 800)


def generate_bip_strategies(
    student_code: str,
    target_behavior: str,
    hypothesis: str,
    goals: str,
    behavior_logs: list,
    cico_data: list = None
) -> str:
    """Generate BIP intervention strategies based on current BIP fields."""
    log_summary = _summarize_behavior_logs(behavior_logs)
    
    prompt = f"""[학생 코드]: {student_code}

[현재 BIP 내용]
- 표적행동: {target_behavior}
- 가설: {hypothesis}
- 목표 (수치화): {goals}

[행동 기록 분석]
{log_summary}

{f"[CICO 데이터]{chr(10)}{_format_list(cico_data[:5])}" if cico_data else ""}

[지시사항]
BCBA로서 위 표적행동, 가설, 목표에 맞추어 구체적인 중재 전략을 제안하세요.

다음 4가지 영역별로 작성해주세요:

**[예방 전략 (Prevention)]**
- 배경사건/선행사건 수정을 통해 문제행동 발생을 사전에 예방하는 전략

**[교수 전략 (Teaching)]**  
- 대체행동/바람직한 행동을 체계적으로 가르치는 전략

**[강화 전략 (Reinforcement)]**
- 바람직한 행동을 강화하고 문제행동의 강화를 차단하는 전략

**[위기관리 계획 (Crisis Plan)]**
- 위기 상황(자·타해, 도주 등) 발생 시 대응 절차

각 영역당 2~3가지 구체적 전략을 제안하세요. 특수학교 현장에서 실제 적용 가능한 수준으로 작성하세요."""
    
    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 1200)


SCHOOL_CRISIS_PROTOCOL = """[학교 차원 위기행동 지원 프로토콜 (기본 베이스)]
1) 전조: 불안한 눈빛이나 짧은 호흡 등 전조 징후가 관찰될 경우, 감정카드 등 시각 도구로 자기조절을 유도하며, 진정 시 교육활동으로 복귀시키고 고조 시 다음 단계로 이행한다.
2) 고조: 얼굴 붉힘, 목소리 고조 등 정서가 급격히 거칠어지는 학급 차원의 문제행동이 발생할 경우, 언어 자극을 최소화하고 시각자료를 활용해 자극 요소를 차단하며, 진정 시 복귀시키되 위기행동으로 악화될 경우 위기 발생 상황 알림 단계로 넘어간다.
3) 대응 및 알림: 의자를 집어던지거나 자해적 행동 등 학교 차원 관리 위기행동이 발생할 경우, 비상벨이나 무전기로 즉시 위기대응팀을 호출하여 현장 대응 및 제한적 물리적 제지를 실행하며, 진정되면 교육활동으로 복귀시키고 지속되면 분리 장소와 분리지도 교원을 확정한다.
4) 분리지도 및 회복: 교직원 2인 이상이 동행하여 학생을 안전하게 분리 장소로 이동시킨 경우, 진정 활동지 등을 제공하고 10분 간격으로 호흡 안정 및 지시 수용 상태를 관찰하며, 복귀 가능 기준 충족 시 학급으로 복귀시키고 미회복 시 2차 분리를 진행한다.
5) 가정학습 조치 및 보고: 하루 2회 이상 분리 후에도 복귀를 거부하거나 반복적 위기행동으로 회복이 불가능한 경우, 관리자 보고 및 학부모 연락을 통해 가정학습 전환과 학생 인계를 실행하며, 발생 상황을 행동데이터시스템에 입력하고 분리지도 보고서를 제출하여 추후 지원 여부를 확정한다."""


def generate_full_bip(
    student_code: str,
    behavior_logs: list,
    tier_data: dict = None,
    meeting_notes: list = None,
    cico_data: list = None,
    user_context: dict = None
) -> str:
    """Generate comprehensive BIP using ALL available data sources."""
    log_summary = _summarize_behavior_logs(behavior_logs)
    
    # Format meeting notes
    notes_text = "(상담/관찰 기록 없음)"
    if meeting_notes:
        notes_lines = []
        for n in meeting_notes[:10]:
            date = n.get("date", n.get("날짜", ""))
            content = n.get("content", n.get("내용", ""))
            if content:
                notes_lines.append(f"- [{date}] {content[:150]}")
        if notes_lines:
            notes_text = "\n".join(notes_lines)
    
    # Format CICO data
    cico_text = "(CICO 데이터 없음)"
    if cico_data:
        cico_lines = []
        for c in cico_data[:5]:
            cico_lines.append(str(c)[:200])
        if cico_lines:
            cico_text = "\n".join(cico_lines)
    
    # Format tier info
    tier_text = "(Tier 정보 없음)"
    if tier_data:
        tier_text = str(tier_data)[:300]
    
    # User context (fields 9-11)
    user_text = ""
    if user_context:
        med = user_context.get("medication_status", "")
        reinf = user_context.get("reinforcer_info", "")
        other = user_context.get("other_considerations", "")
        if med: user_text += f"\n[약물 복용 현황]: {med}"
        if reinf: user_text += f"\n[강화제 정보]: {reinf}"
        if other: user_text += f"\n[기타 고려사항]: {other}"
    if not user_text:
        user_text = "(사용자 추가 입력 없음)"
    
    prompt = f"""[학생 코드]: {student_code}

[Tier 현황]
{tier_text}

[행동 기록 분석 (BehaviorLogs1)]
{log_summary}

[상담일지/관찰기록 (MeetingNotes)]
{notes_text}

[CICO 데이터]
{cico_text}

[사용자 입력 정보 (약물/강화제/기타)]
{user_text}

{SCHOOL_CRISIS_PROTOCOL}

[지시사항]
BCBA로서 위의 모든 데이터를 종합적으로 분석하여, 아래 8개 영역의 BIP(행동중재계획) 내용을 작성하세요.

**반드시 지켜야 할 규칙:**
1. 각 영역의 내용은 서로 **절대 중복되지 않도록** 합니다. 8개가 합쳐져서 하나의 완성된 BIP가 됩니다.
2. 각 영역당 **최대 10줄 이내**로 작성합니다.
3. 그대로 복사하여 붙여넣기하면 BIP가 완성되도록 **실용적이고 구체적으로** 작성합니다.
4. 7번 위기행동지원전략은 위 학교 차원 프로토콜을 기본으로 하되, 데이터에서 식별된 이 학생의 특성에 맞게 개별맞춤형으로 제시합니다.
5. **4, 5, 6번(전략 영역)에서는 반드시 NCEAP의 EBP Report(2020) 또는 Cooper의 응용행동분석(ABA) 3판에서 명시된 증거기반실제(EBP) 절차 이름을 각 전략의 제목으로 사용합니다.**

**EBP 용어 사용 규칙 (4, 5, 6번에 적용):**
각 전략은 아래 형식으로 제시합니다:
• **[EBP 절차명(영문 약어)]** — 구체적 적용 방법  
예시:
- **[NCR(비수반강화, Noncontingent Reinforcement)]** — 10분 간격 고정시간 스케줄(FT)로 선호자극 제공
- **[고확률지시순서(High-Probability Instructional Sequence)]** — 쉬운 지시 3회 연속 후 목표 지시 제시
- **[BST(행동기술훈련, Behavioral Skills Training)]** — 지시→모델링→리허설→피드백 4단계로 교수
- **[DRA(대체행동 차별강화)]** — 도움 요청 시 즉시 강화, 자리이탈 시 강화 차단
- **[토큰경제(Token Economy)]** — 토큰 5개 누적 시 선호활동 교환
- **[자기관리(Self-Management)]** — 자기기록+자기평가+자기강화 3단계

4번 예방 전략에 사용 가능한 EBP: NCR(비수반강화), 고확률지시순서(HPC), 선행사건 조절(Antecedent Modification), 환경재배치(Environmental Rearrangement), 시각적 지원(Visual Support), 선택제공(Choice Making), 구조화된 일과(Structured Schedule)
5번 교수 전략에 사용 가능한 EBP: BST(행동기술훈련), 촉구(Prompting)/용암(Fading), 과제분석(Task Analysis), 사회기술훈련(Social Skills Training), 자기관리(Self-Management), 또래중재(Peer-Mediated Instruction), 비디오 모델링(Video Modeling), 사회 내러티브(Social Narratives)
6번 강화 전략에 사용 가능한 EBP: DRA(대체행동 차별강화), DRI(비양립행동 차별강화), DRO(타행동 차별강화), 토큰경제(Token Economy), 행동계약(Behavioral Contracting), 집단강화(Group-Oriented Contingency), 소거(Extinction), 반응대가(Response Cost)

다음 형식으로 정확히 작성하세요:

**[1. 표적행동]**
(내용)

**[2. 가설(기능)]**
(내용)

**[3. 목표]**
(내용)

**[4. 예방 전략]**
(EBP 절차명을 제목으로 하여 각 전략 제시)

**[5. 교수 전략]**
(EBP 절차명을 제목으로 하여 각 전략 제시)

**[6. 강화 전략]**
(EBP 절차명을 제목으로 하여 각 전략 제시)

**[7. 위기행동지원 전략]**
(내용)

**[8. 평가 계획(Tier3 졸업 기준 포함)]**"""
    
    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 2500)


# ============================================================
# Utility Functions
# ============================================================

def _format_dict(d: dict) -> str:
    """Format a dict for prompt inclusion."""
    lines = []
    for k, v in d.items():
        if isinstance(v, list):
            lines.append(f"- {k}: {len(v)}개 항목")
            for item in v[:5]:
                lines.append(f"  - {item}")
        elif isinstance(v, dict):
            lines.append(f"- {k}: {v}")
        else:
            lines.append(f"- {k}: {v}")
    return "\n".join(lines)


def _format_list(lst: list) -> str:
    """Format a list for prompt inclusion."""
    if not lst:
        return "(데이터 없음)"
    return "\n".join([f"- {item}" for item in lst[:10]])


def _summarize_behavior_logs(logs: list) -> str:
    """Summarize behavior logs for AI prompt."""
    if not logs:
        return "(행동 기록 없음)"
    
    total = len(logs)
    
    type_counts = {}
    function_counts = {}
    time_counts = {}
    day_counts = {}
    intensity_sum = 0
    intensity_count = 0
    
    for log in logs:
        btype = log.get("행동유형", log.get("type", ""))
        func = log.get("기능", log.get("function", ""))
        time_slot = log.get("시간대", log.get("time", ""))
        date_str = log.get("행동발생 날짜", log.get("date", ""))
        intensity = log.get("강도", log.get("intensity", 0))
        
        if btype:
            type_counts[btype] = type_counts.get(btype, 0) + 1
        if func:
            function_counts[func] = function_counts.get(func, 0) + 1
        if time_slot:
            time_counts[time_slot] = time_counts.get(time_slot, 0) + 1
        if date_str:
            try:
                from datetime import datetime
                dt = datetime.strptime(str(date_str), "%Y-%m-%d")
                days = ["월", "화", "수", "목", "금", "토", "일"]
                day_name = days[dt.weekday()]
                day_counts[day_name] = day_counts.get(day_name, 0) + 1
            except:
                pass
        try:
            ival = float(intensity)
            intensity_sum += ival
            intensity_count += 1
        except:
            pass
    
    avg_intensity = round(intensity_sum / intensity_count, 2) if intensity_count > 0 else 0
    
    lines = [
        f"- 총 행동 발생: {total}건",
        f"- 평균 강도: {avg_intensity}",
        f"- 행동유형별: {_top_items(type_counts, 5)}",
        f"- 기능별: {_top_items(function_counts, 5)}",
        f"- 시간대별: {_top_items(time_counts, 5)}",
        f"- 요일별: {_top_items(day_counts, 5)}",
    ]
    
    return "\n".join(lines)


def _top_items(counts: dict, n: int = 5) -> str:
    """Get top N items from a count dict as a formatted string."""
    if not counts:
        return "(없음)"
    sorted_items = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:n]
    return ", ".join([f"{k}({v}건)" for k, v in sorted_items])

def generate_bcba_comprehensive_analysis(
    start_date: str,
    end_date: str,
    analytics_data: dict,
    cico_data: dict,
    tier3_data: dict
) -> str:
    """Generate a holistic BCBA report for the entire school based on dashboard data."""
    
    # Format analytics context
    summary = analytics_data.get("summary", {})
    big5 = analytics_data.get("big5", {})
    
    behavior_types = ", ".join([f"{item['name']}({item['value']})" for item in big5.get("behaviors", [])[:5]])
    time_slots = ", ".join([f"{item['name']}({item['value']})" for item in big5.get("times", [])[:5]])
    locations = ", ".join([f"{item['name']}({item['value']})" for item in big5.get("locations", [])[:5]])
    
    risk_list = analytics_data.get("risk_list", [])
    risk_text = "\n".join([f"- {r['name']}: {r['count']}건" for r in risk_list[:5]]) if risk_list else "없음"
    
    # Format CICO context
    cico_summary = cico_data.get("summary", {})
    cico_text = f"- 대상 학생: {cico_summary.get('total_students', 0)}명\n" \
                f"- 평균 수행률: {cico_summary.get('avg_rate', 0)}%\n" \
                f"- 목표 달성: {cico_summary.get('achieved_count', 0)}명 / 미달성: {cico_summary.get('not_achieved_count', 0)}명"
    
    # Format Tier 3 context
    t3_students = tier3_data.get("students", [])
    t3_text = "\n".join([f"- {s['code']}({s['name']}): {s.get('incidents', 0)}건 발생" for s in t3_students[:5]]) if t3_students else "없음"
    
    prompt = f"""[분석 기간]: {start_date} ~ {end_date}

[1. 전체 행동 발생 통계]
- 총 발생 건수: {summary.get('total_incidents', 0)}건
- 일평균 발생: {summary.get('daily_avg', 0)}건
- 주요 행동 유형: {behavior_types}
- 주요 발생 시간대: {time_slots}
- 주요 발생 장소: {locations}

[2. 집중 지원 대상 학생 (High Risk)]
{risk_text}

[3. Tier 2 (CICO) 운영 현황]
{cico_text}

[4. Tier 3 (집중지원/위기관리) 학생 현황]
{t3_text}

[지시사항]
당신은 특수학교 PBS 전문가(BCBA)입니다. 위 데이터를 바탕으로 학교 전체의 PBS 운영 현황을 진단하고 개선 방향을 제시하는 '학교 PBS 운영 종합 분석 보고서'를 작성하세요.

보고서 구성:
1. **행동 현황 총평**: 기간 내 행동 발생 추이와 전반적인 학교 분위기 분석
2. **Tier별 운영 효과성**: 보편적 지원(T1)이 잘 작동하고 있는지, 2/3단계 지원이 필요한 학생들에게 적절히 제공되고 있는지 평가
3. **핵심 위기 요인**: 고위험 학생군과 빈발 장소/시간대를 연계한 환경적 위험 요소 분석
4. **전문적 제언**: 차기 운영 기간 동안 강화해야 할 PBIS 전략 및 행정적 지원 요청 사항

*분량: 1500자 내외로 상세하고 전문적으로 작성*"""
    
    return _call_gemini(BCBA_SYSTEM_PROMPT, prompt, 3000)
