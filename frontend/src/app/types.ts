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
