# backend/app/services/decision/signals.py

from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional
from app.domain.models import (
    DecisionSignal, DecisionSignalType, SignalSeverity, DecisionStatus,
    BehaviorEvent, CicoObservation, EvidenceRef
)

def evaluate_decision_signals(
    student_code: str,
    behavior_events: List[BehaviorEvent],
    cico_observations: List[CicoObservation] = None,
    bip_plan: Dict[str, Any] = None
) -> List[DecisionSignal]:
    """
    Evaluates deterministic decision support signals for a student.
    Does NOT mutate Tiers automatically; creates actionable review items for teachers/teams.
    """
    signals: List[DecisionSignal] = []
    cico_observations = cico_observations or []
    now = datetime.now()

    # 1. SAFETY Signal
    recent_safety_events = [e for e in behavior_events if e.safety.physical_restraint or e.safety.injury_to_others or e.safety.self_injury]
    if recent_safety_events:
        top_ev = recent_safety_events[0]
        ref = EvidenceRef(
            source_type="Log_Main",
            source_id=top_ev.event_id,
            log_id=top_ev.source_log_id,
            event_date=top_ev.event_date,
            label="물리적 제지 또는 상해 발생",
            excerpt=top_ev.notes
        )
        signals.append(DecisionSignal(
            signal_id=f"SIG_SAFE_{student_code}_{top_ev.event_date}",
            student_code=student_code,
            signal_type=DecisionSignalType.SAFETY,
            severity=SignalSeverity.URGENT,
            title="🚨 안전 및 위기행동 후속 조치 필요",
            reason=f"최근 {len(recent_safety_events)}건의 물리적 제지 또는 상해/위기 사건이 기록되었습니다.",
            evidence=[ref],
            recommended_next_action="안전 계획 점검 및 관리자 보고/보호자 안내 완료 여부 확인",
            status=DecisionStatus.OPEN,
            created_at=now
        ))

    # 2. MORE_DATA Signal
    abc_complete = [e for e in behavior_events if e.antecedent and e.consequence]
    if len(behavior_events) > 0 and len(abc_complete) < 5:
        signals.append(DecisionSignal(
            signal_id=f"SIG_DATA_{student_code}",
            student_code=student_code,
            signal_type=DecisionSignalType.MORE_DATA,
            severity=SignalSeverity.INFO,
            title="🟡 FBA 직접 관찰 데이터 부족",
            reason=f"총 {len(behavior_events)}건의 행동 기록 중 선행사건(A)-후속결과(C)가 완성된 기록이 {len(abc_complete)}건으로 부족합니다.",
            evidence=[],
            recommended_next_action="기능 가설 수립을 위해 교실 일과 중 3회 이상의 ABC 직접 관찰 기록 추가",
            status=DecisionStatus.OPEN,
            created_at=now
        ))

    # 3. GOAL_STALLED Signal (CICO)
    if len(cico_observations) >= 10:
        met_count = sum(1 for c in cico_observations if c.goal_met is True)
        total_valid = sum(1 for c in cico_observations if c.goal_met is not None)
        if total_valid >= 10 and (met_count / total_valid) < 0.7:
            signals.append(DecisionSignal(
                signal_id=f"SIG_CICO_STALL_{student_code}",
                student_code=student_code,
                signal_type=DecisionSignalType.GOAL_STALLED,
                severity=SignalSeverity.REVIEW,
                title="🟠 CICO 지원 목표 달성 정체",
                reason=f"최근 {total_valid}회차 중 목표 달성률이 {round(met_count/total_valid*100, 1)}%로 70% 미만에 머물고 있습니다.",
                evidence=[],
                recommended_next_action="강화제 선호도 재평가 또는 목표행동 난이도/기준 조정 검토",
                status=DecisionStatus.OPEN,
                created_at=now
            ))

    # 4. CHANGE_UP Signal (Behavior Frequency Spike)
    if len(behavior_events) >= 6:
        # Check if last 2 weeks frequency is higher than previous 2 weeks
        two_weeks_ago = date.today() - timedelta(days=14)
        recent_cnt = sum(1 for e in behavior_events if e.event_date >= two_weeks_ago)
        older_cnt = len(behavior_events) - recent_cnt
        if recent_cnt >= 4 and recent_cnt > older_cnt * 1.5:
            signals.append(DecisionSignal(
                signal_id=f"SIG_SPIKE_{student_code}",
                student_code=student_code,
                signal_type=DecisionSignalType.CHANGE_UP,
                severity=SignalSeverity.REVIEW,
                title="📈 최근 2주 행동 발생 빈도 증가",
                reason=f"최근 2주간 {recent_cnt}건의 행동이 집중 발생하여 이전 기간 대비 50% 이상 증가했습니다.",
                evidence=[],
                recommended_next_action="선행사건 환경 자극 변화 및 배경사건(수면/투약/일과 변화) 확인",
                status=DecisionStatus.OPEN,
                created_at=now
            ))

    return signals
