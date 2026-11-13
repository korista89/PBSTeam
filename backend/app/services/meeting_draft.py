# 협의회 실시 전 초안: 학교행동중재지원팀(전교 자료)·학급 협의회(학급 자료).
# 자료 수치는 코드가 계산하고, AI는 안건별 문장만 쓴다. AI가 실패하면 수치만 채운 초안을 돌려준다.
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

# (차수, 시한(월, 일), 시기, 핵심 초점, 안건 4개) — 학교행동중재지원팀 연간 운영 일정
SCHOOL_SESSIONS = [
    (1, (3, 10), "3월 초", "학년 초 체계 가동", ["학년도 학교행동중재지원계획(안) 검토 및 확정", "조직 구성 및 구성원별 역할 확인", "전년도 단계별 지원 대상자 승계 및 보호자 동의 일정", "학년 초 적응기 위기행동 대응 체계 점검"]),
    (2, (3, 31), "3월 말", "첫 데이터 분석", ["3월 지원 내용 공유", "3월 행동데이터 분석 및 개별학생교육지원 현황", "단계별 지원 대상자 검토 및 조정", "2단계·3+단계 프로그램 배정 및 외부 강사 매칭"]),
    (3, (4, 30), "4월 말", "중재 본격 실행", ["4월 지원 내용 및 4월 행동데이터 공유", "CICO 4주 점검 결과", "3단계 FBA·BIP 수립 현황", "5월 행사(체험학습, 운동회) 대비 예방 전략"]),
    (4, (5, 31), "5월 말", "행사 영향 점검", ["5월 행동데이터 공유 및 행사 영향 분석", "BIP 실행충실도 점검 결과", "교직원·학부모 연수 결과 공유", "강화제 재평가 및 토큰 교환소 품목 조정"]),
    (5, (6, 30), "6월 말", "1학기 충실도 점검", ["6월 행동데이터 공유", "1학기 보편적 지원 실행충실도 점검 결과", "3+단계 프로그램 종료 결과 및 후속 지원", "여름철 컨디션 관리 및 단계 하향 검토"]),
    (6, (7, 25), "7월 방학 전", "1학기 마무리", ["1학기 행동데이터 종합 분석", "방학 중 가정 연계 지원", "2학기 지원 대상 예비 검토", "방학 중 환경 정비 및 개별학생교육지원 집계 점검"]),
    (7, (8, 20), "8월 개학 직후", "2학기 초 재적응", ["개학 첫 주 행동 관찰 결과", "기대행동 재교수(부스터) 계획", "2학기 단계별 지원 대상 확정", "2학기 교직원 연수(FBA·BIP) 계획"]),
    (8, (8, 31), "8월 말", "전입생 선별·BIP 조정", ["개학 2주 행동데이터 공유", "전입생 선별 관찰 결과", "2학기 BIP 수정 대상 검토", "3+단계 2학기 대상 선정 및 추석 연휴 대비"]),
    (9, (9, 30), "9월 말", "연휴 영향·하향 검토", ["9월 행동데이터 공유", "2학기 의사소통 프로그램 운영 현황", "단계 하향 대상 검토", "10월 위기행동 지원 연수 준비"]),
    (10, (10, 31), "10월 말", "기준 변경·행사 대비", ["10월 행동데이터 공유", "개별학생교육지원비 지급 기준 변경 심의 결과 공유", "단계별 지원 대상자 검토 및 조정", "11월 학교 축제 대비 예방 전략"]),
    (11, (11, 30), "11월 말", "연간 평가 준비", ["11월 행동데이터 공유", "SAS(PBIS 자가평가설문) 및 만족도 조사 실시 계획", "2학기 실행충실도 점검 결과", "차년도 학교행동중재지원계획 개선 의견 수렴"]),
    (12, (12, 31), "12월 말", "연간 결과·차년도 계획", ["연간 행동데이터 및 SAS 결과 분석", "개별학생교육지원비 지급 확정", "차년도 연속 지원 대상 명단 확정", "차년도 학교행동중재지원계획 개선 방향 및 겨울방학 가정 연계"]),
]

CLASS_AGENDA = [
    "학급 행동데이터 공유(지난 협의 이후)",
    "학급 기대행동·토큰 강화 운영 점검",
    "CICO·개별 지원 학생 진행 상황과 단계 조정",
    "다음 기간 예방 전략과 구성원별 역할 분담",
]
SCHOOL_ATTENDEES = "학교행동중재지원팀(관리자, PBS 코디네이터, 학년부장, 특수교육지도사·상담 담당 등)"
CLASS_ATTENDEES = "학급 담임, 부담임, 교과담당교사, 지원인력(특수교육지도사·사회복무요원)"


def _school_year(d: date) -> int:
    return d.year if d.month >= 3 else d.year - 1


def _due(session, sy: int) -> date:
    m, day = session[1]
    return date(sy, m, day)


def pick_session(today: date) -> int:
    """오늘 이후 가장 가까운 차수(1~2월은 12차)."""
    sy = _school_year(today)
    for s in SCHOOL_SESSIONS:
        if _due(s, sy) >= today:
            return s[0]
    return 12


def session_info(no: int, today: date) -> Dict[str, Any]:
    """차수 정보와 기본 자료 기간(직전 차수 다음 날 ~ 오늘)."""
    s = SCHOOL_SESSIONS[no - 1]
    sy = _school_year(today)
    start = date(sy, 3, 1) if no == 1 else _due(SCHOOL_SESSIONS[no - 2], sy) + timedelta(days=1)
    if start > today:
        start = today - timedelta(days=30)
    return {"no": no, "when": s[2], "focus": s[3], "agenda": list(s[4]),
            "period_start": start.isoformat(), "period_end": today.isoformat()}


def _top(items: list, n: int = 3) -> List[str]:
    return [f"{i.get('name')} {i.get('value')}건" for i in (items or [])[:n]]


def build_facts(start: str, end: str, class_id: Optional[str]) -> Dict[str, Any]:
    """협의 근거 수치. 학생은 코드로만 적는다."""
    from app.services.analysis import get_analytics_data
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    span = (d1 - d0).days + 1
    cur = get_analytics_data(start, end, class_id=class_id)
    prev = get_analytics_data((d0 - timedelta(days=span)).isoformat(), (d0 - timedelta(days=1)).isoformat(), class_id=class_id)
    s, ps = cur.get("summary", {}), prev.get("summary", {})
    facts: Dict[str, Any] = {
        "기간": f"{start} ~ {end}",
        "위기행동": f"{s.get('total_incidents', 0)}건(직전 같은 기간 {ps.get('total_incidents', 0)}건), 평균 강도 {s.get('avg_intensity', 0)}",
        "개별학생교육지원": f"{s.get('individual_support_count', 0)}건(직전 {ps.get('individual_support_count', 0)}건)",
        "지원 단계 인원": f"재학 {s.get('enrolled_count', 0)}명 · 2단계 CICO {s.get('tier2_cico_count', 0)}명 · SST {s.get('tier2_sst_count', 0)}명 · 3단계 {s.get('tier3_count', 0)}명 · 3+단계 {s.get('tier3_plus_count', 0)}명",
        "많은 행동": _top(cur.get("big5", {}).get("behaviors")),
        "많은 장소": _top(cur.get("big5", {}).get("locations")),
        "많은 시간대": _top(cur.get("big5", {}).get("times")),
        "추정 기능": _top(cur.get("functions")),
        "기록 많은 학생": [f"{r.get('student_code')}({r.get('tier', '')}) {r.get('count')}건, 최고 강도 {r.get('max_intensity')}" for r in (cur.get("risk_list") or [])[:5]],
        "강도 5 또는 안전 경보": len(cur.get("safety_alerts") or []),
    }
    try:
        from app.services.sheets import get_cico_report_data
        from app.api.deps import get_student_class_code
        rep = get_cico_report_data(d1.month)
        rows = [r for r in rep.get("students", []) if not class_id or get_student_class_code(str(r.get("code", ""))) == class_id]
        facts["CICO"] = [f"{r.get('code')} {r.get('target_behavior') or '목표 미설정'} 수행률 {r.get('rate') or '-'} → {r.get('decision') or '-'}" for r in rows]
    except Exception:
        facts["CICO"] = []
    return facts


def fallback_draft(title: str, attendees: str, agenda: List[str], facts: Dict[str, Any]) -> str:
    lines = [f"■ {title} 협의록(초안)", f"- 대상 기간: {facts['기간']}", f"- 참석자: {attendees}", "", "Ⅰ. 현황 자료"]
    for k, v in facts.items():
        if k == "기간":
            continue
        lines.append(f"- {k}: " + (", ".join(v) if isinstance(v, list) else str(v)) if v else f"- {k}: 없음")
    lines += ["", "Ⅱ. 안건별 협의"]
    for i, a in enumerate(agenda, 1):
        lines += [f"{i}. {a}", "  가. 현황: ", "  나. 협의 내용: ", "  다. 결정 사항: ", "  라. 담당·기한: ", ""]
    return "\n".join(lines)


def generate_draft(title: str, attendees: str, agenda: List[str], facts: Dict[str, Any], audience: str) -> str:
    import json
    from app.services.ai_insight import COMMON_BCBA_SYSTEM_PROMPT, _call_llm
    prompt = f"""[협의회] {title}
[참석자] {attendees}
[안건] {json.dumps(agenda, ensure_ascii=False)}
[현황 자료(코드 계산, 학생은 코드)] {json.dumps(facts, ensure_ascii=False)}

[지시사항]
{audience} 협의회를 열기 전에 구성원이 미리 읽고 회의에서 바로 결정할 수 있는 협의록 초안을 작성하라.
1. 형식: 제목·대상 기간·참석자 → Ⅰ. 현황 요약(5줄 이하) → Ⅱ. 안건별 협의.
2. 안건마다 "가. 현황(자료 수치 인용) / 나. 협의할 점(질문 형태 1~2개) / 다. 결정(안) / 라. 담당·기한" 4칸을 쓴다.
3. 결정(안)은 실행 행동으로 쓰고 끝에 [협의 필요]를 붙인다. 자료에 없는 사실·수치·이름은 만들지 않는다. 자료가 없는 안건은 "자료 없음 — 회의에서 보고"라고 쓴다.
4. 개조식 '~함' 종결, 한 줄 55자 이내. 마크다운 굵게(**) 쓰지 않는다."""
    text = _call_llm(COMMON_BCBA_SYSTEM_PROMPT, prompt, 3000) or ""
    if not text.strip() or text.lstrip().startswith("⚠"):
        return fallback_draft(title, attendees, agenda, facts)
    return text.replace("**", "")
