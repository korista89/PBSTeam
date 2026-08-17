# backend/app/domain/models.py

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True
    )


class TierCode(str, Enum):
    TIER_1 = "TIER_1"
    TIER_2_CICO = "TIER_2_CICO"
    TIER_2_SST = "TIER_2_SST"
    TIER_3 = "TIER_3"
    TIER_3_PLUS = "TIER_3_PLUS"


class FunctionCode(str, Enum):
    ATTENTION = "ATTENTION"
    TANGIBLE_ACTIVITY = "TANGIBLE_ACTIVITY"
    ESCAPE_DEMAND = "ESCAPE_DEMAND"
    AUTOMATIC_SENSORY = "AUTOMATIC_SENSORY"
    DISCOMFORT_RELIEF = "DISCOMFORT_RELIEF"
    MULTIPLE = "MULTIPLE"
    UNKNOWN = "UNKNOWN"


class HypothesisStatus(str, Enum):
    PROPOSED = "PROPOSED"
    NEEDS_MORE_DATA = "NEEDS_MORE_DATA"
    TEACHER_CONFIRMED = "TEACHER_CONFIRMED"
    TEAM_CONFIRMED = "TEAM_CONFIRMED"
    REJECTED = "REJECTED"


class PlanStatus(str, Enum):
    DRAFT = "DRAFT"
    REVIEW_REQUESTED = "REVIEW_REQUESTED"
    ACTIVE = "ACTIVE"
    SUPERSEDED = "SUPERSEDED"
    CLOSED = "CLOSED"


class SignalSeverity(str, Enum):
    INFO = "INFO"
    REVIEW = "REVIEW"
    PRIORITY = "PRIORITY"
    URGENT = "URGENT"


class DecisionSignalType(str, Enum):
    SAFETY = "SAFETY"
    REVIEW_DUE = "REVIEW_DUE"
    CHANGE_UP = "CHANGE_UP"
    GOAL_STALLED = "GOAL_STALLED"
    MORE_DATA = "MORE_DATA"
    FIDELITY_LOW = "FIDELITY_LOW"
    MEETING_ACTION = "MEETING_ACTION"
    DATA_MISSING = "DATA_MISSING"


class DecisionStatus(str, Enum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    ACTION_PLANNED = "ACTION_PLANNED"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"


class WorkloadLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class EBPCategory(str, Enum):
    ASSESSMENT = "ASSESSMENT"
    SETTING_EVENT = "SETTING_EVENT"
    ANTECEDENT = "ANTECEDENT"
    TEACHING = "TEACHING"
    REINFORCEMENT = "REINFORCEMENT"
    CONSEQUENCE = "CONSEQUENCE"


class EvidenceRef(StrictModel):
    source_type: str
    source_id: str
    log_id: Optional[str] = None
    event_date: Optional[date] = None
    label: str
    excerpt: Optional[str] = None


class TierSnapshot(StrictModel):
    active_tiers: list[TierCode] = Field(default_factory=list)
    changed_at: Optional[datetime] = None
    memo: Optional[str] = None


class StudentProfile(StrictModel):
    student_code: str
    display_name: str
    class_name: str
    enrolled: bool = True
    beable_code: Optional[str] = None

    tier: TierSnapshot

    communication_modes: list[str] = Field(default_factory=list)
    preferred_supports: list[str] = Field(default_factory=list)
    preferences: list[str] = Field(default_factory=list)
    challenge_contexts: list[str] = Field(default_factory=list)
    early_signs: list[str] = Field(default_factory=list)
    accessibility_notes: list[str] = Field(default_factory=list)

    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


class SafetyFlags(StrictModel):
    self_injury: bool = False
    injury_to_others: bool = False
    staff_injury: bool = False
    physical_restraint: bool = False
    separation_support: bool = False
    emergency_response: bool = False


class FunctionEstimate(StrictModel):
    function_code: FunctionCode
    source: str = "teacher_estimate"
    raw_label: Optional[str] = None


class BehaviorEvent(StrictModel):
    event_id: str
    source_log_id: Optional[str] = None
    student_code: str

    event_date: date
    entered_at: Optional[datetime] = None
    entered_by: Optional[str] = None

    time_slot_codes: list[int] = Field(default_factory=list)
    time_slot_labels: list[str] = Field(default_factory=list)

    location_codes: list[str] = Field(default_factory=list)
    primary_location: Optional[str] = None

    behavior_code: str
    behavior_raw: Optional[str] = None

    intensity: Optional[int] = Field(default=None, ge=1, le=5)
    occurrence_count: Optional[int] = Field(default=None, ge=0)

    antecedent: Optional[str] = None
    consequence: Optional[str] = None
    setting_events: list[str] = Field(default_factory=list)

    teacher_function_estimates: list[FunctionEstimate] = Field(default_factory=list)

    safety: SafetyFlags = Field(default_factory=SafetyFlags)

    notes: Optional[str] = None
    source: str = "Log_Main"


class CicoObservation(StrictModel):
    observation_id: str
    student_code: str
    month: int = Field(ge=1, le=12)

    observation_date: Optional[date] = None
    session_label: Optional[str] = None

    target_behavior: str
    target_type: str
    scale: str
    baseline_rule: Optional[str] = None
    goal_rule: Optional[str] = None

    raw_value: str
    numeric_value: Optional[float] = None
    goal_met: Optional[bool] = None

    source_sheet: str
    source_row: int
    source_column: int

    recorded_at: Optional[datetime] = None
    recorded_by: Optional[str] = None


class DataSufficiency(StrictModel):
    direct_observation_n: int = 0
    unique_days_n: int = 0
    unique_contexts_n: int = 0
    abc_complete_n: int = 0
    contradictory_evidence_n: int = 0

    status: str
    reasons: list[str] = Field(default_factory=list)


class FunctionHypothesis(StrictModel):
    hypothesis_id: str
    student_code: str

    target_behavior: str

    setting_event: Optional[str] = None
    antecedent_condition: str
    consequence_pattern: str

    function_code: FunctionCode
    hypothesis_statement: str

    evidence_for: list[EvidenceRef] = Field(default_factory=list)
    evidence_against: list[EvidenceRef] = Field(default_factory=list)

    data_sufficiency: DataSufficiency

    status: HypothesisStatus = HypothesisStatus.PROPOSED

    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class EBPStrategy(StrictModel):
    id: int
    code: str
    name: str
    category: EBPCategory

    summary: str
    when_to_use: str

    function_fits: list[FunctionCode] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)
    implementation_steps: list[str] = Field(default_factory=list)
    guardrails: list[str] = Field(default_factory=list)
    recommended_pairings: list[str] = Field(default_factory=list)

    outcome_measures: list[str] = Field(default_factory=list)
    fidelity_items: list[str] = Field(default_factory=list)

    workload: WorkloadLevel


class EBPRecommendation(StrictModel):
    ebp_code: str
    recommendation_level: str

    reasons: list[str]
    matched_evidence: list[EvidenceRef] = Field(default_factory=list)

    unmet_prerequisites: list[str] = Field(default_factory=list)
    guardrail_flags: list[str] = Field(default_factory=list)

    excluded: bool = False


class StrategyImplementation(StrictModel):
    implementation_id: str
    ebp_code: str

    context: str
    teacher_action: str
    expected_student_response: str

    prompt_plan: Optional[str] = None
    functional_outcome: Optional[str] = None
    reinforcement_plan: Optional[str] = None
    return_plan: Optional[str] = None

    measurement: list[str] = Field(default_factory=list)
    fidelity_items: list[str] = Field(default_factory=list)

    owner: Optional[str] = None


class MonitoringPlan(StrictModel):
    measures: list[str]
    collection_frequency: str
    review_frequency: str

    success_criteria: list[str]
    modify_criteria: list[str]


class CrisisSupportPlan(StrictModel):
    enabled: bool = False
    early_signs: list[str] = Field(default_factory=list)
    prevention_supports: list[str] = Field(default_factory=list)
    escalation_supports: list[str] = Field(default_factory=list)
    safety_actions: list[str] = Field(default_factory=list)
    recovery_supports: list[str] = Field(default_factory=list)
    documentation_required: bool = True


class BIPPlan(StrictModel):
    plan_id: str
    student_code: str
    version: int = Field(ge=1)

    status: PlanStatus = PlanStatus.DRAFT

    target_behaviors: list[str]
    baseline_summary: str

    hypotheses: list[FunctionHypothesis]
    strategies: list[StrategyImplementation]

    monitoring: MonitoringPlan
    crisis_support: CrisisSupportPlan = Field(default_factory=CrisisSupportPlan)

    rationale: Optional[str] = None

    created_by: str
    created_at: datetime

    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class FidelityObservation(StrictModel):
    fidelity_id: str
    plan_id: str
    student_code: str
    observed_date: date

    ebp_code: str
    item: str
    status: str

    note: Optional[str] = None
    recorded_by: str


class DecisionSignal(StrictModel):
    signal_id: str
    student_code: Optional[str] = None

    signal_type: DecisionSignalType
    severity: SignalSeverity

    title: str
    reason: str

    evidence: list[EvidenceRef] = Field(default_factory=list)

    recommended_next_action: str

    status: DecisionStatus = DecisionStatus.OPEN

    owner: Optional[str] = None
    due_date: Optional[date] = None

    created_at: datetime
    resolved_at: Optional[datetime] = None


class TeacherDecision(StrictModel):
    decision_id: str
    signal_id: Optional[str] = None
    student_code: Optional[str] = None

    decision: str
    rationale: str

    evidence_snapshot: list[EvidenceRef] = Field(default_factory=list)

    owner: Optional[str] = None
    due_date: Optional[date] = None
    next_review_date: Optional[date] = None

    decided_by: str
    decided_at: datetime


class StudentWorkspace(StrictModel):
    student: StudentProfile

    recent_events: list[BehaviorEvent]
    cico: list[CicoObservation]

    hypotheses: list[FunctionHypothesis]
    active_bip: Optional[BIPPlan] = None

    open_signals: list[DecisionSignal]
