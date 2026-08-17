// frontend/src/types/domain.ts

export type TierCode =
  | "TIER_1"
  | "TIER_2_CICO"
  | "TIER_2_SST"
  | "TIER_3"
  | "TIER_3_PLUS";

export type FunctionCode =
  | "ATTENTION"
  | "TANGIBLE_ACTIVITY"
  | "ESCAPE_DEMAND"
  | "AUTOMATIC_SENSORY"
  | "DISCOMFORT_RELIEF"
  | "MULTIPLE"
  | "UNKNOWN";

export type HypothesisStatus =
  | "PROPOSED"
  | "NEEDS_MORE_DATA"
  | "TEACHER_CONFIRMED"
  | "TEAM_CONFIRMED"
  | "REJECTED";

export type PlanStatus =
  | "DRAFT"
  | "REVIEW_REQUESTED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "CLOSED";

export type SignalSeverity =
  | "INFO"
  | "REVIEW"
  | "PRIORITY"
  | "URGENT";

export type DecisionSignalType =
  | "SAFETY"
  | "REVIEW_DUE"
  | "CHANGE_UP"
  | "GOAL_STALLED"
  | "MORE_DATA"
  | "FIDELITY_LOW"
  | "MEETING_ACTION"
  | "DATA_MISSING";

export type DecisionStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "ACTION_PLANNED"
  | "RESOLVED"
  | "DISMISSED";

export type WorkloadLevel = "LOW" | "MEDIUM" | "HIGH";

export type EBPCategory =
  | "ASSESSMENT"
  | "SETTING_EVENT"
  | "ANTECEDENT"
  | "TEACHING"
  | "REINFORCEMENT"
  | "CONSEQUENCE";

export interface EvidenceRef {
  source_type: string;
  source_id: string;
  log_id?: string | null;
  event_date?: string | null;
  label: string;
  excerpt?: string | null;
}

export interface TierSnapshot {
  active_tiers: TierCode[];
  changed_at?: string | null;
  memo?: string | null;
}

export interface StudentProfile {
  student_code: string;
  display_name: string;
  class_name: string;
  enrolled: boolean;
  beable_code?: string | null;

  tier: TierSnapshot;

  communication_modes: string[];
  preferred_supports: string[];
  preferences: string[];
  challenge_contexts: string[];
  early_signs: string[];
  accessibility_notes: string[];

  updated_at?: string | null;
  updated_by?: string | null;
}

export interface SafetyFlags {
  self_injury: boolean;
  injury_to_others: boolean;
  staff_injury: boolean;
  physical_restraint: boolean;
  separation_support: boolean;
  emergency_response: boolean;
}

export interface FunctionEstimate {
  function_code: FunctionCode;
  source: string;
  raw_label?: string | null;
}

export interface BehaviorEvent {
  event_id: string;
  source_log_id?: string | null;
  student_code: string;

  event_date: string;
  entered_at?: string | null;
  entered_by?: string | null;

  time_slot_codes: number[];
  time_slot_labels: string[];

  location_codes: string[];
  primary_location?: string | null;

  behavior_code: string;
  behavior_raw?: string | null;

  intensity?: number | null;
  occurrence_count?: number | null;

  antecedent?: string | null;
  consequence?: string | null;
  setting_events: string[];

  teacher_function_estimates: FunctionEstimate[];

  safety: SafetyFlags;

  notes?: string | null;
  source: string;
}

export interface CicoObservation {
  observation_id: string;
  student_code: string;
  month: number;

  observation_date?: string | null;
  session_label?: string | null;

  target_behavior: string;
  target_type: string;
  scale: string;

  baseline_rule?: string | null;
  goal_rule?: string | null;

  raw_value: string;
  numeric_value?: number | null;
  goal_met?: boolean | null;

  source_sheet: string;
  source_row: number;
  source_column: number;

  recorded_at?: string | null;
  recorded_by?: string | null;
}

export interface DataSufficiency {
  direct_observation_n: number;
  unique_days_n: number;
  unique_contexts_n: number;
  abc_complete_n: number;
  contradictory_evidence_n: number;

  status: string;
  reasons: string[];
}

export interface DataQualityCheck {
  event_count: number;
  date_span_days: number;
  complete_abc_count: number;
  has_location_data: boolean;
  has_intensity_data: boolean;
  is_sufficient_for_fba: boolean;
  reasons: string[];
}

export interface FunctionHypothesis {
  hypothesis_id: string;
  student_code: string;

  target_behavior: string;

  setting_event?: string | null;
  antecedent_condition: string;
  consequence_pattern: string;

  function_code: FunctionCode;
  hypothesis_statement: string;

  evidence_for: EvidenceRef[];
  evidence_against: EvidenceRef[];

  data_sufficiency: DataSufficiency;

  status: HypothesisStatus;

  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface EBPStrategy {
  id: number;
  code: string;
  name: string;
  category: EBPCategory;

  summary: string;
  when_to_use: string;

  function_fits: FunctionCode[];
  prerequisites: string[];
  implementation_steps: string[];
  guardrails: string[];
  recommended_pairings: string[];

  outcome_measures: string[];
  fidelity_items: string[];

  workload: WorkloadLevel;
}

export interface EBPRecommendation {
  ebp_code: string;
  recommendation_level: string;

  reasons: string[];
  matched_evidence: EvidenceRef[];

  unmet_prerequisites: string[];
  guardrail_flags: string[];

  excluded: boolean;
}

export interface StrategyImplementation {
  implementation_id: string;
  ebp_code: string;

  context: string;
  teacher_action: string;
  expected_student_response: string;

  prompt_plan?: string | null;
  functional_outcome?: string | null;
  reinforcement_plan?: string | null;
  return_plan?: string | null;

  measurement: string[];
  fidelity_items: string[];

  owner?: string | null;
}

export interface MonitoringPlan {
  measures: string[];
  collection_frequency: string;
  review_frequency: string;

  success_criteria: string[];
  modify_criteria: string[];
}

export interface CrisisSupportPlan {
  enabled: boolean;
  early_signs: string[];
  prevention_supports: string[];
  escalation_supports: string[];
  safety_actions: string[];
  recovery_supports: string[];
  documentation_required: boolean;
}

export interface BIPPlan {
  plan_id: string;
  student_code: string;
  version: number;

  status: PlanStatus;

  target_behaviors: string[];
  baseline_summary: string;

  hypotheses: FunctionHypothesis[];
  strategies: StrategyImplementation[];

  monitoring: MonitoringPlan;
  crisis_support: CrisisSupportPlan;

  rationale?: string | null;

  created_by: string;
  created_at: string;

  updated_by?: string | null;
  updated_at?: string | null;

  approved_by?: string | null;
  approved_at?: string | null;
}

export interface FidelityObservation {
  fidelity_id: string;
  plan_id: string;
  student_code: string;
  observed_date: string;

  ebp_code: string;
  item: string;
  status: string;

  note?: string | null;
  recorded_by: string;
}

export interface DecisionSignal {
  signal_id: string;
  student_code?: string | null;

  signal_type: DecisionSignalType;
  severity: SignalSeverity;

  title: string;
  reason: string;

  evidence: EvidenceRef[];

  recommended_next_action: string;

  status: DecisionStatus;

  owner?: string | null;
  due_date?: string | null;

  created_at: string;
  resolved_at?: string | null;
}

export interface TeacherDecision {
  decision_id: string;
  signal_id?: string | null;
  student_code?: string | null;

  decision: string;
  rationale: string;

  evidence_snapshot: EvidenceRef[];

  owner?: string | null;
  due_date?: string | null;
  next_review_date?: string | null;

  decided_by: string;
  decided_at: string;
}

export interface StudentWorkspace {
  student: StudentProfile;

  recent_events: BehaviorEvent[];
  cico: CicoObservation[];

  hypotheses: FunctionHypothesis[];
  active_bip?: BIPPlan | null;

  open_signals: DecisionSignal[];
}
