# backend/app/api/endpoints/workspace.py

from fastapi import APIRouter, HTTPException, Body, Depends
from typing import List, Dict, Any
from datetime import timedelta
from app.core.time import now_kst, today_kst
from app.domain.models import BehaviorEvent, DecisionSignal, SignalSeverity
from app.adapters.sheets.tier_status import TierStatusAdapter
from app.adapters.sheets.log_main import LogMainAdapter
from app.services.decision.signals import evaluate_decision_signals
from app.api.deps import require_authenticated_user, check_student_scope, normalize_class_identifier

router = APIRouter()


@router.get("/today")
def get_today_decision_center(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """
    Returns today's decision cockpit (scoped to teacher class or school-wide for admin):
    - Urgent Safety Signals (Restraints / Injuries within 14d)
    - Review Due Signals (CICO stalled / Frequency spikes / Active missing data)
    - Tier counts & High-risk highlights
    """
    today = today_kst()
    students = TierStatusAdapter.fetch_students()
    all_events = LogMainAdapter.fetch_events()

    role = str(current_user.get("role", "")).lower()
    if role not in ["admin", "superadmin"]:
        user_class = normalize_class_identifier(current_user.get("class_id") or current_user.get("id"))
        from app.api.deps import get_student_class_code
        students = [s for s in students if get_student_class_code(s.student_code) == user_class]
        student_codes = {s.student_code for s in students}
        all_events = [e for e in all_events if e.student_code in student_codes]

    # Calculate 14-day recent window
    two_weeks_ago = today - timedelta(days=14)
    recent_events = [e for e in all_events if e.event_date >= two_weeks_ago]

    # Evaluate signals across scoped students
    all_signals: List[DecisionSignal] = []
    events_by_student: Dict[str, List[BehaviorEvent]] = {}
    for ev in all_events:
        events_by_student.setdefault(ev.student_code, []).append(ev)

    for s in students:
        s_events = events_by_student.get(s.student_code, [])
        if s_events:
            sigs = evaluate_decision_signals(
                student_code=s.student_code,
                behavior_events=s_events,
                as_of_date=today,
                safety_window_days=14
            )
            all_signals.extend(sigs)

    from app.services.sheets import fetch_today_acks
    acks = fetch_today_acks()
    all_signals = [s for s in all_signals if s.signal_id not in acks]
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
        "date": str(today),
        "total_enrolled": len(students),
        "tier_counts": tier_counts,
        "recent_14d_events_count": len(recent_events),
        "urgent_safety_signals": urgent_signals,
        "review_signals": review_signals,
        "active_signals_count": len(all_signals)
    }


@router.post("/today/ack")
def acknowledge_today_signals(payload: dict = Body(...), current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Today 신호 '확인 완료'. signal_ids 를 받는다. 담임은 자기 학급 학생 신호만 닫을 수 있다.
    새 기록이 생기면 신호 ID가 바뀌어 다시 뜬다."""
    from app.services.sheets import TODAY_ACK_STEP, append_approval_rows, fetch_today_acks
    ids = [str(x).strip() for x in (payload.get("signal_ids") or []) if str(x).strip().startswith("SIG_")]
    if not ids:
        raise HTTPException(status_code=400, detail="signal_ids 가 비었습니다.")
    for sid in ids:  # SIG_{종류}_{학생코드}_{날짜}
        check_student_scope(sid.split("_", 2)[2].rsplit("_", 1)[0], current_user)
    done = fetch_today_acks()
    by = str(current_user.get("name") or current_user.get("id") or "")
    at = now_kst().replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
    rows = [[sid, TODAY_ACK_STEP, "확인", by, at, str(payload.get("memo") or "")] for sid in dict.fromkeys(ids) if sid not in done]
    if rows:
        append_approval_rows(rows)
    return {"success": True, "acknowledged": len(rows)}
