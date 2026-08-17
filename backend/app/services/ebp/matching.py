# backend/app/services/ebp/matching.py

from typing import List, Dict, Any, Optional
from app.domain.models import (
    EBPStrategy, EBPCategory, FunctionCode, FunctionHypothesis,
    DataSufficiency, EBPRecommendation, EvidenceRef
)
from app.services.ebp.catalog import load_ebp_catalog
from app.services.ebp.guardrails import validate_ebp_guardrails

def generate_ebp_recommendation_bundle(
    hypothesis: Optional[FunctionHypothesis],
    antecedent_patterns: List[str] = None,
    setting_events: List[str] = None,
    current_tier: str = "TIER_1",
    selected_ebps: List[str] = None
) -> Dict[str, Any]:
    """
    Generates a deterministic 39 Be-Able EBP candidate bundle:
    {
      "assessment": [...],
      "setting_event": [...],
      "prevent": [...],
      "teach": [...],
      "reinforce": [...],
      "respond": [...],
      "monitoring": [...],
      "limitations": [...],
      "missing_data": [...]
    }
    """
    catalog = load_ebp_catalog()
    fn_code = hypothesis.function_code if hypothesis else FunctionCode.UNKNOWN
    sufficiency = hypothesis.data_sufficiency if hypothesis else DataSufficiency(status="LOW", reasons=["관찰 데이터 부족"])
    
    bundle = {
        "assessment": [],
        "setting_event": [],
        "prevent": [],
        "teach": [],
        "reinforce": [],
        "respond": [],
        "monitoring": ["표적행동 발생률", "대체행동 독립 수행률", "실행충실도(Fidelity)"],
        "limitations": [],
        "missing_data": []
    }

    if sufficiency.status == "LOW":
        bundle["limitations"].append("직접 관찰 데이터(ABC)가 충분하지 않아 추천 전략은 '조건부 검토' 수준으로 제공됩니다.")
        bundle["missing_data"].append("최소 2주간의 ABC 직접 관찰 및 상황 다양성 확보 필요")

    # 1. Assessment layer
    if fn_code == FunctionCode.UNKNOWN or sufficiency.status == "LOW":
        fba_strat = next((s for s in catalog if s.code == "FBA"), None)
        if fba_strat:
            bundle["assessment"].append(_make_rec(fba_strat, "우선 검토", ["행동 기능이 명확하지 않아 체계적인 FBA 직접 관찰이 필요합니다."]))

    if setting_events and any("건강" in s or "수면" in s or "투약" in s for s in setting_events):
        me_strat = next((s for s in catalog if s.code == "ME"), None)
        if me_strat:
            bundle["assessment"].append(_make_rec(me_strat, "우선 검토", ["건강/수면/투약 관련 배경사건이 관찰되어 의학적 상태 확인이 선행되어야 합니다."]))

    # 2. Setting Event layer
    if fn_code == FunctionCode.AUTOMATIC_SENSORY:
        exm_strat = next((s for s in catalog if s.code == "EXM"), None)
        if exm_strat:
            bundle["setting_event"].append(_make_rec(exm_strat, "함께 고려", ["감각 자극 및 높은 각성 조절을 위한 사전 신체활동"]))

    # 3. Antecedent / Prevention layer
    if fn_code == FunctionCode.ESCAPE_DEMAND:
        tm_strat = next((s for s in catalog if s.code == "ABI-TM"), None)
        cm_strat = next((s for s in catalog if s.code == "ABI-CM"), None)
        vs_strat = next((s for s in catalog if s.code == "VS"), None)
        if tm_strat: bundle["prevent"].append(_make_rec(tm_strat, "우선 검토", ["과제 난이도·분량 조정을 통한 과제 회피 선행사건 예방"]))
        if cm_strat: bundle["prevent"].append(_make_rec(cm_strat, "우선 검토", ["활동 순서 및 자료 선택권 제공으로 거부 완화"]))
        if vs_strat: bundle["prevent"].append(_make_rec(vs_strat, "함께 고려", ["시각적 일과표 및 전환 예고를 통한 예측성 확보"]))
    elif fn_code == FunctionCode.ATTENTION:
        ncr_strat = next((s for s in catalog if s.code == "R-NCR"), None)
        em_strat = next((s for s in catalog if s.code == "ABI-EM"), None)
        if ncr_strat: bundle["prevent"].append(_make_rec(ncr_strat, "우선 검토", ["문제행동 발생 전 시간계획에 따른 관심 사전 제공"]))
        if em_strat: bundle["prevent"].append(_make_rec(em_strat, "함께 고려", ["교사와의 물리적 거리 및 상호작용 배치"]))
    elif fn_code == FunctionCode.AUTOMATIC_SENSORY:
        ee_strat = next((s for s in catalog if s.code == "ABI-EE"), None)
        if ee_strat: bundle["prevent"].append(_make_rec(ee_strat, "우선 검토", ["선호하는 감각 대안 활동을 환경에 사전 배치"]))
    else:
        vs_strat = next((s for s in catalog if s.code == "VS"), None)
        em_strat = next((s for s in catalog if s.code == "ABI-EM"), None)
        if vs_strat: bundle["prevent"].append(_make_rec(vs_strat, "함께 고려", ["시각적 지원을 통한 일과 구조화"]))
        if em_strat: bundle["prevent"].append(_make_rec(em_strat, "함께 고려", ["환경 자극 및 소음·동선 조정"]))

    # 4. Teaching / Replacement layer
    fct_strat = next((s for s in catalog if s.code == "FCT"), None)
    aac_strat = next((s for s in catalog if s.code == "AAC"), None)
    if fct_strat:
        bundle["teach"].append(_make_rec(fct_strat, "우선 검토", ["문제행동과 동일한 기능을 달성하는 기능적 대체 의사소통 요청 교수"]))
    if aac_strat:
        bundle["teach"].append(_make_rec(aac_strat, "함께 고려", ["보완대체의사소통(경은그림말 AAC) 상시 접근 및 모델링"]))

    # 5. Reinforcement layer
    if fn_code in [FunctionCode.ESCAPE_DEMAND, FunctionCode.ATTENTION, FunctionCode.TANGIBLE_ACTIVITY]:
        dra_strat = next((s for s in catalog if s.code == "DR-A"), None)
        if dra_strat:
            bundle["reinforce"].append(_make_rec(dra_strat, "우선 검토", ["기능적 대체행동 발생 시 즉각적이고 차별화된 강화 제공"]))
    else:
        te_strat = next((s for s in catalog if s.code == "R-TE"), None)
        if te_strat:
            bundle["reinforce"].append(_make_rec(te_strat, "함께 고려", ["목표행동 수행에 대한 긍정적 토큰 보상"]))

    # 6. Response / Consequence layer (Guarded)
    # Never auto-recommend EXT without teacher request. RIRD only for severe sensory.
    if fn_code == FunctionCode.AUTOMATIC_SENSORY:
        rird_strat = next((s for s in catalog if s.code == "RIRD"), None)
        if rird_strat:
            excluded, flags, unmet = validate_ebp_guardrails(rird_strat, fn_code, sufficiency, selected_ebps)
            bundle["respond"].append(_make_rec(rird_strat, "조건부", ["학습을 심각하게 방해하는 자동강화 행동에 한해 최소개입 적용"], guardrail_flags=flags))

    return bundle


def _make_rec(strategy: EBPStrategy, level: str, reasons: List[str], guardrail_flags: List[str] = None) -> Dict[str, Any]:
    return {
        "ebp_code": strategy.code,
        "name": strategy.name,
        "category": strategy.category.value,
        "recommendation_level": level,
        "reasons": reasons,
        "guardrail_flags": guardrail_flags or strategy.guardrails[:2],
        "summary": strategy.summary,
        "implementation_steps": strategy.implementation_steps,
        "workload": strategy.workload.value
    }
