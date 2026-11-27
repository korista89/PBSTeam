import json
from app.services.sheets import tier_label
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, Literal
from app.services.normalize import normalize_behavior_log
from app.services.ai_insight import (
    generate_bip_hypothesis,
    generate_bip_strategies,
    generate_full_bip,
    generate_data_based_decision_recommendation,
    generate_fba_report,
)
from app.services.fba_evidence import build_fba_evidence_summary, fba_data_gate
from app.api.deps import require_authenticated_user, check_student_scope
from app.services.zero_pii import ensure_analyzable

router = APIRouter()

class BIPData(BaseModel):
    StudentCode: str
    TargetBehavior: Optional[str] = ""
    Hypothesis: Optional[str] = ""
    Goals: Optional[str] = ""
    PreventionStrategies: Optional[str] = ""
    TeachingStrategies: Optional[str] = ""
    ReinforcementStrategies: Optional[str] = ""
    CrisisPlan: Optional[str] = ""
    EvaluationPlan: Optional[str] = ""
    MedicationStatus: Optional[str] = ""
    ReinforcerInfo: Optional[str] = ""
    OtherConsiderations: Optional[str] = ""
    UpdatedAt: Optional[str] = ""
    Author: Optional[str] = ""
    PreventionEBP: Optional[str] = ""
    TeachingEBP: Optional[str] = ""
    ConsequenceEBP: Optional[str] = ""
    CrisisEBP: Optional[str] = ""
    # 학교 BIP 양식 칸 + FBA·결과 보고서(JSON 문자열)
    PlanName: Optional[str] = ""
    PlanStart: Optional[str] = ""
    PlanEnd: Optional[str] = ""
    Teacher: Optional[str] = ""
    Gender: Optional[str] = ""
    DisabilityType: Optional[str] = ""
    MedicationYN: Optional[str] = ""
    OperationalDefinition: Optional[str] = ""
    MeasurementMethod: Optional[str] = ""
    SupportTeam: Optional[str] = ""
    CrisisNotify: Optional[str] = ""
    CrisisReturn: Optional[str] = ""
    CrisisHome: Optional[str] = ""
    HomeSupport: Optional[str] = ""
    FBAReport: Optional[str] = ""
    ProgressReport: Optional[str] = ""
    Source: Optional[str] = ""
    # 학교 '행동중재계획서' 양식(2026-2) 칸
    AuthoredDate: Optional[str] = ""
    Antecedents: Optional[str] = ""
    Consequences: Optional[str] = ""
    CrisisS1: Optional[str] = ""
    CrisisR1: Optional[str] = ""
    CrisisS2: Optional[str] = ""
    CrisisR2: Optional[str] = ""
    CrisisS3: Optional[str] = ""
    CrisisR3: Optional[str] = ""
    CrisisS4: Optional[str] = ""
    CrisisR4: Optional[str] = ""
    AdditionalSupport: Optional[str] = ""

def _resolve_beable_code(student_code: str) -> str:
    from app.services.sheets import get_beable_code_mapping
    mapping = get_beable_code_mapping()
    for bc, info in mapping.items():
        if str(info.get('student_code', '')).strip() == student_code.strip():
            return bc
    return student_code

def _filter_student_logs(records: list, student_code: str, beable_code: str = "") -> list:
    codes = {student_code.strip()}
    if beable_code:
        codes.add(beable_code.strip())

    filtered = []
    for r in records:
        sc = str(r.get("student_code", r.get("학생코드", r.get("코드번호", "")))).strip()
        name = str(r.get("student_name", r.get("학생명", ""))).strip()
        if sc in codes or name in codes:
            filtered.append(r)
    return filtered


def _build_student_info(student_code: str, status_records: list) -> Dict[str, Any]:
    for s in status_records:
        if str(s.get("학생코드", "")).strip() == student_code:
            from app.services.normalize import resolve_course_level
            return {
                "code": student_code,
                "name": s.get("학생명", student_code),
                "class": s.get("학급", ""),
                "course_level": resolve_course_level(student_code, s.get("학급", "")),
                "tier": tier_label(s),
            }
    return {"code": student_code, "name": student_code, "class": "", "tier": 1}


@router.get("/students/{student_code}/bip")
def get_student_bip(
    student_code: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(student_code, current_user)
    from app.services.sheets import get_bip
    result = get_bip(student_code)
    if result is None:
        return {"StudentCode": student_code, "TargetBehavior": "", "Hypothesis": "", "Goals": ""}
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.post("/students/{student_code}/bip")
def save_student_bip(
    student_code: str,
    data: BIPData,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(student_code, current_user)
    if data.StudentCode != student_code:
        raise HTTPException(status_code=400, detail="Student Code mismatch")
    
    from app.services.sheets import save_bip
    result = save_bip(data.dict())
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/students/{student_code}/fba-evidence")
def get_student_fba_evidence(
    student_code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Deterministic FBA evidence summary for the profile dashboard — no LLM call.

    Reuses the same evidence packet (build_fba_evidence_summary) that the
    ai-hypothesis/ai-strategies/ai-bip-full/ai-decision-recommendation
    endpoints already compute internally for prompts, so the profile page can
    render frequency/intensity/location/function distributions, ABC-narrative
    coverage, and representative incidents instantly instead of waiting on an
    AI call just to see the underlying numbers.
    """
    check_student_scope(student_code, current_user)
    ensure_analyzable(student_code)  # 2027 모드: 보호자 미동의·철회 학생은 개별 분석 제외
    from app.services.sheets import fetch_all_records, fetch_student_status

    beable_code = _resolve_beable_code(student_code)
    raw_logs = _filter_student_logs(fetch_all_records(), student_code, beable_code)
    if start_date and end_date:  # 인수인계 차트: 올해 기록만 세어 월별 차트와 기준을 맞춘다
        from app.services.sheets import normalize_date_string
        sd, ed = normalize_date_string(start_date), normalize_date_string(end_date)
        raw_logs = [r for r in raw_logs if sd <= normalize_date_string(r.get("행동발생날짜") or r.get("발생날짜") or r.get("date") or "") <= ed]
    student_info = _build_student_info(student_code, fetch_student_status())
    norm_logs = [normalize_behavior_log(r, {student_code: student_info}) for r in raw_logs]

    return build_fba_evidence_summary(student_info, norm_logs)


# ============================================================
# AI BIP Endpoints
# ============================================================

@router.post("/students/{student_code}/ai-hypothesis")
def ai_bip_hypothesis(
    student_code: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑦ 🤖 AI 기능적 가설 생성 (BIP Step 4)"""
    check_student_scope(student_code, current_user)
    ensure_analyzable(student_code)  # 2027 모드: 보호자 미동의·철회 학생은 개별 분석 제외
    from app.services.sheets import fetch_all_records, fetch_student_status
    
    beable_code = _resolve_beable_code(student_code)
    records = fetch_all_records()
    raw_logs = _filter_student_logs(records, student_code, beable_code)
    
    status_records = fetch_student_status()
    student_info = {"code": student_code, "class": "", "tier": 1}
    for s in status_records:
        if str(s.get("학생코드", "")).strip() == student_code:
            student_info = {
                "code": student_code,
                "name": s.get("학생명", student_code),
                "class": s.get("학급", ""),
                "tier": tier_label(s),
            }
            break
            
    norm_logs = [normalize_behavior_log(r, {student_code: student_info}) for r in raw_logs]

    gate = fba_data_gate(len(norm_logs))
    if not gate["eligible"]:
        return {"hypothesis": gate["notice"], **gate}
    
    target_behaviors = list(dict.fromkeys([l["behavior_type"] for l in norm_logs]))
    tb_str = ", ".join(target_behaviors) if target_behaviors else "수업 방해 및 과제 불응"
    
    contexts = list(dict.fromkeys([
        f"{l['location']} ({','.join(l['time_slot_labels']) or '시간대 미상'})"
        for l in norm_logs
    ]))
    ant_str = "; ".join(contexts[:8]) if contexts else "시간대·장소 기록 미상"
    
    functions = list(dict.fromkeys([','.join(l['function_labels']) for l in norm_logs if l['function_labels']]))
    func_str = ", ".join(functions) if functions else "교사 추정기능 미입력"
    
    notes_list = [l["notes"] for l in norm_logs if l.get("notes")]
    notes_summary = " / ".join(note[:250] for note in notes_list[:5])
    
    result = generate_bip_hypothesis(
        student_info=student_info,
        target_behavior=tb_str,
        antecedent_data=ant_str,
        function_data=func_str,
        notes_summary=notes_summary,
        sample_size=len(norm_logs)
    )
    return {"hypothesis": result, **gate}


class AIStrategiesRequest(BaseModel):
    target_behavior: str = ""
    hypothesis: str = ""
    goals: str = ""

@router.post("/students/{student_code}/ai-strategies")
def ai_bip_strategies(
    student_code: str,
    req: AIStrategiesRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑧ 🤖 AI 3단계 중재 전략 제안 (BIP Step 6)"""
    check_student_scope(student_code, current_user)
    ensure_analyzable(student_code)  # 2027 모드: 보호자 미동의·철회 학생은 개별 분석 제외
    from app.services.sheets import fetch_all_records, fetch_student_status
    import json
    
    status_records = fetch_student_status()
    student_info = {"code": student_code}
    for s in status_records:
        if str(s.get("학생코드", "")).strip() == student_code:
            student_info = {
                "code": student_code,
                "name": s.get("학생명", student_code),
                "class": s.get("학급", ""),
                "tier": tier_label(s)
            }
            break

    beable_code = _resolve_beable_code(student_code)
    raw_logs = _filter_student_logs(fetch_all_records(), student_code, beable_code)
    norm_logs = [normalize_behavior_log(r, {student_code: student_info}) for r in raw_logs]
    gate = fba_data_gate(len(norm_logs))
    if not gate["eligible"]:
        return {"strategies": gate["notice"], **gate}
    evidence = build_fba_evidence_summary(student_info, norm_logs)

    result = generate_bip_strategies(
        student_info=student_info,
        target_behavior=req.target_behavior or "표적행동",
        hypothesis_data=req.hypothesis or "가설 데이터",
        function_data=json.dumps(
            {
                "teacher_input": req.goals or "추정 기능 미입력",
                "evidence": evidence["deterministic_metrics"],
                "narrative_coverage": evidence["narrative_and_abc_coverage"],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
    )
    return {"strategies": result, **gate}


class AIFBAReportRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    teacher_context: str = ""


@router.post("/students/{student_code}/ai-fba-report")
def ai_fba_report(
    student_code: str,
    req: AIFBAReportRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """FBA 결과 보고서 초안(6개 절) — 누적 행동기록 근거 요약 기반."""
    check_student_scope(student_code, current_user)
    ensure_analyzable(student_code)  # 2027 모드: 보호자 미동의·철회 학생은 개별 분석 제외
    from app.services.sheets import fetch_all_records, fetch_student_status, normalize_date_string

    raw_logs = _filter_student_logs(fetch_all_records(), student_code, _resolve_beable_code(student_code))
    if req.start_date and req.end_date:
        sd, ed = normalize_date_string(req.start_date), normalize_date_string(req.end_date)
        raw_logs = [r for r in raw_logs if sd <= normalize_date_string(r.get("행동발생날짜") or r.get("발생날짜") or r.get("date") or "") <= ed]
    student_info = _build_student_info(student_code, fetch_student_status())
    norm_logs = [normalize_behavior_log(r, {student_code: student_info}) for r in raw_logs]
    gate = fba_data_gate(len(norm_logs))
    if not gate["eligible"]:
        return {"analysis": gate["notice"], **gate}
    evidence = build_fba_evidence_summary(student_info, norm_logs)
    return {"analysis": generate_fba_report(student_info, evidence, req.teacher_context, len(norm_logs)), **gate}


class AIDocumentDraftRequest(BaseModel):
    kind: Literal["medical", "support", "progress", "handover"]
    context: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@router.post("/students/{student_code}/ai-document-draft")
def ai_document_draft(
    student_code: str,
    req: AIDocumentDraftRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """의료협력의뢰서·추가지원신청서·중재 결과 보고서·다음 학년도 인수인계 자료 초안 — 누적 행동기록 근거 요약 + 화면의 계획·수치."""
    check_student_scope(student_code, current_user)
    ensure_analyzable(student_code)  # 2027 모드: 보호자 미동의·철회 학생은 개별 분석 제외
    from app.services.sheets import fetch_all_records, fetch_student_status, normalize_date_string
    from app.services.ai_insight import generate_document_draft

    raw_logs = _filter_student_logs(fetch_all_records(), student_code, _resolve_beable_code(student_code))
    if req.start_date and req.end_date:
        sd, ed = normalize_date_string(req.start_date), normalize_date_string(req.end_date)
        raw_logs = [r for r in raw_logs if sd <= normalize_date_string(r.get("행동발생날짜") or r.get("발생날짜") or r.get("date") or "") <= ed]
    student_info = _build_student_info(student_code, fetch_student_status())
    norm_logs = [normalize_behavior_log(r, {student_code: student_info}) for r in raw_logs]
    gate = fba_data_gate(len(norm_logs))
    if not gate["eligible"] and req.kind != "handover":  # 인수인계는 기능 추정이 아니라서 Tier2(기록 적음) 학생도 쓴다
        return {"analysis": gate["notice"], **gate}
    evidence = build_fba_evidence_summary(student_info, norm_logs)
    context = req.context
    if req.kind == "handover":
        context = _handover_extra_context(student_code) + "\n" + context
    return {"analysis": generate_document_draft(req.kind, student_info, evidence, context, len(norm_logs)), **gate}



def _tier2_year_lines(student_code: str) -> list:
    """올해 CICO 목표·월별 수행률과 SST 참여(인수인계 근거). 학생정보 및 이해자료는 넣지 않는다."""
    from app.services import tier_monthly as tm
    from app.services.sheets import get_cico_report_data
    lines = []
    try:
        year = tm.student_year(student_code)
    except Exception:
        return lines
    sst = sorted({p for m in year for p in (m.get("sst") or [])})
    if sst:
        lines.append(f"[SST 참여] {', '.join(sst)} (참여 {sum(1 for m in year if m.get('sst'))}개월)")
    goals: dict = {}
    for m in (m["month"] for m in year if m.get("cico")):
        try:
            rows = (get_cico_report_data(m) or {}).get("students", [])
        except Exception:
            continue
        for r in rows:
            if str(r.get("code")) == student_code:
                g = goals.setdefault(r.get("target_behavior", ""), {"type": r.get("behavior_type", ""), "criteria": r.get("goal_criteria", ""), "rates": []})
                g["rates"].append(f"{m}월 {r.get('rate', '-')}{'(달성)' if r.get('achieved') == 'O' else ''}")
                g["decision"] = r.get("decision", "")
    if goals:
        lines.append(f"[CICO 기록 — {sum(1 for m in year if m.get('cico'))}개월]")
        lines += [f"- {k} ({v['type']}, 목표 {v['criteria']}): {', '.join(v['rates'])} / 최근 판정: {v.get('decision', '')}" for k, v in goals.items()]
    return lines


def _handover_extra_context(student_code: str) -> str:
    """인수인계 자료: 화면에 없는 서버 자료(사례 협의 기록·그림말 인증)를 덧붙여, 1년간 기록한 교사가 고칠 게 적도록 한다."""
    from app.services.sheets import fetch_meeting_notes, fetch_student_status
    lines = []
    for s in fetch_student_status() or []:
        if str(s.get("학생코드", "")).strip() == student_code:
            n = str(s.get("그림말인증", "")).strip()
            # 0(인증 없음)을 넘기면 AI가 '인증이 있다'로 잘못 쓴다. 1단계 이상일 때만 넣는다.
            if n and n not in ("0", "0.0") and n[0].isdigit():
                lines.append(f"[의사소통 참고] 그림말누리제 인증 {n}단계(전체 13단계)")
    try:
        notes = fetch_meeting_notes("tier3", student_code)[:8]
    except Exception:
        notes = []
    lines += _tier2_year_lines(student_code)
    if notes:
        lines.append("[사례 협의 기록(최근 순)]")
        lines += [f"- {n.get('date', '')}: {str(n.get('content', ''))[:300]}" for n in notes]
    return "\n".join(lines)


class AIBIPFullRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    medication_status: str = ""
    reinforcer_info: str = ""
    other_considerations: str = ""
    mode: Literal["compact", "detailed"] = "detailed"

@router.post("/students/{student_code}/ai-bip-full")
def ai_bip_full(
    student_code: str,
    req: AIBIPFullRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑨ 🤖 AI BIP 전체 계획서 제안 (BIP Step 12)"""
    check_student_scope(student_code, current_user)
    ensure_analyzable(student_code)  # 2027 모드: 보호자 미동의·철회 학생은 개별 분석 제외
    from app.services.sheets import fetch_all_records, fetch_student_status, normalize_date_string
    
    beable_code = _resolve_beable_code(student_code)
    records = fetch_all_records()
    raw_logs = _filter_student_logs(records, student_code, beable_code)
    
    if req.start_date and req.end_date:
        sd = normalize_date_string(req.start_date)
        ed = normalize_date_string(req.end_date)
        raw_logs = [r for r in raw_logs if sd <= normalize_date_string(r.get("행동발생날짜") or r.get("발생날짜") or r.get("date") or "") <= ed]
        
    status_records = fetch_student_status()
    student_info = {"code": student_code}
    for s in status_records:
        if str(s.get("학생코드", "")).strip() == student_code:
            student_info = {
                "code": student_code,
                "name": s.get("학생명", student_code),
                "class": s.get("학급", ""),
                "tier": tier_label(s)
            }
            break
            
    norm_logs = [normalize_behavior_log(r, {student_code: student_info}) for r in raw_logs]

    gate = fba_data_gate(len(norm_logs))
    if not gate["eligible"]:
        return {"analysis": gate["notice"], **gate}
        
    tb_list = list(dict.fromkeys([l["behavior_type"] for l in norm_logs]))
    avg_int = round(sum(l['intensity'] for l in norm_logs)/len(norm_logs), 1) if norm_logs else 0
    target_behavior = f"{', '.join(tb_list)} (평균 강도 {avg_int}/5, 누적 {len(norm_logs)}건)"
    
    func_list = list(dict.fromkeys([','.join(l['function_labels']) for l in norm_logs if l['function_labels']]))
    hypothesis_data = f"교사 입력 추정 기능: {', '.join(func_list)}" if func_list else "교사 추정기능 미입력 — 특기사항과 구조화 필드 교차검토 필요"

    evidence_summary = build_fba_evidence_summary(student_info, norm_logs)
        
    result = generate_full_bip(
        student_info=student_info,
        target_behavior=target_behavior,
        hypothesis_data=hypothesis_data,
        strategies_data="예방-교수-강화 전략은 잠정 기능가설과 1:1로 연결",
        school_crisis_protocol="경은학교 위기관리계획 4단계(전조 → 고조 → 대응·알림 → 분리·회복), 최소제한원칙 준수",
        behavior_logs=norm_logs,
        mode=req.mode,
        medication_status=req.medication_status,
        reinforcer_info=req.reinforcer_info,
        other_considerations=req.other_considerations,
        evidence_summary=evidence_summary,
    )

    return {"analysis": result, **gate, "mode": req.mode}


class AIDecisionRecommendationRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    summary: Optional[str] = None   # 화면이 계산한 자료 요약(표적행동 기록 포함) — 협의록 초안에 씀
    choice: Optional[str] = None    # 화면에서 고른 결정 선택지


def _decision_context(student_code: str, req: AIDecisionRecommendationRequest):
    """의사결정 제안·팀 협의록 초안 공통 자료: (학생정보, 기간자료 JSON, BIP, EBP, 팀 협의 기록, 기록 수 게이트)."""
    import json
    from app.services.sheets import fetch_all_records, fetch_student_status, fetch_meeting_notes, get_bip, normalize_date_string

    beable_code = _resolve_beable_code(student_code)
    raw_logs = _filter_student_logs(fetch_all_records(), student_code, beable_code)
    if req.start_date and req.end_date:
        sd = normalize_date_string(req.start_date)
        ed = normalize_date_string(req.end_date)
        raw_logs = [r for r in raw_logs if sd <= normalize_date_string(r.get("행동발생날짜") or r.get("발생날짜") or r.get("date") or "") <= ed]

    student_info = {"code": student_code}
    for s in fetch_student_status():
        if str(s.get("학생코드", "")).strip() == student_code:
            student_info = {"code": student_code, "name": s.get("학생명", student_code), "class": s.get("학급", ""), "tier": tier_label(s)}
            break

    norm_logs = [normalize_behavior_log(r, {student_code: student_info}) for r in raw_logs]
    gate = fba_data_gate(len(norm_logs))
    evidence_summary = build_fba_evidence_summary(student_info, norm_logs)
    period_data = json.dumps({
        "period": f"{req.start_date or '전체'} ~ {req.end_date or '전체'}",
        "metrics": evidence_summary["deterministic_metrics"],
        "narrative_coverage": evidence_summary["narrative_and_abc_coverage"],
        "representative_evidence": evidence_summary["representative_evidence_samples"],
    }, ensure_ascii=False, separators=(",", ":"))

    bip = get_bip(student_code) or {}
    skip = {"StudentCode", "UpdatedAt", "Author", "ProgressReport", "Source"}
    current_bip = "\n".join(f"- {k}: {v}" for k, v in bip.items() if k not in skip and v)
    ebp = "\n".join(f"- {k}: {bip.get(k)}" for k in ("PreventionEBP", "TeachingEBP", "ConsequenceEBP", "CrisisEBP") if bip.get(k))
    # 이 학생 사례 협의 기록(개별학생 행동중재 ⑤ 탭에 누적 저장되는 meeting_type)
    notes = fetch_meeting_notes("tier3", student_code)
    team_notes = "\n".join(f"[{n.get('date','')}] {n.get('content','')}" for n in notes[:10])
    return student_info, period_data, current_bip, ebp, team_notes, gate


@router.post("/students/{student_code}/ai-decision-recommendation")
def ai_decision_recommendation(
    student_code: str,
    req: AIDecisionRecommendationRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑩ 🤖 데이터기반 의사결정(DBDM) 제안 — 기간 데이터 + 현재 BIP + EBP 실행충실도 + 팀 협의 기록 종합"""
    check_student_scope(student_code, current_user)
    ensure_analyzable(student_code)  # 2027 모드: 보호자 미동의·철회 학생은 개별 분석 제외
    student_info, period_data, current_bip, ebp, team_notes, gate = _decision_context(student_code, req)
    if not gate["eligible"]:
        return {"analysis": gate["notice"], **gate}
    result = generate_data_based_decision_recommendation(
        student_info=student_info, period_data=period_data, current_bip=current_bip,
        ebp_selections=ebp, team_notes=team_notes)
    return {"analysis": result, **gate}


@router.post("/students/{student_code}/ai-team-minutes-draft")
def ai_team_minutes_draft(
    student_code: str,
    req: AIDecisionRecommendationRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """개별화교육지원팀 협의회 실시 전 협의록 초안 — 지금까지의 이 학생 자료로 안건·현황·결정(안)을 미리 채운다.
    기록이 적어도 초안은 만든다(자료 한계를 초안에 적는다)."""
    check_student_scope(student_code, current_user)
    ensure_analyzable(student_code)  # 2027 모드: 보호자 미동의·철회 학생은 개별 분석 제외
    from app.services.ai_insight import generate_iep_team_minutes_draft
    student_info, period_data, current_bip, ebp, team_notes, gate = _decision_context(student_code, req)
    result = generate_iep_team_minutes_draft(
        student_info=student_info, period_data=period_data, screen_summary=req.summary or "",
        current_bip=current_bip, ebp_selections=ebp, team_notes=team_notes,
        choice=req.choice or "", data_notice="" if gate["eligible"] else gate["notice"])
    return {"draft": result}
