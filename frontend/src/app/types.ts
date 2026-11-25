export interface TrendData {
    date: string;
    count: number;
}

export interface ChartData {
    name: string;
    value: number;
}

export interface HeatmapData {
    x: string;
    y: string;
    value: number;
}

export interface RiskStudent {
    name: string;
    student_code: string;
    count: number;
    max_intensity: number;
    tier: string;
    class: string;
}

export interface SafetyAlert {
    date: string;
    student: string;
    location: string;
    type: string;
    intensity: number;
}

export interface WeeklyTrendData {
    week: string;
    count: number;
}

export interface DashboardData {
    error?: string;
    summary: {
        total_incidents: number;
        avg_intensity: number;
        risk_student_count: number;
        enrolled_count?: number;
        individual_support_count?: number;
        tier1_count?: number;
        tier2_cico_count?: number;
        tier2_sst_count?: number;
        tier3_count?: number;
        tier3_plus_count?: number;
    };
    trends: TrendData[];
    weekly_trends?: WeeklyTrendData[];
    big5: {
        locations: ChartData[];
        times: ChartData[];
        behaviors: ChartData[];
        weekdays: ChartData[];
    };
    risk_list: RiskStudent[];
    functions: ChartData[];
    antecedents: ChartData[];
    consequences: ChartData[];
    heatmap: HeatmapData[];
    safety_alerts: SafetyAlert[];
    ai_comment?: string;
    ai_report?: AIReport;
}

export interface AIReport {
    briefing_text: string;
    sections: {
        briefing: string;
        agenda: string;
        order: string;
        decision: string;
        checklist: string;
    };
    tier_stats?: any;
    summary?: any;
}

export interface StudentProfile {
    student_code: string;
    name: string;
    class: string;
    tier: string;
    total_incidents: number;
    avg_intensity: number;
}

export interface StudentData {
    profile: StudentProfile;
    abc_data: { x: string; y: string; z: number; function: string }[];
    functions: ChartData[];
    cico_trend: TrendData[];
    weekly_trend?: any[];
    behavior_types?: ChartData[];
    location_stats?: ChartData[];
    time_stats?: ChartData[];
    weekday_dist?: ChartData[];
    monthly_trend?: any[];
    daily_intensity?: any[];
    separation_stats?: any[];
    daily_report_freq?: any[];
    monthly_report_freq?: any[];
}

export interface StudentMeetingData {
    name: string;
    class: string;
    total_incidents: number;
    weekly_avg: number;
    is_emergency: boolean;
    emergency_reason: string;
    is_tier2_candidate: boolean;
    decision_recommendation: string;
}

export interface MeetingAnalysisSummary {
    emergency_count: number;
    tier2_candidate_count: number;
}

export interface MeetingAnalysisResponse {
    period: string;
    students: StudentMeetingData[];
    summary: MeetingAnalysisSummary;
}

export interface User {
    id: string;
    role: string;
    Role?: string; // Legacy support
    class_id?: string;
    class_name?: string;
    name?: string;
    scope?: string | null;   // null=전교, 과정명(과정부장), 학급(담임)
    classes?: string[];      // 볼 수 있는 학급
    group?: string;          // ADMIN·PBST_STAFF·DEPT_HEAD·TEACHER
    account_admin?: boolean; // 계정·비밀번호 관리 가능
    privacy_mode?: string;   // 2026_HYBRID_RBAC | 2027_FULL_ZERO_PII
}
