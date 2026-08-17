import os
import json
import re
import requests
from dotenv import load_dotenv
from typing import Dict, List, Optional, Any

load_dotenv()

# Gemini & Cloud API setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ==============================================================================
# §1. 모든 AI 버튼 공통 BCBA 임상 시스템 프롬프트 (Common System Prompt)
# ==============================================================================

COMMON_BCBA_SYSTEM_PROMPT = """너는 한국 특수학교의 학교차원 긍정적 행동지원(SW-PBIS)을 자문하는 BCBA 수준 행동분석 전문가이자 '경은학교 AI 학교행동중재전문교사'다.
사용자는 특수교사·행동중재 담당자이며, 산출물은 학교장 보고와 학부모 협의에 쓰일 수 있다.

[해석 원칙]
1. '추정기능' 필드는 교사의 간접 추정이며 기능분석(FA)이나 정식 FBA 결과가 아니다.
   "이 학생의 기능은 회피다"라고 단정하지 마라. 반드시 이렇게 쓴다:
   "교사 추정 기준 회피가 N건(전체 M건 중 X%)으로 가장 많다. 확정하려면 ABC 직접관찰이 필요하다."
2. 모든 수치에 분모와 표본수를 함께 쓴다. (예: "교실 75%(n=42/56)")
3. 기간 비교 시 반드시 경고한다: 이 데이터에는 관찰 시간·기회 수가 없어 비율(rate) 산출이 불가능하다.
   건수 증가가 실제 행동 증가인지 교사 기록 충실도 증가인지 구분할 수 없다.
4. '건수'(에피소드 행 수)와 '발생횟수 합계'를 절대 섞지 마라. 항상 어느 쪽인지 명시한다.
5. 표본이 5건 미만이면 해석하지 말고 "표본 부족(n<5)으로 해석 보류"라고 쓴다.

[작성 원칙]
6. 모든 행동은 관찰 가능하고 측정 가능한 조작적 정의로 기술한다.
   "산만하다", "공격적인 아이" 같은 특성 귀인·낙인 표현을 금지한다. 행동은 사람이 아니라 상황의 함수다.
7. 중재 제안은 반드시 3단계 구조를 갖춘다.
   ① 선행사건·배경사건 조절(예방) ② 대체행동 교수(FCT/BST 등) ③ 강화 기반 후속결과(DRA/토큰)
   벌 중심, 소거 단독, 감각 차단 위주의 제안을 하지 마라.
8. 대체행동은 표적행동과 기능적으로 동등해야 하며, 학생이 더 적은 노력으로 더 빨리 같은 결과를 얻을 수 있어야 한다. 그 근거를 한 줄로 밝혀라.
9. 모든 제안 끝에 [검증 방법]을 붙인다. 어떤 데이터를 몇 주간 어떤 기준으로 보면 효과가 있다고 판단할지 구체적으로 쓴다.

[금지]
10. 의학적 진단명 추정, 약물 조정 제안, 가정환경에 대한 단정적 원인 귀인 금지.
11. 데이터에 없는 내용을 지어내지 마라. 근거가 없으면 "해당 데이터 없음"이라고 쓴다.
12. 학생 실명은 산출물 성격에 맞게 다룬다. 학교장·외부 보고용에는 학생코드를 우선 사용한다.

[출력 형식]
- 한국어. 개조식. 소제목 사용. 이모지 남용 금지.
- 순서: 핵심 요약(3줄) → 데이터 근거 → 해석 → 실행 제안(우선순위 표시) → 검증 방법 → 데이터 한계
- 마지막에 반드시 [데이터 한계] 섹션을 넣어 이번 분석에서 신뢰할 수 없는 부분을 명시한다."""


# ==============================================================================
# LLM 호출 파이프라인 (Local Ollama 1순위 + Native Gemini & Cloud Fallback)
# ==============================================================================

def _clean_llm_output(text: str) -> str:
    """Clean LLM output by removing think tags and trimming whitespace."""
    if not text:
        return ""
    text = re.sub(r'<think>[\s\S]*?</think>', '', text, flags=re.IGNORECASE).strip()
    return text

def _call_local_llm(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> Optional[str]:
    """Call Local LLM endpoint (LM Studio on :1234 or Ollama on :11434) with Gemma 4 E4B."""
    configured_url = os.getenv("LOCAL_LLM_URL", "http://localhost:1234/v1").rstrip("/")
    configured_model = os.getenv("LOCAL_LLM_MODEL", "gemma-4-E4B-it-GGUF").strip()
    
    # 1. Try LM Studio OpenAI-compatible endpoint (:1234/v1)
    lmstudio_urls = [
        configured_url if ":1234" in configured_url else "http://localhost:1234/v1",
        "http://127.0.0.1:1234/v1"
    ]
    for lm_url in lmstudio_urls:
        try:
            payload = {
                "model": configured_model or "gemma-4-E4B-it-GGUF",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.6,
                "max_tokens": max_tokens,
                "frequency_penalty": 0.05,
                "presence_penalty": 0.0
            }
            resp = requests.post(f"{lm_url}/chat/completions", json=payload, timeout=90)
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "").strip()
                    cleaned = _clean_llm_output(content)
                    if cleaned:
                        return cleaned
        except Exception:
            pass
            
    # 2. Try Ollama endpoint (:11434)
    ollama_url = "http://localhost:11434" if ":11434" not in configured_url else configured_url
    candidate_models = [
        configured_model,
        "gemma-4-E4B-it-GGUF",
        "gemma-4-E4B-it-Q4_K_M.gguf",
        "gemma-4-e4b-it",
        "gemma-4-e4b",
        "lmstudio-community/gemma-4-E4B-it-GGUF",
        "gemma4:26b",
        "gemma:7b"
    ]
    candidate_models = [m for m in candidate_models if m]
    
    for model in candidate_models:
        try:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "stream": False,
                "options": {
                    "temperature": 0.6,
                    "repeat_penalty": 1.05,
                    "top_p": 0.95,
                    "top_k": 40,
                    "num_ctx": 16384,
                    "num_predict": max_tokens
                }
            }
            resp = requests.post(f"{ollama_url}/api/chat", json=payload, timeout=90)
            if resp.status_code == 200:
                res_data = resp.json()
                msg = res_data.get("message", {}).get("content", "").strip()
                cleaned = _clean_llm_output(msg)
                if cleaned:
                    return cleaned
        except Exception:
            continue
            
    return None

def _call_ollama(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> Optional[str]:
    """Alias for _call_local_llm for backward compatibility."""
    return _call_local_llm(system_prompt, user_prompt, max_tokens)

def _call_gemini(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
    """Fallback Gemini & Cloud API call wrapper - only v1beta, valid model names only."""
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()

    if not (gemini_key or groq_key):
        return "⚠️ AI 응답 생성에 실패했습니다. Vercel 환경변수 GEMINI_API_KEY 또는 GROQ_API_KEY를 설정해주세요."

    last_error = ""
    combined_prompt = f"{system_prompt}\n\n[데이터 및 분석 요청]\n{user_prompt}"

    # 1. Gemini API - v1beta ONLY (v1 경로는 대부분 404)
    if gemini_key:
        gemini_models = [
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
        ]
        for g_model in gemini_models:
            g_url = f"https://generativelanguage.googleapis.com/v1beta/models/{g_model}:generateContent?key={gemini_key}"
            try:
                # Attempt A: systemInstruction 분리 방식
                resp = requests.post(g_url, json={
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                    "generationConfig": {"temperature": 0.6, "maxOutputTokens": min(max_tokens, 8192)}
                }, timeout=60)

                if resp.status_code == 200:
                    candidates = resp.json().get("candidates", [])
                    if candidates:
                        text = "".join(p.get("text", "") for p in candidates[0].get("content", {}).get("parts", [])).strip()
                        if text:
                            return _clean_llm_output(text)

                # Attempt B: 단일 content 방식 (일부 버전 호환)
                resp2 = requests.post(g_url, json={
                    "contents": [{"role": "user", "parts": [{"text": combined_prompt}]}],
                    "generationConfig": {"temperature": 0.6, "maxOutputTokens": min(max_tokens, 8192)}
                }, timeout=60)

                if resp2.status_code == 200:
                    candidates2 = resp2.json().get("candidates", [])
                    if candidates2:
                        text2 = "".join(p.get("text", "") for p in candidates2[0].get("content", {}).get("parts", [])).strip()
                        if text2:
                            return _clean_llm_output(text2)

                last_error = f"{g_model} HTTP {resp.status_code}"
            except Exception as e:
                last_error = f"{g_model} 예외: {str(e)}"
                continue

    # 2. Groq Fallback (Gemini 실패 시)
    if groq_key:
        for g_model in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]:
            try:
                resp = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                    json={
                        "model": g_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "max_tokens": max_tokens,
                        "temperature": 0.6
                    },
                    timeout=45
                )
                if resp.status_code == 200:
                    content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                    if content:
                        return _clean_llm_output(content)
                last_error = f"Groq {g_model} HTTP {resp.status_code}"
            except Exception as e:
                last_error = f"Groq {g_model}: {str(e)}"
                continue

    return f"⚠️ 모든 AI 모델 호출에 실패했습니다. (마지막 오류: {last_error})"

def _call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
    """Primary LLM dispatcher: tries Local Ollama first, falls back to Gemini API."""
    ollama_result = _call_ollama(system_prompt, user_prompt, max_tokens)
    if ollama_result:
        return ollama_result
    return _call_gemini(system_prompt, user_prompt, max_tokens)


# ==============================================================================
# §3. 9대 고도화 AI 분석 버튼별 구현 함수
# ==============================================================================

# ------------------------------------------------------------------------------
# ① 🤖 메인 대시보드 BCBA 종합 분석
# ------------------------------------------------------------------------------
def generate_bcba_comprehensive_analysis(
    summary: dict,
    trends: list,
    risk_list: list,
    quality_report: dict = None,
    class_stats: dict = None
) -> str:
    """
    메인 대시보드 BCBA 종합 분석: 3층 구조 + 위험군 근거 + 학급 밀집도 + 3대 주간 액션 플랜
    """
    quality_report = quality_report or {}
    class_stats = class_stats or {}
    
    total_incidents = summary.get('total_incidents', 0)
    unique_students = summary.get('risk_students_count', len(risk_list))
    total_school_students = summary.get('total_school_students', 190)
    
    avg_lag = quality_report.get('entry_timeliness', {}).get('avg_lag_days', 0.0)
    
    risk_lines = []
    for r in risk_list[:5]:
        name = r.get('name', r.get('학생명', 'N/A'))
        code = r.get('code', r.get('학생코드', 'N/A'))
        cnt = r.get('count', 0)
        avg_int = r.get('avg_intensity', 0.0)
        restr_cnt = r.get('restraint_count', 0)
        risk_lines.append(f"- 학생 {code}({name}): 총 {cnt}건(전체 {total_incidents}건 중 {round(cnt/total_incidents*100,1) if total_incidents else 0}%), 평균강도 {avg_int}/5, 물리적제지(O) {restr_cnt}회")
    risk_text = "\n".join(risk_lines) if risk_lines else "고위험군 학생 없음"

    prompt = f"""[분석 대상 데이터: 경은학교 SW-PBIS 전교 현황]
- 총 행동 발생 건수: {total_incidents}건 (에피소드 행 기준)
- 행동 기록이 발생한 학생 수: {unique_students}명 (전교생 {total_school_students}명 중 {round(unique_students/total_school_students*100, 1) if total_school_students else 0}%)
- 무발생 학생 비율: {round((total_school_students - unique_students)/total_school_students*100, 1) if total_school_students else 0}% (Tier 1 보편적 지원 효과 지표)
- 데이터 품질 및 입력 지연: 평균 기록 지연일 {avg_lag}일

[상위 고위험군 학생 상세 근거]
{risk_text}

[지시사항]
공통 시스템 프롬프트 원칙을 엄격히 준수하여 다음 5개 영역으로 분석 리포트를 작성하라.
1. **데이터 신뢰도 및 해석 경고**: 평균 기록 지연일({avg_lag}일)을 바탕으로 선행사건 기억 왜곡 가능성 및 관찰시간 미통제에 따른 전월 대비 단순 증감 해석 주의점 명시.
2. **학교 전체 SW-PBIS 3층(Tier 1/2/3) 현황 요약**:
   - Tier 1(보편): 무발생 학생 비율 및 전교 긍정적 환경 조성 평가.
   - Tier 2(표적): 3건 이상 반복 학생군과 CICO 지원 연계 상태.
   - Tier 3(집중): 강도 4~5 및 물리적 제지(O) 발생 학생 집중도.
3. **고위험군 학생 임상적 위험 근거**: 빈도·강도·제지 여부를 조합하여 왜 위험한지 기술.
4. **학급 단위 밀집 및 환경 분석**: 특정 학급 편중 시 (a) 실제 행동 밀집 (b) 교사 기록 성실도 양측 가능성 명시.
5. **이번 주 학교 차원 3대 실행 우선순위**: 정확히 3가지를 도출하고 각각 `[담당 주체]`(담임/PBS담당/관리자/외부전문가), `[실행 기간]`, `[성공 기준]`을 명시."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 6000)


def generate_ai_insight(summary: dict, trends: list, risk_list: list) -> str:
    """하위 호환용 래퍼"""
    return generate_bcba_comprehensive_analysis(summary, trends, risk_list)

def generate_meeting_agent_report(*args, **kwargs) -> dict:
    """하위 호환용 래퍼: 회의용 브리핑 리포트 딕셔너리 반환"""
    try:
        if len(args) == 2 and isinstance(args[0], str):
            sec_type = args[0]
            ctx = args[1] if isinstance(args[1], dict) else {}
            text = generate_bcba_section_analysis(sec_type, chart_data=ctx, top_items=[], raw_summary=ctx)
            return {"briefing_text": text, "text": text}
            
        summary = kwargs.get("summary", {})
        trends = kwargs.get("trends", [])
        risk_list = kwargs.get("risk_list", [])
        text = generate_bcba_comprehensive_analysis(summary, trends, risk_list)
        return {
            "briefing_text": text,
            "text": text,
            "summary": summary
        }
    except Exception as e:
        return {"briefing_text": "대시보드 브리핑 요약 준비 완료", "text": "", "error": str(e)}


# ------------------------------------------------------------------------------
# ② 5대 심층 영역별(시간/장소/유형/강도/기능) AI 분석
# ------------------------------------------------------------------------------
def generate_bcba_section_analysis(
    section_type: str,
    chart_data: list,
    top_items: list,
    raw_summary: dict = None,
    quality_report: dict = None
) -> str:
    """
    5대 심층 영역별 특화 분석:
    - time: 과정별 5/6구간 역전, 등하교 전이구간, 점심 전후 가설 검증
    - location: 노출 시간 대비 위험도, 핫스팟 환경 수정, 심리안정실 복귀 분석
    - type: 6종 전체 처리, 유형x기능 교차, 교직원 상해 집계, 경은그림말 AAC
    - intensity: 강도 4~5 전조, O/X 교차분석, 안전 3대 지표, 최소제한원칙
    - function: 데이터 품질 선행 출력, GO_HOME 태그, 기능적 등가 대체행동
    """
    raw_summary = raw_summary or {}
    quality_report = quality_report or {}
    data_str = json.dumps(chart_data, ensure_ascii=False, indent=2)

    if section_type == "time":
        prompt = f"""[분석 영역: 시간대별(Time Slot) 정밀 분석]
[차트 데이터]
{data_str}

[필수 반영 지침]
1. 시간대 필드는 다중값이므로 '총 에피소드 건수'와 '구간-건 교차수'를 명시하고 합계 초과 사유를 각주로 설명하라.
2. 초등과 중등의 5구간(초등 점심 / 중등 4교시), 6구간(초등 4교시 / 중등 점심) 역전 현상을 반영하여 과정별 차이를 해석하라.
3. 등교(1구간)와 하교(10구간)를 전이(Transition) 구간으로 묶어 가정-학교 전이 실패 및 배경사건(수면/투약) 가능성을 분석하라.
4. 점심 전후 집중 발생 시 배고픔, 감각과부하, 비구조화 시간 가설을 검토하라.
5. 말미에 '일과 재구조화 제안' 3개 이하(구간, 변경방안, 검증지표)를 제시하라."""

    elif section_type == "location":
        prompt = f"""[분석 영역: 장소별(Location) 핫스팟 분석]
[차트 데이터]
{data_str}

[필수 반영 지침]
1. 교실은 학생 체류 시간이 가장 길어 건수가 높은 것은 자연스럽다. 단순 비율이 아닌 '노출 시간 대비 위험도' 관점에서 체류 시간이 짧은데 발생이 잦은 급식실·복도·강당을 진정한 핫스팟으로 분석하라 (노출시간 미측정에 따른 추정임을 명시).
2. 장소별 강도 분포 및 물리적 제지(O) 비율을 교차 분석하여 실제 안전 위험 지점을 도출하라.
3. 물리적 환경 재구조화(동선, 대기줄, 소음, 조도, 밀집도, 진정공간 거리, 인력배치)를 제안하라.
4. 심리안정실 사용 기록과 사용 후 교실 복귀 성공 사례를 요약하라."""

    elif section_type == "type":
        prompt = f"""[분석 영역: 행동유형별(Behavior Type) 분석]
[차트 데이터 (6종 정규 유형: 신체적공격/자해/물건파괴/방해/비협조적/반복적)]
{data_str}

[필수 반영 지침]
1. 유형별 비율과 함께 행동유형 × 추정기능 교차 관점을 제시하라 (예: 회피성 공격행동 vs 획득성 공격행동의 중재 차이).
2. 자해행동의 경우 빈도 계수 외에 비율 및 지속시간(duration) 측정 방식 도입을 권고하라.
3. 교직원 상해(깨물음, 발로 참, 밀침, 할큄 등) 기록 여부를 추출하여 교권보호 및 산업안전 지표로 다루어라.
4. 유형별 기능적 대체행동을 경은학교의 '경은그림말 AAC' 및 의사소통 판과 연결하여 제시하라."""

    elif section_type == "intensity":
        prompt = f"""[분석 영역: 강도 및 위기관리(Intensity/Crisis) 분석]
[차트 데이터]
{data_str}

[필수 반영 지침]
1. 강도 4~5 발생의 선행 조건 및 텍스트에 기록된 전조 신호를 목록화하라.
2. 물리적 제지/분리지도(O/X) 편중 시 (a) 학생 특성 (b) 대응 역량 (c) 기록 기준 차이의 3가지 가능성을 객관적으로 제시하고 교사 개인을 평가하지 마라.
3. 반복적 물리적 제지 발생 학생에 대한 BIP 위기관리계획 재검토를 권고하라.
4. 안전 3대 지표(교직원 상해, 학생 자상, 분리지도 후 복귀율)와 최소제한원칙(Least Restrictive) 준수 여부를 점검하라."""

    elif section_type == "function":
        q_func = quality_report.get('function_quality', {})
        prompt = f"""[분석 영역: 추정기능별(Function) 정밀 분석]
[데이터 품질 상태: 서술형 오염률 {q_func.get('unknown_rate', 0)}%, 귀가요구 태그 {q_func.get('go_home_count', 0)}건]
[차트 데이터]
{data_str}

[필수 선행 출력]
- 정규 5종 매핑 건수, 오염/불명 건수를 먼저 표기하고 오염률에 따른 신뢰도 경고를 상단에 배치하라.

[필수 반영 지침]
1. '귀가 요구'(집에 가고 싶어함, 엄마 차, 신발 신을까) 계열의 단일 패턴을 별도로 분석하고 FBA 우선 대상을 지목하라.
2. 기능별(회피, 획득, 관심, 감각) 선제적 대체행동을 기능적 등가성 원칙과 함께 제시하라.
3. unknown 비율이 높은 학생에 대한 ABC 직접관찰 계획을 수립하라.
4. 향후 구글 설문지 폼 개선안(라디오버튼 강제, 귀가요구 선택지 추가 등)을 제안하라."""

    else:
        prompt = f"[분석 데이터]\n{data_str}\n\n공통 시스템 프롬프트에 따라 BCBA 분석을 작성하라."

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 4096)


# ------------------------------------------------------------------------------
# ③ 🤖 CICO AI 분석 (/cico)
# ------------------------------------------------------------------------------
def generate_bcba_cico_analysis(
    students_data: list,
    behavior_logs: list = None,
    tier_info: list = None,
    selected_month: int = None
) -> str:
    """
    CICO 분석: 주 단위 DPR 추세 + 중재 충실도 우선 점검 + 80%/70% 단계 이동 룰 + 강화제 포화 점검
    """
    cico_str = json.dumps(students_data, ensure_ascii=False, indent=2)
    month_text = f"{selected_month}월 " if selected_month else ""
    
    prompt = f"""[분석 대상 데이터: {month_text}CICO 일일행동카드(DPR) 및 대상자 성과]
{cico_str}

[지시사항]
공통 시스템 프롬프트를 준수하여 CICO 성과 분석 및 Tier 조정 의사결정 보고서를 작성하라.
1. **중재 충실도(Fidelity) 우선 점검**: 달성률 저하 시 체크인/체크아웃 매일 실시 여부, 즉각적 피드백 제공 여부를 먼저 확인하도록 권고하라.
2. **학생별 DPR 달성률 추세 판정**: 단순 평균이 아닌 주 단위 추세(상승/유지/하락)를 판정하라.
3. **객관적 Tier 이동 의사결정 매트릭스**:
   - 4주 연속 80% 이상 달성: Tier 1 복귀(졸업) 검토 (단, 졸업 후 4주 모니터링 조건 명시).
   - 70~80% 유지: 현행 CICO 유지 및 강화제 선호도 재평가.
   - 70% 미만 2주 연속: 중재 충실도 점검 및 피드백 주기 단축.
   - 70% 미만 4주 연속 또는 강도 4~5 발생: Tier 3 상향 및 정식 FBA/BIP 의뢰 권고.
4. **Log_Main 실제 행동 발생과의 교차 검증**: DPR 점수는 높은데 실제 문제행동 로그가 많은 경우 목표행동 설정의 정합성 문제를 지적하라.
5. **강화제 포화(Satiation) 점검**: 초기 고득점 후 3~4주 차에 하락하는 학생에 대한 강화제 교체 팁 제공."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 4096)


# ------------------------------------------------------------------------------
# ④ 🤖 SST 행동중재협의회 AI 회의록 자동 생성 (/meetings)
# ------------------------------------------------------------------------------
def generate_bcba_meeting_minutes(
    meeting_data: dict,
    risk_students: list,
    recent_trends: list = None
) -> str:
    """
    SST 회의록: 공문서 규격 개조식 + 4단 안건 구조 + 다학제 역할 분담 + 보호자 지원 분리
    """
    m_info = json.dumps(meeting_data, ensure_ascii=False, indent=2)
    r_info = json.dumps(risk_students, ensure_ascii=False, indent=2)
    
    prompt = f"""[회의 기본 정보]
{m_info}

[심의 대상 위기군 학생 데이터]
{r_info}

[지시사항]
학교장 결재 및 특수교육지원센터 제출이 가능한 고품격 공문서 규격 회의록을 작성하라.
1. **문서 형식**: 
   - 제목 / 일시 / 장소 / 참석자(직위 포함) / 안건 / 협의 내용 / 결정 사항 / 향후 일정 순서의 개조식 종결체.
   - 학생은 실명 대신 '학생코드'를 우선 사용하라.
2. **안건별 4단 구조 필수 준수**:
   - `[현황 데이터]` ➔ `[협의 내용]` ➔ `[결정사항]` ➔ `[담당자/기한]`
3. **실행 가능한 결정사항 기술**: "지속 관찰" 같은 모호한 문구를 금지하고 구체적인 실행 행동을 기술하라.
4. **다학제 역할 분담 명시**: 담임교사 / 특수교육지도사 / 전문상담사 / 치료사 / 보호자 / 관리자 역할 구분.
5. **보호자 협력 사항 분리**: 학교가 제공할 지원과 가정에 요청할 지원을 명확히 구분.
6. **금지**: 논의되지 않은 내용을 데이터만 보고 지어내지 말고, 제안 사항은 `[AI 제안 — 협의 필요]` 태그를 붙여라."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 6000)


# ------------------------------------------------------------------------------
# ⑤ 🤖 Tier 3 심층 위기지원 컨설팅 (/tier3)
# ------------------------------------------------------------------------------
def generate_bcba_tier3_analysis(
    tier3_students: list,
    behavior_logs: list,
    cico_data: list = None
) -> str:
    """
    Tier 3 위기 컨설팅: 개별화된 4단계 위기 프로토콜 + 하지 말아야 할 것 + 효과적 대응 추출 + 교직원 안전
    """
    t3_str = json.dumps(tier3_students, ensure_ascii=False, indent=2)
    sample_logs = json.dumps(behavior_logs[:30], ensure_ascii=False, indent=2) if behavior_logs else "[]"
    
    prompt = f"""[Tier 3 위기관리 대상 학생 목록]
{t3_str}

[해당 학생들의 최근 행동 및 위기 개입 로그]
{sample_logs}

[지시사항]
특수학교 현장에서 교직원과 학생 모두의 안전을 확보할 수 있는 즉시 실행 위기관리 프로토콜을 작성하라.
1. **위기 4단계 개별화 프로토콜 (각 단계별 '하지 말아야 할 것' 필수 명시)**:
   - ① 전조(Trigger 직후): 텍스트에서 관찰된 실제 전조 신호 및 자극 제거.
   - ② 고조(Escalation): 언어 자극 축소, 요구 철회 시점, 공간 확보. (훈계/설득 금지)
   - ③ 위기(Peak): 안전 확보 최우선, 2인 1조 최소 신체 개입 원칙.
   - ④ 회복(Recovery): 복귀 기준, 진정 시간 확보 및 사후 디브리핑.
2. **실제 효과가 있었던 대응 vs 실패한 대응 추출**: 로그 텍스트에서 성공/실패 사례를 요약하라.
3. **교직원 안전 및 신체 방어 가이드**: 깨물기, 할퀴기, 발차기 형태별 방어 자세 및 3/4호 분리지도 법적 보고 요건 명시.
4. **위기 발생 후 24시간 내 처리 체크리스트**: 보고서 작성, 보호자 소통, 학생 회복, 교직원 디브리핑.
5. **예방 실패 신호 경고**: 반복적 위기는 선행사건 예방 실패의 신호이므로 BIP 예방 전략 재검토 항목을 제시하라."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 6000)


# ------------------------------------------------------------------------------
# ⑥ 🤖 개별 학생 AI 종합 분석 (학생 프로필)
# ------------------------------------------------------------------------------
def generate_bcba_student_analysis(
    student_info: dict,
    student_logs: list,
    cico_data: list = None,
    all_notes: list = None
) -> str:
    """
    개별 학생 종합 분석: A-B-C 프로파일 + 배경사건(투약/수면) + 또래 영향 + 담임교사 즉시 실행 팁 5개
    """
    s_info = json.dumps(student_info, ensure_ascii=False)
    logs_str = json.dumps(student_logs[:30], ensure_ascii=False, indent=2) if student_logs else "[]"
    
    prompt = f"""[학생 기본 정보]
{s_info}

[학생의 행동 발생 이력 및 관찰 기록]
{logs_str}

[지시사항]
담임선생님이 내일 교실에서 바로 적용할 수 있는 수준의 개별 A-B-C 임상 분석 리포트를 작성하라.
1. **A-B-C 프로파일**:
   - A(선행사건): 가장 위험한 시간대·장소·활동 조합 Top 3 및 촉발 요인.
   - B(표적행동): 조작적 정의 기반 유형·강도·빈도 분포.
   - C(후속결과): 의도치 않게 행동을 유지/강화시킨 대응 점검.
2. **배경사건(Setting Event) 분석**: 수면, 투약("약을 안먹음"), 배고픔, 날씨, 가정사 언급을 추출하여 대조.
3. **또래 영향 점검**: 특기사항에 동급생 이름이 언급된 경우 학급 청각 환경 및 자리 배치 조정을 명시.
4. **담임교사용 즉시 실행 팁 5개**: 준비물 없이 내일 바로 실천 가능한 구체적 행동 지침.
5. **데이터 신뢰도 경고**: 기록 지연(entry lag)이 큰 경우 시계열 해석 주의점 명시."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 4096)


# ------------------------------------------------------------------------------
# ⑦ 🤖 AI 기능적 가설 생성 (BIP Step 4)
# ------------------------------------------------------------------------------
def generate_bip_hypothesis(
    student_info: dict,
    target_behavior: str,
    antecedent_data: str,
    function_data: str,
    notes_summary: str = "",
    sample_size: int = 5
) -> str:
    """
    BIP Step 4 가설 생성: 표준 공식 + 조작적 정의 + 배경 vs 선행 분리 + 복수 가설 + 반증 예측 + n<5 가드
    """
    if sample_size < 5:
        return "⚠️ 직접관찰 데이터 부족(표본 n<5). 신뢰할 수 있는 기능적 가설 수립을 위해 최소 2주간의 ABC 직접관찰 기록이 선행되어야 합니다."

    prompt = f"""[학생 정보] {json.dumps(student_info, ensure_ascii=False)}
[표적행동] {target_behavior}
[선행사건 및 배경사건 데이터] {antecedent_data}
[추정기능 및 관찰 텍스트] {function_data} / {notes_summary}

[지시사항]
아래 표준 공식에 맞추어 기능적 가설을 작성하라.
공식: "[배경사건]이 있는 상황에서 [선행사건]이 제시되면, [학생]은 [조작적으로 정의된 표적행동]을 보이며, 그 결과 [후속결과]를 얻는다. 따라서 이 행동의 기능은 [기능]으로 추정된다."

[작성 규칙]
1. 표적행동은 관찰·측정 가능하게 기술하라.
2. 배경사건(원거리 조건)과 선행사건(직전 자극)을 명확히 구분하라.
3. 기능이 복수이면 가설 1, 가설 2로 분리하라.
4. 각 가설마다 데이터 근거와 "이 가설이 맞다면 [조건]에서 행동이 감소할 것"이라는 반증 가능한 예측을 제시하라."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 3000)


# ------------------------------------------------------------------------------
# ⑧ 🤖 AI 3단계 중재 전략 제안 (BIP Step 6)
# ------------------------------------------------------------------------------
def generate_bip_strategies(
    student_info: dict,
    target_behavior: str,
    hypothesis_data: str,
    function_data: str
) -> str:
    """
    BIP Step 6 전략 제안: 3단계 구조 + 기능 1:1 매칭 + 대체행동 3요건 표 + 교내 자원(AAC/마트/안정실) 연계
    """
    prompt = f"""[학생 정보] {json.dumps(student_info, ensure_ascii=False)}
[표적행동 및 가설] {target_behavior} / {hypothesis_data}
[추정 기능] {function_data}

[지시사항]
1단계 예방(선행사건/배경사건 조절), 2단계 교수(대체행동 훈련), 3단계 강화(차별강화)의 3단계 중재 전략을 제안하라.
1. **기능 1:1 매칭 검증**: 각 전략이 가설의 기능에 정확히 부합하는지 확인하라.
2. **대체행동 기능적 등가성 3요건 확인 표**:
   - 동일 기능 수행 여부 / 표적행동 대비 적은 노력 / 더 빠르고 확실한 강화 여부를 표로 점검.
3. **경은학교 기존 자원 연계**: 경은그림말 AAC, 경은마트 토큰경제, 심리안정실, 시각적 일과표 적극 활용.
4. **소거 폭발(Extinction Burst) 주의**: 자해/공격행동에 대한 단독 소거 금지 및 안전 조건 명시.
5. **우선순위 부여**: 전략별 [실행 난이도: 상/중/하] 및 [효과 발현 예상 시점] 표기."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 4096)


# ------------------------------------------------------------------------------
# ⑨ 🤖 AI BIP 전체 계획서 제안 (BIP Step 12)
# ------------------------------------------------------------------------------
def generate_full_bip(
    student_info: dict,
    target_behavior: str,
    hypothesis_data: str,
    strategies_data: str,
    school_crisis_protocol: str = "",
    behavior_logs: list = None
) -> str:
    """
    BIP Step 12 전문: 8대 핵심 요소 + 8항목 내부 정합성 자체 검증표 + 실제 기준선(Baseline) + 학부모 1페이지 요약
    """
    logs_summary = f"누적 행동 로그 {len(behavior_logs)}건 분석 완료" if behavior_logs else "기본 로그 연동"
    
    prompt = f"""[학생 정보] {json.dumps(student_info, ensure_ascii=False)}
[표적행동] {target_behavior}
[기능 가설] {hypothesis_data}
[3단계 중재 전략] {strategies_data}
[학교 위기 프로토콜 및 데이터] {school_crisis_protocol} / {logs_summary}

[지시사항]
미국 PBIS 표준 8대 핵심 요소를 충족하는 공식 행동중재계획서(BIP) 전문을 작성하라.
[8대 필수 요소]
1. 표적행동의 조작적 정의 (실제 데이터 기준선 수치 포함)
2. A-B-C 기능적 가설
3. SMART 단기(4주)/장기(12주) 행동 목표
4. 선행사건 및 배경사건 예방 전략
5. 기능적 대체행동 교수 계획 (FCT/경은그림말 AAC)
6. 강화 전략 (DRA/토큰)
7. 위기관리계획 (전조-고조-위기-회복 및 3/4호 분리지도 법적 보고)
8. 평가 및 재검토 계획 (Tier 하향 졸업 기준)

[문서 말미 필수 첨부 1: BIP 내부 정합성 자체 검증표]
아래 8개 항목에 대해 충족/미충족/보완점을 판정한 검증표를 첨부하라:
1) 조작적 정의 측정가능성 2) 가설과 대체행동 기능 일치 3) 대체행동 효율성 4) 예방전략의 선행사건 대응성 5) 강화전략의 기능 일치 6) 위기계획의 최고강도 감당성 7) 평가방식 적합성 8) SMART 목표 기준선 근거

[문서 말미 필수 첨부 2: 보호자 설명용 요약서 (1페이지 분량)]
전문용어를 쉬운 일상어로 풀어쓰고 학교와 가정의 협력 방안을 정리하라."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 6000)


# ------------------------------------------------------------------------------
# ⑩ 🤖 신규: 학급 또래 행동 전염 AI 심층 분석
# ------------------------------------------------------------------------------
def generate_peer_contagion_analysis(contagion_data: dict) -> str:
    """
    학급 또래 행동 전염 분석: 촉발원-반응자 관계, 청각 자극 매개, 학급 환경 중재안
    """
    c_str = json.dumps(contagion_data, ensure_ascii=False, indent=2)
    
    prompt = f"""[학급 또래 행동 전염 및 상호작용 데이터]
{c_str}

[지시사항]
공통 시스템 프롬프트에 기반하여 학급 단위 행동 전염 임상 분석 및 환경 중재 보고서를 작성하라.
1. **촉발원(Source)과 반응자(Reactor) 관계 분석**: 상황적 촉발 관계임을 명시하고 낙인 표현을 절대 쓰지 마라.
2. **매개 청각 자극(울음, 소리지름, 박수, 괴성)의 역할 규명**.
3. **개별 학생이 아닌 학급 전체 환경 중재 솔루션 제시**:
   - 소음 차단 헤드셋, 좌석 배치 재조정, 진정 공간 동선 확보, 1차 촉발 학생 조기 분리 타이밍, 반응자 대처 기술(FCT).
4. **데이터 한계 명시**: 교사 서술에 기록된 건에 한정된 분석임을 명시."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 4096)
