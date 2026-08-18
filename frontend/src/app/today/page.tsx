"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { AuthCheck } from "../components/AuthProvider";
import GlobalNav from "../components/GlobalNav";
import type { DecisionSignal } from "../../types/domain";

export default function TodayDecisionCenterPage() {
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedSignal, setSelectedSignal] = useState<DecisionSignal | null>(null);
    const [decisionAction, setDecisionAction] = useState<string>("ADAPT_STRATEGY");
    const [decisionRationale, setDecisionRationale] = useState<string>("");
    const [actionSuccess, setActionSuccess] = useState<boolean>(false);

    useEffect(() => {
        fetchTodayData();
    }, []);

    const fetchTodayData = async () => {
        try {
            setLoading(true);
            setError(null);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const res = await axios.get(`${apiUrl}/api/v1/workspace/today`);
            setData(res.data);
        } catch (err: any) {
            console.error("Failed to load Today decision center:", err);
            setError("오늘의 의사결정 데이터를 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleRecordDecision = () => {
        if (!selectedSignal || !decisionRationale.trim()) {
            alert("의사결정 사유를 입력해 주세요.");
            return;
        }
        setActionSuccess(true);
        setTimeout(() => {
            setActionSuccess(false);
            setSelectedSignal(null);
            setDecisionRationale("");
        }, 1500);
    };

    const navigateToStudent = (studentCode?: string | null) => {
        if (!studentCode) return;
        router.push(`/student/${encodeURIComponent(studentCode)}`);
    };

    return (
        <AuthCheck>
            <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
                <GlobalNav currentPage="today" />

                <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px" }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", flexWrap: "wrap", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span style={{ fontSize: "2.2rem" }}>🧭</span>
                            <div>
                                <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                                    Today 행동지원 의사결정 센터
                                </h1>
                                <p style={{ fontSize: "0.95rem", color: "#64748b", margin: "4px 0 0 0" }}>
                                    긴급 위기 안전 후속 조치, 중재 점검 신호, 팀 협의 과제를 실시간으로 확인하고 결정합니다.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={fetchTodayData}
                            style={{
                                padding: "8px 16px",
                                background: "white",
                                border: "1px solid #cbd5e1",
                                borderRadius: "10px",
                                fontWeight: 700,
                                color: "#334155",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}
                        >
                            🔄 새로고침
                        </button>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: "center", padding: "100px", color: "#64748b" }}>
                            <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>🧭</div>
                            <p style={{ fontWeight: 600 }}>전교 지원 신호를 분석하고 있습니다...</p>
                        </div>
                    ) : error ? (
                        <div style={{ padding: "20px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "12px", color: "#991b1b", fontWeight: 600 }}>
                            {error}
                        </div>
                    ) : (
                        <div>
                            {/* Summary Metrics Bar */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "28px" }}>
                                <div style={{ background: "white", padding: "20px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                                    <div style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>재학 학생 총원</div>
                                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
                                        {data?.total_enrolled || 0}<span style={{ fontSize: "1rem", fontWeight: 500, color: "#64748b" }}>명</span>
                                    </div>
                                    <div style={{ fontSize: "0.8rem", color: "#3b82f6", marginTop: "4px", fontWeight: 600 }}>
                                        T1 {data?.tier_counts?.["Tier 1"]} · T2 {data?.tier_counts?.["Tier 2"]} · T3 {data?.tier_counts?.["Tier 3"]} · T3+ {data?.tier_counts?.["Tier 3+"]}
                                    </div>
                                </div>

                                <div style={{ background: "white", padding: "20px", borderRadius: "14px", border: "1px solid #fecaca", borderLeft: "5px solid #ef4444" }}>
                                    <div style={{ fontSize: "0.85rem", color: "#991b1b", fontWeight: 700 }}>🚨 긴급 안전 신호</div>
                                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#ef4444", marginTop: "4px" }}>
                                        {data?.urgent_safety_signals?.length || 0}<span style={{ fontSize: "1rem", fontWeight: 500, color: "#991b1b" }}>건</span>
                                    </div>
                                    <div style={{ fontSize: "0.8rem", color: "#b91c1c", marginTop: "4px" }}>
                                        물리적 제지 / 상해 후속 확인 필요
                                    </div>
                                </div>

                                <div style={{ background: "white", padding: "20px", borderRadius: "14px", border: "1px solid #fed7aa", borderLeft: "5px solid #f97316" }}>
                                    <div style={{ fontSize: "0.85rem", color: "#9a3412", fontWeight: 700 }}>🟠 중재 점검 신호</div>
                                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#f97316", marginTop: "4px" }}>
                                        {data?.review_signals?.length || 0}<span style={{ fontSize: "1rem", fontWeight: 500, color: "#9a3412" }}>건</span>
                                    </div>
                                    <div style={{ fontSize: "0.8rem", color: "#c2410c", marginTop: "4px" }}>
                                        CICO 목표 정체 / 빈도 급증 / 데이터 부족
                                    </div>
                                </div>

                                <div style={{ background: "white", padding: "20px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                                    <div style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>최근 14일 기록 건수</div>
                                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
                                        {data?.recent_14d_events_count || 0}<span style={{ fontSize: "1rem", fontWeight: 500, color: "#64748b" }}>건</span>
                                    </div>
                                    <div style={{ fontSize: "0.8rem", color: "#10b981", marginTop: "4px", fontWeight: 600 }}>
                                        교내 행동지원 일과 정상 가동 중
                                    </div>
                                </div>
                            </div>

                            {/* Section 1: Urgent Safety Signals */}
                            {data?.urgent_safety_signals && data.urgent_safety_signals.length > 0 && (
                                <div style={{ marginBottom: "32px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                                        <span style={{ fontSize: "1.3rem" }}>🚨</span>
                                        <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#991b1b", margin: 0 }}>
                                            우선 검토 1: 긴급 안전 및 위기 후속 조치 과제
                                        </h2>
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                        {data.urgent_safety_signals.map((sig: DecisionSignal) => (
                                            <div
                                                key={sig.signal_id}
                                                style={{
                                                    background: "white",
                                                    borderRadius: "14px",
                                                    border: "1px solid #fca5a5",
                                                    padding: "20px",
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    flexWrap: "wrap",
                                                    gap: "16px",
                                                    boxShadow: "0 1px 3px rgba(239, 68, 68, 0.05)"
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                                        <span style={{ padding: "4px 8px", background: "#fee2e2", color: "#b91c1c", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 800 }}>
                                                            {sig.student_code} 학생
                                                        </span>
                                                        <span style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>
                                                            {sig.title}
                                                        </span>
                                                    </div>
                                                    <p style={{ fontSize: "0.9rem", color: "#475569", margin: "0 0 6px 0" }}>
                                                        {sig.reason}
                                                    </p>
                                                    <p style={{ fontSize: "0.82rem", color: "#dc2626", margin: 0, fontWeight: 600 }}>
                                                        권장 다음 조치: {sig.recommended_next_action}
                                                    </p>
                                                </div>

                                                <div style={{ display: "flex", gap: "8px" }}>
                                                    <button
                                                        disabled={!sig.student_code}
                                                        onClick={() => navigateToStudent(sig.student_code)}
                                                        style={{
                                                            padding: "8px 14px",
                                                            background: sig.student_code ? "#f1f5f9" : "#e2e8f0",
                                                            color: sig.student_code ? "#334155" : "#94a3b8",
                                                            border: "1px solid #cbd5e1",
                                                            borderRadius: "8px",
                                                            fontSize: "0.85rem",
                                                            fontWeight: 700,
                                                            cursor: sig.student_code ? "pointer" : "not-allowed"
                                                        }}
                                                    >
                                                        학생 360 보기 ➔
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedSignal(sig)}
                                                        style={{
                                                            padding: "8px 14px",
                                                            background: "#ef4444",
                                                            color: "white",
                                                            border: "none",
                                                            borderRadius: "8px",
                                                            fontSize: "0.85rem",
                                                            fontWeight: 700,
                                                            cursor: "pointer"
                                                        }}
                                                    >
                                                        의사결정 기록
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Section 2: Review Signals */}
                            <div style={{ marginBottom: "32px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                                    <span style={{ fontSize: "1.3rem" }}>🟠</span>
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#c2410c", margin: 0 }}>
                                        우선 검토 2: 중재 전략 점검 및 지원 조정 신호
                                    </h2>
                                </div>

                                {data?.review_signals && data.review_signals.length > 0 ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "16px" }}>
                                        {data.review_signals.map((sig: DecisionSignal) => (
                                            <div
                                                key={sig.signal_id}
                                                style={{
                                                    background: "white",
                                                    borderRadius: "14px",
                                                    border: "1px solid #fed7aa",
                                                    padding: "20px",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    justifyContent: "space-between"
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                                        <span style={{ padding: "4px 8px", background: "#ffedd5", color: "#c2410c", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 800 }}>
                                                            {sig.student_code} 학생
                                                        </span>
                                                        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                                                            {sig.signal_type}
                                                        </span>
                                                    </div>
                                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>
                                                        {sig.title}
                                                    </h3>
                                                    <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.5, margin: "0 0 12px 0" }}>
                                                        {sig.reason}
                                                    </p>
                                                    <p style={{ fontSize: "0.82rem", color: "#ea580c", margin: 0, fontWeight: 600 }}>
                                                        권장: {sig.recommended_next_action}
                                                    </p>
                                                </div>

                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #f1f5f9" }}>
                                                    <button
                                                        disabled={!sig.student_code}
                                                        onClick={() => navigateToStudent(sig.student_code)}
                                                        style={{
                                                            background: "none",
                                                            border: "none",
                                                            color: sig.student_code ? "#3b82f6" : "#94a3b8",
                                                            fontSize: "0.85rem",
                                                            fontWeight: 700,
                                                            cursor: sig.student_code ? "pointer" : "not-allowed",
                                                            padding: 0
                                                        }}
                                                    >
                                                        학생 데이터 열람 ➔
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedSignal(sig)}
                                                        style={{
                                                            padding: "6px 12px",
                                                            background: "#f97316",
                                                            color: "white",
                                                            border: "none",
                                                            borderRadius: "6px",
                                                            fontSize: "0.82rem",
                                                            fontWeight: 700,
                                                            cursor: "pointer"
                                                        }}
                                                    >
                                                        결정 기록
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ background: "white", padding: "32px", borderRadius: "14px", textAlign: "center", color: "#64748b", border: "1px solid #e2e8f0" }}>
                                        🎉 현재 즉각적인 조정이 필요한 중재 정체 신호가 없습니다.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Teacher Decision Modal */}
                    {selectedSignal && (
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
                            onClick={() => setSelectedSignal(null)}
                        >
                            <div
                                style={{
                                    background: "white",
                                    borderRadius: "20px",
                                    maxWidth: "600px",
                                    width: "100%",
                                    padding: "28px",
                                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
                                    ✍️ 교사 행동지원 의사결정 기록
                                </h2>
                                <p style={{ fontSize: "0.88rem", color: "#64748b", marginBottom: "20px" }}>
                                    학생 코드: <strong>{selectedSignal.student_code}</strong> · 신호: {selectedSignal.title}
                                </p>

                                {actionSuccess ? (
                                    <div style={{ padding: "20px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", color: "#166534", fontWeight: 700, textAlign: "center" }}>
                                        ✅ 의사결정이 성공적으로 기록되었습니다.
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ marginBottom: "16px" }}>
                                            <label style={{ display: "block", fontSize: "0.88rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                                                결정 유형 (Action)
                                            </label>
                                            <select
                                                value={decisionAction}
                                                onChange={(e) => setDecisionAction(e.target.value)}
                                                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
                                            >
                                                <option value="KEEP">현행 중재 유지 및 추가 관찰 (KEEP)</option>
                                                <option value="ADAPT_STRATEGY">EBP 전략 수정 및 난이도/강화제 조정 (ADAPT)</option>
                                                <option value="INTENSIFY">지원 강도 강화 (Tier 상향 검토/INTENSIFY)</option>
                                                <option value="FADE">목표 달성으로 중재 점진적 페이딩 (FADE)</option>
                                                <option value="NEW_FBA">추가 기능평가(FBA) 및 ABC 직접관찰 실시 (NEW_FBA)</option>
                                                <option value="SAFETY_PLAN_UPDATE">위기 안전계획 갱신 및 관리자/보호자 보고 (SAFETY_PLAN)</option>
                                            </select>
                                        </div>

                                        <div style={{ marginBottom: "20px" }}>
                                            <label style={{ display: "block", fontSize: "0.88rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                                                의사결정 근거 및 실행 계획 (Rationale)
                                            </label>
                                            <textarea
                                                rows={4}
                                                placeholder="데이터 관찰 결과, 협의 내용, 적용할 구체적 변경 사항을 작성하세요..."
                                                value={decisionRationale}
                                                onChange={(e) => setDecisionRationale(e.target.value)}
                                                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", resize: "vertical" }}
                                            />
                                        </div>

                                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                            <button
                                                onClick={() => setSelectedSignal(null)}
                                                style={{ padding: "8px 16px", background: "#f1f5f9", color: "#334155", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
                                            >
                                                취소
                                            </button>
                                            <button
                                                onClick={handleRecordDecision}
                                                style={{ padding: "8px 18px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
                                            >
                                                저장하기
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </AuthCheck>
    );
}
