# backend/app/api/endpoints/target_behavior.py
"""표적행동(문제행동/목표행동) 데이터 관리 — 담임교사가 정의한 행동을 BIP 적용기간 동안 추적한다.
CICODaily(Tier2 고정 카드형)와는 별개 기능: 여기는 학생 개별로 자유롭게 정의하는 행동을 다룬다."""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.api.deps import require_authenticated_user, check_student_scope
from app.services.sheets import (
    get_target_behaviors, create_target_behavior, update_target_behavior_status,
    add_target_behavior_data, get_target_behavior_data,
    add_target_behavior_fidelity, get_target_behavior_fidelity,
    update_target_behavior_data, delete_target_behavior_data,
    update_target_behavior_fidelity, delete_target_behavior_fidelity,
    fetch_student_status, fetch_all_records, normalize_date_string,
)
from app.services.ai_insight import generate_data_based_decision_recommendation, _redact_dict_name

router = APIRouter()


def _build_student_info(student_code: str) -> Dict[str, Any]:
    for s in fetch_student_status():
        if str(s.get("학생코드", "")).strip() == student_code:
            return {"code": student_code, "name": s.get("학생명", student_code), "class": s.get("학급", "")}
    return {"code": student_code, "name": student_code, "class": ""}


@router.get("/students/{student_code}")
def list_target_behaviors(
    student_code: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(student_code, current_user)
    return {"behaviors": get_target_behaviors(student_code)}


class CreateTargetBehaviorRequest(BaseModel):
    type: str  # "문제행동" | "목표행동"
    definition: str
    measurement_type: str  # "빈도" | "지속시간" | "강도" | "퍼센트"
    baseline: Optional[str] = ""
    bip_start_date: Optional[str] = ""
    bip_end_date: Optional[str] = ""


@router.post("/students/{student_code}")
def add_target_behavior(
    student_code: str,
    req: CreateTargetBehaviorRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(student_code, current_user)
    if req.type not in ["문제행동", "목표행동"]:
        raise HTTPException(status_code=400, detail="type은 '문제행동' 또는 '목표행동'이어야 합니다.")
    author = current_user.get("name") or current_user.get("id") or ""
    result = create_target_behavior({
        "student_code": student_code,
        "type": req.type,
        "definition": req.definition,
        "measurement_type": req.measurement_type,
        "baseline": req.baseline,
        "bip_start_date": req.bip_start_date,
        "bip_end_date": req.bip_end_date,
        "author": author,
    })
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


class UpdateStatusRequest(BaseModel):
    status: str  # "진행중" | "종료"
    student_code: str  # 스코프 확인용


@router.patch("/{behavior_id}")
def patch_target_behavior(
    behavior_id: str,
    req: UpdateStatusRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(req.student_code, current_user)
    if req.status not in ["진행중", "종료"]:
        raise HTTPException(status_code=400, detail="status는 '진행중' 또는 '종료'여야 합니다.")
    result = update_target_behavior_status(behavior_id, req.status)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


class DataPointRequest(BaseModel):
    student_code: str  # 스코프 확인용
    date: str
    value: str
    memo: Optional[str] = ""


@router.post("/{behavior_id}/data")
def submit_data_point(
    behavior_id: str,
    req: DataPointRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(req.student_code, current_user)
    recorded_by = current_user.get("name") or current_user.get("id") or ""
    result = add_target_behavior_data(behavior_id, req.date, req.value, recorded_by, req.memo or "")
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


class FidelityRequest(BaseModel):
    student_code: str  # 스코프 확인용
    date: str
    implemented: str  # "O" | "X"
    memo: Optional[str] = ""


@router.post("/{behavior_id}/fidelity")
def submit_fidelity(
    behavior_id: str,
    req: FidelityRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(req.student_code, current_user)
    recorded_by = current_user.get("name") or current_user.get("id") or ""
    result = add_target_behavior_fidelity(behavior_id, req.date, req.implemented, req.memo or "", recorded_by)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


class UpdateDataPointRequest(BaseModel):
    student_code: str  # 스코프 확인용
    date: Optional[str] = None
    value: Optional[str] = None
    memo: Optional[str] = None


@router.patch("/data/{uuid}")
def edit_data_point(
    uuid: str,
    req: UpdateDataPointRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(req.student_code, current_user)
    result = update_target_behavior_data(uuid, req.date, req.value, req.memo)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.delete("/data/{uuid}")
def remove_data_point(
    uuid: str,
    student_code: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(student_code, current_user)
    result = delete_target_behavior_data(uuid)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


class UpdateFidelityRequest(BaseModel):
    student_code: str  # 스코프 확인용
    date: Optional[str] = None
    implemented: Optional[str] = None
    memo: Optional[str] = None


@router.patch("/fidelity/{uuid}")
def edit_fidelity(
    uuid: str,
    req: UpdateFidelityRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(req.student_code, current_user)
    result = update_target_behavior_fidelity(uuid, req.date, req.implemented, req.memo)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.delete("/fidelity/{uuid}")
def remove_fidelity(
    uuid: str,
    student_code: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    check_student_scope(student_code, current_user)
    result = delete_target_behavior_fidelity(uuid)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/{behavior_id}/chart")
def get_chart_data(
    behavior_id: str,
    student_code: str,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """표적행동 시계열 + 실행충실도 시계열 + 같은 기간 위기행동(Log_Main) 발생 빈도를 함께 반환한다."""
    check_student_scope(student_code, current_user)

    data_points = get_target_behavior_data(behavior_id)
    fidelity_points = get_target_behavior_fidelity(behavior_id)

    # 같은 학생의 위기행동 발생일자를 날짜별 건수로 집계 — 표적행동 추이와 겹쳐볼 수 있도록.
    all_logs = fetch_all_records(force_refresh=False)
    crisis_by_date: Dict[str, int] = {}
    for r in all_logs:
        code = str(r.get("학생코드") or r.get("코드번호") or "").strip()
        if code != str(student_code).strip():
            continue
        d = normalize_date_string(r.get("행동발생날짜", ""))
        if not d:
            continue
        crisis_by_date[d] = crisis_by_date.get(d, 0) + 1

    return {
        "behavior_id": behavior_id,
        "data_points": sorted(data_points, key=lambda r: str(r.get("Date", ""))),
        "fidelity_points": sorted(fidelity_points, key=lambda r: str(r.get("Date", ""))),
        "crisis_by_date": [{"date": d, "count": c} for d, c in sorted(crisis_by_date.items())],
    }


class DecisionAnalysisRequest(BaseModel):
    student_code: str
    behavior_definition: str = ""
    current_bip: str = ""
    team_notes: str = ""


@router.post("/{behavior_id}/decision-analysis")
def decision_analysis(
    behavior_id: str,
    req: DecisionAnalysisRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """표적행동 데이터+실행충실도+같은 기간 위기행동 빈도를 종합해 데이터기반 의사결정(DBDM) 제안을 생성한다."""
    check_student_scope(req.student_code, current_user)

    chart = get_chart_data(behavior_id, req.student_code, current_user)
    data_points = chart["data_points"]
    fidelity_points = chart["fidelity_points"]
    crisis_by_date = chart["crisis_by_date"]

    implemented_count = sum(1 for f in fidelity_points if str(f.get("Implemented", "")).strip().upper() == "O")
    fidelity_rate = f"{implemented_count}/{len(fidelity_points)}건 실행" if fidelity_points else "실행기록 없음"
    total_crisis = sum(c["count"] for c in crisis_by_date)

    period_data = f"""[표적행동 정의] {req.behavior_definition or "(정의 없음)"}
[데이터 포인트 수] {len(data_points)}건
[최근 값 추이] {", ".join(f'{d.get("Date")}:{d.get("Value")}' for d in data_points[-10:]) or "데이터 없음"}
[중재 실행충실도] {fidelity_rate}
[같은 기간 위기행동 발생] {total_crisis}건"""

    student_info = _build_student_info(req.student_code)
    result = generate_data_based_decision_recommendation(
        student_info=_redact_dict_name(student_info),
        period_data=period_data,
        current_bip=req.current_bip,
        ebp_selections=fidelity_rate,
        team_notes=req.team_notes,
    )
    return {"analysis": result}
