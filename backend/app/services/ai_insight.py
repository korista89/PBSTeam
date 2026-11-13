from app.services.sheets import tier_label
import logging
import os
from app.adapters.sheets.resilience import SheetUnavailable
import json
import re
import time
from datetime import datetime
import requests
from dotenv import load_dotenv
from typing import Optional
from app.services.fba_evidence import (
    build_fba_evidence_summary,
    fba_data_gate,
)

logger = logging.getLogger(__name__)

load_dotenv()

# Gemini & Cloud API setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def _is_serverless_runtime() -> bool:
    """Return True when the request is running inside the deployed function."""
    return bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


def _remaining_seconds(deadline: float) -> float:
    return max(0.0, deadline - time.monotonic())


def _bounded_request_timeout(deadline: float, cap_seconds: float) -> Optional[tuple]:
    """Build a requests connect/read timeout that stays inside a shared deadline."""
    remaining = min(cap_seconds, _remaining_seconds(deadline))
    if remaining < 2.0:
        return None
    connect_timeout = min(3.0, max(1.0, remaining * 0.2))
    read_timeout = max(1.0, remaining - connect_timeout)
    return (connect_timeout, read_timeout)

# ==============================================================================
# PII 마스킹 — LLM(Gemini/Groq/로컬) 프롬프트 경계에서 학생 실명을 코드로 치환
# ==============================================================================
# 화면(교사용 UI)에는 실명이 남아도 되지만, 이 경계를 넘어 외부 LLM API로 나가는
# 페이로드에는 학생 실명이 포함되면 안 된다 — Gemini 무료(AI Studio) 티어와 자체
# 데이터 검토 정책, 그리고 국외 서버로의 민감정보(장애/행동 기록) 전송이라는
# 개인정보보호법상 리스크 때문이다. 각 generate_* 함수가 프롬프트를 조립하기
# 직전에 아래 헬퍼를 거치도록 한다. 화면 표시는 프론트의 maskName()이 이미 담당하므로
# 여기서는 "외부로 나가는 페이로드에서 실명을 완전히 제거"만 책임진다.

_NAME_KEYS = ("name", "student_name", "학생명", "이름")


def _redact_dict_name(d: dict) -> dict:
    """학생 1명을 나타내는 dict에서 실명 키를 학생코드로 치환한 얕은 복사본을 반환."""
    if not isinstance(d, dict):
        return d
    code = d.get("code") or d.get("student_code") or d.get("학생코드") or d.get("StudentCode") or "UNKNOWN"
    redacted = dict(d)
    for key in _NAME_KEYS:
        if key in redacted:
            redacted[key] = code
    return redacted


def _redact_list_names(items) -> list:
    """학생 dict 리스트에 _redact_dict_name을 일괄 적용."""
    if not isinstance(items, list):
        return items
    return [_redact_dict_name(it) if isinstance(it, dict) else it for it in items]


def _redact_log_names(logs) -> list:
    """정규화된 행동로그 리스트에서 실명 필드(및 raw_* 원본 실명 컬럼)를 코드로 치환."""
    if not isinstance(logs, list):
        return logs
    cleaned = []
    for log in logs:
        if not isinstance(log, dict):
            cleaned.append(log)
            continue
        item = dict(log)
        code = item.get("student_code") or item.get("학생코드") or "UNKNOWN"
        for key in list(item.keys()):
            if key in _NAME_KEYS or (key.startswith("raw_") and "명" in key):
                item[key] = code
        cleaned.append(item)
    return cleaned


# section_type 값이 "학생별" 데이터를 나르는 경우만 골라 redact한다. time/location/type/
# intensity/function 같은 집계 차트는 "name"이 학생이 아니라 차트 카테고리 라벨이므로
# 여기서 건드리면 안 된다(예: "신체적공격" 같은 행동유형 이름).
_STUDENT_KEYED_SECTIONS = {
    "tier_upgrade_candidates", "cico_performance",
    "tier3_student_freq", "tier3_decision_dist", "tier3_intensity_compare",
}


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
5. 개별 학생 위기행동 자료가 3건 미만이면 기능 추정을 보류하고 최소 3건 입력 안내만 한다.
   3건 이상이면 분석하되, 별도 ABC 문항이 없는 운영 자료임을 고려해 결과를 '잠정 기능가설'로 표시한다.

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
- 판단을 먼저 쓰고 근거는 불릿으로 쓴다.
- 실행안에는 담당·시점·확인 지표를 넣고, 전문용어는 처음 한 번만 쉽게 설명한다. 반복과 장문 서론은 피한다.
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


_BIP_SECTION_TITLES = {
    1: "표적행동",
    2: "가설(기능)",
    3: "목표",
    4: "예방 전략",
    5: "교수 전략",
    6: "강화 전략",
    7: "위기행동지원 전략",
    8: "평가 계획(Tier3 졸업 기준 포함)",
    9: "약물 복용 현황",
    10: "강화제 정보",
    11: "기타 고려사항",
}

_CRISIS_SUBFIELDS = [
    "전조", "고조", "알림", "장소/이동방법", "관찰 방법",
    "호명반응 확인 방법", "지시 목록", "회복대화 방법",
    "복귀의사 방법", "복귀 후 반응",
]


def _ensure_bip_output_contract(
    result: str,
    *,
    target_behavior: str,
    hypothesis_data: str,
    medication_status: str,
    reinforcer_info: str,
    other_considerations: str,
) -> str:
    """Guarantee the editable 11-section BIP contract without inventing facts."""
    cleaned = (result or "").strip()
    if not cleaned or cleaned.startswith(("⚠️", "⏳")):
        return cleaned

    footer = ""
    body = cleaned
    footer_match = re.search(r"\n\s*---\s*\n(?=>)", cleaned)
    if footer_match:
        body = cleaned[:footer_match.start()].strip()
        footer = cleaned[footer_match.start():].strip()

    extracted = {}
    for number in _BIP_SECTION_TITLES:
        match = re.search(
            rf"(?ms)^###\s*{number}\.\s*[^\n]*\n(.*?)(?=^###\s*\d+\.|\Z)",
            body,
        )
        if match:
            extracted[number] = match.group(1).strip()

    fallbacks = {
        1: f"- {target_behavior or '미상 — 직접 관찰로 조작적 정의 확인 필요'}",
        2: f"- {hypothesis_data or '미상 — 특기사항(기타) 서술과 직접관찰로 확인 필요'}",
        3: "- 기준선 대비 위기행동과 강도를 줄이고, 같은 기능의 대체행동 사용을 늘린다. 구체 수치는 기준선 확인 후 팀이 확정한다.",
        4: "- AI 응답에서 누락됨 — 잠정 기능에 맞는 선행사건 조절 방법을 팀이 확인한다.",
        5: "- AI 응답에서 누락됨 — 학생이 가장 쉽고 빠르게 사용할 수 있는 대체 의사소통 방식을 평가·교수한다.",
        6: "- AI 응답에서 누락됨 — 대체행동 직후 같은 기능의 결과를 더 빠르고 일관되게 제공한다.",
        7: "- AI 응답에서 누락됨 — 학교 위기행동지원 절차와 학생별 안전계획을 팀이 확인한다.",
        8: "- 위기행동 건수·강도, 대체행동 사용, 실행충실도를 매주 기록하고 2주마다 팀이 검토한다.\n- Tier3 졸업은 기준선 대비 안정적 감소, 중대한 안전사건 없음, 대체행동 증가, 실행충실도 확보가 4주 이상 유지되고 팀이 합의할 때 검토한다.",
        9: f"- {medication_status or '미입력 — 현재 처방 사실만 보호자·보건교사와 확인 필요'}",
        10: f"- {reinforcer_info or '미입력 — 간단한 선호도 평가로 현재 강화제를 확인 필요'}",
        11: f"- {other_considerations or '미입력 — 의사소통·감각·건강·환경·팀 역할을 추가 확인 필요'}",
    }

    completed_sections = []
    for number, title in _BIP_SECTION_TITLES.items():
        content = extracted.get(number) or fallbacks[number]
        if number in {4, 5, 6} and "📚 EBP 추가" not in content:
            content += "\n\n#### 📚 EBP 추가\n- AI 응답에서 누락됨 — 잠정 기능과 학생 특성에 맞는 EBP를 팀이 확인한다."
        if number == 7:
            if "🚨 위기행동지원절차" not in content:
                content += "\n\n#### 🚨 위기행동지원절차"
            for label in _CRISIS_SUBFIELDS:
                if not re.search(rf"\*\*{re.escape(label)}:\*\*", content):
                    content += f"\n- **{label}:** 미상 — 학교 절차와 학생별 자료를 확인한다."
        completed_sections.append(f"### {number}. {title}\n{content.strip()}")

    completed = "\n\n".join(completed_sections)
    if footer:
        completed += f"\n\n{footer}"
    return completed

def _call_local_llm(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> Optional[str]:
    """Call Local LLM endpoint (LM Studio on :1234 or Cloudflare Tunnel or Ollama) with Gemma 4 E4B."""
    is_serverless = _is_serverless_runtime()
    # On a real local dev machine, the user explicitly prefers waiting up to
    # three minutes for the local model. On the deployed serverless function
    # we only ever get here when a tunnel URL was explicitly configured, and
    # a dead tunnel must fail fast rather than hold the request/thread open.
    deadline = time.monotonic() + (20 if is_serverless else 180)
    raw_url = os.getenv("LOCAL_LLM_URL", "").strip()
    configured_model = os.getenv("LOCAL_LLM_MODEL", "").strip()

    # URL 후보 목록 구성 (반드시 /v1 경로로 정규화)
    v1_urls = []
    if raw_url:
        clean = raw_url.rstrip("/")
        if not clean.endswith("/v1"):
            clean = f"{clean}/v1"
        v1_urls.append(clean)

    # localhost/127.0.0.1 fallbacks only make sense when this code is
    # actually running on the same machine as the local model.
    if not is_serverless:
        v1_urls.extend([
            "http://localhost:1234/v1",
            "http://127.0.0.1:1234/v1",
            "http://localhost:11434/v1",
            "http://127.0.0.1:11434/v1"
        ])
    
    # 중복 제거
    seen = set()
    unique_urls = []
    for u in v1_urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)
            
    # 1. OpenAI-compatible /v1/chat/completions 호출 (LM Studio / Cloudflare Tunnel / Ollama v1)
    for endpoint in unique_urls:
        if _remaining_seconds(deadline) < 2:
            break
        try:
            model_to_use = configured_model or "google/gemma-4-e4b"
            try:
                model_timeout = min(2.0, _remaining_seconds(deadline))
                if model_timeout < 0.5:
                    break
                m_resp = requests.get(f"{endpoint}/models", timeout=model_timeout)
                if m_resp.status_code == 200:
                    m_data = m_resp.json().get("data", [])
                    if m_data and isinstance(m_data, list):
                        model_to_use = m_data[0].get("id", model_to_use)
            except SheetUnavailable:
                raise
            except Exception:
                logger.warning("처리 중 오류(무시하고 계속)", exc_info=True)
                pass

            payload = {
                "model": model_to_use,
                "messages": [
                    {
                        "role": "system", 
                        "content": "/no_think\n" + system_prompt + "\n\n[최우선 지침: 생각/추론 과정(Thinking/Reasoning)을 출력하지 말고, 사용자 프롬프트에 지정된 제목·번호·순서의 한국어 최종 결과만 출력하라.]"
                    },
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.4,
                "max_tokens": min(max_tokens, 4096),
                "reasoning_effort": "none",
                "chat_template_kwargs": {"enable_thinking": False},
                "extra_body": {"thinking": False}
            }
            request_timeout = _bounded_request_timeout(deadline, 175)
            if request_timeout is None:
                break
            resp = requests.post(
                f"{endpoint}/chat/completions",
                json=payload,
                timeout=request_timeout,
            )
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    msg_obj = choices[0].get("message", {})
                    content = msg_obj.get("content", "").strip()
                    # content가 비어있고 reasoning_content에 내용이 있는 경우 대비
                    if not content and msg_obj.get("reasoning_content"):
                        content = msg_obj.get("reasoning_content", "").strip()
                        
                    actual_model = data.get("model", model_to_use)
                    cleaned = _clean_llm_output(content)
                    if cleaned and len(cleaned) > 100:
                        location_tag = "Cloudflare Tunnel" if "trycloudflare" in endpoint else "Local"
                        return cleaned + f"\n\n---\n> 🖥️ **로컬 AI 모델**: {actual_model} ({location_tag})"
        except SheetUnavailable:
            raise
        except Exception:
            logger.warning("처리 중 오류(무시하고 계속)", exc_info=True)
            continue
            
    # 2. Ollama 네이티브 API (:11434/api/chat) — localhost only reachable off-serverless
    ollama_candidates = [] if is_serverless else ["http://localhost:11434", "http://127.0.0.1:11434"]
    for o_url in ollama_candidates:
        if _remaining_seconds(deadline) < 2:
            break
        try:
            payload = {
                "model": configured_model or "gemma-4-e4b",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "stream": False,
                "options": {
                    "temperature": 0.6,
                    "num_predict": max_tokens
                }
            }
            request_timeout = _bounded_request_timeout(deadline, 175)
            if request_timeout is None:
                break
            resp = requests.post(f"{o_url}/api/chat", json=payload, timeout=request_timeout)
            if resp.status_code == 200:
                res_data = resp.json()
                msg = res_data.get("message", {}).get("content", "").strip()
                cleaned = _clean_llm_output(msg)
                if cleaned and len(cleaned) > 100:
                    return cleaned + f"\n\n---\n> 🖥️ **로컬 모델**: {configured_model or 'gemma-4-e4b'} (Ollama)"
        except SheetUnavailable:
            raise
        except Exception:
            logger.warning("처리 중 오류(무시하고 계속)", exc_info=True)
            continue
            
    return None

def _call_ollama(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> Optional[str]:
    """Alias for _call_local_llm for backward compatibility."""
    return _call_local_llm(system_prompt, user_prompt, max_tokens)

def _call_gemini(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
    """Fallback Gemini & Cloud API call wrapper - with thinkingBudget fix and robust fallbacks."""
    deadline = time.monotonic() + (100 if _is_serverless_runtime() else 180)
    gemini_key = (
        os.getenv("GEMINI_API_KEY", "").strip()
        or os.getenv("GEMINI_API_KEY_0817", "").strip()
        or os.getenv("GOOGLE_AI_API_KEY", "").strip()
    )
    groq_key = os.getenv("GROQ_API_KEY", "").strip()

    if not (gemini_key or groq_key):
        return "⚠️ AI 응답 생성에 실패했습니다. Vercel 환경변수 GEMINI_API_KEY 또는 GROQ_API_KEY를 설정해주세요."

    last_error = ""
    best_response = ""
    best_model_tag = ""

    # 1. Gemini API - v1beta ONLY
    if gemini_key:
        gemini_models = [
            "gemini-2.5-flash",
            "gemini-1.5-flash",
            "gemini-2.5-flash-lite",
        ]
        for g_model in gemini_models:
            if _remaining_seconds(deadline) < 2:
                break
            g_url = f"https://generativelanguage.googleapis.com/v1beta/models/{g_model}:generateContent?key={gemini_key}"
            
            # Gemini 2.5 Flash의 Thinking 버짓 문제를 해결하기 위한 요청 생성
            # thinkingBudget: 0 으로 설정하여 추론 토큰 소진 없이 100% 한국어 임상 분석 본문 출력에 집중
            req_configs = [
                # Config 1: thinkingBudget: 0 (Gemini 2.5 Flash용 초고속/전체 토큰 출력)
                {
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                    "generationConfig": {
                        "temperature": 0.6,
                        "maxOutputTokens": 8192,
                        "thinkingConfig": {"thinkingBudget": 0}
                    }
                },
                # Config 2: 기본 generationConfig (Gemini 1.5 등 thinkingConfig 미지원 모델용)
                {
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                    "generationConfig": {
                        "temperature": 0.6,
                        "maxOutputTokens": 8192
                    }
                }
            ]
            
            for req_body in req_configs:
                if _remaining_seconds(deadline) < 2:
                    break
                try:
                    request_timeout = _bounded_request_timeout(deadline, 55)
                    if request_timeout is None:
                        break
                    resp = requests.post(g_url, json=req_body, timeout=request_timeout)
                    if resp.status_code == 200:
                        resp_json = resp.json()
                        candidates = resp_json.get("candidates", [])
                        if candidates:
                            text = "".join(p.get("text", "") for p in candidates[0].get("content", {}).get("parts", [])).strip()
                            finish_reason = candidates[0].get("finishReason", "UNKNOWN")
                            usage = resp_json.get("usageMetadata", {})
                            out_tokens = usage.get("candidatesTokenCount", 0)
                            in_tokens = usage.get("promptTokenCount", 0)
                            
                            if not text:
                                continue
                            
                            diag = f"| 종료: {finish_reason} | 입력: {in_tokens}토큰, 출력: {out_tokens}토큰"
                            model_tag = f"\n\n---\n> ☁️ **AI 모델**: {g_model} (Google Gemini) {diag}"
                            cleaned = _clean_llm_output(text)
                            
                            # 정상 완료 (STOP) 이거나 충분한 분량 (1200자 이상)이면 즉시 반환
                            if finish_reason == "STOP" or len(cleaned) >= 1200:
                                return cleaned + model_tag
                            
                            # 너무 짧게 잘린 경우 저장 후 다음 시도
                            if len(cleaned) > len(best_response):
                                best_response = cleaned
                                best_model_tag = model_tag
                                
                    elif resp.status_code == 429:
                        last_error = f"{g_model} 429 한도 초과"
                        break
                    else:
                        last_error = f"{g_model} HTTP {resp.status_code}"
                except SheetUnavailable:
                    raise
                except Exception as e:
                    logger.warning("처리 중 오류(무시하고 계속)", exc_info=True)
                    last_error = f"{g_model} 예외: {str(e)[:100]}"
                    continue

    # 2. Groq Fallback (Gemini 실패 또는 잘림 시)
    if groq_key:
        GROQ_MAX_CHARS = 18000
        groq_system = system_prompt[:3000] if len(system_prompt) > 3000 else system_prompt
        groq_user = user_prompt[:GROQ_MAX_CHARS] if len(user_prompt) > GROQ_MAX_CHARS else user_prompt

        for g_model in ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]:
            if _remaining_seconds(deadline) < 2:
                break
            try:
                request_timeout = _bounded_request_timeout(deadline, 45)
                if request_timeout is None:
                    break
                resp = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                    json={
                        "model": g_model,
                        "messages": [
                            {"role": "system", "content": groq_system},
                            {"role": "user", "content": groq_user}
                        ],
                        "max_tokens": min(max_tokens, 4096),
                        "temperature": 0.6
                    },
                    timeout=request_timeout
                )
                if resp.status_code == 200:
                    content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                    if content:
                        cleaned = _clean_llm_output(content)
                        groq_tag = f"\n\n---\n> ☁️ **AI 모델**: {g_model} (Groq)"
                        if len(cleaned) > len(best_response):
                            return cleaned + groq_tag
                elif resp.status_code == 429:
                    if not best_response:
                        return "⏳ AI 분석 요청이 너무 많아 잠시 대기 중입니다. 1분 후 다시 [Refresh]를 눌러주세요. (Groq 무료 한도 초과)"
                    break
                last_error = f"Groq {g_model} HTTP {resp.status_code}"
            except SheetUnavailable:
                raise
            except Exception as e:
                logger.warning("처리 중 오류(무시하고 계속)", exc_info=True)
                last_error = f"Groq {g_model}: {str(e)}"
                continue

    # 최장 응답 반환
    if best_response:
        return best_response + best_model_tag

    return f"⚠️ 모든 AI 모델 호출에 실패했습니다. (마지막 오류: {last_error})"

def _scrub_prompt(text: str) -> str:
    """국외 AI 전송 직전: 자유서술에 섞인 실명(별칭 패턴)·전화·주민번호를 가린다. 실패해도 호출은 막지 않는다."""
    try:
        from app.core.privacy import scrub_free_text
        from app.services.sheets import fetch_student_status
        aliases = [r.get("학생이름", "") for r in fetch_student_status()]
        return scrub_free_text(text, aliases)
    except Exception:
        return text


def _call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 8192) -> str:
    """Primary LLM dispatcher: tries Local Ollama/LM Studio first, falls back to Gemini API.

    On the deployed serverless function, 'localhost' never reaches the
    teacher's PC, and an offline Cloudflare Tunnel makes every candidate URL
    hang until its connect/read timeout. That previously blocked AI-insight
    requests for up to ~3 minutes before falling back to Gemini. In
    production we only attempt the local/tunnel model when an explicit,
    non-localhost LOCAL_LLM_URL is configured (i.e. a tunnel the operator
    deliberately turned on), and we cap that attempt tightly so a dead
    tunnel fails fast instead of eating the request budget.
    """
    user_prompt = _scrub_prompt(user_prompt)
    should_try_local = True
    if _is_serverless_runtime():
        raw_url = os.getenv("LOCAL_LLM_URL", "").strip().lower()
        should_try_local = bool(raw_url) and "localhost" not in raw_url and "127.0.0.1" not in raw_url

    if should_try_local:
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
    chart_data_for_prompt = (
        _redact_list_names(chart_data) if section_type in _STUDENT_KEYED_SECTIONS else chart_data
    )
    data_str = json.dumps(chart_data_for_prompt, ensure_ascii=False, indent=2)

    # 차트 자체에 표시할 데이터가 없는 상태(빈 배열 또는 전부 0건)에서는 LLM에 일반론적인
    # 조언을 지어내게 하지 말고, 데이터가 없다는 사실만 명확히 안내한다.
    if isinstance(chart_data, list):
        total = 0.0
        saw_number = False
        for item in chart_data:
            if isinstance(item, dict):
                v = item.get("value", item.get("count"))
                if v is not None:
                    try:
                        total += float(v)
                        saw_number = True
                    except (TypeError, ValueError):
                        pass
        if not chart_data or (saw_number and total <= 0):
            return "📭 표시할 데이터가 없습니다. 해당 기간에 입력된 행동기록이 없어 분석할 수 없습니다. 행동기록을 입력한 뒤 다시 시도해 주세요."

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

    elif section_type == "weekly_trend":
        has_yearly_compare = isinstance(raw_summary, dict) and isinstance(raw_summary.get("yearly_compare"), dict)
        compare_note = ""
        if has_yearly_compare:
            yc = raw_summary["yearly_compare"]
            compare_note = f"""
[동일 주차 기준 연도별 비교 데이터 ({yc.get('prev2_year')}년/{yc.get('prev1_year')}년/{yc.get('curr_year')}년)]
{json.dumps(yc.get('data', []), ensure_ascii=False, indent=2)}
※ 이전 연도 값은 원자료 폐기 후 남긴 비식별 집계 요약(학교 전체 합계)이다. null은 그 해 자료 없음이며 0건과 다르다. 개별 학생·학급 단위 연도 비교는 하지 않는다."""
        prompt = f"""[분석 영역: 주별 위기행동 발생 추이(Weekly Trend) 분석]
[주차별 건수 데이터 (시간 순)]
{data_str}
{compare_note}

[필수 반영 지침]
1. 최근 구간이 이전 대비 증가·감소·정체 중 무엇인지 방향성을 먼저 판단하라.
2. 특정 주차에 급증/급감이 있다면 그 시점을 짚고 학사일정(시험, 행사, 계절 변화 등)과의 연관 가능성을 제시하라.
3. 이 추이가 현재 학교 전체 PBS 운영이 효과가 있는지 없는지에 대해 시사하는 바를 제시하라.
{"4. 연도별 비교 데이터가 있다면 같은 주차 기준으로 " + str(yc.get('prev2_year')) + "년·" + str(yc.get('prev1_year')) + "년 대비 올해가 개선되었는지 악화되었는지 간단히 짚어라." if has_yearly_compare else ""}"""

    elif section_type == "weekly_restraint_trend":
        prompt = f"""[분석 영역: 주별 제지 및 개별지원 실시 추이 분석]
[주차별 물리적 제지/개별학생교육지원 실시 건수 데이터 (시간 순)]
{data_str}

[필수 반영 지침]
1. 최근 구간이 이전 대비 증가·감소·정체 중 무엇인지 방향성을 먼저 판단하라.
2. 특정 주차에 제지·개별지원 건수가 급증했다면 그 시점을 짚고 특정 학생이나 학사일정과의 연관 가능성을 제시하라.
3. 제지·개별지원 건수가 줄지 않고 반복된다면 최소제한원칙(Least Restrictive) 관점에서 위기관리계획(BIP) 재점검이 필요한지 판단하라."""

    elif section_type == "tier_upgrade_candidates":
        target_tier = raw_summary.get("target_tier", "") if isinstance(raw_summary, dict) else ""
        candidates = raw_summary.get("candidates", []) if isinstance(raw_summary, dict) else []
        codes = {str(c.get("student_code", "")).strip() for c in candidates if c.get("student_code")}

        full_logs: list = []
        if codes:
            from app.services.sheets import fetch_all_records, fetch_student_status
            from app.services.normalize import normalize_behavior_log

            status_records = fetch_student_status()
            tier_info_map = {}
            for s in status_records:
                code = str(s.get("학생코드", "")).strip()
                if code:
                    tier_info_map[code] = {"class": s.get("학급", ""), "tier": tier_label(s)}
            for r in fetch_all_records():
                rc = str(r.get("학생코드", r.get("코드번호", ""))).strip()
                if rc in codes:
                    full_logs.append(normalize_behavior_log(r, tier_info_map))
        logs_str = json.dumps(_redact_log_names(full_logs[-150:]), ensure_ascii=False, indent=2)

        prompt = f"""[분석 영역: {target_tier} 상향 검토 대상자 선정 근거 분석]
[검토 대상자 요약]
{data_str}

[대상자 전체 행동 기록 원자료 (누적, 최근 150건)]
{logs_str}

[필수 반영 지침]
1. 각 대상자가 왜 검토 대상으로 선정되었는지(누적 빈도·최대 강도 기준) 근거를 밝혀라.
2. 원자료에 나타난 반복 패턴(시간대·장소·기능)이 선정 타당성을 뒷받침하는지 판단하라.
3. 학교행동중재지원팀이 이 명단으로 바로 실행할 수 있는 다음 조치를 제시하라."""

    elif section_type == "teacher_pbst_request":
        class_name = raw_summary.get("class_name", "") if isinstance(raw_summary, dict) else ""
        prompt = f"""[분석 영역: 담임교사 → 학교행동중재지원팀(PBST) 제출 의견 자동 생성]
[학급: {class_name}]
[우리 반 최근 행동/Tier 데이터]
{data_str}

[필수 반영 지침]
1. 이 학급 데이터에서 담임교사가 학교행동중재지원팀에 실제로 요청할 만한 사항(예: 특정 학생 Tier 재검토, 협의회 소집, 추가 인력·자원 지원, BIP 재수립 등)을 데이터 근거와 함께 도출하라.
2. 추측성 조언이 아니라 이 학급의 수치(빈도, 강도, Tier 분포, 최근 추이)에 직접 근거한 요청만 제시하라.
3. 학교행동중재지원팀이 받자마자 무엇을 검토해야 하는지 바로 알 수 있도록 구체적으로 작성하라."""

    elif section_type == "cico_performance":
        prompt = f"""[분석 영역: CICO 학생별 수행률 vs 목표 분석]
[학생별 이번 달 수행률(rate) 대 개인 목표(goal) 데이터]
{data_str}

[필수 반영 지침]
1. 목표 대비 수행률이 낮은 학생을 지목하고, 격차가 큰 순으로 우선순위를 매겨라.
2. 목표를 이미 크게 상회하는 학생이 있다면 목표 자체가 너무 낮게 설정된 것은 아닌지 점검하라.
3. 학교행동중재지원팀이 이번 주 CICO 운영에서 가장 먼저 손봐야 할 학생/조치를 제시하라."""

    elif section_type == "cico_monthly_trend":
        prompt = f"""[분석 영역: CICO 전체 학생 월별 평균 수행률 추이]
[3월부터 현재까지 월별 평균 수행률(%) 데이터]
{data_str}

[필수 반영 지침]
1. 최근 달이 이전 대비 상승·하락·정체 중 무엇인지 방향성을 먼저 판단하라.
2. 특정 달에 급등/급락이 있다면 학사일정(방학, 시험, 신학기 적응 등)과의 연관 가능성을 짚어라.
3. 이 추이가 현재 학교의 CICO 운영 방식이 효과적인지에 대해 시사하는 바를 제시하라."""

    elif section_type == "cico_decision_distribution":
        prompt = f"""[분석 영역: CICO 학생 의사결정 제안 분포]
[이번 달 학생별 시스템 의사결정 제안 분포(예: CICO 유지/Tier1 하향/Tier3 상향 등)]
{data_str}

[필수 반영 지침]
1. 어떤 의사결정 유형이 몇 명으로 가장 많은지 밝히고, 그 비중이 정상적인 CICO 운영 상태를 의미하는지 판단하라.
2. Tier1 하향 권장이나 Tier3 상향 검토 인원이 있다면 그 인원부터 우선 논의 대상으로 지목하라.
3. 이 분포를 바탕으로 학교행동중재지원팀 다음 회의에서 다룰 안건을 제안하라."""

    elif section_type == "cico_achievement_trend":
        prompt = f"""[분석 영역: CICO 월별 목표 달성/미달 학생 수 추이]
[월별 목표 달성 인원(달성) 대 미달 인원(미달) 데이터]
{data_str}

[필수 반영 지침]
1. 최근 달의 달성 비율이 이전 달 대비 개선되고 있는지 악화되고 있는지 판단하라.
2. 미달 인원이 누적/반복되는 경향이 있다면 CICO 프로그램 자체(목표 설정, 강화물, 담당 교사 지원)의 재검토가 필요한지 짚어라.
3. 학교행동중재지원팀이 다음 달 CICO 운영에서 바로 적용할 수 있는 개선 조치를 제시하라."""

    elif section_type == "tier3_weekly_trend":
        prompt = f"""[분석 영역: Tier3 대상학생 주별 위기행동 발생 추이]
[주차별 건수 데이터 (시간 순)]
{data_str}

[필수 반영 지침]
1. 최근 구간이 이전 대비 증가·감소·정체 중 무엇인지 방향성을 먼저 판단하라.
2. 급증/급감 시점이 있다면 학사일정과의 연관 가능성을 제시하라.
3. Tier3 집중지원(FBA/BIP) 전반이 효과가 있는지 시사하는 바를 제시하라."""

    elif section_type == "tier3_student_freq":
        prompt = f"""[분석 영역: Tier3 대상학생별 보고빈도 비교]
[학생별 누적 보고 건수 데이터]
{data_str}

[필수 반영 지침]
1. 보고빈도가 가장 높은 학생을 지목하고 FBA/BIP 재검토 우선순위를 매겨라.
2. 학생 간 격차가 크다면 개별 대응이 다르게 필요한지 판단하라.
3. 학교행동중재지원팀이 이번 주 가장 먼저 검토할 학생/조치를 제시하라."""

    elif section_type == "tier3_decision_dist":
        prompt = f"""[분석 영역: Tier3 대상학생 의사결정 제안 분포]
[학생별 시스템 의사결정 제안 분포(Tier3 유지/하향 검토/상향 검토 등)]
{data_str}

[필수 반영 지침]
1. 어떤 의사결정 유형이 몇 명으로 가장 많은지 밝히고 그 비중이 정상적인지 판단하라.
2. 상향 검토·위기 유지 인원이 있다면 그 인원부터 우선 논의 대상으로 지목하라.
3. 이 분포를 바탕으로 개별화교육지원팀 다음 회의에서 다룰 안건을 제안하라."""

    elif section_type == "tier3_intensity_compare":
        prompt = f"""[분석 영역: Tier3 대상학생별 행동 강도 비교]
[학생별 평균/최대 강도 데이터]
{data_str}

[필수 반영 지침]
1. 최대 강도가 높은 학생을 지목하고 위기관리계획(CrisisPlan) 재점검이 필요한지 판단하라.
2. 평균 강도와 최대 강도의 격차가 큰 학생은 산발적 고강도 위기로 해석하고 전조 관리를 제안하라.
3. 학교행동중재지원팀이 바로 실행할 수 있는 다음 조치를 제시하라."""

    else:
        prompt = f"[분석 데이터]\n{data_str}\n\n공통 시스템 프롬프트에 따라 BCBA 분석을 작성하라."

    prompt += """

[출력 형식 - 이 지침이 시스템 프롬프트의 출력 형식 규칙보다 우선한다]
공통 시스템 프롬프트의 "[출력 형식]" 절(소제목 구성, 핵심 요약 3줄, [데이터 한계] 섹션 등)은 이번 응답에는 적용하지 않는다.
대신 위 지침의 내용을 반영하여 아래 형식 그대로, 다른 텍스트 없이 정확히 3줄만 출력하라.

해석1. (한 문장, 반점으로 여러 절을 잇지 말 것)
해석2. (한 문장)
해석3. (한 문장, 데이터 한계나 신뢰도 관련 내용이 필요하면 여기에)

각 줄은 "해석N. " 뒤에 하나의 요지만 담은 짧은 문장 하나로 끝내라. 제목, 소제목, 인사말, 서론은 쓰지 마라.
학교행동중재지원팀(PBST)이 한눈에 읽고 바로 의사결정에 활용할 수 있도록 가장 중요한 시사점과 실행 가능한 제안만 압축해서 담아라."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 2048)


# ==============================================================================
# §2.5 P0 AI Structured Summary Builders (계산은 Python, 해석은 AI)
# ==============================================================================

def _build_cico_summary_payload(
    students_data: list,
    behavior_logs: list = None,
    tier_info: list = None,
    selected_month: int = None
) -> dict:
    """
    Python deterministic aggregation for CICO AI analysis.
    Eliminates raw 31-day O/X dumps while preserving exact statistical and clinical metrics.
    """
    students_data = students_data or []
    behavior_logs = behavior_logs or []
    tier_info = tier_info or []

    # Map tier info
    tier_map = {}
    for t in tier_info:
        code = str(t.get("학생코드", t.get("Code", ""))).strip()
        if code:
            tier_map[code] = t

    student_summaries = []
    total_recorded_days = 0
    total_success_days = 0
    total_goals_met = 0

    for s in students_data:
        code = str(s.get("code") or s.get("student_code") or s.get("학생코드") or "").strip()
        class_name = str(s.get("class") or s.get("class_name") or "").strip()
        target_behavior = str(s.get("target_behavior") or s.get("목표행동") or "").strip()
        behavior_type = str(s.get("behavior_type") or s.get("목표행동 유형") or "증가 목표행동").strip()
        goal_str = str(s.get("goal") or s.get("goal_criteria") or s.get("목표달성기준") or "80% 이상").strip()
        is_decrease = "감소" in behavior_type

        # Parse goal number. rate_num below is always attainment (higher =
        # better, X/미발생 counts as success for 감소 목표행동), so a "이하"
        # criterion (e.g. "10% 이하" occurrence) needs its attainment
        # equivalent (90%) to compare against.
        goal_num = 80.0
        gm = re.search(r"(\d+(?:\.\d+)?)", goal_str)
        if gm:
            try:
                goal_num = float(gm.group(1))
            except ValueError:
                goal_num = 80.0
        effective_goal_num = (100 - goal_num) if "이하" in goal_str else goal_num

        # get_cico_report_data() (the usual source of students_data) names this
        # field "daily_data", not "daily" - without this the day list was always
        # empty and every student showed up as "0 recorded days" regardless of
        # how much data actually existed.
        daily_records = s.get("daily_data") or s.get("daily") or []
        valid_days = [
            d for d in daily_records
            if isinstance(d, dict) and str(d.get("value", "")).strip() in ["O", "o", "V", "v", "X", "x"]
        ]
        success_values = ["X", "x"] if is_decrease else ["O", "o", "V", "v"]

        recorded_days = len(valid_days)
        success_days = len([d for d in valid_days if str(d.get("value", "")).strip() in success_values])
        total_recorded_days += recorded_days
        total_success_days += success_days

        rate_num = round(success_days / recorded_days * 100, 1) if recorded_days > 0 else 0.0
        is_goal_achieved = rate_num >= effective_goal_num
        if is_goal_achieved:
            total_goals_met += 1

        # Recent 5-day and previous 5-day rates
        recent_5 = valid_days[-5:] if len(valid_days) >= 5 else valid_days
        recent_5_success = len([d for d in recent_5 if str(d.get("value", "")).strip() in success_values])
        recent_5day_rate = round(recent_5_success / len(recent_5) * 100, 1) if recent_5 else rate_num

        prev_5 = valid_days[-10:-5] if len(valid_days) >= 10 else []
        prev_5_success = len([d for d in prev_5 if str(d.get("value", "")).strip() in success_values])
        previous_5day_rate = round(prev_5_success / len(prev_5) * 100, 1) if prev_5 else None

        # Trend direction
        if previous_5day_rate is not None:
            change_pp = round(recent_5day_rate - previous_5day_rate, 1)
            if change_pp >= 5.0:
                trend_dir = "improving"
            elif change_pp <= -5.0:
                trend_dir = "declining"
            else:
                trend_dir = "stable"
        else:
            change_pp = 0.0
            trend_dir = "stable" if recorded_days >= 5 else "insufficient_data"

        # Consecutive success/failure count
        consecutive_success = 0
        consecutive_failure = 0
        for d in reversed(valid_days):
            val = str(d.get("value", "")).strip()
            if val in success_values:
                if consecutive_failure == 0:
                    consecutive_success += 1
                else:
                    break
            elif val in ["O", "o", "V", "v", "X", "x"]:
                if consecutive_success == 0:
                    consecutive_failure += 1
                else:
                    break

        # Historical multi-month trend
        historical_trend = s.get("trend", [])
        all_rates_parsed = []
        for t in historical_trend:
            try:
                r = float(str(t.get("rate", "")).replace("%", ""))
                all_rates_parsed.append(r * 100 if r <= 1 else r)
            except (ValueError, AttributeError):
                all_rates_parsed.append(None)

        # 클라이언트가 보낸 추이만으로는 같은 목표와 연속 월을 보장할 수 없다.
        # 단계 하향은 원자료를 확인한 팀이 결정한다.
        last2_high = False

        ts = tier_map.get(code, {})
        has_sst = str(ts.get("Tier2(SST)", "")).strip() == "O"
        has_t3 = str(ts.get("Tier3", "")).strip() == "O" or str(ts.get("Tier3+", "")).strip() == "O"
        cico_only = not (has_sst or has_t3)

        # Existing CICO Decision Rule Reuse
        if not recorded_days:
            decision_rule = "기록 부족: 단계 판단 보류"
        elif last2_high and cico_only:
            decision_rule = "Tier1 하향 권장 (2개월 연속 목표 달성, CICO 졸업 검토)"
        elif last2_high and not cico_only:
            decision_rule = "CICO 유지 (T3/SST 병행 지원 지속)"
        elif rate_num >= effective_goal_num:
            decision_rule = "CICO 유지 (양호, 현재 강화제 및 피드백 유지)"
        elif rate_num >= 50:
            decision_rule = "CICO 수정 검토 (중재 충실도 점검 및 피드백 주기 단축)"
        else:
            decision_rule = "Tier3 상향 검토 (정식 FBA/BIP 의뢰 검토)"

        # Compact monthly trend map
        compact_monthly_trend = {t.get("month", ""): t.get("rate", "") for t in historical_trend if t.get("month")}

        student_summaries.append({
            "code": code,
            "class": class_name,
            "target": target_behavior,
            "goal": goal_str,
            "metrics": {
                "recorded_days": recorded_days,
                "overall_rate_pct": rate_num,
                "recent_5d_rate_pct": recent_5day_rate,
                "trend": trend_dir,
                "change_pp": change_pp,
                "consec_success": consecutive_success,
                "consec_fail": consecutive_failure,
                "monthly_rates": compact_monthly_trend
            },
            "decision": {
                "rule_result": decision_rule,
                "support_type": "CICO_ONLY" if cico_only else ("T3_CONCURRENT" if has_t3 else "SST_CONCURRENT")
            }
        })

    # Cross-reference with Log_Main crisis behaviors
    student_codes_set = {s["code"] for s in student_summaries if s.get("code")}
    matching_logs = [
        l for l in behavior_logs
        if str(l.get("student_code", l.get("학생코드", ""))).strip() in student_codes_set
    ]
    crisis_logs_count = len(matching_logs)
    high_intensity_count = len([l for l in matching_logs if int(l.get("intensity") or l.get("강도") or 0) >= 4])

    avg_overall_rate = round(total_success_days / total_recorded_days * 100, 1) if total_recorded_days > 0 else 0.0

    return {
        "evaluation_period": f"{selected_month}월" if selected_month else "당월",
        "cohort": {
            "total_students": len(student_summaries),
            "total_recorded_days": total_recorded_days,
            "avg_achievement_rate_pct": avg_overall_rate,
            "goals_met_count": total_goals_met,
            "crisis_logs_in_log_main": crisis_logs_count,
            "high_intensity_crisis_count": high_intensity_count
        },
        "students": student_summaries,
        "guards": {
            "denominator": "학생별 실제 기록 일수(recorded_days)",
            "limit": "관찰 기회수가 미통제된 데이터이므로 주간 추세 및 충실도를 우선 해석함."
        }
    }


def _build_student_summary_payload(
    student_info: dict,
    student_logs: list,
    cico_data: list = None,
    all_notes: list = None,
) -> dict:
    """Build the current narrative-first FBA evidence payload."""
    return build_fba_evidence_summary(_redact_dict_name(student_info), student_logs, all_notes)


# ------------------------------------------------------------------------------
# ③ 🤖 CICO AI 분석 (/cico) - Optimized with Structured Summary
# ------------------------------------------------------------------------------
def generate_bcba_cico_analysis(
    students_data: list,
    behavior_logs: list = None,
    tier_info: list = None,
    selected_month: int = None
) -> str:
    """
    CICO 분석: Python 정량 집계 Structured Summary 기반 의사결정 컨설팅.
    (원시 O/X 배열 dump를 제거하고 정확한 통계치와 결정론적 룰 결과 전달)
    """
    summary_payload = _build_cico_summary_payload(
        students_data=students_data,
        behavior_logs=behavior_logs,
        tier_info=tier_info,
        selected_month=selected_month
    )
    cico_summary_json = json.dumps(summary_payload, ensure_ascii=False, separators=(',', ':'))
    month_text = f"{selected_month}월 " if selected_month else ""

    prompt = f"""[분석 대상: {month_text}CICO 정량 집계 및 Tier 의사결정 요약]
{cico_summary_json}

[지시사항]
공통 시스템 프롬프트를 준수하여 CICO 성과 분석 및 Tier 조정 보고서를 작성하라.
제공된 집계 수치(달성률, 최근 추세, 연속 성공일, 룰 판정, monthly_rates)를 인용하라.

0. **쉬운 말로 쓰기**: 이 보고서는 바쁜 담임교사가 훑어보고 바로 행동할 수 있어야 한다.
   "DPR", "정합성", "포화" 같은 전문용어는 쓰지 말고 일상어로 풀어 쓴다
   (예: "DPR 달성률" → "하루 목표 달성률", "정합성 확인" → "CICO 목표와 실제 문제행동이
   같은 것을 가리키는지 확인"). Tier1/2/3은 그대로 쓰되 괄호로 "(담임 관찰 단계/집중 지원
   단계/전문가 개입 단계)"처럼 짧게 덧붙인다. 문장은 짧게, 한자어보다 쉬운 우리말을 우선한다.
1. **중재 충실도 점검**: 달성률 저하 시 매일 체크인/아웃 및 즉각 피드백 실시 여부 우선 확인.
2. **이번 달 추세 판정**: 단순 평균 대신 최근 5일 및 주 단위 추세(상승/유지/하락) 판정.
3. **월별 추이 해설**: metrics.monthly_rates에 담긴 달별 달성률을 "3월 30% → 6월 55% →
   9월 100%"처럼 순서대로 짚어가며, 언제부터 좋아졌는지/나빠졌는지, 방학·학기 전환 등
   특정 시점에 꺾인 지점이 있는지, 지금 추세가 계속되면 다음 달엔 어떨지 한두 문장으로 짚는다.
   데이터가 1~2개월뿐이면 "아직 추이를 판단하기엔 기록이 부족하다"고 명시한다.
4. **Tier 이동 의사결정 매트릭스**:
   - 목표(기본 80%) 이상 2개월 연속 + CICO만 받는 학생: Tier 1 하향(졸업) 검토 (하향 후 4주 모니터링 명시).
   - SST·Tier 3 병행 학생은 목표를 달성해도 CICO 유지.
   - 목표 달성 1개월: 현행 유지 및 강화제 선호도 재평가.
   - 수행률 50% 이상~목표 미만: CICO 수정 검토(충실도 점검, 피드백 주기 단축).
   - 수행률 50% 미만 또는 위기행동 강도 5: Tier 3 상향 및 정식 FBA·BIP 의뢰 검토.
5. **위기행동 기록 교차 확인**: 하루 목표 달성률이 높은데도 위기행동 기록이 많다면, CICO
   목표행동과 실제 문제행동이 서로 다른 것을 가리키고 있지 않은지 짚는다.
6. **강화제(보상) 점검**: 3~4주 차에 달성률이 떨어진 학생은 보상(강화제)을 바꿔볼 것을 제안한다.

[출력 형식]
`핵심 판단`, `월별 추이`, `학생별 우선순위`, `Tier 결정`, `이번 주 실행`, `데이터 한계` 6개
소제목만 사용한다. `월별 추이`는 학생당 2줄 이내, `학생별 우선순위`는 학생당 3줄 이내,
실행 항목은 3개 이하로 쓴다."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 2600)


# ------------------------------------------------------------------------------
# ④ 🤖 SST 행동중재협의회 AI 회의록 자동 생성 (/meetings)
# ------------------------------------------------------------------------------
# ------------------------------------------------------------------------------
# ⑤ 🤖 Tier 3 심층 위기지원 컨설팅 (/tier3) - Optimized with Structured Summary
# ------------------------------------------------------------------------------
# ------------------------------------------------------------------------------
# ⑥ 🤖 개별 학생 AI 종합 분석 (학생 프로필) - Optimized with Structured Summary
# ------------------------------------------------------------------------------
def generate_bcba_student_analysis(
    student_info: dict,
    student_logs: list,
    cico_data: list = None,
    all_notes: list = None
) -> str:
    """
    개별 학생 종합 분석: 구조화 필드와 특기사항 서술을 교차한 잠정 FBA 분석.
    (원시 30건 로그 dump를 제거하고 통계 분포와 엄선된 대표 사건 전달)
    """
    gate = fba_data_gate(len(student_logs or []))
    if not gate["eligible"]:
        return gate["notice"]

    summary_payload = _build_student_summary_payload(
        student_info=student_info,
        student_logs=student_logs,
        cico_data=cico_data,
        all_notes=all_notes
    )
    student_summary_json = json.dumps(summary_payload, ensure_ascii=False, separators=(',', ':'))

    prompt = f"""[학생 위기행동 정량 집계 및 대표 관찰 증거 요약]
{student_summary_json}

[지시사항]
특수교사·담임교사·IEP팀이 바로 이해하고 실행할 수 있는 개별 FBA 참고 리포트를 작성하라.
별도 ABC 문항이 아니라 특기사항(기타)에 서술된 자료가 주된 맥락 자료다. 구조화 필드(추정기능·행동유형·강도·횟수·시간대·장소·안전사건)와 특기사항을 교차하라. 특기사항에서 A/B/C 단서를 구분할 수는 있으나, 기록되지 않은 선행사건이나 후속결과를 사실처럼 만들지 마라.

[출력 형식 — 아래 6개 소제목만 사용]
### 1. 핵심 판단
- 잠정 기능가설 1~2개와 신뢰수준을 3줄 이내로 쓴다.
### 2. 근거
- 실제 n, 주요 행동·기능·시간·장소·강도·특기사항 근거를 5개 이하 불릿으로 쓴다.
### 3. 특기사항에서 확인된 A-B-C 단서
- A/B/C를 각각 쓰되 없으면 반드시 "별도 기록 없음"이라고 쓴다.
### 4. 기능에 맞는 교실 지원
- 예방·대체행동 교수·강화를 각각 2개 이하로 쓴다. 학생의 의사소통 방식이 미상이면 선택 가능한 반응형태를 제시하고 확인 필요로 표시한다.
### 5. 이번 주 확인할 데이터
- 담당자·관찰상황·측정항목을 3개 이하로 쓴다.
### 6. 데이터 한계
- 잠정 가설이며 직접 ABC 관찰로 확인해야 할 부분을 2문장 이내로 쓴다."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 2600)


# ------------------------------------------------------------------------------
# ⑥-2 🤖 약물 변경 전후 교실 행동 비교 — 정신건강의학과 진료 참고용 담임교사 관찰 의견서
# ------------------------------------------------------------------------------
def _summarize_medication_period(label: str, start: str, end: str, data: dict) -> dict:
    """Turn one period's get_student_analytics() result into a compact,
    rate-normalized summary so before/after periods of different lengths are
    still comparable (raw totals would mislead if the periods aren't equal)."""
    days = None
    try:
        days = (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days + 1
    except (ValueError, TypeError):
        pass

    profile = data.get("profile") or {}
    total_incidents = profile.get("total_incidents", 0) or 0
    avg_weekly = round(total_incidents / (days / 7), 1) if days and days > 0 else None

    return {
        "label": label,
        "period": f"{start} ~ {end}",
        "period_days": days,
        "total_incidents": total_incidents,
        "avg_weekly_incidents": avg_weekly,
        "avg_intensity": profile.get("avg_intensity", 0),
        "weekday_pattern": [
            {"day": d.get("name"), "count": d.get("value")}
            for d in (data.get("weekday_dist") or [])
        ],
        "behavior_type_distribution": [
            {"type": b.get("name"), "count": b.get("value")}
            for b in (data.get("behavior_types") or [])
        ][:5],
    }


def _format_medications(medications: list) -> str:
    """"약물 없음(관찰만)" 상태와 여러 약물 병용을 모두 표현한다. 빈 목록은
    "미복용"으로 명시해, 약물 시작 전/중단 후 관찰과 병용약물 변경을 모두
    다룰 수 있게 한다."""
    names = [
        f"{(m.get('name') or '').strip()}{(' ' + m.get('dose', '').strip()) if m.get('dose', '').strip() else ''}"
        for m in (medications or [])
        if (m.get("name") or "").strip()
    ]
    return ", ".join(names) if names else "미복용"


def generate_medication_response_report(
    student_info: dict,
    before_medications: list,
    after_medications: list,
    before_period: dict,
    after_period: dict,
    before_data: dict,
    after_data: dict,
) -> str:
    """
    약물 복용 변경 전/후 교실 행동을 비교해, 담임교사가 정신건강의학과 진료 시
    의료진에게 제출할 수 있는 "교실 관찰 의견서"를 만든다. 각 기간에 여러
    약물을 병용했거나(다약제), 한쪽 기간이 아예 미복용(예: 약물 시작 전
    관찰, 또는 중단 후 관찰)이어도 다룰 수 있다.

    이 함수는 의도적으로 진단이나 처방을 만들어내지 않는다. 진단명 추정과 약물
    조정 제안은 COMMON_BCBA_SYSTEM_PROMPT 10번 규칙에서 이미 금지되어 있고,
    아래 프롬프트에서도 같은 제약을 다시 명시한다 — 학생 실제 행동 데이터를
    바탕으로 교사가 관찰한 사실만 정리하고, 진단·처방은 전적으로 담당 의사의
    몫으로 남긴다. 다만 입력된 약물에 대해 이미 널리 알려진(약품설명서 수준의)
    일반적 효과·부작용을 참고 정보로 짧게 소개하고, 관찰된 행동이 그 부작용
    패턴과 겹치면 가능성으로만 조심스럽게 짚는 것은 허용한다 — 이는 진단이나
    처방이 아니라 공개된 일반 정보 제공이며, 드물거나 불확실한 약물이면
    "정보 부족"이라고 쓰도록 지시해 안 알려진 사실을 지어내지 않게 한다.
    """
    before_summary = _summarize_medication_period("변경 전", before_period["start"], before_period["end"], before_data)
    after_summary = _summarize_medication_period("변경 후", after_period["start"], after_period["end"], after_data)

    payload = {
        "student": {"code": student_info.get("code"), "class": student_info.get("class")},
        "medications": {
            "before": [{"name": m.get("name"), "dose": m.get("dose")} for m in (before_medications or []) if (m.get("name") or "").strip()] or "미복용",
            "after": [{"name": m.get("name"), "dose": m.get("dose")} for m in (after_medications or []) if (m.get("name") or "").strip()] or "미복용",
        },
        "before": before_summary,
        "after": after_summary,
    }
    summary_json = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    before_meds_label = _format_medications(before_medications)
    after_meds_label = _format_medications(after_medications)

    prompt = f"""[약물 복용 변경 전후 교실 행동 관찰 비교 자료]
{summary_json}

변경 전 복용: {before_meds_label}
변경 후 복용: {after_meds_label}

[용도]
이 문서는 담임교사가 정신건강의학과 진료 시 의료진에게 제출하는 "교실 관찰 의견서"다.
교실에서 관찰한 객관적 행동 변화를 의료진에게 전달해 의료진의 진단·처방 판단을 돕는
참고자료를 작성하는 것이 목적이다. 한쪽 기간이 "미복용"이면 약물 시작 전(또는 중단
후) 관찰이라는 뜻이고, 양쪽 다 약물이 있으면 병용 약물이 바뀐 경우(교체·추가·감량 등)
라는 뜻이니 문맥에 맞게 서술하라. 여러 약물이 병용된 경우 약물별로 구분하지 말고
"복용 조합"으로 묶어 행동 변화와만 연결하라(어느 약이 효과가 있었는지 추정 금지).
**이 문서는 진단서나 처방전이 아니며, 그런 것처럼 쓰면 안 된다.**

[반드시 지킬 것]
1. 진단명을 추정하거나 단정하지 마라(예: "ADHD가 확실하다" 금지). 관찰된 행동만 기술한다.
2. 약물 증량·감량·교체·중단을 제안하지 마라. 그 판단은 전적으로 담당 의사의 몫이다.
3. avg_weekly_incidents(주당 평균 발생), avg_intensity(평균 강도), weekday_pattern
   (요일별 패턴), behavior_type_distribution(행동 유형 분포)을 변경 전/후로 비교해
   변화의 방향과 크기를 수치로 제시한다. 값이 없으면 "해당 기간 기록 없음"이라고 쓴다.
4. 관찰 기간의 길이가 서로 다를 수 있으므로 반드시 "주당 평균"으로 비교하고, 총
   건수만으로 비교하지 마라.
5. 상관관계일 뿐 인과관계가 아님을 분명히 한다(계절, 학사일정, 교우관계 등 다른
   요인 때문일 수도 있음). 병용 약물이 여러 개면 그중 어느 것의 효과인지도 알 수
   없다는 점을 함께 밝힌다.
6. 쉬운 말로 쓰되 의료진이 읽을 자료이므로 수치는 생략하지 말고 구체적으로 쓴다.
7. 약물명이 입력되어 있으면(미복용이 아니면), 그 약물에 대해 "이미 널리 알려진, 약품
   설명서 수준의" 일반적 효과·주요 부작용만 짧게 소개해도 된다. 이것은 진단이나 처방이
   아니라 참고 정보 제공이다. 단, 확실하지 않거나 드문 약물·정보면 지어내지 말고
   "일반적으로 알려진 정보가 부족함"이라고 쓴다. 관찰된 행동 변화 중 그 약물의 잘 알려진
   부작용과 겹치는 부분이 있다면 "~와 겹치는 양상이라 참고가 필요합니다"처럼 반드시
   조심스럽게(가능성으로만) 쓰고, "~때문이다"처럼 원인으로 단정하지 마라.

[출력 형식 — 아래 소제목만 사용]
### 담임교사 관찰 의견서
- 학생 코드, 관찰 기간(변경 전/후), 변경 전/후 복용 약물(미복용 포함)을 첫 줄에 나열한다.
### 1. 관찰 요약
- 변경 전후 주당 평균 발생 건수·평균 강도 변화를 2~3문장으로 요약한다.
### 2. 세부 비교
- 요일별 패턴, 행동 유형 분포 변화를 불릿으로 쓴다.
### 3. 약물 관련 일반 참고 정보
- 입력된 약물의 일반적으로 알려진 효과·주요 부작용을 짧게 쓰고, 관찰 결과 중 겹치는
  부분이 있으면 조심스럽게 짚는다. 미복용이거나 정보가 부족하면 그렇다고 쓴다.
- 마지막 줄에 "정확한 정보는 처방전·약품설명서·의료진 확인이 필요합니다"를 덧붙인다.
### 4. 교실에서 함께 관찰된 사항
- 수치로 안 잡히는 정성적 변화(집중도, 또래 관계, 수업 참여 등)가 있으면 쓰고,
  없으면 "특이사항 없음"이라 쓴다.
### 5. 유의사항
- 이 자료는 교실 관찰에 근거한 참고자료이며 진단이나 처방을 대신하지 않는다는 점,
  상관관계와 인과관계를 혼동하지 말아야 한다는 점을 명시한다."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 2000)


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
    BIP Step 4 가설 생성: 구조화 필드와 특기사항 기반 잠정 가설 + n<3 가드.
    """
    gate = fba_data_gate(sample_size)
    if not gate["eligible"]:
        return gate["notice"]

    prompt = f"""[학생 정보] {json.dumps(_redact_dict_name(student_info), ensure_ascii=False)}
[표적행동] {target_behavior}
[시간대·장소 등 맥락 데이터] {antecedent_data}
[교사 추정기능 및 특기사항(기타) 서술] {function_data} / {notes_summary}

[지시사항]
별도 ABC 문항이 없는 운영 자료다. 특기사항에서 확인되는 A/B/C 단서와 구조화 필드의 반복 패턴을 결합하여 잠정 기능가설을 작성하라.

[작성 규칙]
1. 첫 줄에 `잠정 기능가설:`을 쓰고 2문장 이내로 요약하라.
2. 표적행동은 관찰·측정 가능하게 기술하라.
3. 기능이 복수이면 가설 1, 가설 2로 나누되 각 가설은 근거 2개 이하로 쓴다.
4. 없는 선행사건·후속결과를 채우지 말고 `별도 기록 없음`으로 표시하라.
5. 마지막에 `확인 관찰:`로 반증 가능한 직접관찰 방법 1개를 제시하라."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 1000)


# ------------------------------------------------------------------------------
# 경기Be-Able 공식 EBP 39 카탈로그 인용 블록 — AI가 전략명을 자유롭게 지어내지 않고
# 실제 39개 항목의 공식 번호·코드·이름 중에서 골라 인용하도록 프롬프트에 얹는다.
# ------------------------------------------------------------------------------
_EBP_CATALOG_REFERENCE_CACHE: Optional[str] = None


def _ebp_catalog_reference_block() -> str:
    global _EBP_CATALOG_REFERENCE_CACHE
    if _EBP_CATALOG_REFERENCE_CACHE is not None:
        return _EBP_CATALOG_REFERENCE_CACHE
    try:
        from app.services.ebp.catalog import load_ebp_catalog
        catalog = sorted(load_ebp_catalog(), key=lambda s: s.official_no or 999)
        lines = [
            f"{(s.official_no or 0):02d}/39 {s.official_domain or ''} {s.code} {s.name}"
            for s in catalog
        ]
        _EBP_CATALOG_REFERENCE_CACHE = "\n".join(lines)
    except SheetUnavailable:
        raise
    except Exception:
        _EBP_CATALOG_REFERENCE_CACHE = ""
    return _EBP_CATALOG_REFERENCE_CACHE


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
    prompt = f"""[학생 정보] {json.dumps(_redact_dict_name(student_info), ensure_ascii=False)}
[표적행동 및 가설] {target_behavior} / {hypothesis_data}
[추정 기능] {function_data}

[경기Be-Able 공식 EBP 39 목록 — 번호/영역/코드/이름]
{_ebp_catalog_reference_block()}

[지시사항]
1단계 예방(선행사건/배경사건 조절), 2단계 교수(대체행동 훈련), 3단계 강화(차별강화)의 3단계 중재 전략을 제안하라.
1. **위 39개 목록에서만 전략을 고른다.** 목록에 없는 전략명을 새로 만들지 말고, 각 전략을 언급할 때 `코드(공식번호/39) 이름` 형식(예: `FCT(21/39) 기능적의사소통훈련`)으로 표기한다.
2. **기능 1:1 매칭 검증**: 각 전략이 가설의 기능에 정확히 부합하는지 확인하라.
3. **대체행동 기능적 등가성 3요건 확인 표**:
   - 동일 기능 수행 여부 / 표적행동 대비 적은 노력 / 더 빠르고 확실한 강화 여부를 표로 점검.
4. **경은학교 기존 자원 연계**: 경은그림말 AAC, 경은마트 토큰경제, 심리안정실, 시각적 일과표 적극 활용.
5. **소거 폭발(Extinction Burst) 주의**: 자해/공격행동에 대한 단독 소거 금지 및 안전 조건 명시.
6. **우선순위 부여**: 전략별 [실행 난이도: 상/중/하] 및 [효과 발현 예상 시점] 표기.

[출력 형식]
`1. 예방`, `2. 교수`, `3. 강화`, `확인 방법` 네 소제목만 사용한다. 각 단계는 실행문 3개 이하, 한 항목은 2문장 이하로 쓴다."""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 1600)


# ------------------------------------------------------------------------------
# ⑨ 🤖 AI BIP 전체 계획서 제안 (BIP Step 12)
# ------------------------------------------------------------------------------
def generate_full_bip(
    student_info: dict,
    target_behavior: str,
    hypothesis_data: str,
    strategies_data: str,
    school_crisis_protocol: str = "",
    behavior_logs: list = None,
    mode: str = "detailed",
    medication_status: str = "",
    reinforcer_info: str = "",
    other_considerations: str = "",
    evidence_summary: dict = None,
) -> str:
    """
    Generate the same 11-field BIP contract in two reading depths.

    ``compact`` is used by FBA/BIP관리 for a short editable first draft.
    ``detailed`` is used by AI BIP 제안 받기 for classroom-ready guidance.
    """
    behavior_logs = behavior_logs or []
    gate = fba_data_gate(len(behavior_logs))
    if not gate["eligible"]:
        return gate["notice"]

    mode = "compact" if mode == "compact" else "detailed"
    evidence_summary = evidence_summary or build_fba_evidence_summary(
        _redact_dict_name(student_info), behavior_logs
    )
    # evidence_summary may arrive pre-built by a caller that used an
    # un-redacted student_info (e.g. bip.py endpoints) — strip its embedded
    # student_profile.name too, regardless of where it came from.
    if isinstance(evidence_summary, dict) and isinstance(evidence_summary.get("student_profile"), dict):
        evidence_summary = {**evidence_summary, "student_profile": _redact_dict_name(evidence_summary["student_profile"])}
    evidence_json = json.dumps(evidence_summary, ensure_ascii=False, separators=(",", ":"))

    if mode == "compact":
        depth_rules = """- 쉽고 짧은 최초 초안이다.
- 1~6, 8~11번은 각각 1~3개 불릿, 불릿당 한 문장으로 쓴다.
- 7번은 지정된 10개 항목을 빠짐없이 쓰되 각 항목은 한 문장으로 쓴다.
- 전체 분량은 약 1,800자 이내로 압축한다."""
    else:
        depth_rules = """- 교사가 보고 바로 실행할 수 있는 쉽고 상세한 제안이다.
- 가장 먼저 1~11번과 위기지원 10개 항목을 모두 완성한다. 번호 누락은 가장 큰 오류다.
- 1~6, 8~11번은 각각 1~3개 불릿으로 쓰고, 상황·교사 행동·학생 반응·확인 기준을 압축한다.
- 7번은 지정된 10개 항목마다 관찰 기준과 실행 행동을 1~2문장으로 쓴다.
- 전문용어는 쉬운 뜻을 함께 쓰며 전체 분량은 약 3,200자 이내로 제한한다."""

    prompt = f"""[출력 목적] {"FBA/BIP관리의 짧은 AI 초안" if mode == "compact" else "AI BIP 제안 받기의 쉽고 상세한 제안"}
[학생 정보] {json.dumps(_redact_dict_name(student_info), ensure_ascii=False)}
[위기행동 전체 근거 요약] {evidence_json}
[기존 표적행동 요약] {target_behavior}
[기존 잠정 기능가설] {hypothesis_data}
[사용자 입력 정보]
- 약물 복용 현황: {medication_status or "미입력"}
- 강화제 정보: {reinforcer_info or "미입력"}
- 기타 고려사항: {other_considerations or "미입력"}
[학교 위기 프로토콜] {school_crisis_protocol or "학교 절차 확인 필요"}

[지시사항]
1. 별도 ABC 문항이 없는 자료다. 특기사항(기타) 서술과 추정기능·행동유형·강도·횟수·시간대·장소·안전사건을 교차하여 잠정 기능가설을 세운다.
2. 데이터에 없는 선행사건·후속결과·의사소통 방식·약물·강화제·가정 정보는 만들지 말고 `미상 — 확인 필요`로 쓴다.
3. 단일 기능으로 확정하지 말고, 행동형태·상황별 다중통제 가능성과 직접관찰 확인 항목을 반영한다.
4. 예방→대체행동 교수→강화가 동일한 잠정 기능에 연결되게 한다. 의사소통 방식이 미상이면 그림·몸짓·AAC·말 중 학생이 가장 쉽고 빠르게 사용할 방식을 평가하도록 쓴다.
5. 자해·공격·물건파괴 위험에는 소거 단독을 제안하지 않는다. 최고조에서는 안전 확보와 자극 축소를 우선한다.
6. 약물은 사용자가 입력한 사실만 옮기고 조정·중단을 제안하지 않는다.

[분량 규칙]
{depth_rules}

[출력 형식 — 제목 문구, 번호, 순서를 정확히 지키고 다른 앞뒤 문구를 붙이지 말 것]
### 1. 표적행동
(내용)

### 2. 가설(기능)
(잠정 가설, 근거, 확인 필요 사항)

### 3. 목표
(측정 가능한 단기·장기 목표)

### 4. 예방 전략
(내용)
#### 📚 EBP 추가
(기능에 맞는 EBP 이름과 쉬운 적용법)

### 5. 교수 전략
(내용)
#### 📚 EBP 추가
(기능적으로 같은 결과를 얻는 대체행동 교수 EBP)

### 6. 강화 전략
(내용)
#### 📚 EBP 추가
(기능에 맞는 강화 EBP와 전달 기준)

### 7. 위기행동지원 전략
#### 🚨 위기행동지원절차
- **전조:** (내용)
- **고조:** (내용)
- **알림:** (내용)
- **장소/이동방법:** (내용)
- **관찰 방법:** (내용)
- **호명반응 확인 방법:** (내용)
- **지시 목록:** (내용)
- **회복대화 방법:** (내용)
- **복귀의사 방법:** (내용)
- **복귀 후 반응:** (내용)

### 8. 평가 계획(Tier3 졸업 기준 포함)
(측정항목·검토주기·수정기준·Tier3 졸업기준)

### 9. 약물 복용 현황
(사용자 입력만 반영)

### 10. 강화제 정보
(사용자 입력과 선호도 재평가 방법)

### 11. 기타 고려사항
(의사소통·감각·건강·환경·팀 역할 중 자료로 확인된 내용과 확인 필요 사항)"""

    # Keep both modes finishable inside the three-minute local-model window.
    raw_result = _call_llm(
        COMMON_BCBA_SYSTEM_PROMPT,
        prompt,
        1600 if mode == "compact" else 2000,
    )
    return _ensure_bip_output_contract(
        raw_result,
        target_behavior=target_behavior,
        hypothesis_data=hypothesis_data,
        medication_status=medication_status,
        reinforcer_info=reinforcer_info,
        other_considerations=other_considerations,
    )


def generate_iep_team_minutes_draft(
    student_info: dict, period_data: str, screen_summary: str, current_bip: str,
    ebp_selections: str, team_notes: str, choice: str = "", data_notice: str = ""
) -> str:
    """개별화교육지원팀 협의회 실시 전 협의록 초안(학생 1명). 자료 수치만 근거로 쓰고 결정은 [협의 필요]로 남긴다."""
    prompt = f"""[학생] {json.dumps(_redact_dict_name(student_info), ensure_ascii=False)}
[화면 자료 요약(위기행동·표적행동 기록)]
{screen_summary or "(없음)"}
[기간 행동 자료]
{period_data}
[현재 BIP]
{current_bip or "(작성된 BIP 없음)"}
[EBP·실행충실도]
{ebp_selections or "(없음)"}
[지난 협의 기록]
{team_notes or "(없음)"}
[담임이 고른 결정 선택지] {choice or "(미선택)"}
[자료 한계] {data_notice or "(없음)"}

[지시사항]
개별화교육지원팀(담임·부담임·교과·지원인력·보호자·관리자) 협의회를 열기 전에 미리 읽을 협의록 초안을 작성하라.
형식(개조식 '~함', 한 줄 55자 이내, ** 금지):
■ 개별화교육지원팀 협의록(초안) — 학생코드
- 일시·장소·참석자: 빈칸(회의에서 기입)
Ⅰ. 현재까지 자료 요약(수치 인용 5줄 이하, 지난 협의 이후 변화 포함)
Ⅱ. 협의 안건
 1. 중재 효과 판단(자료-BIP 일치 여부)
 2. 실행충실도와 장애 요인
 3. 다음 단계 결정(유지·수정·단계 조정·의뢰)
 4. 가정 연계와 구성원별 역할
 각 안건: 가. 현황 / 나. 협의할 점(질문 1~2개) / 다. 결정(안) [협의 필요] / 라. 담당·기한
Ⅲ. 다음 점검일(안)
자료에 없는 사실·수치는 만들지 말고 '확인 필요'로 쓴다. 지난 협의에서 정한 사항이 지켜졌는지 확인 항목을 넣는다."""
    return (_call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 2500) or "").replace("**", "")


def generate_data_based_decision_recommendation(
    student_info: dict,
    period_data: str,
    current_bip: str,
    ebp_selections: str,
    team_notes: str
) -> str:
    """
    설정 기간 데이터 + 현재 BIP + 개별화교육지원팀 협의 내용(충실도 포함)을 종합하여
    데이터기반 의사결정(DBDM) 제안을 생성한다.
    """
    prompt = f"""[학생 정보] {json.dumps(_redact_dict_name(student_info), ensure_ascii=False)}

[현재 설정 기간 행동 데이터 요약]
{period_data}

[현재 BIP(행동중재계획) 내용]
{current_bip or "(작성된 BIP 없음)"}

[교사가 선택/입력한 EBP 전략 및 실행충실도 체크포인트]
{ebp_selections or "(선택된 EBP 없음)"}

[개별화교육지원팀 협의 누적 기록]
{team_notes or "(협의 기록 없음)"}

[지시사항]
위 4가지 자료(기간 데이터, 현재 BIP, EBP 실행충실도, 팀 협의 기록)를 종합하여 데이터기반 의사결정(Data-Based Decision Making) 제안을 작성하라.

[필수 반영 지침]
1. 현재 BIP와 실제 데이터 추이가 일치하는지(효과 있음) 불일치하는지(효과 없음/악화) 먼저 판단하라.
2. EBP 실행충실도 체크포인트 내용을 근거로, 효과 부진이 '전략 자체의 한계'인지 '실행충실도 부족'인지 구분하라.
3. 팀 협의 기록에 언급된 우려나 합의사항이 데이터와 상충하는 지점이 있다면 짚어라.
4. 다음 중 하나로 명확히 제안하라: (a) 현재 BIP/EBP 유지, (b) 특정 EBP 교체/추가, (c) 실행충실도 개선 조치, (d) Tier 조정(하향/상향) 검토.
5. 다음 개별화교육지원팀 회의에서 바로 결정할 수 있도록 실행 가능한 조치 3개 이하로 압축하라.

[출력 형식]
소제목 없이 다음 4개 항목만 순서대로, 각 항목 2~3문장으로 작성하라:
1) 데이터-BIP 일치도 판단
2) 원인 분석 (전략 한계 vs 실행충실도)
3) 팀 협의와의 정합성
4) 제안 (다음 조치)"""

    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 1800)


# ------------------------------------------------------------------------------
# ⑩ 🤖 신규: 학급 또래 행동 전염 AI 심층 분석
# ------------------------------------------------------------------------------
FBA_REPORT_SECTIONS = [
    "의뢰 사유 및 배경 정보",
    "표적행동 정의",
    "자료 수집 방법 및 기간",
    "자료 분석 결과",
    "기능 가설",
    "결론 및 중재 방향",
]


DOCUMENT_SPECS = {
    "medical": ("의료협력 의뢰서", ["의뢰 사유", "행동 요약", "지금까지의 중재와 반응", "복용 약물·건강 상태", "의료진께 요청하는 사항"],
                "의사가 읽는 문서다. 약물·진단은 교사 입력에 있는 것만 쓰고, 없으면 '확인 필요'로 쓴다. 5절은 의료진이 판단할 질문 2~3개를 번호 없이 줄로 쓴다."),
    "support": ("추가 지원 신청서", ["신청 사유", "행동 요약", "지금까지의 중재와 결과", "필요한 지원 내용", "기대 효과와 평가 방법"],
                "관리자·교육청이 읽는 문서다. 4절은 인력·공간·전문가 자문·교구 중 근거가 있는 것만 구체적으로(누가·언제·얼마나) 쓰고, 5절에는 지원을 줄이거나 끝낼 수치 기준을 쓴다."),
    "progress": ("개별학생 행동중재 결과 보고서", ["중재 실행 현황", "종합 의견", "향후 계획"],
                 "1절은 교사가 준 중재 전·후 수치를 그대로 옮기고 해석을 덧붙이지 않는다. 2절은 효과·실행충실도·한계를 쓴다. 3절은 유지·수정·종료·의뢰 중 근거 있는 방향 1개와 다음 점검 시점을 쓴다."),
}


def generate_document_draft(kind: str, student_info: dict, evidence_summary: dict, context: str = "", sample_size: int = 0) -> str:
    """의료협력의뢰서·추가지원신청서·중재 결과 보고서 초안 — 누적 행동기록 요약과 교사 입력만으로 쓴다."""
    gate = fba_data_gate(sample_size)
    if not gate["eligible"]:
        return gate["notice"]
    title, secs, extra = DOCUMENT_SPECS[kind]
    sections = "\n".join(f"{i}. {t}" for i, t in enumerate(secs, 1))
    prompt = f"""[학생 정보] {json.dumps(_redact_dict_name(student_info), ensure_ascii=False)}
[누적 행동기록 근거 요약(결정론적 집계)] {json.dumps(evidence_summary, ensure_ascii=False)[:10000]}
[교사가 입력한 계획·수치·맥락] {context[:6000] or '없음'}

[지시사항]
위 자료만으로 '{title}' 초안을 작성하라. 아래 절 제목을 번호와 함께 그대로 쓰고, 각 절은 개조식 2~5줄로 쓴다.
{sections}

[작성 규칙]
1. 자료에 없는 사실·수치·진단명·약물명은 만들지 않고 '확인 필요'로 쓴다.
2. 행동은 관찰·측정 가능한 용어와 숫자(건수, 기간, 강도)로 쓴다.
3. {extra}
4. 학생 이름은 쓰지 말고 '대상 학생'으로 쓴다. 문체는 '~함', '~임'으로 끝낸다."""
    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 2000)


def generate_fba_report(student_info: dict, evidence_summary: dict, teacher_context: str = "", sample_size: int = 0) -> str:
    """FBA 결과 보고서 초안 — 누적 행동기록 근거 요약만으로 6개 절을 쓴다(없는 사실은 만들지 않는다)."""
    gate = fba_data_gate(sample_size)
    if not gate["eligible"]:
        return gate["notice"]
    sections = "\n".join(f"{i}. {t}" for i, t in enumerate(FBA_REPORT_SECTIONS, 1))
    prompt = f"""[학생 정보] {json.dumps(_redact_dict_name(student_info), ensure_ascii=False)}
[누적 행동기록 근거 요약(결정론적 집계)] {json.dumps(evidence_summary, ensure_ascii=False)[:12000]}
[교사가 입력한 기존 계획·맥락] {teacher_context[:3000] or '없음'}

[지시사항]
위 자료만으로 기능적 행동평가(FBA) 결과 보고서 초안을 작성하라. 아래 6개 절 제목을 번호와 함께 그대로 쓰고, 각 절은 개조식 3~6줄로 쓴다.
{sections}

[작성 규칙]
1. 표적행동은 관찰·측정 가능한 용어로 정의한다(빈도·지속시간·강도 기준 포함).
2. 4절에는 기록 건수, 관찰일수, 평균·최대 강도, 많이 발생한 장소·시간대·행동유형을 숫자로 쓴다.
3. 5절은 "(상황)일 때 (행동)을 하고 (결과)를 얻는다/피한다" 형식의 잠정 기능가설로 쓰고, 근거 수치를 붙인다.
4. 자료에 없는 선행사건·후속결과·진단명은 만들지 말고 '별도 기록 없음'으로 쓴다.
5. 6절에는 경기 Be-Able EBP 이름으로 예방·교수·강화 방향을 1줄씩 제시하고, 확인 관찰 방법 1개를 쓴다.
6. 학생 이름은 쓰지 말고 '대상 학생'으로 쓴다. 문체는 '~함', '~임'으로 끝낸다."""
    return _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 2500)
