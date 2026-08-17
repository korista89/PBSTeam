# backend/app/services/decision/signals.py

from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional
from app.core.time import now_kst, today_kst
from app.domain.models import (
    DecisionSignal, DecisionSignalType, SignalSeverity, DecisionStatus,
    BehaviorEvent, CicoObservation, EvidenceRef
)

def evaluate_decision_signals(
    student_code: str,
    behavior_events: List[BehaviorEvent],
    cico_observations: List[CicoObservation] = None,
    bip_plan: Dict[str, Any] = None,
    as_of_date: Optional[date] = None,
    safety_window_days: int = 14,
    is_today_inbox: bool = True,
    active_tier_names: Optional[List[str]] = None
) -> List[DecisionSignal]:
    """
    Evaluates deterministic decision support signals for a student.
    Does NOT mutate Tiers automatically; creates actionable review items for teachers/teams.
    """
    signals: List[DecisionSignal] = []
    cico_observations = cico_observations or []
    target_date = as_of_date or today_kst()
    created_time = now_kst()

    # 1. SAFETY Signal (Strict 14-day window & sorted latest evidence)
    safety_cutoff = target_date - timedelta(days=safety_window_days)
    recent_safety_events = [
        e for e in behavior_events
        if e.event_date >= safety_cutoff and (
            e.safety.physical_restraint
            or e.safety.injury_to_others
            or e.safety.self_injury
            or e.safety.staff_injury
            or e.safety.emergency_response
        )
    ]

    has_safety_signal = False
    if recent_safety_events:
        # Sort by event_date descending to pick the most recent incident as primary evidence
        recent_safety_events.sort(key=lambda e: e.event_date, reverse=True)
        top_ev = recent_safety_events[0]

        ref = EvidenceRef(
            source_type="Log_Main",
            source_id=top_ev.event_id,
            log_id=top_ev.source_log_id,
            event_date=top_ev.event_date,
            label="물리적 제지 또는 상해/위기 발생",
            excerpt=top_ev.notes
        )
        signals.append(DecisionSignal(
            signal_id=f"SIG_SAFE_{student_code}_{top_ev.event_date}",
            student_code=student_code,
            signal_type=DecisionSignalType.SAFETY,
            severity=SignalSeverity.URGENT,
            title="🚨 안전 및 위기행동 후속 조치 필요",
            reason=f"최근 {safety_window_days}일간 {len(recent_safety_events)}건의 물리적 제지 또는 상해/위기 사건이 기록되었습니다.",
            evidence=[ref],
            recommended_next_action="안전 계획 점검 및 관리자 보고/보호자 안내 완료 여부 확인",
            status=DecisionStatus.OPEN,
            created_at=created_time
        ))
        has_safety_signal = True

    # 2. CHANGE_UP Signal (Current 14d [D-13~D] vs Previous 14d [D-27~D-14])
    cur_start = target_date - timedelta(days=13)
    prev_start = target_date - timedelta(days=27)
    prev_end = target_date - timedelta(days=14)

    cur_events = [e for e in behavior_events if cur_start <= e.event_date <= target_date]
    prev_events = [e for e in behavior_events if prev_start <= e.event_date <= prev_end]

    cur_cnt = len(cur_events)
    prev_cnt = len(prev_events)

    has_spike_signal = False
    if cur_cnt >= 4 and (prev_cnt == 0 or cur_cnt >= prev_cnt * 1.5 or (cur_cnt - prev_cnt) >= 3):
        signals.append(DecisionSignal(
            signal_id=f"SIG_SPIKE_{student_code}_{target_date}",
            student_code=student_code,
            signal_type=DecisionSignalType.CHANGE_UP,
            severity=SignalSeverity.REVIEW,
            title="📈 최근 2주 행동 발생 빈도 증가",
            reason=f"최근 14일간 {cur_cnt}건 발생 (직전 14일 {prev_cnt}건 대비 빈도 증가)",
            evidence=[],
            recommended_next_action="선행사건 환경 자극 변화 및 배경사건(수면/투약/일과 변화) 확인",
            status=DecisionStatus.OPEN,
            created_at=created_time
        ))
        has_spike_signal = True

    # 3. GOAL_STALLED Signal (CICO Goal Met Rate < 70%)
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
                created_at=created_time
            ))

    # 4. MORE_DATA Signal (ABC complete < 3)
    # In Today Action Inbox mode: Only trigger for actively supported students or recent active cases
    abc_complete = [e for e in behavior_events if e.antecedent and e.consequence]

    should_evaluate_more_data = True
    if is_today_inbox:
        # Check if student is active: event within 30 days OR active tier 2/3 OR active safety/spike signal
        has_recent_events = any(e.event_date >= target_date - timedelta(days=30) for e in behavior_events)
        is_tier_2_or_3 = bool(
            active_tier_names and any(
                t in ["TIER_2_CICO", "TIER_2_SST", "TIER_3", "TIER_3_PLUS"] for t in active_tier_names
            )
        )
        should_evaluate_more_data = has_recent_events or is_tier_2_or_3 or has_safety_signal or has_spike_signal

    if should_evaluate_more_data and len(behavior_events) > 0 and len(abc_complete) < 3:
        signals.append(DecisionSignal(
            signal_id=f"SIG_DATA_{student_code}",
            student_code=student_code,
            signal_type=DecisionSignalType.MORE_DATA,
            severity=SignalSeverity.INFO,
            title="🟡 FBA 직접 관찰 데이터 부족",
            reason=f"총 {len(behavior_events)}건의 행동 기록 중 선행사건(A)-후속결과(C)가 완성된 기록이 {len(abc_complete)}건(3건 미만)입니다.",
            evidence=[],
            recommended_next_action="기능 가설 수립을 위해 교실 일과 중 3회 이상의 ABC 직접 관찰 기록 수집 권장",
            status=DecisionStatus.OPEN,
            created_at=created_time
        ))

    return signals
