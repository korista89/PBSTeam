# backend/app/api/endpoints/workspace.py

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from datetime import date, timedelta
from app.domain.models import (
    StudentWorkspace, StudentProfile, BehaviorEvent, CicoObservation,
    DecisionSignal, DataQualityCheck, FunctionHypothesis, FunctionCode,
    DataSufficiency, SignalSeverity, HypothesisStatus
)
from app.adapters.sheets.tier_status import TierStatusAdapter
from app.adapters.sheets.log_main import LogMainAdapter
from app.adapters.sheets.cico import CicoMonthAdapter
from app.services.sheets import get_bip
from app.services.ebp.matching import generate_ebp_recommendation_bundle
from app.services.decision.signals import evaluate_decision_signals

router = APIRouter()

@router.get("/today")
async def get_today_decision_center():
    """
    Returns today's school-wide decision cockpit:
    - Urgent Safety Signals (Restraints / Injuries)
    - Review Due Signals (CICO stalled / Frequency spikes / Missing data)
    - School-wide Tier counts & High-risk highlights
    """
    students = TierStatusAdapter.fetch_students()
    all_events = LogMainAdapter.fetch_events()

    # Calculate 14-day recent window
    two_weeks_ago = date.today() - timedelta(days=14)
    recent_events = [e for e in all_events if e.event_date >= two_weeks_ago]

    # Evaluate signals across all students
    all_signals: List[DecisionSignal] = []
    events_by_student: Dict[str, List[BehaviorEvent]] = {}
    for ev in all_events:
        events_by_student.setdefault(ev.student_code, []).append(ev)

    for s in students:
        s_events = events_by_student.get(s.student_code, [])
        if s_events:
            sigs = evaluate_decision_signals(s.student_code, s_events)
            all_signals.extend(sigs)

    urgent_signals = [s for s in all_signals if s.severity in [SignalSeverity.URGENT, SignalSeverity.PRIORITY]]
    review_signals = [s for s in all_signals if s.severity in [SignalSeverity.REVIEW, SignalSeverity.INFO]]

    # Tier counts
    tier_counts = {"Tier 1": 0, "Tier 2": 0, "Tier 3": 0, "Tier 3+": 0}
    for s in students:
        tier_names = [t.value for t in s.tier.active_tiers]
        if "TIER_3_PLUS" in tier_names:
            tier_counts["Tier 3+"] += 1
        elif "TIER_3" in tier_names:
            tier_counts["Tier 3"] += 1
        elif "TIER_2_CICO" in tier_names or "TIER_2_SST" in tier_names:
            tier_counts["Tier 2"] += 1
        else:
            tier_counts["Tier 1"] += 1

    return {
        "date": str(date.today()),
        "total_enrolled": len(students),
        "tier_counts": tier_counts,
        "recent_14d_events_count": len(recent_events),
        "urgent_safety_signals": urgent_signals[:10],
        "review_signals": review_signals[:20],
        "active_signals_count": len(all_signals)
    }


@router.get("/student/{student_code}")
async def get_student_workspace(student_code: str):
    """
    Returns unified Student 360 Workspace:
    - Profile & Tiers
    - Behavior Events timeline
    - FBA Functional Patterns & Hypothesis
    - EBP Recommendation Candidate Bundle
    - CICO History (3~7월)
    - Active BIP
    - Decision Signals & Data Quality check
    """
    students = TierStatusAdapter.fetch_students()
    profile = next((s for s in students if s.student_code == student_code), None)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Student '{student_code}' not found in TierStatus roster.")

    all_events = LogMainAdapter.fetch_events()
    s_events = [e for e in all_events if e.student_code == student_code]

    # CICO Observations from active months (3~7월)
    cico_obs: List[CicoObservation] = []
    for m in [3, 4, 5, 6, 7]:
        m_obs = CicoMonthAdapter.fetch_observations(m)
        s_m_obs = [o for o in m_obs if o.student_code == student_code]
        cico_obs.extend(s_m_obs)

    # Active BIP
    raw_bip = get_bip(student_code)

    # Data Quality Check
    complete_abc = sum(1 for e in s_events if e.antecedent and e.consequence)
    unique_dates = len(set(e.event_date for e in s_events))
    is_sufficient = len(s_events) >= 5 and complete_abc >= 3
    
    dq = DataQualityCheck(
        event_count=len(s_events),
        date_span_days=unique_dates,
        complete_abc_count=complete_abc,
        has_location_data=any(e.primary_location and e.primary_location != "기타/미상" for e in s_events),
        has_intensity_data=any(e.intensity is not None and e.intensity > 0 for e in s_events),
        is_sufficient_for_fba=is_sufficient,
        reasons=[] if is_sufficient else ["ABC 직접 관찰 기록(선행-행동-후속) 5건 이상 수집 권장"]
    )

    # Function Hypothesis estimation
    fn_counts: Dict[str, int] = {}
    for e in s_events:
        for est in e.teacher_function_estimates:
            fn_counts[est.function_code.value] = fn_counts.get(est.function_code.value, 0) + 1

    top_fn_code = FunctionCode.UNKNOWN
    if fn_counts:
        top_fn_str = max(fn_counts, key=fn_counts.get)
        if top_fn_str in FunctionCode.__members__:
            top_fn_code = FunctionCode(top_fn_str)

    target_beh = s_events[0].behavior_code if s_events else "표적행동"
    antecedent = s_events[0].antecedent if (s_events and s_events[0].antecedent) else "과제 전환 또는 지시 상황"
    consequence = s_events[0].consequence if (s_events and s_events[0].consequence) else "과제 회피 또는 교사 관심 획득"
    setting_ev = s_events[0].setting_events[0] if (s_events and s_events[0].setting_events) else None

    hyp = FunctionHypothesis(
        hypothesis_id=f"HYP_{student_code}",
        student_code=student_code,
        target_behavior=target_beh,
        setting_event=setting_ev,
        antecedent_condition=antecedent,
        consequence_pattern=consequence,
        function_code=top_fn_code,
        hypothesis_statement=f"{student_code} 학생은 {antecedent} 상황에서 {top_fn_code.value} 기능을 위해 {target_beh} 행동을 나타내는 것으로 추정됨.",
        evidence_for=[],
        evidence_against=[],
        data_sufficiency=DataSufficiency(
            direct_observation_n=len(s_events),
            unique_days_n=unique_dates,
            unique_contexts_n=len(set(e.primary_location for e in s_events if e.primary_location)),
            abc_complete_n=complete_abc,
            contradictory_evidence_n=0,
            status="MEDIUM" if is_sufficient else "LOW",
            reasons=dq.reasons
        ),
        status=HypothesisStatus.PROPOSED
    )

    # EBP Recommendation Bundle
    ebp_bundle = generate_ebp_recommendation_bundle(
        hypothesis=hyp,
        antecedent_patterns=[e.primary_location for e in s_events[:5] if e.primary_location],
        setting_events=[s for e in s_events for s in e.setting_events],
        current_tier=profile.tier.active_tiers[0].value if profile.tier.active_tiers else "TIER_1"
    )

    # Decision Signals
    signals = evaluate_decision_signals(student_code, s_events, cico_obs, raw_bip)

    return {
        "profile": profile,
        "events_count": len(s_events),
        "events": s_events[:50],  # Latest 50 events
        "cico_observations": cico_obs,
        "hypothesis": hyp,
        "ebp_recommendation_bundle": ebp_bundle,
        "active_bip": raw_bip,
        "decision_signals": signals,
        "data_quality": dq
    }
