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
    // 1. 유치원 (10X -> 유X관리자)
    { code: "101", name: "유치원 1반", id: "유1관리자" },
    { code: "102", name: "유치원 2반", id: "유2관리자" },
    // 2. 초등 (2XX -> 초X-X관리자)
    { code: "211", name: "초등 1학년 1반", id: "초1-1관리자" },
    { code: "212", name: "초등 1학년 2반", id: "초1-2관리자" },
    { code: "221", name: "초등 2학년 1반", id: "초2-1관리자" }, // 222 missing in original but let's be safe or just follow original
    { code: "222", name: "초등 2학년 2반", id: "초2-2관리자" },
    { code: "231", name: "초등 3학년 1반", id: "초3-1관리자" },
    { code: "241", name: "초등 4학년 1반", id: "초4-1관리자" },
    { code: "242", name: "초등 4학년 2반", id: "초4-2관리자" },
    { code: "251", name: "초등 5학년 1반", id: "초5-1관리자" },
    { code: "252", name: "초등 5학년 2반", id: "초5-2관리자" },
    { code: "261", name: "초등 6학년 1반", id: "초6-1관리자" },
    { code: "262", name: "초등 6학년 2반", id: "초6-2관리자" },
    // 3. 중학교 (3XX -> 중X-X관리자)
    { code: "311", name: "중학교 1학년 1반", id: "중1-1관리자" },
    { code: "312", name: "중학교 1학년 2반", id: "중1-2관리자" },
    { code: "321", name: "중학교 2학년 1반", id: "중2-1관리자" },
    { code: "322", name: "중학교 2학년 2반", id: "중2-2관리자" },
    { code: "331", name: "중학교 3학년 1반", id: "중3-1관리자" },
    { code: "332", name: "중학교 3학년 2반", id: "중3-2관리자" },
    { code: "340", name: "중학교 순회학급", id: "중순회관리자" },
    // 4. 고등 (4XX -> 고X-X관리자)
    { code: "411", name: "고등학교 1학년 1반", id: "고1-1관리자" },
    { code: "412", name: "고등학교 1학년 2반", id: "고1-2관리자" },
    { code: "421", name: "고등학교 2학년 1반", id: "고2-1관리자" },
    { code: "422", name: "고등학교 2학년 2반", id: "고2-2관리자" },
    { code: "431", name: "고등학교 3학년 1반", id: "고3-1관리자" },
    { code: "432", name: "고등학교 3학년 2반", id: "고3-2관리자" },
    { code: "440", name: "고등학교 순회학급", id: "고순회관리자" },
    // 5. 전공과 (5XX -> 전X-X관리자)
    { code: "511", name: "전공과 1학년 1반", id: "전1-1관리자" },
    { code: "512", name: "전공과 1학년 2반", id: "전1-2관리자" },
    { code: "513", name: "전공과 1학년 3반", id: "전1-3관리자" },
    { code: "521", name: "전공과 2학년 1반", id: "전2-1관리자" },
    { code: "522", name: "전공과 2학년 2반", id: "전2-2관리자" },
    { code: "523", name: "전공과 2학년 3반", id: "전2-3관리자" },
    // 6. 예비
    { code: "600", name: "예비 학급", id: "예비관리자" }
];
