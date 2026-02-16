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

export const BIP_STRATEGIES: { [key: string]: { prevention: string, teaching: string, consequence: string } } = {
    "관심 끌기 (Attention)": {
        prevention: "- 비구조화된 시간에 교사의 관심 제공 (Non-contingent Attention)\n- 과제 수행 중 주기적인 칭찬 제공\n- 또래와 함께하는 활동 기회 제공",
        teaching: "- 적절한 방법으로 관심 끄는 표현(손 들기, 말 걸기) 교육\n- '나 좀 봐주세요' 카드 사용하기",
        consequence: "- 부적절한 행동에 대한 계획적 무시 (Planned Ignoring)\n- 적절한 행동 시 즉각적이고 구체적인 칭찬 제공"
    },
    "회피 (Escape)": {
        prevention: "- 과제 난이도 조절 및 선택권 제공\n- 과제 수행 중 짧은 휴식 시간 제공 (Break Card)\n- 선호하는 활동을 과제 후에 배치 (Premack Principle)",
        teaching: "- '도와주세요' 또는 '잠깐 쉴래요' 표현 교육\n- 과제 거부 대신 협상하는 기술 교육",
        consequence: "- 과제 수행 완료 시 강화물 제공\n- 부적절한 행동 시 과제 면제 금지 (Stay with Task)"
    },
    "물건/활동 얻기 (Tangible)": {
        prevention: "- 선호하는 물건/활동의 사용 규칙 명확히 제시\n- 기다리는 시간 동안 대체 활동 제공\n- 시각적 스케줄을 통해 활동 순서 안내",
        teaching: "- '주세요' 또는 '빌려줄래?' 표현 교육\n- 기다리기 기술 및 순서 지키기 교육",
        consequence: "- 부적절한 행동 시 물건/활동 제공 지연\n- 적절한 요청 시 즉시 제공 또는 강화"
    },
    "감각/자기자극 (Sensory)": {
        prevention: "- 감각적 욕구를 충족시킬 수 있는 대체 도구 제공 (Fidget toy)\n- 환경 자극 조절 (소음 차단, 조명 조절)\n- 풍부한 감각 활동 포함",
        teaching: "- 스트레스 상황에서 감각 도구 사용 요청하기\n- 적절한 시공간에서 감각 활동 하기",
        consequence: "- 부적절한 행동 중단 및 대체 감각 활동 유도\n- 감각 행동이 타인에게 피해를 주지 않도록 제한"
    }
};
