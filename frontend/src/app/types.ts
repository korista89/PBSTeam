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

export interface DashboardData {
    error?: string;
    summary: {
        total_incidents: number;
        avg_intensity: number;
        risk_student_count: number;
    };
    trends: TrendData[];
    big5: {
        locations: ChartData[];
        times: ChartData[];
        behaviors: ChartData[];
    };
    risk_list: RiskStudent[];
    functions: ChartData[];
    heatmap: HeatmapData[];
    safety_alerts: SafetyAlert[];
    ai_comment?: string;
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
