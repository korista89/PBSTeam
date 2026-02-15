// Shared constants for the PBIS platform

// Chart color palette
export const COLORS = [
    "#0088FE", "#00C49F", "#FFBB28", "#FF8042",
    "#8884d8", "#82ca9d", "#ffc658",
];

// Tier color mapping
export const TIER_COLORS: { [key: string]: string } = {
    "Tier 1": "#10B981",
    "Tier2(CICO)": "#F59E0B",
    "Tier2(SST)": "#1976d2",
    "Tier 2": "#F59E0B", // Legacy
    "Tier 3": "#EF4444",
    "Tier3+": "#4a148c",
};

// API URL helper
export function getApiUrl(): string {
    if (typeof window !== "undefined") {
        return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    }
    return "http://localhost:8000";
}

export const CLASS_LIST = [
    // 1. 유치원
    { id: "101", name: "유치원 0학년 1반" }, { id: "102", name: "유치원 0학년 2반" },
    // 2. 초등
    { id: "211", name: "초등 1학년 1반" }, { id: "212", name: "초등 1학년 2반" },
    { id: "221", name: "초등 2학년 1반" }, { id: "222", name: "초등 2학년 2반" },
    { id: "231", name: "초등 3학년 1반" },
    { id: "241", name: "초등 4학년 1반" }, { id: "242", name: "초등 4학년 2반" },
    { id: "251", name: "초등 5학년 1반" }, { id: "252", name: "초등 5학년 2반" },
    { id: "261", name: "초등 6학년 1반" }, { id: "262", name: "초등 6학년 2반" },
    // 3. 중학교
    { id: "311", name: "중학교 1학년 1반" }, { id: "312", name: "중학교 1학년 2반" },
    { id: "321", name: "중학교 2학년 1반" }, { id: "322", name: "중학교 2학년 2반" },
    { id: "331", name: "중학교 3학년 1반" }, { id: "332", name: "중학교 3학년 2반" },
    { id: "340", name: "중학교 순회학급" },
    // 4. 고등
    { id: "411", name: "고등학교 1학년 1반" }, { id: "412", name: "고등학교 1학년 2반" },
    { id: "421", name: "고등학교 2학년 1반" }, { id: "422", name: "고등학교 2학년 2반" },
    { id: "431", name: "고등학교 3학년 1반" }, { id: "432", name: "고등학교 3학년 2반" },
    { id: "440", name: "고등학교 순회학급" },
    // 5. 전공과
    { id: "511", name: "전공과 1학년 1반" }, { id: "512", name: "전공과 1학년 2반" }, { id: "513", name: "전공과 1학년 3반" },
    { id: "521", name: "전공과 2학년 1반" }, { id: "522", name: "전공과 2학년 2반" }, { id: "523", name: "전공과 2학년 3반" },
    // 6. 예비
    { id: "600", name: "예비 학급" }
];
