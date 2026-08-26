from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal
from app.services.normalize import normalize_behavior_log
from app.services.ai_insight import (
    generate_bip_hypothesis,
    generate_bip_strategies,
    generate_full_bip,
    generate_data_based_decision_recommendation
)
from app.services.fba_evidence import build_fba_evidence_summary, fba_data_gate
from app.api.deps import require_authenticated_user, check_student_scope

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


@router.get("/students/{student_code}/bip")
async def get_student_bip(
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
async def save_student_bip(
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


# ============================================================
# AI BIP Endpoints
# ============================================================

@router.post("/students/{student_code}/ai-hypothesis")
async def ai_bip_hypothesis(
    student_code: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑦ 🤖 AI 기능적 가설 생성 (BIP Step 4)"""
    check_student_scope(student_code, current_user)
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
                "tier": s.get("Tier", s.get("지원단계", 1)),
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
async def ai_bip_strategies(
    student_code: str,
    req: AIStrategiesRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑧ 🤖 AI 3단계 중재 전략 제안 (BIP Step 6)"""
    check_student_scope(student_code, current_user)
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
                "tier": s.get("Tier", 1)
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


class AIBIPFullRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    medication_status: str = ""
    reinforcer_info: str = ""
    other_considerations: str = ""
    mode: Literal["compact", "detailed"] = "detailed"

@router.post("/students/{student_code}/ai-bip-full")
async def ai_bip_full(
    student_code: str,
    req: AIBIPFullRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑨ 🤖 AI BIP 전체 계획서 제안 (BIP Step 12)"""
    check_student_scope(student_code, current_user)
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
                "tier": s.get("Tier", 1)
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
        school_crisis_protocol="경은학교 위기관리 4단계 프로토콜 (전조-고조-위기-회복 및 최소제한원칙 준수)",
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

@router.post("/students/{student_code}/ai-decision-recommendation")
async def ai_decision_recommendation(
    student_code: str,
    req: AIDecisionRecommendationRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """⑩ 🤖 데이터기반 의사결정(DBDM) 제안 — 기간 데이터 + 현재 BIP + EBP 실행충실도 + 팀 협의 기록 종합"""
    check_student_scope(student_code, current_user)
    from app.services.sheets import fetch_all_records, fetch_student_status, fetch_meeting_notes, get_bip, normalize_date_string

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
                "tier": s.get("Tier", 1)
            }
            break

    norm_logs = [normalize_behavior_log(r, {student_code: student_info}) for r in raw_logs]
    gate = fba_data_gate(len(norm_logs))
    if not gate["eligible"]:
        return {"analysis": gate["notice"], **gate}
    import json
    evidence_summary = build_fba_evidence_summary(student_info, norm_logs)
    period_data = json.dumps(
        {
            "period": f"{req.start_date or '전체'} ~ {req.end_date or '전체'}",
            "metrics": evidence_summary["deterministic_metrics"],
            "narrative_coverage": evidence_summary["narrative_and_abc_coverage"],
            "representative_evidence": evidence_summary["representative_evidence_samples"],
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )

    bip = get_bip(student_code) or {}
    current_bip_str = "\n".join(
        f"- {k}: {v}" for k, v in bip.items()
        if k not in ("StudentCode", "UpdatedAt", "Author") and v
    )
    ebp_str = "\n".join(
        f"- {k}: {bip.get(k)}" for k in ("PreventionEBP", "TeachingEBP", "ConsequenceEBP", "CrisisEBP")
        if bip.get(k)
    )

    notes = fetch_meeting_notes("fba_bip_team", student_code)
    team_notes_str = "\n".join(f"[{n.get('date','')}] {n.get('content','')}" for n in notes)

    result = generate_data_based_decision_recommendation(
        student_info=student_info,
        period_data=period_data,
        current_bip=current_bip_str,
        ebp_selections=ebp_str,
        team_notes=team_notes_str
    )
    return {"analysis": result, **gate}
