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
