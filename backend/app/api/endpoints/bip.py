from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.services.normalize import normalize_behavior_log
from app.services.ai_insight import (
    generate_bip_hypothesis,
    generate_bip_strategies,
    generate_full_bip
)

router = APIRouter()

class BIPData(BaseModel):
    StudentCode: str
    TargetBehavior: Optional[str] = ""
    AntecedentTriggers: Optional[str] = ""
    SettingEvents: Optional[str] = ""
    EstimatedFunction: Optional[str] = ""
    FunctionalHypothesis: Optional[str] = ""
    BehaviorGoal: Optional[str] = ""
    AntecedentInterventions: Optional[str] = ""
    TeachingInterventions: Optional[str] = ""
    ConsequenceInterventions: Optional[str] = ""
    CrisisManagementPlan: Optional[str] = ""
    EvaluationPlan: Optional[str] = ""
    MedicationStatus: Optional[str] = ""
    ReinforcerInfo: Optional[str] = ""
    OtherConsiderations: Optional[str] = ""

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
async def get_student_bip(student_code: str):
    from app.services.sheets import get_bip
    result = get_bip(student_code)
    if result is None:
        return {"StudentCode": student_code, "TargetBehavior": "", "Hypothesis": "", "Goals": ""}
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.post("/students/{student_code}/bip")
async def save_student_bip(student_code: str, data: BIPData):
    from app.services.sheets import save_bip
    if data.StudentCode != student_code:
        raise HTTPException(status_code=400, detail="Student Code mismatch")
    
    result = save_bip(data.dict())
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ============================================================
# AI BIP Endpoints
# ============================================================

@router.post("/students/{student_code}/ai-hypothesis")
async def ai_bip_hypothesis(student_code: str):
    """⑦ 🤖 AI 기능적 가설 생성 (BIP Step 4)"""
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
    
    # 텍스트 및 데이터 종합
    target_behaviors = list(dict.fromkeys([l["behavior_type"] for l in norm_logs]))
    tb_str = ", ".join(target_behaviors) if target_behaviors else "수업 방해 및 과제 불응"
    
    antecedents = list(dict.fromkeys([f"{l['location']} ({','.join(l['time_slot_labels'])})" for l in norm_logs[:5]]))
    ant_str = "; ".join(antecedents) if antecedents else "과제 제시 및 교실 일과 상황"
    
    functions = list(dict.fromkeys([','.join(l['function_labels']) for l in norm_logs if l['function_labels']]))
    func_str = ", ".join(functions) if functions else "불편해소 또는 과제회피"
    
    notes_list = [l["notes"] for l in norm_logs if l.get("notes")]
    notes_summary = " / ".join(notes_list[:5])
    
    result = generate_bip_hypothesis(
        student_info=student_info,
        target_behavior=tb_str,
        antecedent_data=ant_str,
        function_data=func_str,
        notes_summary=notes_summary,
        sample_size=len(norm_logs)
    )
    return {"hypothesis": result}


class AIStrategiesRequest(BaseModel):
    target_behavior: str = ""
    hypothesis: str = ""
    goals: str = ""

@router.post("/students/{student_code}/ai-strategies")
async def ai_bip_strategies(student_code: str, req: AIStrategiesRequest):
    """⑧ 🤖 AI 3단계 중재 전략 제안 (BIP Step 6)"""
    from app.services.sheets import fetch_student_status
    
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
            
    result = generate_bip_strategies(
        student_info=student_info,
        target_behavior=req.target_behavior or "표적행동",
        hypothesis_data=req.hypothesis or "가설 데이터",
        function_data=req.goals or "추정 기능"
    )
    return {"strategies": result}


class AIBIPFullRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    medication_status: str = ""
    reinforcer_info: str = ""
    other_considerations: str = ""

@router.post("/students/{student_code}/ai-bip-full")
async def ai_bip_full(student_code: str, req: AIBIPFullRequest):
    """⑨ 🤖 AI BIP 전체 계획서 제안 (BIP Step 12)"""
    from app.services.sheets import fetch_all_records, fetch_student_status, normalize_date_string
    
    beable_code = _resolve_beable_code(student_code)
    records = fetch_all_records()
    raw_logs = _filter_student_logs(records, student_code, beable_code)
    
    if req.start_date and req.end_date:
        sd = normalize_date_string(req.start_date)
        ed = normalize_date_string(req.end_date)
        raw_logs = [r for r in raw_logs if sd <= normalize_date_string(r.get("발생날짜", r.get("date", ""))) <= ed]
        
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
    
    if not norm_logs:
        return {"analysis": "INSUFFICIENT_DATA: 행동 관찰 기록이 부족하여 기능적 가설 및 BIP를 자동 생성할 수 없습니다. 직접 관찰 기록을 먼저 수집해 주세요."}
        
    tb_list = list(dict.fromkeys([l["behavior_type"] for l in norm_logs]))
    avg_int = round(sum(l['intensity'] for l in norm_logs)/len(norm_logs), 1) if norm_logs else 0
    target_behavior = f"{', '.join(tb_list)} (평균 강도 {avg_int}/5, 누적 {len(norm_logs)}건)"
    
    func_list = list(dict.fromkeys([','.join(l['function_labels']) for l in norm_logs if l['function_labels']]))
    hypothesis_data = f"관찰된 추정 기능: {', '.join(func_list)}" if func_list else "기능 미상 (추가 FBA 직접 관찰 필요)"
        
    result = generate_full_bip(
        student_info=student_info,
        target_behavior=target_behavior,
        hypothesis_data=hypothesis_data,
        strategies_data=f"건강/복약 관찰: {req.medication_status}, 선호강화제: {req.reinforcer_info}, 기타: {req.other_considerations}",
        school_crisis_protocol="경은학교 위기관리 4단계 프로토콜 (전조-고조-위기-회복 및 최소제한원칙 준수)",
        behavior_logs=norm_logs
    )
    
    return {"analysis": result}
