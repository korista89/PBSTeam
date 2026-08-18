# verify_domain_and_api.py
"""
Deterministic Verification Script for PBSTeam 2.0 Backend & Domain Contracts
"""
import os
import sys
from datetime import date, datetime, timedelta

# Ensure backend directory is on sys.path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

def test_imports():
    print("=" * 60)
    print("STEP 1: Testing FastAPI and Endpoints Imports")
    print("=" * 60)
    
    try:
        from app.main import app
        print("✅ app.main import: FASTAPI_IMPORT_OK")
    except Exception as e:
        print(f"❌ app.main import FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

    endpoints = [
        "app.core.time",
        "app.adapters.sheets.log_main",
        "app.adapters.sheets.tier_status",
        "app.adapters.sheets.cico",
        "app.api.endpoints.analytics",
        "app.api.endpoints.workspace",
        "app.api.endpoints.ebp",
        "app.api.endpoints.bip",
        "app.api.endpoints.cico",
        "app.api.endpoints.student",
        "app.api.endpoints.auth",
        "app.api.endpoints.tier",
        "app.api.endpoints.meeting_notes",
        "app.api.endpoints.board",
        "app.api.endpoints.picture_words",
        "app.api.endpoints.behavior",
    ]

    for ep in endpoints:
        try:
            __import__(ep)
            print(f"✅ {ep}: OK")
        except Exception as e:
            print(f"❌ {ep}: FAILED ({e})")
            import traceback
            traceback.print_exc()
            return False

    return True

def test_ebp_catalog():
    print("\n" + "=" * 60)
    print("STEP 2: Testing Be-Able 39 EBP Catalog")
    print("=" * 60)
    from app.services.ebp.catalog import load_ebp_catalog, get_ebp_by_code
    strategies = load_ebp_catalog()
    print(f"✅ Loaded EBP Strategies Count: {len(strategies)}")
    assert len(strategies) == 39, f"Expected 39 strategies, got {len(strategies)}"
    
    fba = get_ebp_by_code("FBA")
    assert fba is not None, "FBA strategy not found in catalog"
    print(f"✅ FBA Strategy: {fba.name} ({fba.category.value}) - Workload: {fba.workload.value}")
    return True

def test_domain_constructors():
    print("\n" + "=" * 60)
    print("STEP 3: Testing Strict Domain Model Constructors")
    print("=" * 60)
    from app.domain.models import (
        DataQualityCheck, DataSufficiency, FunctionHypothesis, FunctionCode,
        HypothesisStatus, DecisionSignal, DecisionSignalType, SignalSeverity,
        DecisionStatus, TierSnapshot, TierCode, StudentProfile, BehaviorEvent,
        SafetyFlags, FunctionEstimate, CicoObservation
    )

    # 1. DataQualityCheck
    dq = DataQualityCheck(
        event_count=5,
        date_span_days=3,
        complete_abc_count=3,
        has_location_data=True,
        has_intensity_data=True,
        is_sufficient_for_fba=True,
        reasons=[]
    )
    print("✅ DataQualityCheck constructor: OK")

    # 2. DataSufficiency
    ds = DataSufficiency(
        direct_observation_n=5,
        unique_days_n=3,
        unique_contexts_n=2,
        abc_complete_n=3,
        contradictory_evidence_n=0,
        status="HIGH",
        reasons=[]
    )
    print("✅ DataSufficiency constructor: OK")

    # 3. FunctionHypothesis
    hyp = FunctionHypothesis(
        hypothesis_id="HYP_TEST_001",
        student_code="1011",
        target_behavior="소리지르기",
        setting_event="수면 부족",
        antecedent_condition="수학 개별과제 제시",
        consequence_pattern="과제 중단 및 휴게실 이동",
        function_code=FunctionCode.ESCAPE_DEMAND,
        hypothesis_statement="1011 학생은 수학 과제 제시 시 과제 회피를 위해 소리지르기를 나타냄.",
        evidence_for=[],
        evidence_against=[],
        data_sufficiency=ds,
        status=HypothesisStatus.PROPOSED
    )
    print("✅ FunctionHypothesis constructor: OK")

    # 4. DecisionSignal
    sig = DecisionSignal(
        signal_id="SIG_001",
        student_code="1011",
        signal_type=DecisionSignalType.SAFETY,
        severity=SignalSeverity.URGENT,
        title="🚨 긴급 안전 점검",
        reason="물리적 제지 발생",
        evidence=[],
        recommended_next_action="보호자 및 관리자 보고",
        status=DecisionStatus.OPEN,
        created_at=datetime.now()
    )
    print("✅ DecisionSignal constructor: OK")

    # 5. StudentProfile
    prof = StudentProfile(
        student_code="1011",
        display_name="학생1011",
        class_name="유치원 1반",
        enrolled=True,
        tier=TierSnapshot(active_tiers=[TierCode.TIER_1, TierCode.TIER_2_CICO]),
        communication_modes=["구어", "그림말AAC"],
        preferred_supports=["시각적 일과표"],
        preferences=["음악"],
        challenge_contexts=["소음"],
        early_signs=["귀막기"],
        accessibility_notes=[]
    )
    print("✅ StudentProfile constructor: OK")

    return True

def test_synthetic_log_main_adapter():
    print("\n" + "=" * 60)
    print("STEP 4: Testing LogMainAdapter Synthetic Row Normalization")
    print("=" * 60)
    from app.adapters.sheets.log_main import LogMainAdapter
    from app.domain.models import FunctionCode

    # Synthetic Row 1: Regular valid row with legacy function '불편해소' & frequency text
    row1 = {
        "발생날짜": "2026-05-12",
        "학생코드": "2111",
        "시간대": "2구간: 1교시",
        "행동 발생 장소": "교실. 복도",
        "행동유형(핵심행동으로택1)": "신체적공격행동",
        "강도(1~5점 척도)": "4",
        "발생횟수(한 에피소드 당 1회로 입력 권장)": "4회, 10~15초 동안 지속",
        "추정기능(이번 행동을 통해 파악된 기능)": "불편해소",
        "물리적제지, 3/4호분리지도,본인/타인상해 발생 여부": "X",
        "A_배경_선행사건": "쉬는 시간 종료 후 착석 지시",
        "C_후속결과": "교사의 구두 지도 후 착석"
    }

    event1 = LogMainAdapter._normalize_row(row1, row_idx=2)
    assert event1 is not None, "Failed to normalize valid row1"
    assert event1.event_date == date(2026, 5, 12), f"Date mismatch: {event1.event_date}"
    assert event1.occurrence_count == 4, f"Occurrence mismatch: {event1.occurrence_count}"
    assert "교실" in event1.location_codes, f"Location codes mismatch: {event1.location_codes}"
    assert event1.primary_location == "교실", f"Primary location mismatch: {event1.primary_location}"
    assert event1.antecedent == "쉬는 시간 종료 후 착석 지시"
    assert event1.consequence == "교사의 구두 지도 후 착석"
    assert event1.safety.injury_to_others is False
    assert event1.safety.physical_restraint is False
    
    # Function mapping check: '불편해소' ➔ DISCOMFORT_RELIEF
    assert len(event1.teacher_function_estimates) > 0
    assert event1.teacher_function_estimates[0].function_code == FunctionCode.DISCOMFORT_RELIEF
    print("✅ Synthetic Row 1 (Date, Location, DISCOMFORT_RELIEF, Occ Count 4, ABC): OK")

    # Synthetic Row 2: Legacy function '감각추구' ➔ AUTOMATIC_SENSORY and '물건·활동획득' ➔ TANGIBLE_ACTIVITY
    row2_sensory = {
        "발생날짜": "2026-06-01",
        "학생코드": "2211",
        "추정기능": "감각추구",
        "행동 발생 장소": "급식실"
    }
    event2 = LogMainAdapter._normalize_row(row2_sensory, row_idx=3)
    assert event2 is not None
    assert event2.teacher_function_estimates[0].function_code == FunctionCode.AUTOMATIC_SENSORY
    assert event2.primary_location == "급식실"
    print("✅ Synthetic Row 2 (SENSORY ➔ AUTOMATIC_SENSORY): OK")

    # Synthetic Row 3: Notes text mentioning "공격/힘들어함" without explicit safety field must NOT set safety=True
    row3_notes_only = {
        "발생날짜": "2026-06-02",
        "학생코드": "2311",
        "물리적제지, 3/4호분리지도,본인/타인상해 발생 여부": "X",
        "특기사항(기타)": "친구의 울음소리를 매우 힘들어하며 공격적인 태도를 보였으나 상해는 없음"
    }
    event3 = LogMainAdapter._normalize_row(row3_notes_only, row_idx=4)
    assert event3 is not None
    assert event3.safety.physical_restraint is False
    assert event3.safety.injury_to_others is False
    assert event3.safety.self_injury is False
    print("✅ Synthetic Row 3 (Notes only without explicit safety flag -> Safety flags all False): OK")

    # Synthetic Row 4: Invalid date should NOT forge date.today()
    row4_bad_date = {
        "발생날짜": "invalid-unparseable-date",
        "학생코드": "2411"
    }
    event4 = LogMainAdapter._normalize_row(row4_bad_date, row_idx=5)
    assert event4 is None, "Malformed date row must return None, not date.today()"
    print("✅ Synthetic Row 4 (Invalid date returns None, no date.today() forgery): OK")

    return True

def test_decision_signals_regression():
    print("\n" + "=" * 60)
    print("STEP 5: Testing Decision Signal Correctness & 14d Cutoff Rules")
    print("=" * 60)
    from app.core.time import today_kst, now_kst
    from app.services.decision.signals import evaluate_decision_signals
    from app.domain.models import BehaviorEvent, SafetyFlags, SignalSeverity, DecisionSignalType

    as_of = date(2026, 8, 18)

    def make_event(ev_date: date, physical_restraint: bool = False, has_abc: bool = True) -> BehaviorEvent:
        return BehaviorEvent(
            event_id=f"EV_{ev_date}",
            source_log_id="LOG_1",
            student_code="ST_01",
            event_date=ev_date,
            entered_by="교사",
            time_slot_codes=[1],
            time_slot_labels=["1구간"],
            location_codes=["교실"],
            primary_location="교실",
            behavior_code="자리이탈",
            behavior_raw="자리이탈",
            intensity=3,
            occurrence_count=1,
            antecedent="과제 지시" if has_abc else None,
            consequence="교사 지도" if has_abc else None,
            setting_events=[],
            teacher_function_estimates=[],
            safety=SafetyFlags(physical_restraint=physical_restraint),
            notes="관찰 내용",
            source="Log_Main"
        )

    # 1. KST test
    k_now = now_kst()
    k_today = today_kst()
    assert k_today is not None
    print(f"✅ KST Date Test: {k_today} (Current KST: {k_now.strftime('%Y-%m-%d %H:%M:%S %Z')})")

    # 2. Historical 2025/March 2026 Safety event -> Excluded from Today URGENT
    old_safety = [make_event(date(2025, 6, 1), physical_restraint=True)]
    sigs_old = evaluate_decision_signals("ST_01", old_safety, as_of_date=as_of, safety_window_days=14)
    safety_sigs_old = [s for s in sigs_old if s.signal_type == DecisionSignalType.SAFETY]
    assert len(safety_sigs_old) == 0, "Historical safety event must NOT appear in Today safety signals"
    print("✅ 2025 Safety Event -> Excluded from Today URGENT Safety Signals: OK")

    # 3. Recent 14d Safety event -> Included in Today URGENT
    recent_safety = [make_event(date(2026, 8, 10), physical_restraint=True)]
    sigs_recent = evaluate_decision_signals("ST_01", recent_safety, as_of_date=as_of, safety_window_days=14)
    safety_sigs_recent = [s for s in sigs_recent if s.signal_type == DecisionSignalType.SAFETY]
    assert len(safety_sigs_recent) == 1
    assert safety_sigs_recent[0].severity == SignalSeverity.URGENT
    assert "최근 14일간 1건" in safety_sigs_recent[0].reason
    print("✅ Recent 14d Safety Event -> Included in Today URGENT Safety Signals: OK")

    # 4. CHANGE_UP: Recent 14d (4 events) vs Previous 14d (1 event) -> CHANGE_UP emitted
    spike_events = [
        make_event(date(2026, 8, 15)),
        make_event(date(2026, 8, 14)),
        make_event(date(2026, 8, 10)),
        make_event(date(2026, 8, 6)),  # 4 in current 14d (Aug 5 ~ Aug 18)
        make_event(date(2026, 7, 25)), # 1 in previous 14d (Jul 22 ~ Aug 4)
    ]
    sigs_spike = evaluate_decision_signals("ST_01", spike_events, as_of_date=as_of)
    spike_sigs = [s for s in sigs_spike if s.signal_type == DecisionSignalType.CHANGE_UP]
    assert len(spike_sigs) == 1
    assert "최근 14일간 4건 발생 (직전 14일 1건 대비 빈도 증가)" in spike_sigs[0].reason
    print("✅ CHANGE_UP Test (Current 14d: 4 vs Prev 14d: 1 -> Spike Signal): OK")

    # 5. CHANGE_UP denominator isolation: 50 historical events in 2025 must NOT affect 14d comparison
    hist_events = [make_event(date(2025, 5, 1)) for _ in range(50)]
    sigs_hist = evaluate_decision_signals("ST_01", hist_events, as_of_date=as_of)
    spike_sigs_hist = [s for s in sigs_hist if s.signal_type == DecisionSignalType.CHANGE_UP]
    assert len(spike_sigs_hist) == 0, "50 historical events must not trigger recent spike"
    print("✅ CHANGE_UP Historical Isolation Test (Older 50 events ignored): OK")

    # 6. MORE_DATA: ABC complete < 3 for active student -> MORE_DATA emitted
    incomplete_events = [make_event(date(2026, 8, 10), has_abc=False) for _ in range(2)]
    sigs_more_data = evaluate_decision_signals("ST_01", incomplete_events, as_of_date=as_of, is_today_inbox=True)
    more_data_sigs = [s for s in sigs_more_data if s.signal_type == DecisionSignalType.MORE_DATA]
    assert len(more_data_sigs) == 1
    assert "3건 미만" in more_data_sigs[0].reason
    print("✅ MORE_DATA Test (ABC < 3 -> MORE_DATA signal): OK")

    # 7. MORE_DATA suppression: Historical Tier 1 student with no recent events -> Excluded from Today Inbox
    old_incomplete_events = [make_event(date(2025, 3, 1), has_abc=False)]
    sigs_old_inbox = evaluate_decision_signals("ST_01", old_incomplete_events, as_of_date=as_of, is_today_inbox=True, active_tier_names=["TIER_1"])
    more_data_old = [s for s in sigs_old_inbox if s.signal_type == DecisionSignalType.MORE_DATA]
    assert len(more_data_old) == 0, "Inactive historical Tier 1 student must NOT appear in Today MORE_DATA inbox"
    print("✅ MORE_DATA Inbox Suppression (Historical inactive student excluded): OK")

    return True

def test_health_routes():
    print("\n" + "=" * 60)
    print("STEP 6: Testing FastAPI Health Routes via TestClient")
    print("=" * 60)
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    
    # Test GET /health
    res_health = client.get("/health")
    assert res_health.status_code == 200, f"/health returned {res_health.status_code}"
    assert res_health.json() == {"status": "ok"}, f"/health returned {res_health.json()}"
    print("✅ GET /health: 200 {'status': 'ok'}")
    
    # Test GET /api/health
    res_api_health = client.get("/api/health")
    assert res_api_health.status_code == 200, f"/api/health returned {res_api_health.status_code}"
    assert res_api_health.json() == {"status": "ok"}, f"/api/health returned {res_api_health.json()}"
    print("✅ GET /api/health: 200 {'status': 'ok'}")
    
    return True

def test_p0_security_lockdown():
    print("\n" + "=" * 60)
    print("STEP 7: Testing P0-A Security Lockdown (Destructive Endpoints)")
    print("=" * 60)
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.config import settings

    client = TestClient(app)

    # In production mode, destructive resets must be blocked with HTTP 403
    settings.ENVIRONMENT = "production"

    res_reset_users = client.post("/api/v1/auth/reset-users")
    assert res_reset_users.status_code == 403, f"Expected 403 for reset-users in production, got {res_reset_users.status_code}"
    print("✅ POST /api/v1/auth/reset-users in Production -> 403 Forbidden: OK")

    res_reset_sheet = client.post("/api/v1/tier/reset-sheet")
    assert res_reset_sheet.status_code == 403, f"Expected 403 for reset-sheet in production, got {res_reset_sheet.status_code}"
    print("✅ POST /api/v1/tier/reset-sheet in Production -> 403 Forbidden: OK")

    # Reset environment back
    settings.ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
    return True

if __name__ == "__main__":
    t1 = test_imports()
    t2 = test_ebp_catalog()
    t3 = test_domain_constructors()
    t4 = test_synthetic_log_main_adapter()
    t5 = test_decision_signals_regression()
    t6 = test_health_routes()
    t7 = test_p0_security_lockdown()

    print("\n" + "=" * 60)
    if t1 and t2 and t3 and t4 and t5 and t6 and t7:
        print("🎉 ALL DOMAIN CONTRACT, ADAPTER, TIMEZONE, HEALTH & P0 SECURITY CHECKS PASSED!")
    else:
        print("❌ SOME CHECKS FAILED.")
    print("=" * 60)
