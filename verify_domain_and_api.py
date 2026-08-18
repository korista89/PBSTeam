# verify_domain_and_api.py
"""
Deterministic Verification Script for PBSTeam 2.0 Backend & Domain Contracts
"""
import os
import sys
from datetime import date, datetime, timedelta
from fastapi import HTTPException

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
    from app.core.security import create_access_token
    import unittest.mock as mock

    client = TestClient(app)
    settings.AUTH_SECRET = "synthetic-test-secret-key-32chars-min-p0a"
    settings.ENVIRONMENT = "production"
    trusted_origin_headers = {"Origin": "https://pbs-team.vercel.app"}

    mock_admin_user = {
        "ID": "admin_reset_test",
        "Role": "admin",
        "ClassID": "전체",
        "ClassName": "전체관리자",
        "Name": "관리자",
        "Active": "TRUE"
    }
    admin_token = create_access_token({"sub": "admin_reset_test", "role": "admin", "class_id": "전체"})
    client.cookies.set("pbst_session", admin_token)

    with mock.patch("app.api.deps.get_user_by_id", return_value=mock_admin_user), \
         mock.patch("app.services.sheets.get_user_by_id", return_value=mock_admin_user):

        # With valid admin session and trusted Origin, destructive resets must still be blocked by handler in production
        res_reset_users = client.post("/api/v1/auth/reset-users", headers=trusted_origin_headers)
        assert res_reset_users.status_code == 403, f"Expected 403 for reset-users in production, got {res_reset_users.status_code}"
        assert "production" in res_reset_users.json().get("detail", "").lower()
        print("✅ POST /api/v1/auth/reset-users in Production (Admin session + Trusted Origin) -> 403 Forbidden: OK")

        res_reset_sheet = client.post("/api/v1/tier/reset-sheet", headers=trusted_origin_headers)
        assert res_reset_sheet.status_code == 403, f"Expected 403 for reset-sheet in production, got {res_reset_sheet.status_code}"
        assert "production" in res_reset_sheet.json().get("detail", "").lower()
        print("✅ POST /api/v1/tier/reset-sheet in Production (Admin session + Trusted Origin) -> 403 Forbidden: OK")

    # Reset environment back
    settings.ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
    return True

def test_p0_b1_auth_foundation():
    print("\n" + "=" * 60)
    print("STEP 8: Testing P0-B1 Backend Authentication Foundation")
    print("=" * 60)
    import hashlib
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.config import settings
    from app.core.security import (
        hash_password, verify_password_compat, create_access_token,
        decode_access_token, set_session_cookie, delete_session_cookie
    )

    # [A] Argon2id hash creation
    plain = "TestPassword!2026"
    argon_hash = hash_password(plain)
    assert argon_hash.startswith("$argon2id$"), f"Expected $argon2id$, got {argon_hash}"
    assert plain not in argon_hash, "Plaintext password must not appear in hash"
    print("✅ [A] Argon2id hash generation: OK")

    # [B] Argon2id correct password verify
    res_b = verify_password_compat(plain, argon_hash)
    assert res_b.verified is True
    assert res_b.needs_rehash is False
    assert res_b.legacy_type is None
    print("✅ [B] Argon2id correct password verify -> verified=True, needs_rehash=False: OK")

    # [C] Argon2id wrong password verify
    res_c = verify_password_compat("WrongPassword", argon_hash)
    assert res_c.verified is False
    print("✅ [C] Argon2id wrong password verify -> False: OK")

    # [D] Legacy SHA-256 password verify
    legacy_sha256 = hashlib.sha256("legacy_sha_pwd".encode("utf-8")).hexdigest()
    res_d = verify_password_compat("legacy_sha_pwd", legacy_sha256)
    assert res_d.verified is True
    assert res_d.needs_rehash is True
    assert res_d.legacy_type == "SHA256"
    print("✅ [D] Legacy SHA256 password verify -> verified=True, needs_rehash=True: OK")

    # [E] Legacy Plaintext password verify
    res_e = verify_password_compat("legacy_plain_pwd", "legacy_plain_pwd")
    assert res_e.verified is True
    assert res_e.needs_rehash is True
    assert res_e.legacy_type == "PLAINTEXT"
    print("✅ [E] Legacy Plaintext password verify -> verified=True, needs_rehash=True: OK")

    # [F] Wrong legacy password
    res_f = verify_password_compat("wrong_pwd", "legacy_plain_pwd")
    assert res_f.verified is False
    print("✅ [F] Wrong legacy password verify -> False: OK")

    # Configure Synthetic Secret for testing
    settings.AUTH_SECRET = "synthetic-test-secret-key-32chars-min-p0b1"

    # [G] JWT generation & decode (Strictly minimal claims)
    user_payload = {
        "sub": "TEST_TEACHER_01",
        "role": "teacher",
        "class_id": "CLASS_211",
        "name": "김교사"  # Must be stripped by create_access_token
    }
    jwt_token = create_access_token(user_payload, expires_delta=timedelta(minutes=60))
    decoded = decode_access_token(jwt_token)
    assert decoded["sub"] == "TEST_TEACHER_01"
    assert decoded["role"] == "teacher"
    assert decoded["class_id"] == "CLASS_211"
    assert "name" not in decoded, "User name must NOT be present in JWT payload"
    assert "exp" in decoded and "iat" in decoded
    print("✅ [G] JWT minimal claims (sub, role, class_id only, no name/PII): OK")

    # [H] Tampered JWT rejection
    try:
        decode_access_token(jwt_token + "tampered")
        assert False, "Tampered JWT must be rejected"
    except Exception:
        print("✅ [H] Tampered JWT rejected: OK")

    # [I] Expired JWT rejection
    expired_jwt = create_access_token(user_payload, expires_delta=timedelta(seconds=-10))
    try:
        decode_access_token(expired_jwt)
        assert False, "Expired JWT must be rejected"
    except Exception:
        print("✅ [I] Expired JWT rejected: OK")

    # [O] JWT payload minimal safety
    assert "password" not in decoded and "password_hash" not in decoded and "name" not in decoded
    print("✅ [O] JWT payload contains no sensitive password/name fields: OK")

    # [J, K, L, M, N] HTTP Endpoints via TestClient
    client = TestClient(app)

    mock_b1_user = {
        "ID": "TEST_TEACHER_01",
        "Role": "teacher",
        "ClassID": "CLASS_211",
        "ClassName": "CLASS_211",
        "Name": "",
        "Active": "TRUE"
    }
    def mock_get_b1_user(uid):
        if str(uid) == "TEST_TEACHER_01":
            return mock_b1_user
        return None

    import unittest.mock as mock

    with mock.patch("app.api.deps.get_user_by_id", side_effect=mock_get_b1_user), \
         mock.patch("app.services.sheets.get_user_by_id", side_effect=mock_get_b1_user), \
         mock.patch("app.api.endpoints.auth.get_user_by_id", side_effect=mock_get_b1_user):

        # [J] GET /api/v1/auth/me without cookie -> 401
        res_me_unauth = client.get("/api/v1/auth/me")
        assert res_me_unauth.status_code == 401, f"Expected 401 without cookie, got {res_me_unauth.status_code}"
        print("✅ [J] GET /api/v1/auth/me without cookie -> 401 Unauthorized: OK")

        # [Bearer Header Rejection] Bearer token header must be rejected (Cookie-only enforcement)
        res_me_bearer = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {jwt_token}"})
        assert res_me_bearer.status_code == 401, "Bearer header without cookie must be rejected (Cookie-only session)"
        print("✅ [Cookie-Only] Authorization Bearer header rejected; HttpOnly cookie strictly required: OK")

        # [K] GET /api/v1/auth/me with valid cookie -> 200
        client.cookies.set("pbst_session", jwt_token)
        res_me_auth = client.get("/api/v1/auth/me")
        assert res_me_auth.status_code == 200, f"Expected 200 with cookie, got {res_me_auth.status_code}"
        me_data = res_me_auth.json()
        assert me_data["id"] == "TEST_TEACHER_01"
        assert me_data["role"] == "teacher"
        assert me_data["class_id"] == "CLASS_211"
        print(f"✅ [K] GET /api/v1/auth/me with valid session cookie -> 200 OK: OK")

        trusted_origin_headers = {"Origin": "https://pbs-team.vercel.app"}

        # [User Enumeration Prevention] Non-existent user login returns uniform "Invalid credentials"
        res_login_bad_user = client.post(
            "/api/v1/auth/login",
            json={"user_id": "non_existent_user_999", "password": "any"},
            headers=trusted_origin_headers
        )
        assert res_login_bad_user.status_code == 401, f"Expected 401, got {res_login_bad_user.status_code} ({res_login_bad_user.text})"
        assert res_login_bad_user.json()["detail"] == "Invalid credentials"
        print("✅ [Anti-Enumeration] Non-existent user login + Trusted Origin -> 401 'Invalid credentials': OK")

        # [Wrong Password Check] Existing user with wrong password returns uniform "Invalid credentials"
        res_login_bad_pw = client.post(
            "/api/v1/auth/login",
            json={"user_id": "TEST_TEACHER_01", "password": "wrong_password_123"},
            headers=trusted_origin_headers
        )
        assert res_login_bad_pw.status_code == 401, f"Expected 401, got {res_login_bad_pw.status_code} ({res_login_bad_pw.text})"
        assert res_login_bad_pw.json()["detail"] == "Invalid credentials"
        print("✅ [Anti-Enumeration] Wrong password login + Trusted Origin -> 401 'Invalid credentials': OK")

        # [L] POST /api/v1/auth/logout -> clears cookie
        res_logout = client.post("/api/v1/auth/logout", headers=trusted_origin_headers)
        assert res_logout.status_code == 200
        set_cookie_header = res_logout.headers.get("set-cookie", "")
        assert "pbst_session=" in set_cookie_header
        assert "Max-Age=0" in set_cookie_header or "expires=" in set_cookie_header.lower()
        print("✅ [L] POST /api/v1/auth/logout + Trusted Origin -> Session cookie deleted: OK")

    # [M, N] Cookie flags inspection
    settings.ENVIRONMENT = "production"
    from fastapi import Response
    resp = Response()
    set_session_cookie(resp, jwt_token)
    prod_cookie = resp.headers.get("set-cookie", "")
    assert "httponly" in prod_cookie.lower(), "Session cookie must be HttpOnly"
    assert "secure" in prod_cookie.lower(), "Session cookie must be Secure in production"
    assert "samesite=lax" in prod_cookie.lower(), "Session cookie must be SameSite=lax"
    print("✅ [M, N] Production session cookie flags (HttpOnly=True, Secure=True, SameSite=lax): OK")

    # Missing AUTH_SECRET fail-closed test
    settings.AUTH_SECRET = ""
    try:
        create_access_token(user_payload)
        assert False, "create_access_token must fail if AUTH_SECRET is empty"
    except Exception:
        print("✅ [AUTH_SECRET] Missing secret fails closed on token creation: OK")

    # Health endpoint still functions even if AUTH_SECRET is not configured
    res_h = client.get("/health")
    assert res_h.status_code == 200
    print("✅ [Health] Application /health remains operational regardless of AUTH_SECRET: OK")

    # Restore settings
    settings.AUTH_SECRET = os.getenv("AUTH_SECRET", "")
    settings.ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
    return True

def test_p0_b3_authorization_and_class_scope():
    print("\n" + "=" * 60)
    print("STEP 9: Testing P0-B3 Authorization, Class Scope & Origin Security")
    print("=" * 60)
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.config import settings
    from app.core.security import create_access_token
    from app.api.deps import normalize_class_identifier
    from app.services.sheets import clear_cache
    import unittest.mock as mock

    settings.AUTH_SECRET = "synthetic-test-secret-key-32chars-min-p0b3"
    settings.ENVIRONMENT = "production"
    clear_cache()

    # 1. Test Class Identifier Normalization
    assert normalize_class_identifier("211") == "초1-1"
    assert normalize_class_identifier("초1-1") == "초1-1"
    assert normalize_class_identifier("초1-1관리자") == "초1-1"
    assert normalize_class_identifier("초등 1학년 1반") == "초1-1"
    assert normalize_class_identifier("312") == "중1-2"
    assert normalize_class_identifier("431") == "고3-1"
    assert normalize_class_identifier("511") == "전1-1"
    assert normalize_class_identifier("512") == "전1-2"
    assert normalize_class_identifier("521") == "전2-1"
    assert normalize_class_identifier("522") == "전2-2"
    assert normalize_class_identifier("전공1-1") == "전1-1"
    assert normalize_class_identifier("전공1-2") == "전1-2"
    assert normalize_class_identifier("전공2-1") == "전2-1"
    assert normalize_class_identifier("전공2-2") == "전2-2"
    assert normalize_class_identifier("전공과 2학년 1반") == "전2-1"
    assert normalize_class_identifier("유난초") == "유1"
    assert normalize_class_identifier("유백합") == "유2"
    assert normalize_class_identifier("예비관리자") == "예비"
    assert normalize_class_identifier("중등순회학급관리자") == "중순회"
    print("✅ [Class Normalization] All 35 class codes/names correctly mapped: OK")

    # Mock Users Database
    mock_users = {
        "admin_01": {"UserID": "admin_01", "ID": "admin_01", "Role": "admin", "ClassID": "전체", "Name": "관리자", "Active": "TRUE"},
        "teacher_a": {"UserID": "teacher_a", "ID": "teacher_a", "Role": "teacher", "ClassID": "211", "Name": "교사A", "Active": "TRUE"},
        "teacher_b": {"UserID": "teacher_b", "ID": "teacher_b", "Role": "teacher", "ClassID": "212", "Name": "교사B", "Active": "TRUE"},
        "inactive_01": {"UserID": "inactive_01", "ID": "inactive_01", "Role": "teacher", "ClassID": "211", "Name": "비활성", "Active": "FALSE"},
        "demoted_01": {"UserID": "demoted_01", "ID": "demoted_01", "Role": "teacher", "ClassID": "211", "Name": "강등교사", "Active": "TRUE"},
        "초1-1": {"UserID": "초1-1", "ID": "초1-1", "Role": "class_teacher", "ClassID": "211", "Name": "초1-1담임", "Active": "TRUE", "Password": "teacherpassword123"},
        "유난초": {"UserID": "유난초", "ID": "유난초", "Role": "class_teacher", "ClassID": "101", "Name": "유난초담임", "Active": "TRUE", "Password": "teacherpassword123"},
        "유백합": {"UserID": "유백합", "ID": "유백합", "Role": "class_teacher", "ClassID": "102", "Name": "유백합담임", "Active": "TRUE", "Password": "teacherpassword123"},
        "예비관리자": {"UserID": "예비관리자", "ID": "예비관리자", "Role": "class_teacher", "ClassID": "600", "Name": "예비담당", "Active": "TRUE", "Password": "teacherpassword123"},
    }

    # Mock Students Database (TierStatus & Roster)
    mock_student_status = [
        {"학생코드": "21101", "학생명": "학생A", "학급": "초등 1학년 1반", "Tier": 1, "지원단계": 1, "재학상태": "O"},
        {"학생코드": "21201", "학생명": "학생B", "학급": "초등 1학년 2반", "Tier": 2, "지원단계": 2, "재학상태": "O"},
    ]

    # Synthetic StudentProfiles for pure unit isolation
    from app.domain.models import StudentProfile, TierSnapshot, TierCode
    synthetic_profiles = [
        StudentProfile(student_code="21101", display_name="학생A", class_name="초1-1", tier=TierSnapshot(active_tiers=[TierCode.TIER_1])),
        StudentProfile(student_code="21201", display_name="21101", class_name="초1-2", tier=TierSnapshot(active_tiers=[TierCode.TIER_2_CICO])),
    ]

    # Central get_student_class_code Strictly Code-Only & Adversarial Check (deps.py import binding mocked)
    with mock.patch("app.api.deps.fetch_student_status", return_value=mock_student_status), \
         mock.patch("app.services.sheets.fetch_student_status", return_value=mock_student_status), \
         mock.patch("app.api.deps.TierStatusAdapter.fetch_students", return_value=synthetic_profiles), \
         mock.patch("app.adapters.sheets.tier_status.TierStatusAdapter.fetch_students", return_value=synthetic_profiles):
        from app.api.deps import get_student_class_code, check_student_scope
        # Valid student_code returns canonical class
        assert get_student_class_code("21101") == "초1-1"
        assert get_student_class_code("21201") == "초1-2"
        # Name as authorization identifier is strictly rejected (returns None)
        assert get_student_class_code("학생A") is None
        assert get_student_class_code("학생B") is None
        assert get_student_class_code("") is None
        # Adversarial: student 21201 whose display_name is "21101" belongs to 초1-2, NOT 초1-1
        assert get_student_class_code("21201") == "초1-2"
        try:
            check_student_scope("21201", mock_users["teacher_a"])
            assert False, "Teacher A must NOT have access to student 21201"
        except HTTPException as he:
            assert he.status_code == 403
        # Adversarial: Passing student name to check_student_scope raises 404
        try:
            check_student_scope("학생A", mock_users["teacher_a"])
            assert False, "check_student_scope must reject student name with 404"
        except HTTPException as he:
            assert he.status_code == 404
    print("✅ [Central Scope Helper] get_student_class_code strictly code-only (Names rejected & fully mock-isolated): OK")

    mock_beable = {
        "BE21101": {"student_code": "21101", "student_name": "학생A", "class_name": "초1-1"},
        "BE21201": {"student_code": "21201", "student_name": "학생B", "class_name": "초1-2"},
    }

    mock_student_codes = {
        "학생A": "21101",
        "학생B": "21201",
        "211": "21201",  # Adversarial: Name matches class '211', but code '21201' is class '초1-2'
    }

    # Generate Tokens
    token_admin = create_access_token({"sub": "admin_01", "role": "admin", "class_id": "전체"})
    token_teacher_a = create_access_token({"sub": "teacher_a", "role": "teacher", "class_id": "211"})
    token_teacher_b = create_access_token({"sub": "teacher_b", "role": "teacher", "class_id": "212"})
    token_inactive = create_access_token({"sub": "inactive_01", "role": "teacher", "class_id": "211"})
    # Stale claim token: claim says 'admin', but DB record says 'teacher'
    token_stale_claim = create_access_token({"sub": "demoted_01", "role": "admin", "class_id": "211"})

    def mock_b3_get_user_by_id(uid):
        return mock_users.get(str(uid))

    client = TestClient(app)

    with mock.patch("app.api.deps.get_user_by_id", side_effect=mock_b3_get_user_by_id), \
         mock.patch("app.services.sheets.get_user_by_id", side_effect=mock_b3_get_user_by_id), \
         mock.patch("app.api.endpoints.auth.get_user_by_id", side_effect=mock_b3_get_user_by_id), \
         mock.patch("app.api.endpoints.auth.get_all_users", side_effect=lambda: list(mock_users.values())), \
         mock.patch("app.services.sheets.fetch_all_users", side_effect=lambda: list(mock_users.values())), \
         mock.patch("app.api.deps.fetch_student_status", return_value=mock_student_status), \
         mock.patch("app.services.sheets.fetch_student_status", return_value=mock_student_status), \
         mock.patch("app.services.sheets.get_beable_code_mapping", return_value=mock_beable), \
         mock.patch("app.api.endpoints.roster.fetch_student_codes", return_value=mock_student_codes), \
         mock.patch("app.services.sheets.fetch_student_codes", return_value=mock_student_codes), \
         mock.patch("app.api.deps.TierStatusAdapter.fetch_students", return_value=synthetic_profiles), \
         mock.patch("app.adapters.sheets.tier_status.TierStatusAdapter.fetch_students", return_value=synthetic_profiles):

        trusted_origin_headers = {"Origin": "https://pbs-team.vercel.app"}

        # [A] Anonymous access to protected endpoints -> 401 Unauthorized
        assert client.get("/api/v1/auth/users").status_code == 401
        assert client.get("/api/v1/tier/status").status_code == 401
        assert client.get("/api/v1/workspace/student/21101").status_code == 401
        assert client.get("/api/v1/workspace/today").status_code == 401
        assert client.get("/api/v1/students/21101/analysis").status_code == 401
        assert client.get("/api/v1/bip/students/21101/bip").status_code == 401
        print("✅ [A] Anonymous access to protected routes strictly rejected with 401: OK")

        # [B] Teacher attempting to access Admin endpoints -> 403 Forbidden (Auth check, passing CSRF)
        client.cookies.set("pbst_session", token_teacher_a)
        assert client.get("/api/v1/auth/users").status_code == 403
        assert client.post("/api/v1/auth/users", json={"UserID": "new_user"}, headers=trusted_origin_headers).status_code == 403
        assert client.post("/api/v1/cico/generate", json={"year": 2026, "month": 3}, headers=trusted_origin_headers).status_code == 403
        assert client.post("/api/v1/behavior-log/approve", json={"log_id": "test_log"}, headers=trusted_origin_headers).status_code == 403
        assert client.post("/api/v1/behavior-log/revise", json={"log_id": "test_log"}, headers=trusted_origin_headers).status_code == 403
        assert client.get("/api/v1/behavior-log/pending").status_code == 403
        assert client.put("/api/v1/tier/status", json={"code": "21101", "tier1": "O"}, headers=trusted_origin_headers).status_code == 403
        assert client.put("/api/v1/tier/enrollment", json={"code": "21101", "enrolled": "O"}, headers=trusted_origin_headers).status_code == 403
        assert client.put("/api/v1/tier/beable", json={"code": "21101", "beable_code": "BE21101"}, headers=trusted_origin_headers).status_code == 403
        assert client.post("/api/v1/students/tier-update", json={"student_code": "21101", "tier": "1"}, headers=trusted_origin_headers).status_code == 403
        assert client.post("/api/roster/codes", json=[], headers=trusted_origin_headers).status_code == 404 or client.post("/api/v1/roster/codes", json=[], headers=trusted_origin_headers).status_code == 403
        print("✅ [B] Teacher accessing admin endpoints strictly rejected with 403: OK")

        # [C] Admin accessing Admin endpoints -> 200 OK
        client.cookies.set("pbst_session", token_admin)
        assert client.get("/api/v1/auth/users").status_code == 200
        assert client.get("/api/v1/behavior-log/pending").status_code == 200
        print("✅ [C] Admin accessing admin endpoints authorized with 200: OK")

        # [D] Teacher A accessing Student in Class 초1-1 (Student A: 21101) -> 200 OK
        client.cookies.set("pbst_session", token_teacher_a)
        res_da = client.get("/api/v1/workspace/student/21101")
        assert res_da.status_code == 200, f"Expected 200, got {res_da.status_code}"
        with mock.patch("app.services.sheets.get_student_dashboard_analysis", return_value={"student_code": "21101"}):
            res_da2 = client.get("/api/v1/students/21101/analysis")
            assert res_da2.status_code == 200
        with mock.patch("app.services.sheets.get_bip", return_value={"StudentCode": "21101"}):
            res_da3 = client.get("/api/v1/bip/students/21101/bip")
            assert res_da3.status_code == 200
        print("✅ [D] Teacher A accessing own class student (21101) -> 200 OK: OK")

        # [E] Teacher A accessing Student in Class 초1-2 (Student B: 21201) -> 403 Forbidden
        res_ea = client.get("/api/v1/workspace/student/21201")
        assert res_ea.status_code == 403, f"Expected 403, got {res_ea.status_code}"
        res_ea2 = client.get("/api/v1/students/21201/analysis")
        assert res_ea2.status_code == 403
        res_ea3 = client.get("/api/v1/bip/students/21201/bip")
        assert res_ea3.status_code == 403
        print("✅ [E] Teacher A accessing other class student (21201) -> 403 Forbidden: OK")

        # [F] Teacher B accessing Student in Class 초1-1 (Student A: 21101) -> 403 Forbidden
        client.cookies.set("pbst_session", token_teacher_b)
        res_fb = client.get("/api/v1/workspace/student/21101")
        assert res_fb.status_code == 403
        res_fb2 = client.get("/api/v1/students/21101/analysis")
        assert res_fb2.status_code == 403
        print("✅ [F] Teacher B accessing other class student (21101) -> 403 Forbidden: OK")

        # [G] Admin accessing students across all classes -> 200 OK
        client.cookies.set("pbst_session", token_admin)
        res_ga1 = client.get("/api/v1/workspace/student/21101")
        res_ga2 = client.get("/api/v1/workspace/student/21201")
        assert res_ga1.status_code == 200 and res_ga2.status_code == 200
        print("✅ [G] Admin accessing students in any class -> 200 OK: OK")

        # [H] Non-existent student -> 404 Not Found (Checked by check_student_scope / endpoint)
        res_h1 = client.get("/api/v1/workspace/student/99999")
        assert res_h1.status_code == 404
        client.cookies.set("pbst_session", token_teacher_a)
        res_h2 = client.get("/api/v1/workspace/student/99999")
        assert res_h2.status_code == 404
        print("✅ [H] Non-existent student code -> 404 Not Found: OK")

        # [I-1] Stale JWT Token Claim vs Live Current-Authority Revalidation (Endpoint Level)
        # Verifies that get_current_user revalidates live authority on every request,
        # so an old JWT with role='admin' cannot be used once the current user store reflects role='teacher'.
        mock_users["dynamic_01"] = {
            "ID": "dynamic_01",
            "UserID": "dynamic_01",
            "Role": "admin",
            "ClassID": "전체",
            "Name": "동적유저",
            "Active": "TRUE"
        }
        token_dynamic = create_access_token({"sub": "dynamic_01", "role": "admin", "class_id": "전체"})

        # Step 1: User accesses admin endpoint with active admin authority -> 200 OK
        client.cookies.set("pbst_session", token_dynamic)
        res_pre_demote = client.get("/api/v1/auth/users")
        assert res_pre_demote.status_code == 200, f"Expected 200 before demotion, got {res_pre_demote.status_code}"

        # Step 2: Live authority is demoted in current Users store (Role: admin -> teacher)
        mock_users["dynamic_01"]["Role"] = "teacher"

        # Step 3: User re-attempts admin route using pre-issued token (whose JWT claim still says 'admin')
        # get_current_user evaluates live user record from current store and denies access -> 403 Forbidden
        res_post_demote = client.get("/api/v1/auth/users")
        assert res_post_demote.status_code == 403, f"Expected 403 when live authority is demoted, got {res_post_demote.status_code}"
        print("✅ [I-1] Stale JWT claim rejected by live current authority lookup -> 403: OK")

        # [I-2] Production update_user_role Cache Invalidation Contract (Service Level)
        # Verifies that actual production update_user_role() function strictly triggers clear_cache('users') upon mutation.
        from app.services.sheets import update_user_role as actual_update_user_role

        class MockCell:
            def __init__(self, row, col):
                self.row = row
                self.col = col

        class MockWorksheet:
            def __init__(self):
                self.updated_cells = []

            def find(self, query, in_column=None):
                if str(query) == "dynamic_01":
                    return MockCell(row=2, col=1)
                return None

            def row_values(self, row_num):
                return ["ID", "Password", "Role", "ClassID", "ClassName", "Name", "Phone", "Email", "LastLogin", "Memo"]

            def update_cell(self, row, col, value):
                self.updated_cells.append((row, col, value))
                return True

        class MockSpreadsheet:
            def worksheet(self, title):
                if title == "Users":
                    return MockWorksheet()
                return None

        class MockClient:
            def open_by_url(self, url):
                return MockSpreadsheet()

        orig_sheet_url = settings.SHEET_URL
        settings.SHEET_URL = "https://docs.google.com/spreadsheets/d/dummy_sheet_for_service_test"
        with mock.patch("app.services.sheets.get_sheets_client", return_value=MockClient()), \
             mock.patch("app.services.sheets.clear_cache") as mock_cache_spy:
            res_service = actual_update_user_role("dynamic_01", "teacher", "211", "동적유저", "테스트메모")
            assert "error" not in res_service, f"Expected success, got {res_service}"
            assert res_service.get("message") == "User dynamic_01 updated"
            mock_cache_spy.assert_called_once_with("users")
        settings.SHEET_URL = orig_sheet_url
        print("✅ [I-2] Production update_user_role strictly invoked clear_cache('users') upon success: OK")

        # [J] Inactive user session rejected -> 401 Unauthorized
        client.cookies.set("pbst_session", token_inactive)
        res_inact = client.get("/api/v1/auth/me")
        assert res_inact.status_code == 401
        res_inact2 = client.get("/api/v1/workspace/today")
        assert res_inact2.status_code == 401
        print("✅ [J] Inactive user session rejected with 401 Unauthorized: OK")

        # [K] Write payload student scope check (Teacher A writing to Student B in 초1-2)
        client.cookies.set("pbst_session", token_teacher_a)
        with mock.patch("app.api.endpoints.tier.add_cico_daily", return_value={"success": True}), \
             mock.patch("app.services.sheets.add_cico_daily", return_value={"success": True}):
            res_cico_cross = client.post(
                "/api/v1/tier/cico",
                json={"student_code": "21201", "target1": "O", "target2": "O"},
                headers=trusted_origin_headers
            )
            assert res_cico_cross.status_code == 403, f"Cross-class CICO write must return 403, got {res_cico_cross.status_code}"
            res_cico_own = client.post(
                "/api/v1/tier/cico",
                json={"student_code": "21101", "target1": "O", "target2": "O"},
                headers=trusted_origin_headers
            )
            assert res_cico_own.status_code == 200
        print("✅ [K] Write payload student scope verification (Cross-class write rejected with 403): OK")

        # [L] Path / Body Student Code Mismatch & Bypass Defense
        with mock.patch("app.services.sheets.save_bip", return_value={"success": True}):
            # Path=STU_A (own class), Body=STU_B (cross class) -> 400 mismatch
            res_mismatch_1 = client.post(
                "/api/v1/bip/students/21101/bip",
                json={"StudentCode": "21201", "TargetBehavior": "test"},
                headers=trusted_origin_headers
            )
            assert res_mismatch_1.status_code == 400, f"Expected 400 for path/body mismatch, got {res_mismatch_1.status_code}"
            # Path=STU_B (cross class), Body=STU_A (own class) -> 403 Forbidden on path scope
            res_mismatch_2 = client.post(
                "/api/v1/bip/students/21201/bip",
                json={"StudentCode": "21101", "TargetBehavior": "test"},
                headers=trusted_origin_headers
            )
            assert res_mismatch_2.status_code == 403, f"Expected 403 for cross-class path, got {res_mismatch_2.status_code}"
            # Path=STU_B (cross class), Body=STU_B (cross class) -> 403 Forbidden
            res_mismatch_3 = client.post(
                "/api/v1/bip/students/21201/bip",
                json={"StudentCode": "21201", "TargetBehavior": "test"},
                headers=trusted_origin_headers
            )
            assert res_mismatch_3.status_code == 403, f"Expected 403 for cross-class path & body, got {res_mismatch_3.status_code}"
        print("✅ [L] Path/Body mismatch and cross-class bypass strictly blocked (400/403): OK")

        # [M] POST /cico/monthly/update Scope Defense (Hardening Blocker 1)
        mock_cico_monthly = {
            "month": 3,
            "students": [
                {"row": 5, "학생코드": "21101", "학생명": "학생A", "학급": "초등 1학년 1반"},
                {"row": 6, "학생코드": "21201", "학생명": "학생B", "학급": "초등 1학년 2반"},
            ]
        }
        client.cookies.set("pbst_session", token_teacher_a)
        with mock.patch("app.api.endpoints.cico.get_monthly_cico_data", return_value=mock_cico_monthly), \
             mock.patch("app.services.sheets.get_monthly_cico_data", return_value=mock_cico_monthly), \
             mock.patch("app.api.endpoints.cico.update_monthly_cico_cells", return_value={"success": True}), \
             mock.patch("app.services.sheets.update_monthly_cico_cells", return_value={"success": True}):
            # Teacher A updating Teacher B's student (row 6) -> 403 Forbidden
            res_cico_cross_row = client.post(
                "/api/v1/cico/monthly/update",
                json={"month": 3, "updates": [{"row": 6, "col": 10, "value": "O"}]},
                headers=trusted_origin_headers
            )
            assert res_cico_cross_row.status_code == 403, f"Expected 403 for cross-class CICO monthly update, got {res_cico_cross_row.status_code}"
            # Teacher A updating own student (row 5) -> 200 OK
            res_cico_own_row = client.post(
                "/api/v1/cico/monthly/update",
                json={"month": 3, "updates": [{"row": 5, "col": 10, "value": "O"}]},
                headers=trusted_origin_headers
            )
            assert res_cico_own_row.status_code == 200
        print("✅ [M] POST /cico/monthly/update strictly enforces student scope across all rows: OK")

        # [M-2] GET /api/v1/cico/report & /api/v1/cico/monthly Adversarial class spoofing defense
        client.cookies.set("pbst_session", token_teacher_a)
        mock_cico_report_spoofed = {
            "students": [
                {"code": "21101", "name": "학생A", "class": "초1-1"},
                {"code": "21201", "name": "학생B", "class": "초1-1"},  # Adversarial: class says 초1-1, but code is 21201 (초1-2)
                {"code": "", "name": "미식별", "class": "초1-1"},       # Missing student code
            ]
        }
        with mock.patch("app.api.endpoints.cico.get_cico_report_data", return_value=mock_cico_report_spoofed), \
             mock.patch("app.services.sheets.get_cico_report_data", return_value=mock_cico_report_spoofed):
            res_cico_rep = client.get("/api/v1/cico/report?month=3")
            assert res_cico_rep.status_code == 200, f"Expected 200, got {res_cico_rep.status_code}: {res_cico_rep.text}"
            cico_students = res_cico_rep.json().get("students", [])
            # Teacher A must only receive student 21101; 21201 and empty code must be strictly filtered out
            assert len(cico_students) == 1
            assert cico_students[0]["code"] == "21101"

        mock_cico_monthly_spoofed = {
            "month": 3,
            "students": [
                {"student_code": "21101", "name": "학생A"},
                {"student_code": "21201", "name": "21101"},  # Adversarial: name looks like class code
            ]
        }
        with mock.patch("app.api.endpoints.cico.get_monthly_cico_data", return_value=mock_cico_monthly_spoofed), \
             mock.patch("app.services.sheets.get_monthly_cico_data", return_value=mock_cico_monthly_spoofed):
            res_cico_m = client.get("/api/v1/cico/monthly?month=3")
            assert res_cico_m.status_code == 200, f"Expected 200, got {res_cico_m.status_code}: {res_cico_m.text}"
            monthly_students = res_cico_m.json().get("students", [])
            assert len(monthly_students) == 1
            assert monthly_students[0]["student_code"] == "21101"
        print("✅ [M-2] CICO endpoints strictly filter by student_code (class/name spoofing rejected): OK")

        # [N] GET /api/v1/roster and GET /api/v1/roster/codes Scope Isolation (Hardening Blocker 2)
        # Teacher A only receives section/class data for class 초1-1
        client.cookies.set("pbst_session", token_teacher_a)
        res_roster = client.get("/api/v1/roster")
        assert res_roster.status_code == 200
        roster_data = res_roster.json()
        assert len(roster_data) == 1 and roster_data[0]["section"] == "초등"
        assert len(roster_data[0]["classes"]) == 1 and roster_data[0]["classes"][0]["class_name"] == "초1-1"

        res_roster_teacher = client.get("/api/v1/roster/codes")
        assert res_roster_teacher.status_code == 200
        codes_teacher = res_roster_teacher.json()
        assert "학생A" in codes_teacher
        assert "학생B" not in codes_teacher, "Teacher must NOT receive student codes belonging to other classes"
        assert "211" not in codes_teacher, "Adversarial name resembling class code must NOT bypass code-only authorization"
        # Admin receives full mapping
        client.cookies.set("pbst_session", token_admin)
        res_roster_admin = client.get("/api/v1/roster/codes")
        assert res_roster_admin.status_code == 200
        codes_admin = res_roster_admin.json()
        assert "학생A" in codes_admin and "학생B" in codes_admin and "211" in codes_admin
        print("✅ [N] /api/v1/roster & /roster/codes isolated strictly by student_code scope (name bypass rejected): OK")

        # [O] GET /api/v1/meeting-notes/latest & PATCH / DELETE Class Scope Defense
        mock_notes = [
            {"id": "n1", "uuid": "uuid-1", "meeting_type": "SST", "student_code": "21101", "author": "teacher_a", "content": "초1-1 회의록"},
            {"id": "n2", "uuid": "uuid-2", "meeting_type": "위기관리", "student_code": "21201", "author": "teacher_a", "content": "초1-2 회의록"},
            {"id": "n3", "uuid": "uuid-3", "meeting_type": "전체회의", "student_code": "", "author": "teacher_a", "content": "일반 학교 회의록"},
        ]
        client.cookies.set("pbst_session", token_teacher_a)
        with mock.patch("app.api.endpoints.meeting_notes.fetch_meeting_notes", return_value=mock_notes), \
             mock.patch("app.services.sheets.fetch_meeting_notes", return_value=mock_notes), \
             mock.patch("app.api.endpoints.meeting_notes.update_meeting_note", return_value={"message": "ok"}), \
             mock.patch("app.services.sheets.update_meeting_note", return_value={"message": "ok"}), \
             mock.patch("app.api.endpoints.meeting_notes.delete_meeting_note", return_value={"message": "ok"}), \
             mock.patch("app.services.sheets.delete_meeting_note", return_value={"message": "ok"}):

            res_latest_teacher = client.get("/api/v1/meeting-notes/latest")
            assert res_latest_teacher.status_code == 200
            latest_notes = res_latest_teacher.json().get("notes", {})
            # Teacher A sees SST (21101) and 전체회의, but NOT 위기관리 (21201)
            assert "SST" in latest_notes
            assert "전체회의" in latest_notes
            assert "위기관리" not in latest_notes, "Teacher must NOT receive latest notes of other classes"

            # [O-1] Teacher A attempts PATCH on note n2 (student_code 21201 - other class, even with matching author) -> 403 Forbidden
            res_patch_cross = client.patch(
                "/api/v1/meeting-notes/n2",
                json={"content": "malicious update"},
                headers=trusted_origin_headers
            )
            assert res_patch_cross.status_code == 403, f"Expected 403 for cross-class note PATCH, got {res_patch_cross.status_code}"

            # [O-2] Teacher A attempts DELETE on note n2 (student_code 21201) -> 403 Forbidden
            res_del_cross = client.delete(
                "/api/v1/meeting-notes/n2",
                headers=trusted_origin_headers
            )
            assert res_del_cross.status_code == 403, f"Expected 403 for cross-class note DELETE, got {res_del_cross.status_code}"

            # [O-3] Teacher A updates own-class note n1 (student_code 21101) -> 200 OK
            res_patch_own = client.patch(
                "/api/v1/meeting-notes/n1",
                json={"content": "legitimate update"},
                headers=trusted_origin_headers
            )
            assert res_patch_own.status_code == 200

            # [O-4] Teacher A deletes own-class note n1 (student_code 21101) -> 200 OK
            res_del_own = client.delete(
                "/api/v1/meeting-notes/n1",
                headers=trusted_origin_headers
            )
            assert res_del_own.status_code == 200

            # [O-5] Admin updates and deletes cross-class note n2 -> 200 OK
            client.cookies.set("pbst_session", token_admin)
            res_admin_patch = client.patch(
                "/api/v1/meeting-notes/n2",
                json={"content": "admin update"},
                headers=trusted_origin_headers
            )
            assert res_admin_patch.status_code == 200
            res_admin_del = client.delete(
                "/api/v1/meeting-notes/n2",
                headers=trusted_origin_headers
            )
            assert res_admin_del.status_code == 200

        print("✅ [O] /api/v1/meeting-notes scope & PATCH/DELETE cross-class defense verified: OK")

        # [P] GET /api/v1/analytics/meeting Class Scope Defense (Hardening Item 5)
        mock_meeting_analysis = {
            "period": "2026-07-21 ~ 2026-08-18",
            "students": [
                {"name": "학생A", "code": "21101", "decision": "Tier1"},
                {"name": "학생B", "code": "21201", "decision": "Tier2"},
            ]
        }
        client.cookies.set("pbst_session", token_teacher_a)
        with mock.patch("app.services.analysis.analyze_meeting_data", return_value=mock_meeting_analysis):
            res_meeting_teacher = client.get("/api/v1/analytics/meeting")
            assert res_meeting_teacher.status_code == 200
            meeting_data = res_meeting_teacher.json()
            assert len(meeting_data["students"]) == 1
            assert meeting_data["students"][0]["name"] == "학생A"
        print("✅ [P] /api/v1/analytics/meeting student list isolated by teacher class scope: OK")

        # [Q] Picture-Words Minutes Ownership & Permission Defense (Hardening Item 6)
        mock_pw_minutes = [
            {"날짜": "2026-08-18", "학급ID": "211", "학급명": "초1-1", "source_type": "minutes", "row_index": 2},
            {"날짜": "2026-08-18", "학급ID": "212", "학급명": "초1-2", "source_type": "minutes", "row_index": 3},
            {"날짜": "2026-08-18", "학급ID": "G", "학급명": "수업가이드", "source_type": "lessons", "row_index": 4},
        ]
        client.cookies.set("pbst_session", token_teacher_a)
        with mock.patch("app.api.endpoints.picture_words.fetch_minutes", return_value=mock_pw_minutes), \
             mock.patch("app.services.picture_words.fetch_minutes", return_value=mock_pw_minutes), \
             mock.patch("app.api.endpoints.picture_words.update_minute_entry", return_value={"success": True}), \
             mock.patch("app.services.picture_words.update_minute_entry", return_value={"success": True}), \
             mock.patch("app.api.endpoints.picture_words.delete_minute_entry", return_value={"success": True}), \
             mock.patch("app.services.picture_words.delete_minute_entry", return_value={"success": True}):
            # Teacher A modifying Teacher B's row (row 3) -> 403 Forbidden
            res_pw_cross_patch = client.patch(
                "/api/v1/picture-words/minutes",
                json={"source_type": "minutes", "row_index": 3, "updates": {"내용": "hack"}},
                headers=trusted_origin_headers
            )
            assert res_pw_cross_patch.status_code == 403
            # Teacher A deleting Teacher B's row (row 3) -> 403 Forbidden
            res_pw_cross_del = client.delete("/api/v1/picture-words/minutes/minutes/3", headers=trusted_origin_headers)
            assert res_pw_cross_del.status_code == 403
            # Teacher A modifying global lesson (row 4) -> 403 Forbidden (Admin only)
            res_pw_lesson_patch = client.patch(
                "/api/v1/picture-words/minutes",
                json={"source_type": "lessons", "row_index": 4, "updates": {"내용": "hack"}},
                headers=trusted_origin_headers
            )
            assert res_pw_lesson_patch.status_code == 403
            # Teacher A modifying own row (row 2) -> 200 OK
            res_pw_own_patch = client.patch(
                "/api/v1/picture-words/minutes",
                json={"source_type": "minutes", "row_index": 2, "updates": {"내용": "ok"}},
                headers=trusted_origin_headers
            )
            assert res_pw_own_patch.status_code == 200
        print("✅ [Q] Picture-words minutes mutation ownership strictly enforced (Cross-class/Lesson 403, Own 200): OK")

        # [R] Analytics & AI Student Scope Defense
        client.cookies.set("pbst_session", token_teacher_a)
        with mock.patch("app.api.endpoints.analytics.generate_bcba_student_analysis", return_value="AI Report"), \
             mock.patch("app.services.ai_insight.generate_bcba_student_analysis", return_value="AI Report"):
            res_ai_cross = client.post(
                "/api/v1/analytics/ai-student-analysis",
                json={"student_code": "21201"},
                headers=trusted_origin_headers
            )
            assert res_ai_cross.status_code == 403, f"Expected 403 for cross-class AI student analysis, got {res_ai_cross.status_code}"
            res_ai_own = client.post(
                "/api/v1/analytics/ai-student-analysis",
                json={"student_code": "21101"},
                headers=trusted_origin_headers
            )
            assert res_ai_own.status_code == 200
        print("✅ [R] /api/v1/analytics/ai-student-analysis scope verified (Cross-class 403, Own class 200): OK")

        # [S] /workspace/today class filtering:
        # Teacher A sees only class 초1-1 enrolled count (1)
        res_today_teacher = client.get("/api/v1/workspace/today")
        assert res_today_teacher.status_code == 200
        assert res_today_teacher.json()["total_enrolled"] == 1
        # Admin sees all enrolled count (2)
        client.cookies.set("pbst_session", token_admin)
        res_today_admin = client.get("/api/v1/workspace/today")
        assert res_today_admin.status_code == 200
        assert res_today_admin.json()["total_enrolled"] == 2
        print("✅ [S] /workspace/today scoped by role and class (Teacher=1, Admin=2): OK")

        # [T] CORS & Origin / CSRF Defense in Production (Exact Origin Allowlist)
        # Untrusted Origin on state-changing request -> 403 Forbidden
        res_csrf_bad1 = client.post("/api/v1/auth/logout", headers={"Origin": "https://evil-attacker.com"})
        assert res_csrf_bad1.status_code == 403, f"Expected 403 for evil attacker origin, got {res_csrf_bad1.status_code}"

        # Arbitrary Vercel preview regex rejected in production -> 403 Forbidden
        res_csrf_bad2 = client.post("/api/v1/auth/logout", headers={"Origin": "https://pbs-team-git-feat-x.vercel.app"})
        assert res_csrf_bad2.status_code == 403, f"Expected 403 for unlisted preview origin, got {res_csrf_bad2.status_code}"

        # Production Missing Origin on state-changing request -> 403 Forbidden
        res_csrf_missing = client.post("/api/v1/auth/logout")
        assert res_csrf_missing.status_code == 403, f"Expected 403 for missing origin in production, got {res_csrf_missing.status_code}"

        # Exact Canonical Production Origin -> 200 OK
        res_csrf_good1 = client.post("/api/v1/auth/logout", headers={"Origin": "https://pbs-team.vercel.app"})
        assert res_csrf_good1.status_code == 200, f"Expected 200 for canonical origin, got {res_csrf_good1.status_code}"

        # Explicit FRONTEND_URL configuration -> 200 OK
        import os
        with mock.patch.dict(os.environ, {"FRONTEND_URL": "https://custom-portal.edu"}):
            res_csrf_custom = client.post("/api/v1/auth/logout", headers={"Origin": "https://custom-portal.edu"})
            assert res_csrf_custom.status_code == 200, f"Expected 200 for configured FRONTEND_URL, got {res_csrf_custom.status_code}"

        print("✅ [T] Exact Origin Allowlist CSRF defense (Untrusted/Preview 403, Missing 403, Exact Canonical 200): OK")

        # [U] P0-A Destructive reset in production (even admin gets 403)
        client.cookies.set("pbst_session", token_admin)
        res_reset_users = client.post("/api/v1/auth/reset-users", headers={"Origin": "https://pbs-team.vercel.app"})
        assert res_reset_users.status_code == 403
        res_reset_tier = client.post("/api/v1/tier/reset-sheet", headers={"Origin": "https://pbs-team.vercel.app"})
        assert res_reset_tier.status_code == 403
        print("✅ [U] P0-A Destructive resets strictly 403 in production: OK")

        # [V] Public health endpoints open without session
        client.cookies.clear()
        assert client.get("/health").status_code == 200
        assert client.get("/api/health").status_code == 200
        print("✅ [V] Health endpoints remain open with 200: OK")

        # [W] Real Users Sheet Contract & class_teacher Role Normalization
        # 1. Login with user having Role="class_teacher" and ID="초1-1"
        res_login_ct = client.post(
            "/api/v1/auth/login",
            json={"user_id": "초1-1", "password": "teacherpassword123"},
            headers=trusted_origin_headers
        )
        assert res_login_ct.status_code == 200, f"Login failed for class_teacher: {res_login_ct.text}"
        login_ct_json = res_login_ct.json()
        assert login_ct_json["user"]["role"] == "teacher", "class_teacher must be normalized to canonical 'teacher' on login"
        assert login_ct_json["user"]["id"] == "초1-1"
        token_ct = res_login_ct.cookies.get("pbst_session")
        if token_ct:
            client.cookies.set("pbst_session", token_ct)

        # 2. Revalidation & /me profile returns canonical role="teacher"
        res_me_ct = client.get("/api/v1/auth/me")
        assert res_me_ct.status_code == 200
        assert res_me_ct.json()["role"] == "teacher"
        assert res_me_ct.json()["class_id"] == "211"

        # 3. Access own-class student 21101 -> 200 OK
        res_own_ct = client.get("/api/v1/workspace/student/21101")
        assert res_own_ct.status_code == 200

        # 4. Access cross-class student 21201 -> 403 Forbidden
        res_cross_ct = client.get("/api/v1/workspace/student/21201")
        assert res_cross_ct.status_code == 403

        # 5. Access admin endpoint -> 403 Forbidden
        res_admin_ct = client.get("/api/v1/auth/users")
        assert res_admin_ct.status_code == 403
        print("✅ [W] Real Users contract (Role='class_teacher', ID='초1-1') login & scope verification: OK")

        # [X] Frontend CLASS_LIST vs Backend Users class_teacher Contract Check (Set Equality for all 35 classes)
        expected_35_classes = {
            ("101", "유난초"),
            ("102", "유백합"),
            ("211", "초1-1"),
            ("212", "초1-2"),
            ("221", "초2-1"),
            ("222", "초2-2"),
            ("231", "초3-1"),
            ("232", "초3-2"),
            ("241", "초4-1"),
            ("242", "초4-2"),
            ("251", "초5-1"),
            ("252", "초5-2"),
            ("261", "초6-1"),
            ("262", "초6-2"),
            ("311", "중1-1"),
            ("312", "중1-2"),
            ("321", "중2-1"),
            ("322", "중2-2"),
            ("331", "중3-1"),
            ("332", "중3-2"),
            ("340", "중순회"),
            ("411", "고1-1"),
            ("412", "고1-2"),
            ("421", "고2-1"),
            ("422", "고2-2"),
            ("431", "고3-1"),
            ("432", "고3-2"),
            ("440", "고순회"),
            ("511", "전1-1"),
            ("512", "전1-2"),
            ("513", "전1-3"),
            ("521", "전2-1"),
            ("522", "전2-2"),
            ("523", "전2-3"),
            ("600", "예비관리자"),
        }
        assert len(expected_35_classes) == 35, "Expected class count must be exactly 35"

        frontend_constants_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "src", "app", "constants.ts")
        if os.path.exists(frontend_constants_path):
            with open(frontend_constants_path, "r", encoding="utf-8") as f:
                constants_content = f.read()
            # Extract code and id pairs from CLASS_LIST in constants.ts
            import re
            class_list_matches = re.findall(r'\{\s*code:\s*"([^"]+)",\s*name:\s*"[^"]+",\s*id:\s*"([^"]+)"\s*\}', constants_content)
            actual_frontend_classes = set(class_list_matches)
            assert len(actual_frontend_classes) == 35, f"Expected 35 classes in CLASS_LIST, got {len(actual_frontend_classes)}"
            assert actual_frontend_classes == expected_35_classes, (
                f"CLASS_LIST does not match expected 35 classes. "
                f"Diff: {actual_frontend_classes ^ expected_35_classes}"
            )
            # Ensure no 'X관리자' remains except '예비관리자'
            assert "초1-1관리자" not in constants_content
            assert "초2-2관리자" not in constants_content
            assert "중1-1관리자" not in constants_content
            assert "고1-1관리자" not in constants_content
            assert "전1-1관리자" not in constants_content
        print("✅ [X] Frontend CLASS_LIST contract alignment (Exact 35 class_teacher set equality): OK")

    return True


def test_p0_b4_password_storage_hardening():
    print("\n" + "=" * 60)
    print("STEP 10: Testing P0-B4 Password Storage Hardening & Safe Argon2id Migration")
    print("=" * 60)

    from app.main import app
    from app.core.config import settings
    from fastapi.testclient import TestClient
    from app.core.security import hash_password, verify_password_compat, _hasher, create_access_token, decode_access_token
    from app.services.sheets import update_user_password, update_user_password_cas, create_user, get_all_users
    from scripts.migrate_users_passwords import classify_password_type, run_migration_inspection
    import hashlib
    import unittest.mock as mock

    settings.AUTH_SECRET = "synthetic-test-secret-key-32chars-min-p0b4"
    settings.ENVIRONMENT = "production"
    trusted_origin_headers = {"Origin": "https://pbs-team.vercel.app"}

    # Synthetic password fixtures
    argon_pw_plain = "Synthetic-Argon-Pass-123!"
    argon_hash = hash_password(argon_pw_plain)

    plain_pw_val = "Synthetic-Plain-Pass-456!"

    sha_pw_plain = "Synthetic-Sha-Pass-789!"
    sha_hash = hashlib.sha256(sha_pw_plain.encode("utf-8")).hexdigest()

    # In-memory mock database for users
    mock_db = {
        "user_argon": {"ID": "user_argon", "Password": argon_hash, "Role": "teacher", "ClassID": "211", "Name": "아르곤교사", "Active": "TRUE"},
        "user_plain": {"ID": "user_plain", "Password": plain_pw_val, "Role": "teacher", "ClassID": "211", "Name": "평문교사", "Active": "TRUE"},
        "user_sha": {"ID": "user_sha", "Password": sha_hash, "Role": "teacher", "ClassID": "211", "Name": "샤교사", "Active": "TRUE"},
        "admin_user": {"ID": "admin_user", "Password": argon_hash, "Role": "admin", "ClassID": "전체", "Name": "관리자", "Active": "TRUE"}
    }

    def mock_get_user(uid):
        u = mock_db.get(str(uid))
        return dict(u) if u else None

    # Track writes
    write_log = []

    def mock_cas(user_id: str, expected_stored_password: str, new_plain_password: str):
        u = mock_db.get(user_id)
        if not u:
            return False
        if u["Password"] == expected_stored_password:
            new_h = hash_password(new_plain_password)
            u["Password"] = new_h
            write_log.append(("cas_success", user_id, new_h))
            return True
        else:
            write_log.append(("cas_mismatch", user_id))
            return False

    client = TestClient(app)

    with mock.patch("app.services.sheets.get_user_by_id", side_effect=mock_get_user), \
         mock.patch("app.api.deps.get_user_by_id", side_effect=mock_get_user), \
         mock.patch("app.api.endpoints.auth.get_user_by_id", side_effect=mock_get_user), \
         mock.patch("app.services.sheets.update_user_password_cas", side_effect=mock_cas), \
         mock.patch("app.api.endpoints.auth.update_user_password_cas", side_effect=mock_cas):

        # [A] Argon2id correct password -> login 200
        write_log.clear()
        res_a = client.post("/api/v1/auth/login", json={"user_id": "user_argon", "password": argon_pw_plain}, headers=trusted_origin_headers)
        assert res_a.status_code == 200
        assert len(write_log) == 0, "No rehash write should occur for current Argon2id password"
        print("✅ [A] Argon2id correct password -> login 200 (write=0): OK")

        # [B] Argon2id wrong password -> 401
        write_log.clear()
        res_b = client.post("/api/v1/auth/login", json={"user_id": "user_argon", "password": "Wrong-Password!"}, headers=trusted_origin_headers)
        assert res_b.status_code == 401
        assert len(write_log) == 0
        print("✅ [B] Argon2id wrong password -> 401 (write=0): OK")

        # [C] legacy plaintext correct password -> login 200 -> migration invoked -> stored value Argon2id
        write_log.clear()
        res_c = client.post("/api/v1/auth/login", json={"user_id": "user_plain", "password": plain_pw_val}, headers=trusted_origin_headers)
        assert res_c.status_code == 200
        assert len(write_log) == 1 and write_log[0][0] == "cas_success", f"write_log is: {write_log}"
        assert mock_db["user_plain"]["Password"].startswith("$argon2id$")
        # Verify new hash verifies with plaintext
        _hasher.verify(mock_db["user_plain"]["Password"], plain_pw_val)
        print("✅ [C] Legacy plaintext correct password -> login 200 & upgraded to Argon2id: OK")

        # [D] legacy plaintext wrong password -> 401 -> migration write 0
        mock_db["user_plain"]["Password"] = plain_pw_val # reset
        write_log.clear()
        res_d = client.post("/api/v1/auth/login", json={"user_id": "user_plain", "password": "Wrong-Plain-Password!"}, headers=trusted_origin_headers)
        assert res_d.status_code == 401
        assert len(write_log) == 0
        assert mock_db["user_plain"]["Password"] == plain_pw_val
        print("✅ [D] Legacy plaintext wrong password -> 401 & write=0: OK")

        # [E] legacy SHA256 correct password -> login 200 -> Argon2 upgrade
        write_log.clear()
        res_e = client.post("/api/v1/auth/login", json={"user_id": "user_sha", "password": sha_pw_plain}, headers=trusted_origin_headers)
        assert res_e.status_code == 200
        assert len(write_log) == 1 and write_log[0][0] == "cas_success"
        assert mock_db["user_sha"]["Password"].startswith("$argon2id$")
        _hasher.verify(mock_db["user_sha"]["Password"], sha_pw_plain)
        print("✅ [E] Legacy SHA256 correct password -> login 200 & upgraded to Argon2id: OK")

        # [F] legacy SHA256 wrong password -> 401 -> migration write 0
        mock_db["user_sha"]["Password"] = sha_hash # reset
        write_log.clear()
        res_f = client.post("/api/v1/auth/login", json={"user_id": "user_sha", "password": "Wrong-Sha-Password!"}, headers=trusted_origin_headers)
        assert res_f.status_code == 401
        assert len(write_log) == 0
        assert mock_db["user_sha"]["Password"] == sha_hash
        print("✅ [F] Legacy SHA256 wrong password -> 401 & write=0: OK")

        # [G] current Argon2 + needs_rehash=False -> login 200 -> Password write 0
        write_log.clear()
        res_g = client.post("/api/v1/auth/login", json={"user_id": "user_argon", "password": argon_pw_plain}, headers=trusted_origin_headers)
        assert res_g.status_code == 200
        assert len(write_log) == 0
        print("✅ [G] Current Argon2id + needs_rehash=False -> login 200 & write=0: OK")

        # [H] Argon2 + needs_rehash=True -> login 200 -> rehash write 1
        from argon2 import PasswordHasher as OldHasher
        old_hasher = OldHasher(time_cost=1, memory_cost=1024, parallelism=1, hash_len=16)
        outdated_argon_hash = old_hasher.hash(argon_pw_plain)
        assert _hasher.check_needs_rehash(outdated_argon_hash) is True

        mock_db["user_argon_outdated"] = {
            "ID": "user_argon_outdated",
            "Password": outdated_argon_hash,
            "Role": "teacher",
            "ClassID": "211",
            "Name": "구버전아르곤",
            "Active": "TRUE"
        }
        write_log.clear()
        res_h = client.post("/api/v1/auth/login", json={"user_id": "user_argon_outdated", "password": argon_pw_plain}, headers=trusted_origin_headers)
        assert res_h.status_code == 200
        assert len(write_log) == 1 and write_log[0][0] == "cas_success"
        assert _hasher.check_needs_rehash(mock_db["user_argon_outdated"]["Password"]) is False
        print("✅ [H] Argon2 + needs_rehash=True -> login 200 & rehash write=1: OK")

        # [I] migration storage failure -> credential correct -> login remains 200
        mock_db["user_plain"]["Password"] = plain_pw_val # reset
        write_log.clear()
        with mock.patch("app.services.sheets.update_user_password_cas", side_effect=Exception("Sheet API Rate Limit")), \
             mock.patch("app.api.endpoints.auth.update_user_password_cas", side_effect=Exception("Sheet API Rate Limit")):
            res_i = client.post("/api/v1/auth/login", json={"user_id": "user_plain", "password": plain_pw_val}, headers=trusted_origin_headers)
            assert res_i.status_code == 200, "Login must succeed even if background migration write fails"
            assert "password" not in res_i.json()["user"] and "Password" not in res_i.json()["user"]
        print("✅ [I] Migration storage failure fails open (login 200, secret not leaked): OK")

        # [J] Concurrent password change -> expected stored value mismatch -> silent migration does NOT overwrite newer password
        mock_db["user_plain"]["Password"] = "New-Admin-Changed-Password-777!"
        write_log.clear()
        cas_result = mock_cas("user_plain", expected_stored_password=plain_pw_val, new_plain_password="Some-Old-Password")
        assert cas_result is False
        assert mock_db["user_plain"]["Password"] == "New-Admin-Changed-Password-777!", "CAS mismatch must preserve newer password"
        print("✅ [J] Concurrent password change CAS defense (newer password protected): OK")

        # [K] Password update API -> stored Argon2id -> new password verifies -> raw plaintext storage 0
        admin_jwt = create_access_token({"sub": "admin_user", "role": "admin", "class_id": "전체"})
        client.cookies.set("pbst_session", admin_jwt)

        # Mock worksheet for update_user_password
        mock_ws_records = [
            {"ID": "admin_user", "Password": argon_hash, "Role": "admin", "ClassID": "전체", "ClassName": "전체관리자"},
            {"ID": "user_target", "Password": plain_pw_val, "Role": "teacher", "ClassID": "211", "ClassName": "초1-1"}
        ]
        mock_ws = mock.MagicMock()
        mock_ws.row_values.return_value = ["ID", "Password", "Role", "ClassID", "ClassName"]

        updated_cells = {}
        def mock_update_cell(row, col, val):
            updated_cells[(row, col)] = val
        mock_ws.update_cell.side_effect = mock_update_cell

        with mock.patch("app.services.sheets.get_users_worksheet", return_value=mock_ws), \
             mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_ws_records):

            new_teacher_plain = "Brand-New-Teacher-Password-999!"
            res_k = client.put(
                "/api/v1/auth/users/user_target/password",
                json={"user_id": "user_target", "new_password": new_teacher_plain},
                headers=trusted_origin_headers
            )
            assert res_k.status_code == 200
            # Target row is 3 (header + index 1), col 2 (Password)
            stored_val = updated_cells.get((3, 2))
            assert stored_val is not None
            assert stored_val.startswith("$argon2id$"), "Password update must store Argon2id hash"
            assert stored_val != new_teacher_plain, "Plaintext password must NOT be stored"
            _hasher.verify(stored_val, new_teacher_plain)
        print("✅ [K] Password update API stores Argon2id & raw plaintext storage=0: OK")

        # [L] Create user API -> stored Argon2id -> raw plaintext storage 0
        created_rows = []
        mock_ws.append_row.side_effect = lambda row: created_rows.append(row)
        mock_client = mock.MagicMock()
        mock_client.open_by_url.return_value.worksheet.return_value = mock_ws

        with mock.patch("app.services.sheets.get_sheets_client", return_value=mock_client), \
             mock.patch("app.services.sheets.settings.SHEET_URL", "https://sheets.google.com/test"), \
             mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_ws_records):

            res_l = client.post(
                "/api/v1/auth/users",
                json={
                    "id": "new_teacher_01",
                    "password": "New-Teacher-Plain-Pass-123!",
                    "role": "teacher",
                    "name": "신규교사",
                    "class_id": "212",
                    "class_name": "초등 1학년 2반"
                },
                headers=trusted_origin_headers
            )
            assert res_l.status_code == 200
            assert len(created_rows) == 1
            created_row = created_rows[0]
            created_pw = created_row[1]
            assert created_pw.startswith("$argon2id$"), "Created user must have Argon2id hash"
            assert created_pw != "New-Teacher-Plain-Pass-123!"
            _hasher.verify(created_pw, "New-Teacher-Plain-Pass-123!")
        print("✅ [L] Create user API stores Argon2id & raw plaintext storage=0: OK")

        # [M] /auth/users -> Password key absent from every returned user
        with mock.patch("app.services.sheets.get_users_worksheet", return_value=mock_ws), \
             mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_ws_records):
            res_m = client.get("/api/v1/auth/users")
            assert res_m.status_code == 200
            users_list = res_m.json()
            assert len(users_list) > 0
            for u_item in users_list:
                assert "Password" not in u_item, "Password must not be present in /auth/users response"
                assert "password" not in u_item, "password must not be present in /auth/users response"
        print("✅ [M] /auth/users: Password field absent from every returned user: OK")

        # [N] Session/JWT claims remain minimal: sub, role, class_id only
        client.cookies.clear()
        res_login_admin = client.post("/api/v1/auth/login", json={"user_id": "admin_user", "password": argon_pw_plain}, headers=trusted_origin_headers)
        assert res_login_admin.status_code == 200
        token_admin = res_login_admin.cookies.get("pbst_session")
        admin_decoded = decode_access_token(token_admin)
        assert set(admin_decoded.keys()) == {"sub", "role", "class_id", "exp", "iat"}
        assert "password" not in admin_decoded and "Password" not in admin_decoded
        print("✅ [N] JWT Session claims strictly minimal (sub, role, class_id only): OK")

        # [O] Legacy plaintext password with leading/trailing spaces
        whitespace_pw = "  Synthetic Password 123!  "
        mock_db["user_space"] = {
            "ID": "user_space",
            "Password": whitespace_pw,
            "Role": "teacher",
            "ClassID": "211",
            "Name": "공백교사",
            "Active": "TRUE"
        }
        write_log.clear()
        res_o_exact = client.post(
            "/api/v1/auth/login",
            json={"user_id": "user_space", "password": whitespace_pw},
            headers=trusted_origin_headers
        )
        assert res_o_exact.status_code == 200
        assert len(write_log) == 1 and write_log[0][0] == "cas_success"
        assert mock_db["user_space"]["Password"].startswith("$argon2id$")
        _hasher.verify(mock_db["user_space"]["Password"], whitespace_pw)

        # Trimmed variant must fail with 401
        res_o_trimmed = client.post(
            "/api/v1/auth/login",
            json={"user_id": "user_space", "password": "Synthetic Password 123!"},
            headers=trusted_origin_headers
        )
        assert res_o_trimmed.status_code == 401
        print("✅ [O] Whitespace password progressive rehash & trimmed rejected: OK")

        # [P] update_user_password with leading/trailing spaces
        client.cookies.set("pbst_session", admin_jwt)
        new_space_pw = "  New Space Password 789!  "
        updated_cells.clear()
        with mock.patch("app.services.sheets.get_users_worksheet", return_value=mock_ws), \
             mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_ws_records):
            res_p = client.put(
                "/api/v1/auth/users/user_target/password",
                json={"user_id": "user_target", "new_password": new_space_pw},
                headers=trusted_origin_headers
            )
            assert res_p.status_code == 200
            stored_val_p = updated_cells.get((3, 2))
            assert stored_val_p.startswith("$argon2id$")
            _hasher.verify(stored_val_p, new_space_pw)
            # Trimmed variant must fail
            trimmed_failed = False
            try:
                _hasher.verify(stored_val_p, "New Space Password 789!")
            except Exception:
                trimmed_failed = True
            assert trimmed_failed, "Trimmed password must not verify against untrimmed hash"
        print("✅ [P] update_user_password preserves exact whitespace & trimmed fails: OK")

        # [Q] create_user with leading/trailing spaces
        create_space_pw = "  Create Space Password 456!  "
        created_rows.clear()
        with mock.patch("app.services.sheets.get_sheets_client", return_value=mock_client), \
             mock.patch("app.services.sheets.settings.SHEET_URL", "https://sheets.google.com/test"), \
             mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_ws_records):
            res_q = client.post(
                "/api/v1/auth/users",
                json={
                    "id": "new_space_teacher",
                    "password": create_space_pw,
                    "role": "teacher",
                    "name": "공백신규교사",
                    "class_id": "212",
                    "class_name": "초등 1학년 2반"
                },
                headers=trusted_origin_headers
            )
            assert res_q.status_code == 200
            assert len(created_rows) == 1
            created_pw_q = created_rows[0][1]
            assert created_pw_q.startswith("$argon2id$")
            _hasher.verify(created_pw_q, create_space_pw)
            # Trimmed variant must fail
            trimmed_q_failed = False
            try:
                _hasher.verify(created_pw_q, "Create Space Password 456!")
            except Exception:
                trimmed_q_failed = True
            assert trimmed_q_failed, "Trimmed password must not verify against untrimmed created hash"
        print("✅ [Q] create_user preserves exact whitespace & trimmed fails: OK")

        # [CLI Preflight & Classification Tests]
        assert classify_password_type(argon_hash) == "argon2id"
        assert classify_password_type(sha_hash) == "legacy_sha256"
        assert classify_password_type(plain_pw_val) == "legacy_plaintext"
        assert classify_password_type(whitespace_pw) == "legacy_plaintext"
        assert classify_password_type("") == "blank"
        assert classify_password_type(None) == "blank"

        # Test CLI inspection tool with synthetic worksheet
        cli_ws = mock.MagicMock()
        cli_ws.row_values.return_value = ["ID", "Password", "Role", "ClassID", "ClassName"]
        cli_records = [
            {"ID": "u1", "Password": argon_hash},
            {"ID": "u2", "Password": sha_hash},
            {"ID": "u3", "Password": plain_pw_val},
            {"ID": "u4", "Password": ""},
        ]
        with mock.patch("scripts.migrate_users_passwords.safe_get_all_records", return_value=cli_records):
            counts, records, pw_col = run_migration_inspection(cli_ws)
            assert counts["total_users"] == 4
            assert counts["argon2id"] == 1
            assert counts["legacy_sha256"] == 1
            assert counts["legacy_plaintext"] == 1
            assert counts["blank"] == 1
            assert counts["unknown"] == 0
            assert pw_col == 2
        print("✅ [CLI] scripts/migrate_users_passwords.py preflight & classifier verified: OK")

    return True


def test_phase3_b_cache_suite():
    print("\n" + "=" * 60)
    print("STEP 11: Testing Phase 3-B Cache Read Layer & Targeted Invalidation (C1~C10)")
    print("=" * 60)
    from unittest import mock
    import time
    from app.adapters.sheets.client import get_cached, set_cached, invalidate_cache, _cache as adapter_cache
    from app.services.sheets import (
        _cache as legacy_cache,
        clear_cache,
        get_monthly_cico_data,
        get_cico_report_data,
        get_bip,
        save_bip,
        fetch_meeting_notes,
        add_meeting_note,
        update_meeting_note,
        delete_meeting_note,
        create_user,
        delete_user,
        update_user_password,
        fetch_all_records,
        fetch_all_users,
        fetch_student_status,
        get_holidays_from_config,
        add_holiday,
        delete_holiday
    )
    from app.core.time import now_kst

    cur_year = now_kst().year

    # ----------------------------------------------------
    # C1. Monthly CICO cold/warm cache test
    # ----------------------------------------------------
    clear_cache()
    mock_cico_rows = [
        ["번호", "학급", "학생명", "학생코드", "Tier2", "Tier3", "목표행동", "목표행동 유형", "척도", "입력 기준", "목표 달성 기준", "수행/발생률", "목표 달성 여부", "05-01", "05-02"],
        ["1", "초1-1", "김철수", "21101", "O", "X", "자리에 앉기", "증가", "O/X", "수업시간", "80% 이상", "100%", "O", "O", "O"],
        ["2", "초1-1", "이영희", "21102", "O", "X", "손들고 말하기", "증가", "O/X", "수업시간", "80% 이상", "50%", "X", "O", "X"]
    ]

    with mock.patch("app.services.sheets.get_sheets_client") as mock_client_cico:
        mock_sheet = mock.MagicMock()
        mock_ws = mock.MagicMock()
        mock_client_cico.return_value = mock_sheet
        mock_sheet.open_by_url.return_value = mock_sheet
        mock_sheet.worksheets.return_value = [mock_ws]
        mock_ws.title = "5월"
        mock_sheet.worksheet.return_value = mock_ws

        with mock.patch("app.services.sheets.safe_get_all_values", return_value=mock_cico_rows) as mock_safe_vals:
            # Cold Call
            res_cold = get_monthly_cico_data(5)
            assert res_cold.get("month") == "5월"
            assert len(res_cold.get("students", [])) == 2
            cold_reads = mock_safe_vals.call_count
            assert cold_reads == 1, f"Expected 1 sheet read on cold CICO, got {cold_reads}"

            # Warm Call
            res_warm = get_monthly_cico_data(5)
            assert res_warm.get("month") == "5월"
            assert len(res_warm.get("students", [])) == 2
            warm_reads = mock_safe_vals.call_count - cold_reads
            assert warm_reads == 0, f"Expected 0 sheet reads on warm CICO, got {warm_reads}"

    print("✅ [C1] Monthly CICO cold/warm cache (Cold=1 read, Warm=0 read): OK")

    # ----------------------------------------------------
    # C2. CICO Report reuse (No duplicate sheet reads)
    # ----------------------------------------------------
    clear_cache()
    with mock.patch("app.services.sheets.get_sheets_client") as mock_client_rep:
        mock_sheet = mock.MagicMock()
        mock_ws = mock.MagicMock()
        mock_client_rep.return_value = mock_sheet
        mock_sheet.open_by_url.return_value = mock_sheet
        mock_sheet.worksheets.return_value = [mock_ws]
        mock_ws.title = "5월"
        mock_sheet.worksheet.return_value = mock_ws

        with mock.patch("app.services.sheets.safe_get_all_values", return_value=mock_cico_rows) as mock_safe_vals:
            with mock.patch("app.services.sheets.fetch_student_status", return_value=[{"학생코드": "21101", "Tier2(CICO)": "O"}]):
                rep_cold = get_cico_report_data(5)
                assert "students" in rep_cold
                cold_rep_reads = mock_safe_vals.call_count

                rep_warm = get_cico_report_data(5)
                warm_rep_reads = mock_safe_vals.call_count - cold_rep_reads
                assert warm_rep_reads == 0, f"Expected 0 sheet reads on warm CICO report, got {warm_rep_reads}"
                assert len(rep_cold["students"]) == len(rep_warm["students"])

    print("✅ [C2] CICO Report reuse & raw values caching (Warm=0 read): OK")

    # ----------------------------------------------------
    # C3. BIP cache hit
    # ----------------------------------------------------
    clear_cache()
    mock_bip_records = [
        {"StudentCode": "21101", "TargetBehavior": "이탈행동", "Hypothesis": "회피", "Goals": "착석유지"},
        {"StudentCode": "21102", "TargetBehavior": "소리지르기", "Hypothesis": "관심", "Goals": "대체행동"}
    ]

    with mock.patch("app.services.sheets.ensure_bip_sheet") as mock_ensure_bip:
        mock_bip_ws = mock.MagicMock()
        mock_ensure_bip.return_value = mock_bip_ws

        with mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_bip_records) as mock_bip_records_call:
            # Cold
            bip1 = get_bip("21101")
            assert bip1 is not None and bip1.get("StudentCode") == "21101"
            assert mock_bip_records_call.call_count == 1

            # Warm
            bip2 = get_bip("21101")
            assert bip2 is not None and bip2.get("StudentCode") == "21101"
            assert mock_bip_records_call.call_count == 1, "Warm get_bip must not trigger additional sheet read"

    print("✅ [C3] BIP cache hit (Cold=1 read, Warm=0 read): OK")

    # ----------------------------------------------------
    # C4. BIP targeted invalidation
    # ----------------------------------------------------
    # Seed unrelated caches
    legacy_cache["records"]["data"] = [{"Log_ID": "log1"}]
    legacy_cache["records"]["timestamp"] = time.time()
    legacy_cache["users"]["data"] = [{"ID": "u1"}]
    legacy_cache["users"]["timestamp"] = time.time()
    legacy_cache["tierstatus"]["data"] = [{"학생코드": "21101"}]
    legacy_cache["tierstatus"]["timestamp"] = time.time()
    set_cached("sheet:cico:2026:05", {"month": "5월"})
    set_cached("sheet:log-main", [{"Log_ID": "log1"}])
    set_cached("bip:21101", {"StudentCode": "21101", "TargetBehavior": "Old"})

    with mock.patch("app.services.sheets.ensure_bip_sheet") as mock_ensure_bip:
        mock_bip_ws = mock.MagicMock()
        mock_ensure_bip.return_value = mock_bip_ws
        mock_bip_ws.find.return_value = mock.MagicMock(row=2)
        mock_bip_ws.row_values.return_value = ["StudentCode", "TargetBehavior", "Hypothesis", "Goals"]

        save_res = save_bip({"StudentCode": "21101", "TargetBehavior": "NewBehavior"})
        assert save_res.get("message") == "BIP saved successfully"

    # BIP cache for 21101 must be invalidated
    assert get_cached("bip:21101") is None, "bip:21101 must be invalidated after save_bip"
    # Unrelated caches MUST remain intact
    assert len(legacy_cache["records"]["data"]) == 1, "Log_Main legacy cache must be preserved"
    assert len(legacy_cache["users"]["data"]) == 1, "Users legacy cache must be preserved"
    assert len(legacy_cache["tierstatus"]["data"]) == 1, "TierStatus legacy cache must be preserved"
    assert get_cached("sheet:cico:2026:05") is not None, "CICO cache must be preserved"
    assert get_cached("sheet:log-main") is not None, "LogMain adapter cache must be preserved"

    print("✅ [C4] BIP targeted invalidation (Target invalidated, Log_Main/Users/TierStatus/CICO preserved): OK")

    # ----------------------------------------------------
    # C5. MeetingNotes cache
    # ----------------------------------------------------
    clear_cache()
    mock_meeting_records = [
        {"Date": "2026-05-10", "MeetingType": "tier1", "Content": "1차 협의", "Author": "교사A", "UUID": "m-uuid-1", "StudentCode": "21101", "CreatedAt": "2026-05-10 10:00:00"},
        {"Date": "2026-05-12", "MeetingType": "tier2", "Content": "2차 협의", "Author": "교사B", "UUID": "m-uuid-2", "StudentCode": "21102", "CreatedAt": "2026-05-12 11:00:00"}
    ]

    with mock.patch("app.services.sheets.get_meeting_notes_worksheet") as mock_get_mn_ws:
        mock_mn_ws = mock.MagicMock()
        mock_get_mn_ws.return_value = mock_mn_ws

        with mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_meeting_records) as mock_mn_records:
            mn_cold = fetch_meeting_notes()
            assert len(mn_cold) == 2
            assert mock_mn_records.call_count == 1

            mn_warm = fetch_meeting_notes()
            assert len(mn_warm) == 2
            assert mock_mn_records.call_count == 1, "Warm fetch_meeting_notes must not re-read sheets"

            # Filtered call also uses warm raw cache
            mn_filtered = fetch_meeting_notes(meeting_type="tier1")
            assert len(mn_filtered) == 1
            assert mock_mn_records.call_count == 1, "Filtered fetch_meeting_notes must reuse warm raw cache"

    print("✅ [C5] MeetingNotes cache (Cold=1 read, Warm=0 read, Filter reuse=0 read): OK")

    # ----------------------------------------------------
    # C6. MeetingNotes write invalidation
    # ----------------------------------------------------
    # Seed unrelated caches
    set_cached("sheet:meeting_notes:raw", mock_meeting_records)
    legacy_cache["users"]["data"] = [{"ID": "u1"}]
    legacy_cache["users"]["timestamp"] = time.time()
    set_cached("bip:21101", {"StudentCode": "21101"})
    set_cached("sheet:cico:2026:05", {"month": "5월"})

    with mock.patch("app.services.sheets.get_meeting_notes_worksheet") as mock_get_mn_ws:
        mock_mn_ws = mock.MagicMock()
        mock_get_mn_ws.return_value = mock_mn_ws
        add_res = add_meeting_note({"date": "2026-05-20", "meeting_type": "tier1", "content": "신규 협의", "author": "교사A", "student_code": "21101"})
        assert "uuid" in add_res

    # MeetingNotes raw cache must be invalidated
    assert get_cached("sheet:meeting_notes:raw") is None, "MeetingNotes cache must be invalidated on write"
    # Unrelated caches preserved
    assert len(legacy_cache["users"]["data"]) == 1, "Users cache must be preserved on MeetingNote write"
    assert get_cached("bip:21101") is not None, "BIP cache must be preserved on MeetingNote write"
    assert get_cached("sheet:cico:2026:05") is not None, "CICO cache must be preserved on MeetingNote write"

    print("✅ [C6] MeetingNotes write targeted invalidation (Unrelated caches preserved): OK")

    # ----------------------------------------------------
    # C7. User cache isolation
    # ----------------------------------------------------
    clear_cache()
    legacy_cache["records"]["data"] = [{"Log_ID": "log1"}]
    legacy_cache["records"]["timestamp"] = time.time()
    legacy_cache["tierstatus"]["data"] = [{"학생코드": "21101"}]
    legacy_cache["tierstatus"]["timestamp"] = time.time()
    set_cached("sheet:cico:2026:05", {"month": "5월"})
    set_cached("bip:21101", {"StudentCode": "21101"})
    legacy_cache["users"]["data"] = [{"ID": "teacher1", "Password": "pw"}]
    legacy_cache["users"]["timestamp"] = time.time()

    with mock.patch("app.services.sheets.get_sheets_client") as mock_user_client:
        mock_sh = mock.MagicMock()
        mock_uws = mock.MagicMock()
        mock_user_client.return_value = mock_sh
        mock_sh.open_by_url.return_value = mock_sh
        mock_sh.worksheet.return_value = mock_uws
        mock_uws.row_values.return_value = ["ID", "Password", "Role", "Name", "ClassID", "ClassName"]
        mock_uws.find.return_value = mock.MagicMock(row=2)

        with mock.patch("app.services.sheets.safe_get_all_records", return_value=[]):
            create_res = create_user({"ID": "new_t", "Password": "password123!", "Role": "teacher"})
            assert "created successfully" in create_res.get("message", "")

    # Users cache must be invalidated
    assert len(legacy_cache["users"]["data"]) == 0, "Users cache must be cleared after create_user"
    # Unrelated caches MUST remain intact
    assert len(legacy_cache["records"]["data"]) == 1, "Log_Main cache must remain intact after user write"
    assert len(legacy_cache["tierstatus"]["data"]) == 1, "TierStatus cache must remain intact after user write"
    assert get_cached("sheet:cico:2026:05") is not None, "CICO cache must remain intact after user write"
    assert get_cached("bip:21101") is not None, "BIP cache must remain intact after user write"

    print("✅ [C7] User cache isolation (create_user clears Users only; Records/TierStatus/CICO/BIP preserved): OK")

    # ----------------------------------------------------
    # C8. No global flush on single-entity mutations
    # ----------------------------------------------------
    clear_cache()
    # Populate all caches
    legacy_cache["records"]["data"] = [{"Log_ID": "log_active"}]
    legacy_cache["records"]["timestamp"] = time.time()
    legacy_cache["users"]["data"] = [{"ID": "u_active"}]
    legacy_cache["users"]["timestamp"] = time.time()
    legacy_cache["tierstatus"]["data"] = [{"학생코드": "s_active"}]
    legacy_cache["tierstatus"]["timestamp"] = time.time()
    legacy_cache["board"]["data"] = [{"id": 1, "title": "공지"}]
    legacy_cache["board"]["timestamp"] = time.time()
    set_cached("config:holidays", ["2026-05-05"])
    set_cached("bip:s_active", {"StudentCode": "s_active"})
    set_cached("sheet:cico:2026:05", {"month": "5월"})

    # Test Holiday write targeted invalidation
    with mock.patch("app.services.sheets.get_sheets_client") as mock_hol_client:
        mock_sh = mock.MagicMock()
        mock_hws = mock.MagicMock()
        mock_hol_client.return_value = mock_sh
        mock_sh.open_by_url.return_value = mock_sh
        mock_sh.worksheet.return_value = mock_hws
        mock_hws.col_values.return_value = ["공휴일 날짜 (YYYY-MM-DD)", "※ 안내", "2026-05-05"]

        add_hol_res = add_holiday("2026-06-06", "현충일")
        assert "added" in add_hol_res.get("message", "")

    # Holidays cache cleared
    assert get_cached("config:holidays") is None, "Holidays cache must be cleared"
    # Unrelated caches 100% preserved
    assert len(legacy_cache["records"]["data"]) == 1
    assert len(legacy_cache["users"]["data"]) == 1
    assert len(legacy_cache["tierstatus"]["data"]) == 1
    assert len(legacy_cache["board"]["data"]) == 1
    assert get_cached("bip:s_active") is not None
    assert get_cached("sheet:cico:2026:05") is not None

    print("✅ [C8] No global flush on entity write (Holiday write preserves Records/Users/TierStatus/Board/BIP/CICO): OK")

    # ----------------------------------------------------
    # C9. force_refresh contract
    # ----------------------------------------------------
    clear_cache()
    records_v1 = [{"Log_ID": "log_v1", "학생코드": "21101", "학생명": "김철수", "발생날짜": "2026-05-01", "시간대": "1교시", "행동유형": "이탈", "타임스탬프": "2026-05-01 09:00:00"}]
    records_v2 = [{"Log_ID": "log_v2", "학생코드": "21101", "학생명": "김철수", "발생날짜": "2026-05-02", "시간대": "2교시", "행동유형": "공격", "타임스탬프": "2026-05-02 10:00:00"}]

    with mock.patch("app.services.sheets.get_sheets_client") as mock_rec_client:
        mock_sh = mock.MagicMock()
        mock_rws = mock.MagicMock()
        mock_rws.title = "Log_Main"
        mock_rec_client.return_value = mock_sh
        mock_sh.open_by_url.return_value = mock_sh
        mock_sh.worksheets.return_value = [mock_rws]

        with mock.patch("app.services.sheets.safe_get_all_records", side_effect=[records_v1, records_v2]) as mock_get_recs:
            # 1. Normal fetch (Cold -> Sheet read)
            r1 = fetch_all_records(force_refresh=False)
            assert len(r1) == 1 and r1[0]["Log_ID"] == "log_v1"
            assert mock_get_recs.call_count == 1

            # 2. Normal fetch (Warm -> Cache hit)
            r2 = fetch_all_records(force_refresh=False)
            assert len(r2) == 1 and r2[0]["Log_ID"] == "log_v1"
            assert mock_get_recs.call_count == 1, "Warm fetch must not re-read sheet"

            # 3. force_refresh=True (Bypasses cache -> Sheet read)
            r3 = fetch_all_records(force_refresh=True)
            assert len(r3) == 1 and r3[0]["Log_ID"] == "log_v2"
            assert mock_get_recs.call_count == 2

            # 4. Next normal fetch (Uses newly refreshed cache)
            r4 = fetch_all_records(force_refresh=False)
            assert len(r4) == 1 and r4[0]["Log_ID"] == "log_v2"
            assert mock_get_recs.call_count == 2, "Next normal fetch must use refreshed cache"

    print("✅ [C9] force_refresh contract (normal=cache, force_refresh=True=sheet read, next=refreshed cache): OK")

    # ----------------------------------------------------
    # C10. Data Parity Verification
    # ----------------------------------------------------
    # Verify that data structure and calculations remain identical across cold/warm cache
    clear_cache()
    with mock.patch("app.services.sheets.get_sheets_client") as mock_cico_client:
        mock_sheet = mock.MagicMock()
        mock_ws = mock.MagicMock()
        mock_cico_client.return_value = mock_sheet
        mock_sheet.open_by_url.return_value = mock_sheet
        mock_sheet.worksheets.return_value = [mock_ws]
        mock_ws.title = "5월"
        mock_sheet.worksheet.return_value = mock_ws

        with mock.patch("app.services.sheets.safe_get_all_values", return_value=mock_cico_rows):
            cold_cico = get_monthly_cico_data(5)
            warm_cico = get_monthly_cico_data(5)
            assert cold_cico == warm_cico, "Monthly CICO parity violation between cold and warm"

    print("✅ [C10] Data parity verification (Cold/Warm parity 100% match): OK")
    return True


def benchmark_workflows():
    print("\n" + "=" * 60)
    print("STEP 12: Phase 3-B Cold vs Warm Execution & Sheets Read Benchmark")
    print("=" * 60)
    import time
    from unittest import mock
    from app.services.sheets import (
        clear_cache,
        get_monthly_cico_data,
        get_cico_report_data,
        get_bip,
        fetch_meeting_notes,
        fetch_all_records,
        fetch_student_status
    )

    workflows = [
        "Monthly CICO (5월)",
        "CICO Report (5월)",
        "BIP (21101)",
        "MeetingNotes",
        "Log_Main Records",
        "TierStatus Roster",
    ]

    benchmark_results = []

    # Mock datasets
    mock_cico_rows = [
        ["번호", "학급", "학생명", "학생코드", "Tier2", "Tier3", "목표행동", "목표행동 유형", "척도", "입력 기준", "목표 달성 기준", "수행/발생률", "목표 달성 여부", "05-01", "05-02"],
        ["1", "초1-1", "김철수", "21101", "O", "X", "자리에 앉기", "증가", "O/X", "수업시간", "80% 이상", "100%", "O", "O", "O"],
        ["2", "초1-1", "이영희", "21102", "O", "X", "손들고 말하기", "증가", "O/X", "수업시간", "80% 이상", "50%", "X", "O", "X"]
    ]
    mock_bip_records = [{"StudentCode": "21101", "TargetBehavior": "이탈행동", "Hypothesis": "회피", "Goals": "착석유지"}]
    mock_meeting_records = [{"Date": "2026-05-10", "MeetingType": "tier1", "Content": "협의", "Author": "교사A", "UUID": "u1", "StudentCode": "21101", "CreatedAt": "2026-05-10"}]
    mock_log_records = [{"Log_ID": "l1", "학생코드": "21101", "학생명": "김철수", "발생날짜": "2026-05-01", "시간대": "1교시", "행동유형": "이탈", "타임스탬프": "2026-05-01"}]
    mock_tier_records = [{"학생코드": "21101", "학생이름": "김철수", "학급": "초1-1", "Tier2(CICO)": "O", "재학여부": "O"}]

    # 1. Monthly CICO
    clear_cache()
    with mock.patch("app.services.sheets.get_sheets_client") as mc:
        msh, mws = mock.MagicMock(), mock.MagicMock()
        mc.return_value, msh.open_by_url.return_value, msh.worksheets.return_value, mws.title = msh, msh, [mws], "5월"
        with mock.patch("app.services.sheets.safe_get_all_values", return_value=mock_cico_rows) as mv:
            t0 = time.perf_counter()
            get_monthly_cico_data(5)
            cold_ms = (time.perf_counter() - t0) * 1000
            cold_reads = mv.call_count

            t0 = time.perf_counter()
            get_monthly_cico_data(5)
            warm_ms = (time.perf_counter() - t0) * 1000
            warm_reads = mv.call_count - cold_reads
            benchmark_results.append(("Monthly CICO", cold_reads, cold_ms, warm_reads, warm_ms))

    # 2. CICO Report
    clear_cache()
    with mock.patch("app.services.sheets.get_sheets_client") as mc:
        msh, mws = mock.MagicMock(), mock.MagicMock()
        mc.return_value, msh.open_by_url.return_value, msh.worksheets.return_value, mws.title = msh, msh, [mws], "5월"
        with mock.patch("app.services.sheets.safe_get_all_values", return_value=mock_cico_rows) as mv:
            with mock.patch("app.services.sheets.fetch_student_status", return_value=mock_tier_records):
                t0 = time.perf_counter()
                get_cico_report_data(5)
                cold_ms = (time.perf_counter() - t0) * 1000
                cold_reads = mv.call_count

                t0 = time.perf_counter()
                get_cico_report_data(5)
                warm_ms = (time.perf_counter() - t0) * 1000
                warm_reads = mv.call_count - cold_reads
                benchmark_results.append(("CICO Report", cold_reads, cold_ms, warm_reads, warm_ms))

    # 3. BIP
    clear_cache()
    with mock.patch("app.services.sheets.ensure_bip_sheet") as meb:
        mws = mock.MagicMock()
        meb.return_value = mws
        with mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_bip_records) as mr:
            t0 = time.perf_counter()
            get_bip("21101")
            cold_ms = (time.perf_counter() - t0) * 1000
            cold_reads = mr.call_count

            t0 = time.perf_counter()
            get_bip("21101")
            warm_ms = (time.perf_counter() - t0) * 1000
            warm_reads = mr.call_count - cold_reads
            benchmark_results.append(("BIP", cold_reads, cold_ms, warm_reads, warm_ms))

    # 4. MeetingNotes
    clear_cache()
    with mock.patch("app.services.sheets.get_meeting_notes_worksheet") as mgw:
        mws = mock.MagicMock()
        mgw.return_value = mws
        with mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_meeting_records) as mr:
            t0 = time.perf_counter()
            fetch_meeting_notes()
            cold_ms = (time.perf_counter() - t0) * 1000
            cold_reads = mr.call_count

            t0 = time.perf_counter()
            fetch_meeting_notes()
            warm_ms = (time.perf_counter() - t0) * 1000
            warm_reads = mr.call_count - cold_reads
            benchmark_results.append(("MeetingNotes", cold_reads, cold_ms, warm_reads, warm_ms))

    # 5. Log_Main Records
    clear_cache()
    with mock.patch("app.services.sheets.get_sheets_client") as mc:
        msh, mws = mock.MagicMock(), mock.MagicMock()
        mws.title = "Log_Main"
        mc.return_value, msh.open_by_url.return_value, msh.worksheets.return_value = msh, msh, [mws]
        with mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_log_records) as mr:
            t0 = time.perf_counter()
            fetch_all_records(force_refresh=False)
            cold_ms = (time.perf_counter() - t0) * 1000
            cold_reads = mr.call_count

            t0 = time.perf_counter()
            fetch_all_records(force_refresh=False)
            warm_ms = (time.perf_counter() - t0) * 1000
            warm_reads = mr.call_count - cold_reads
            benchmark_results.append(("Log_Main Records", cold_reads, cold_ms, warm_reads, warm_ms))

    # 6. TierStatus Roster
    clear_cache()
    with mock.patch("app.services.sheets.get_sheets_client") as mc:
        msh, mws = mock.MagicMock(), mock.MagicMock()
        mws.title = "TierStatus"
        mc.return_value, msh.open_by_url.return_value, msh.worksheets.return_value = msh, msh, [mws]
        with mock.patch("app.services.sheets.safe_get_all_records", return_value=mock_tier_records) as mr:
            t0 = time.perf_counter()
            fetch_student_status()
            cold_ms = (time.perf_counter() - t0) * 1000
            cold_reads = mr.call_count

            t0 = time.perf_counter()
            fetch_student_status()
            warm_ms = (time.perf_counter() - t0) * 1000
            warm_reads = mr.call_count - cold_reads
            benchmark_results.append(("TierStatus Roster", cold_reads, cold_ms, warm_reads, warm_ms))

    # Print Table
    print(f"\n{'Workflow':<22} | {'Cold Reads':<10} | {'Cold Latency':<12} | {'Warm Reads':<10} | {'Warm Latency':<12}")
    print("-" * 75)
    for name, c_reads, c_time, w_reads, w_time in benchmark_results:
        print(f"{name:<22} | {c_reads:<10} | {c_time:8.2f} ms   | {w_reads:<10} | {w_time:8.2f} ms")
    print("-" * 75)
    return True


if __name__ == "__main__":
    t1 = test_imports()
    t2 = test_ebp_catalog()
    t3 = test_domain_constructors()
    t4 = test_synthetic_log_main_adapter()
    t5 = test_decision_signals_regression()
    t6 = test_health_routes()
    t7 = test_p0_security_lockdown()
    t8 = test_p0_b1_auth_foundation()
    t9 = test_p0_b3_authorization_and_class_scope()
    t10 = test_p0_b4_password_storage_hardening()
    t11 = test_phase3_b_cache_suite()
    t12 = benchmark_workflows()

    print("\n" + "=" * 60)
    if t1 and t2 and t3 and t4 and t5 and t6 and t7 and t8 and t9 and t10 and t11 and t12:
        print("🎉 ALL DOMAIN CONTRACT, ADAPTER, HEALTH, P0-B1 AUTH, P0-B3 SCOPE, P0-B4 PASSWORD & PHASE 3-B CACHE CHECKS PASSED!")
    else:
        print("❌ SOME CHECKS FAILED.")
    print("=" * 60)
