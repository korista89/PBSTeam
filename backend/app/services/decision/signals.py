# backend/app/services/decision/signals.py

from datetime import date, timedelta
from typing import List, Optional
from app.core.time import now_kst, today_kst
from app.domain.models import (
    DecisionSignal, DecisionSignalType, SignalSeverity, DecisionStatus,
    BehaviorEvent, EvidenceRef
)

# 선행사건·후속결과 필수 안내 시점. 이 날짜 이전 기록은 A·C가 비어도 지적하지 않는다.
ABC_REQUIRED_SINCE = date(2026, 11, 16)


def evaluate_decision_signals(
    student_code: str,
    behavior_events: List[BehaviorEvent],
    as_of_date: Optional[date] = None,
    safety_window_days: int = 14
) -> List[DecisionSignal]:
    """
    Evaluates deterministic decision support signals for a student.
    Does NOT mutate Tiers automatically; creates actionable review items for teachers/teams.
    """
    signals: List[DecisionSignal] = []
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

    # 2. CHANGE_UP Signal (Current 14d [D-13~D] vs Previous 14d [D-27~D-14])
    cur_start = target_date - timedelta(days=13)
    prev_start = target_date - timedelta(days=27)
    prev_end = target_date - timedelta(days=14)

    cur_events = [e for e in behavior_events if cur_start <= e.event_date <= target_date]
    prev_events = [e for e in behavior_events if prev_start <= e.event_date <= prev_end]

    cur_cnt = len(cur_events)
    prev_cnt = len(prev_events)

    if cur_cnt >= 4 and (prev_cnt == 0 or cur_cnt >= prev_cnt * 1.5 or (cur_cnt - prev_cnt) >= 3):
        signals.append(DecisionSignal(
            signal_id=f"SIG_SPIKE_{student_code}_{max(e.event_date for e in cur_events)}",
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

    # 4. MORE_DATA: 선행사건·후속결과가 빠진 '새' 기록만 알린다.
    # 예전 양식은 추정기능만 체크했고 A·C 필수 안내가 없었으므로 ABC_REQUIRED_SINCE 이전 기록은 따지지 않는다.
    missing = [e for e in behavior_events
               if e.event_date >= ABC_REQUIRED_SINCE and not (e.antecedent and e.consequence)]
    if missing:
        signals.append(DecisionSignal(
            signal_id=f"SIG_DATA_{student_code}_{max(e.event_date for e in missing)}",
            student_code=student_code,
            signal_type=DecisionSignalType.MORE_DATA,
            severity=SignalSeverity.INFO,
            title="🟡 선행사건·후속결과 빠진 기록",
            reason=f"선행사건·후속결과 필수 안내 뒤 기록 중 {len(missing)}건에 둘 중 하나가 비어 있습니다.",
            evidence=[],
            recommended_next_action="기록 편집에서 선행사건(행동 직전)과 후속결과(행동 직후)를 채워 기능 분석에 쓰이게 하기",
            status=DecisionStatus.OPEN,
            created_at=created_time
        ))

    return signals
