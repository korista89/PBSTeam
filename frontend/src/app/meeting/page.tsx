"use client";

import React, { useState } from 'react';
import styles from './page.module.css';
import axios from 'axios';
import { AuthCheck } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { useDateRange } from "../components/GlobalNav";


export default function MeetingPage() {
    const { startDate, endDate } = useDateRange();
    const [result, setResult] = useState("");
    const [loading, setLoading] = useState(false);

    // Context Period (Default: Jan 1st - Today)
    const [contextStartDate, setContextStartDate] = useState(`${new Date().getFullYear()}-01-01`);
    const [contextEndDate, setContextEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [showContextSettings, setShowContextSettings] = useState(false);

    const handleGenerate = async () => {
        if (!startDate || !endDate) {
            alert("상단 네비게이션 바에서 분석할 기간(집중 분석 기간)을 먼저 선택해주세요.");
            return;
        }
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-meeting-minutes`, {
                start_date: startDate,
                end_date: endDate,
                context_start_date: contextStartDate,
                context_end_date: contextEndDate
            }, { timeout: 180000 });
            setResult(res.data.analysis || "");
        } catch (e: any) {
            console.error(e);
            alert("회의록 생성 실패: " + (e.response?.data?.detail || e.message));
        } finally {
            setLoading(false);
        }
    };

    const [saving, setSaving] = useState(false);

    const handleSaveToSheet = async () => {
        if (!result) return;
        setSaving(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
                meeting_type: "tier1",
                date: new Date().toISOString().split('T')[0],
                content: result,
                author: "PBS Coordinator",
                period_start: startDate,
                period_end: endDate
            });
            alert("협의록이 시스템 및 구글 시트에 성공적으로 저장되었습니다.");
        } catch (e: any) {
            console.error(e);
            alert("저장 실패: " + (e.response?.data?.detail || e.message));
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = () => {
        if (!result) return;
        navigator.clipboard.writeText(result);
        alert("클립보드에 복사되었습니다.");
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <AuthCheck>
            <AppShell
                currentPage="meeting"
                title="🤝 행동중재지원팀 정기 협의회 에이전트"
                subtitle="학교 전체 행동 데이터(Log_Main, CICO, Tier 3)를 다차원 분석하여 학교장 보고용 표준 협의록을 자동 생성"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {/* Top Configuration Card */}
                    <div className="card" style={{ padding: "20px", borderLeft: "4px solid #8b5cf6" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                            <div>
                                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                                    🎯 분석 기간 설정 및 AI 협의록 생성
                                </div>
                                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                                    집중 분석 기간과 비교 기간의 변화율을 대조하여 개선율, 악화 영역, 차기 지원 대책을 도출합니다.
                                </div>
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={loading || !startDate || !endDate}
                                className="btn btn-ai"
                                style={{ padding: "10px 24px", fontSize: "0.88rem" }}
                            >
                                {loading ? "데이터 종합 분석 중..." : "✨ AI 정기 협의록 자동 생성"}
                            </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", background: "var(--bg-subtle)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
                            <div>
                                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                                    📅 집중 분석 기간 (TopBar 기준)
                                </div>
                                <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--primary-blue)" }}>
                                    {startDate && endDate ? `${startDate} ~ ${endDate}` : "상단 탑바에서 날짜를 선택하세요"}
                                </div>
                            </div>

                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                                        📊 비교/배경 기간 (Context)
                                    </div>
                                    <button
                                        onClick={() => setShowContextSettings(!showContextSettings)}
                                        style={{ border: "none", background: "none", color: "var(--primary-blue)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 700 }}
                                    >
                                        {showContextSettings ? "접기" : "기간 변경"}
                                    </button>
                                </div>
                                {showContextSettings ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <input
                                            type="date"
                                            value={contextStartDate}
                                            onChange={e => setContextStartDate(e.target.value)}
                                            style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-subtle)", fontSize: "0.78rem", background: "white" }}
                                        />
                                        <span style={{ color: "var(--text-muted)" }}>~</span>
                                        <input
                                            type="date"
                                            value={contextEndDate}
                                            onChange={e => setContextEndDate(e.target.value)}
                                            style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-subtle)", fontSize: "0.78rem", background: "white" }}
                                        />
                                    </div>
                                ) : (
                                    <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                        {contextStartDate} ~ {contextEndDate}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Result Content */}
                    {result ? (
                        <div className="card" style={{ padding: "24px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
                                <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span>📋</span> 생성된 정기 협의록 전문
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <button
                                        onClick={handleSaveToSheet}
                                        disabled={saving}
                                        className="btn btn-primary"
                                    >
                                        {saving ? "저장 중..." : "💾 시트에 저장"}
                                    </button>
                                    <button onClick={handleCopy} className="btn btn-secondary">
                                        📋 복사하기
                                    </button>
                                    <button onClick={handlePrint} className="btn btn-secondary">
                                        🖨️ 인쇄
                                    </button>
                                </div>
                            </div>

                            <div
                                style={{
                                    whiteSpace: "pre-wrap",
                                    lineHeight: 1.8,
                                    color: "var(--text-primary)",
                                    background: "var(--bg-subtle)",
                                    padding: "20px",
                                    borderRadius: "10px",
                                    border: "1px solid var(--border-subtle)",
                                    fontSize: "0.92rem"
                                }}
                            >
                                {result}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-state-icon">🤝</div>
                            <div className="empty-state-title">협의회 안건을 생성할 준비가 되었습니다</div>
                            <div className="empty-state-text">상단 [AI 정기 협의록 자동 생성] 버튼을 누르면 전교 데이터를 기반으로 공문서 규격의 협의록이 도출됩니다.</div>
                        </div>
                    )}
                </div>
            </AppShell>
        </AuthCheck>
    );
}
