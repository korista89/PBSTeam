"use client";

import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { AuthCheck } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { useRouter } from "next/navigation";
import { EBPStrategy, EBPCategory, FunctionCode } from "../../types/domain";

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    ALL: { label: "전체 (39종)", icon: "🌐", color: "#3b82f6" },
    ASSESSMENT: { label: "평가 (2종)", icon: "🔍", color: "#6366f1" },
    SETTING_EVENT: { label: "배경사건 (2종)", icon: "🛌", color: "#8b5cf6" },
    ANTECEDENT_PREVENT: { label: "선행사건 예방 (9종)", icon: "🛡️", color: "#0ea5e9" },
    TEACH_REPLACEMENT: { label: "대체/기술 교수 (17종)", icon: "💡", color: "#10b981" },
    REINFORCE: { label: "차별강화 (7종)", icon: "⭐", color: "#f59e0b" },
    CONSEQUENCE_RESPOND: { label: "후속결과/반응 (2종)", icon: "🚨", color: "#ef4444" }
};

const FUNCTION_LABELS: Record<string, string> = {
    ALL: "전체 기능",
    ESCAPE_DEMAND: "도피/회피 (과제·상황)",
    ATTENTION: "관심 추구 (교사·또래)",
    TANGIBLE_ACTIVITY: "물질/선호활동 획득",
    AUTOMATIC_SENSORY: "감각 조절/자동 강화",
    HEALTH_PAIN_SLEEP: "건강/통증/수면"
};

export default function EBPLibraryPage() {
    const router = useRouter();
    const [strategies, setStrategies] = useState<EBPStrategy[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
    const [selectedFunction, setSelectedFunction] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [activeStrategy, setActiveStrategy] = useState<EBPStrategy | null>(null);

    useEffect(() => {
        fetchCatalog();
    }, []);

    const fetchCatalog = async () => {
        try {
            setLoading(true);
            setError(null);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const res = await axios.get(`${apiUrl}/api/v1/ebp/catalog`);
            setStrategies(res.data.strategies || []);
        } catch (err: any) {
            console.error("Failed to load EBP catalog:", err);
            setError("EBP 카탈로그를 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const filteredStrategies = useMemo(() => {
        return strategies.filter((s) => {
            if (selectedCategory !== "ALL" && s.category !== selectedCategory) return false;
            if (selectedFunction !== "ALL" && !s.function_fits.includes(selectedFunction as FunctionCode)) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchName = s.name.toLowerCase().includes(q);
                const matchCode = s.code.toLowerCase().includes(q);
                const matchSummary = s.summary.toLowerCase().includes(q);
                const matchWhen = s.when_to_use.toLowerCase().includes(q);
                if (!matchName && !matchCode && !matchSummary && !matchWhen) return false;
            }
            return true;
        });
    }, [strategies, selectedCategory, selectedFunction, searchQuery]);

    return (
        <AuthCheck>
            <AppShell
                currentPage="ebp"
                title="📚 경기 Be-Able 39 Core EBP 지식 허브"
                subtitle="특수학교 학생을 위한 39개 근거기반실제(EBP) 정의, 3단계 실행 가이드, Guardrail 및 추천 조합"
                hideDateFilter={true}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {/* Filter & Search Bar */}
                    <div className="card" style={{ padding: "16px" }}>
                        {/* Category Buttons */}
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                            {Object.entries(CATEGORY_LABELS).map(([catKey, catMeta]) => {
                                const isSelected = selectedCategory === catKey;
                                return (
                                    <button
                                        key={catKey}
                                        onClick={() => setSelectedCategory(catKey)}
                                        style={{
                                            padding: "8px 14px",
                                            borderRadius: "10px",
                                            border: isSelected ? `2px solid ${catMeta.color}` : "1px solid #e2e8f0",
                                            background: isSelected ? `${catMeta.color}15` : "white",
                                            color: isSelected ? catMeta.color : "#475569",
                                            fontWeight: isSelected ? 700 : 500,
                                            fontSize: "0.88rem",
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            transition: "all 0.15s"
                                        }}
                                    >
                                        <span>{catMeta.icon}</span>
                                        <span>{catMeta.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search & Function Dropdown */}
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                            <div style={{ flex: "1 1 300px" }}>
                                <input
                                    type="text"
                                    placeholder="전략명, 코드(FCT, DRA 등), 문제 상황, 키워드 검색..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{
                                        width: "100%",
                                        padding: "10px 16px",
                                        borderRadius: "10px",
                                        border: "1px solid #cbd5e1",
                                        fontSize: "0.92rem",
                                        outline: "none"
                                    }}
                                />
                            </div>
                            <div style={{ flex: "0 1 240px" }}>
                                <select
                                    value={selectedFunction}
                                    onChange={(e) => setSelectedFunction(e.target.value)}
                                    style={{
                                        width: "100%",
                                        padding: "10px 14px",
                                        borderRadius: "10px",
                                        border: "1px solid #cbd5e1",
                                        fontSize: "0.92rem",
                                        background: "white",
                                        cursor: "pointer"
                                    }}
                                >
                                    {Object.entries(FUNCTION_LABELS).map(([fnKey, fnLabel]) => (
                                        <option key={fnKey} value={fnKey}>
                                            {fnLabel}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Content Section */}
                    {loading ? (
                        <div style={{ textAlign: "center", padding: "80px", color: "#64748b" }}>
                            <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>📖</div>
                            <p style={{ fontWeight: 600 }}>39개 EBP 전략을 불러오는 중입니다...</p>
                        </div>
                    ) : error ? (
                        <div style={{ padding: "20px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "12px", color: "#991b1b", fontWeight: 600 }}>
                            {error}
                        </div>
                    ) : (
                        <div>
                            <div style={{ marginBottom: "16px", fontSize: "0.9rem", color: "#64748b", fontWeight: 600 }}>
                                검색 결과: 총 {filteredStrategies.length}개 전략
                            </div>

                            {/* Card Grid */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "20px" }}>
                                {filteredStrategies.map((strat) => {
                                    const catMeta = CATEGORY_LABELS[strat.category] || { label: strat.category, icon: "📌", color: "#3b82f6" };
                                    return (
                                        <div
                                            key={strat.id}
                                            onClick={() => setActiveStrategy(strat)}
                                            style={{
                                                background: "white",
                                                borderRadius: "14px",
                                                border: "1px solid #e2e8f0",
                                                padding: "20px",
                                                cursor: "pointer",
                                                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                                                transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
                                                display: "flex",
                                                flexDirection: "column",
                                                justifyContent: "space-between"
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = "translateY(-2px)";
                                                e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.06)";
                                                e.currentTarget.style.borderColor = catMeta.color;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = "translateY(0)";
                                                e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.03)";
                                                e.currentTarget.style.borderColor = "#e2e8f0";
                                            }}
                                        >
                                            <div>
                                                {/* Card Header */}
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                                                    <span
                                                        style={{
                                                            fontSize: "0.75rem",
                                                            padding: "4px 8px",
                                                            borderRadius: "6px",
                                                            background: `${catMeta.color}15`,
                                                            color: catMeta.color,
                                                            fontWeight: 700
                                                        }}
                                                    >
                                                        {catMeta.icon} {catMeta.label.split(" ")[0]}
                                                    </span>
                                                    <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#64748b", fontFamily: "monospace" }}>
                                                        {strat.code}
                                                    </span>
                                                </div>

                                                {/* Title */}
                                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>
                                                    {strat.name}
                                                </h3>

                                                {/* Summary */}
                                                <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.5, margin: "0 0 14px 0" }}>
                                                    {strat.summary}
                                                </p>
                                            </div>

                                            {/* Card Footer */}
                                            <div>
                                                {/* Function Tags */}
                                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                                                    {strat.function_fits.map((fn) => (
                                                        <span
                                                            key={fn}
                                                            style={{
                                                                fontSize: "0.72rem",
                                                                padding: "2px 6px",
                                                                background: "#f1f5f9",
                                                                color: "#475569",
                                                                borderRadius: "4px",
                                                                fontWeight: 600
                                                            }}
                                                        >
                                                            {FUNCTION_LABELS[fn] || fn}
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Action Bar */}
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid #f1f5f9" }}>
                                                    <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600 }}>
                                                        업무부하: {strat.workload === "LOW" ? "🟢 낮음" : strat.workload === "MEDIUM" ? "🟡 보통" : "🔴 높음"}
                                                    </span>
                                                    <span style={{ fontSize: "0.82rem", color: catMeta.color, fontWeight: 700 }}>
                                                        실행 가이드 보기 ➔
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Detail Modal / Drawer */}
                    {activeStrategy && (
                        <div
                            style={{
                                position: "fixed",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: "rgba(15, 23, 42, 0.6)",
                                backdropFilter: "blur(4px)",
                                zIndex: 2000,
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                padding: "20px"
                            }}
                            onClick={() => setActiveStrategy(null)}
                        >
                            <div
                                style={{
                                    background: "white",
                                    borderRadius: "20px",
                                    maxWidth: "760px",
                                    width: "100%",
                                    maxHeight: "90vh",
                                    overflowY: "auto",
                                    padding: "32px",
                                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                                    <div>
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                                            <span style={{ padding: "4px 8px", background: "#e0f2fe", color: "#0369a1", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700 }}>
                                                {activeStrategy.code}
                                            </span>
                                            <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>
                                                {CATEGORY_LABELS[activeStrategy.category]?.label || activeStrategy.category}
                                            </span>
                                        </div>
                                        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                                            {activeStrategy.name}
                                        </h2>
                                    </div>
                                    <button
                                        onClick={() => setActiveStrategy(null)}
                                        style={{
                                            background: "#f1f5f9",
                                            border: "none",
                                            borderRadius: "50%",
                                            width: "36px",
                                            height: "36px",
                                            fontSize: "1.2rem",
                                            cursor: "pointer",
                                            color: "#64748b"
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>

                                <p style={{ fontSize: "0.95rem", color: "#334155", lineHeight: 1.6, marginBottom: "20px", background: "#f8fafc", padding: "14px", borderRadius: "10px" }}>
                                    {activeStrategy.summary}
                                </p>

                                {/* When to use */}
                                <div style={{ marginBottom: "24px" }}>
                                    <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                                        🎯 언제 적용하나요?
                                    </h4>
                                    <p style={{ fontSize: "0.9rem", color: "#475569", margin: 0 }}>
                                        {activeStrategy.when_to_use}
                                    </p>
                                </div>

                                {/* 3-Step Implementation Guide */}
                                <div style={{ marginBottom: "24px" }}>
                                    <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginBottom: "12px" }}>
                                        📋 3단계 실행 가이드
                                    </h4>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        {activeStrategy.implementation_steps.map((step, idx) => (
                                            <div key={idx} style={{ display: "flex", gap: "12px", alignItems: "flex-start", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px 16px", borderRadius: "10px" }}>
                                                <span style={{ background: "#22c55e", color: "white", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                                                    {idx + 1}
                                                </span>
                                                <span style={{ fontSize: "0.9rem", color: "#166534", lineHeight: 1.5, fontWeight: 500 }}>
                                                    {step}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Guardrails / Safeguards */}
                                {activeStrategy.guardrails && activeStrategy.guardrails.length > 0 && (
                                    <div style={{ marginBottom: "24px" }}>
                                        <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#b91c1c", marginBottom: "8px" }}>
                                            ⚠️ 교육적·임상적 안전 가드레일 (주의사항)
                                        </h4>
                                        <ul style={{ margin: 0, paddingLeft: "20px", color: "#991b1b", fontSize: "0.88rem", lineHeight: 1.6 }}>
                                            {activeStrategy.guardrails.map((g, idx) => (
                                                <li key={idx}>{g}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Recommended Pairings */}
                                {activeStrategy.recommended_pairings && activeStrategy.recommended_pairings.length > 0 && (
                                    <div style={{ marginBottom: "24px" }}>
                                        <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                                            🔗 함께 쓰면 좋은 추천 조합 (Pairing)
                                        </h4>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            {activeStrategy.recommended_pairings.map((p) => (
                                                <span key={p} style={{ padding: "6px 12px", background: "#fef3c7", color: "#92400e", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 700 }}>
                                                    {p}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                                    <button
                                        onClick={() => setActiveStrategy(null)}
                                        style={{
                                            padding: "10px 24px",
                                            background: "#f1f5f9",
                                            color: "#475569",
                                            border: "none",
                                            borderRadius: "10px",
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}
                                    >
                                        닫기
                                    </button>
                                    <button
                                        onClick={() => router.push("/report/tier3")}
                                        title="FBA/BIP관리에서 이 전략을 학생에게 선택·적용하고 충실도를 기록할 수 있습니다"
                                        style={{
                                            padding: "10px 24px",
                                            background: "#0f172a",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "10px",
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}
                                    >
                                        🧩 학생에게 적용 →
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </AppShell>
        </AuthCheck>
    );
}
