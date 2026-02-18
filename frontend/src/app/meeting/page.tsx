"use client";

import React, { useState } from 'react';
import styles from './page.module.css';
import axios from 'axios';
import { AuthCheck } from "../components/AuthProvider";
import GlobalNav, { useDateRange } from "../components/GlobalNav";

export default function MeetingPage() {
    const { startDate, endDate } = useDateRange();
    const [result, setResult] = useState("");
    const [loading, setLoading] = useState(false);

    const handleGenerate = async () => {
        if (!startDate || !endDate) {
            alert("상단 네비게이션 바에서 분석할 기간을 먼저 선택해주세요.");
            return;
        }
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-meeting-minutes`, {
                start_date: startDate,
                end_date: endDate
            });
            setResult(res.data.analysis);
        } catch (e: any) {
            console.error(e);
            alert("회의록 생성 실패: " + (e.response?.data?.detail || e.message));
        } finally {
            setLoading(false);
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
            <div className={styles.container}>
                <GlobalNav currentPage="meeting" />
                <main className={styles.main}>
                    <div className={styles.card} style={{ borderLeft: '5px solid #8b5cf6', minHeight: '80vh' }}>
                        <header style={{ marginBottom: '2rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
                            <h1 style={{ fontSize: '1.8rem', color: '#111', marginBottom: '0.5rem' }}>
                                🤖 학교행동중재지원팀 정기 협의회 에이전트
                            </h1>
                            <p style={{ color: '#666' }}>
                                설정된 기간의 학교 전체 데이터(행동발생, CICO, Tier3)를 분석하여 학교장 보고용 협의록을 자동 생성합니다.
                            </p>

                            <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontWeight: 'bold', color: '#4b5563' }}>분석 기간: </span>
                                    <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                                        {startDate && endDate ? `${startDate} ~ ${endDate}` : '기간 미설정 (상단에서 선택하세요)'}
                                    </span>
                                </div>
                                <button
                                    onClick={handleGenerate}
                                    disabled={loading || !startDate || !endDate}
                                    style={{
                                        padding: '10px 24px',
                                        backgroundColor: loading ? '#9ca3af' : '#8b5cf6',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '1rem',
                                        fontWeight: 'bold',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                        transition: 'background 0.2s'
                                    }}
                                >
                                    {loading ? "데이터 분석 및 생성 중..." : "✨ AI 협의록 생성하기"}
                                </button>
                            </div>
                        </header>

                        {result ? (
                            <section>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '1rem' }}>
                                    <button
                                        onClick={handleCopy}
                                        style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                                    >
                                        📋 복사하기
                                    </button>
                                    <button
                                        onClick={handlePrint}
                                        style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                                    >
                                        🖨️ 인쇄하기
                                    </button>
                                </div>
                                <div
                                    style={{
                                        whiteSpace: 'pre-wrap',
                                        lineHeight: '1.8',
                                        color: '#374151',
                                        backgroundColor: '#fff',
                                        padding: '2rem',
                                        borderRadius: '8px',
                                        border: '1px solid #e5e7eb',
                                        fontFamily: 'sans-serif',
                                        fontSize: '1.05rem'
                                    }}
                                >
                                    {result}
                                </div>
                            </section>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                                <p>기간을 설정하고 [AI 협의록 생성하기] 버튼을 눌러주세요.</p>
                                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                    Google Sheets의 모든 데이터를 기반으로 즉시 분석합니다.
                                </p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </AuthCheck>
    );
}
