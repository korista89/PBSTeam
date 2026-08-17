# backend/app/services/ebp/guardrails.py

from typing import List, Dict, Any, Tuple
from app.domain.models import EBPStrategy, FunctionCode, DataSufficiency, EBPRecommendation, EvidenceRef

def validate_ebp_guardrails(
    strategy: EBPStrategy,
    function_code: FunctionCode,
    data_sufficiency: DataSufficiency,
    selected_ebps: List[str] = None
) -> Tuple[bool, List[str], List[str]]:
    """
    Evaluates clinical and educational guardrails for a specific EBP candidate.
    Returns: (is_excluded, guardrail_flags, unmet_prerequisites)
    """
    selected_ebps = [s.upper() for s in (selected_ebps or [])]
    flags = []
    unmet = []
    excluded = False

    code = strategy.code.upper()

    # 1. EXT (Extinction) Guardrail
    if code == "EXT":
        if data_sufficiency.status == "LOW" or function_code == FunctionCode.UNKNOWN:
            excluded = True
            flags.append("기능 가설 근거 부족 (FBA 직접 관찰 데이터 선행 필요)")
        if "FCT" not in selected_ebps and "DR-A" not in selected_ebps:
            flags.append("대체행동 교수(FCT/DR-A)가 계획에 반드시 선행·동반되어야 합니다.")
            unmet.append("대체행동 교수 계획")
        flags.append("소거 폭발(Extinction Burst) 및 안전 위험에 대한 팀 합의와 안전 계획 필수")

    # 2. RIRD (Response Interruption and Redirection) Guardrail
    elif code == "RIRD":
        if function_code != FunctionCode.AUTOMATIC_SENSORY:
            flags.append("RIRD는 학습을 실질적으로 방해하는 자동강화 반복행동에만 제한적으로 검토합니다.")
        flags.append("무해한 자기조절 및 신경다양성 행동은 표적으로 삼지 않으며, 최소침습적 절차만 허용됩니다.")

    # 3. DR-O (Differential Reinforcement of Other Behavior) Guardrail
    elif code == "DR-O":
        if "FCT" not in selected_ebps and "DR-A" not in selected_ebps:
            flags.append("DR-O는 대체행동을 가르치지 않으므로, 기능적 대체행동(FCT/DR-A)을 반드시 병행해야 합니다.")
            unmet.append("기능적 대체행동 병행")

    # 4. FCT (Functional Communication Training) Guardrail
    elif code == "FCT":
        if function_code == FunctionCode.UNKNOWN:
            flags.append("기능이 불명확한 경우 대체 의사소통 요청의 기능적 등가성을 먼저 평가해야 합니다.")

    # 5. AAC Guardrail
    elif code == "AAC":
        flags.append("AAC 기기/의사소통판은 상시 접근이 보장되어야 하며 보상이나 처벌의 수단으로 통제할 수 없습니다.")

    # 6. ME (Medical Evaluation) Guardrail
    elif code == "ME":
        flags.append("교사는 의학적 진단을 내리거나 약물 조정을 제안할 수 없으며, 관찰 사실을 보호자/전문가와 공유합니다.")

    return excluded, flags, unmet
