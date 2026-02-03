"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import styles from "../page.module.css";
import { AuthCheck } from "../components/AuthProvider";

interface CICOStudent {
    Code: string;
    Name: string;
    Class: string;
}

interface CICORecord {
    Date: string;
    StudentCode: string;
    TargetBehavior1: string;
    TargetBehavior2: string;
    AchievementRate: number;
    TeacherMemo: string;
}

export default function CICOInputPage() {
    const [tier2Students, setTier2Students] = useState<CICOStudent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStudent, setSelectedStudent] = useState<string>("");
    const [target1, setTarget1] = useState<string>("");
    const [target2, setTarget2] = useState<string>("");
    const [memo, setMemo] = useState("");
    const [saving, setSaving] = useState(false);
    const [todayDate, setTodayDate] = useState(new Date().toISOString().split('T')[0]);
    const [recentRecords, setRecentRecords] = useState<CICORecord[]>([]);
    const [todayCompleted, setTodayCompleted] = useState(false);

    useEffect(() => {
        fetchTier2Students();
    }, []);

    useEffect(() => {
        if (selectedStudent) {
            fetchRecentRecords(selectedStudent);
        }
    }, [selectedStudent]);

    const fetchTier2Students = async () => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const response = await axios.get(`${apiUrl}/api/v1/tier/status`);
            
            // Filter to Tier 2 students only
            interface StatusRecord { Code: string; Name?: string; Class?: string; CurrentTier: string; }
            const tier2 = response.data.filter((s: StatusRecord) => s.CurrentTier === "Tier 2");
            setTier2Students(tier2.map((s: StatusRecord) => ({
                Code: s.Code,
                Name: s.Name || s.Code,
                Class: s.Class || ""
            })));
            
            if (tier2.length > 0) {
                setSelectedStudent(tier2[0].Code);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentRecords = async (code: string) => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const response = await axios.get(`${apiUrl}/api/v1/tier/cico?student_code=${code}`);
            const records = response.data.slice(-7) as CICORecord[]; // Last 7 records
            setRecentRecords(records);
            
            // Check if today's entry exists for this student
            const today = new Date().toISOString().split('T')[0];
            const todayEntry = records.find((r: CICORecord) => r.Date === today);
            setTodayCompleted(!!todayEntry);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmit = async () => {
        if (!selectedStudent || !target1 || !target2) {
            alert("모든 항목을 입력해주세요.");
            return;
        }

        try {
            setSaving(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            
            const user = localStorage.getItem("user");
            const enteredBy = user ? JSON.parse(user).id : "";

            await axios.post(`${apiUrl}/api/v1/tier/cico`, {
                date: todayDate,
                student_code: selectedStudent,
                target1: target1,
                target2: target2,
                memo: memo,
                entered_by: enteredBy
            });

            alert("CICO 기록이 저장되었습니다!");
            setTarget1("");
            setTarget2("");
            setMemo("");
            fetchRecentRecords(selectedStudent);
        } catch (err) {
            console.error(err);
            alert("저장 실패");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className={styles.loading}>로딩 중...</div>;

    if (tier2Students.length === 0) {
        return (
            <div className={styles.container}>
                <header className={styles.header}>
                    <div>
                        <h1 className={styles.title}>📝 CICO 일일 기록</h1>
                        <p className={styles.subtitle}>Tier 2 학생 표적 행동 체크</p>
                    </div>
                    <button onClick={() => window.location.href='/'} style={{ padding: '8px 16px', cursor: 'pointer' }}>
                        ← 대시보드
                    </button>
                </header>
                <main className={styles.main}>
                    <div className={styles.card} style={{ textAlign: 'center', padding: '40px' }}>
                        <p style={{ fontSize: '1.2rem', color: '#666' }}>
                            현재 Tier 2 대상 학생이 없습니다.
                        </p>
                        <p style={{ color: '#999', marginTop: '10px' }}>
                            Tier별 현황 페이지에서 학생을 Tier 2로 변경해주세요.
                        </p>
                        <button 
                            onClick={() => window.location.href='/tier-status'}
                            style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                        >
                            Tier별 현황 가기
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    const currentStudent = tier2Students.find(s => s.Code === selectedStudent);
    const achievementRate = recentRecords.length > 0 
        ? Math.round(recentRecords.reduce((sum, r) => sum + (r.AchievementRate || 0), 0) / recentRecords.length)
        : 0;

    return (
        <AuthCheck>
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>📝 CICO 일일 기록</h1>
                    <p className={styles.subtitle}>Tier 2 학생 표적 행동 체크 (2개 표적행동)</p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {todayCompleted && (
                        <span style={{ 
                            padding: '6px 12px', 
                            backgroundColor: '#d1fae5', 
                            color: '#059669',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold'
                        }}>
                            ✓ 오늘 기록 완료
                        </span>
                    )}
                    <button onClick={() => window.location.href='/tier-status'} style={{ padding: '8px 16px', cursor: 'pointer' }}>
                        📊 Tier별 현황
                    </button>
                    <button onClick={() => window.location.href='/'} style={{ padding: '8px 16px', cursor: 'pointer' }}>
                        ← 대시보드
                    </button>
                </div>
            </header>

            <main className={styles.main}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Input Form */}
                    <div className={styles.card}>
                        <h2 style={{ marginBottom: '20px' }}>
                            오늘의 기록
                            {todayCompleted && <span style={{ fontSize: '0.8rem', marginLeft: '10px', color: '#f59e0b' }}>(수정 시 기존 기록에 추가됨)</span>}
                        </h2>
                        
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>날짜</label>
                            <input 
                                type="date" 
                                value={todayDate}
                                onChange={(e) => setTodayDate(e.target.value)}
                                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', width: '100%' }}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>대상 학생</label>
                            <select 
                                value={selectedStudent}
                                onChange={(e) => setSelectedStudent(e.target.value)}
                                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', width: '100%' }}
                            >
                                {tier2Students.map(s => (
                                    <option key={s.Code} value={s.Code}>
                                        {s.Code} - {s.Name} ({s.Class})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>표적 행동 1</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button 
                                    onClick={() => setTarget1('O')}
                                    style={{ 
                                        flex: 1, 
                                        padding: '15px', 
                                        backgroundColor: target1 === 'O' ? '#10b981' : '#f3f4f6',
                                        color: target1 === 'O' ? 'white' : '#333',
                                        border: 'none', 
                                        borderRadius: '8px', 
                                        fontSize: '1.2rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ⭕ 달성
                                </button>
                                <button 
                                    onClick={() => setTarget1('X')}
                                    style={{ 
                                        flex: 1, 
                                        padding: '15px', 
                                        backgroundColor: target1 === 'X' ? '#ef4444' : '#f3f4f6',
                                        color: target1 === 'X' ? 'white' : '#333',
                                        border: 'none', 
                                        borderRadius: '8px', 
                                        fontSize: '1.2rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ❌ 미달성
                                </button>
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>표적 행동 2</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button 
                                    onClick={() => setTarget2('O')}
                                    style={{ 
                                        flex: 1, 
                                        padding: '15px', 
                                        backgroundColor: target2 === 'O' ? '#10b981' : '#f3f4f6',
                                        color: target2 === 'O' ? 'white' : '#333',
                                        border: 'none', 
                                        borderRadius: '8px', 
                                        fontSize: '1.2rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ⭕ 달성
                                </button>
                                <button 
                                    onClick={() => setTarget2('X')}
                                    style={{ 
                                        flex: 1, 
                                        padding: '15px', 
                                        backgroundColor: target2 === 'X' ? '#ef4444' : '#f3f4f6',
                                        color: target2 === 'X' ? 'white' : '#333',
                                        border: 'none', 
                                        borderRadius: '8px', 
                                        fontSize: '1.2rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ❌ 미달성
                                </button>
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>메모 (선택)</label>
                            <textarea 
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                                placeholder="특이사항이 있으면 입력하세요..."
                                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', minHeight: '80px', resize: 'vertical' }}
                            />
                        </div>

                        <button 
                            onClick={handleSubmit}
                            disabled={saving}
                            style={{ 
                                width: '100%', 
                                padding: '15px', 
                                backgroundColor: saving ? '#9ca3af' : '#6366f1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '1.1rem',
                                fontWeight: 'bold',
                                cursor: saving ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {saving ? "저장 중..." : "💾 기록 저장"}
                        </button>
                    </div>

                    {/* Recent Records & Stats */}
                    <div>
                        {/* Student Stats */}
                        <div className={styles.card} style={{ marginBottom: '20px' }}>
                            <h2 style={{ marginBottom: '15px' }}>
                                {currentStudent?.Name || selectedStudent} 학생 현황
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6366f1' }}>{recentRecords.length}</div>
                                    <div style={{ color: '#666', fontSize: '0.9rem' }}>총 기록 수</div>
                                </div>
                                <div style={{ textAlign: 'center', padding: '15px', backgroundColor: achievementRate >= 80 ? '#d1fae5' : achievementRate >= 50 ? '#fef3c7' : '#fee2e2', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: achievementRate >= 80 ? '#059669' : achievementRate >= 50 ? '#b45309' : '#dc2626' }}>{achievementRate}%</div>
                                    <div style={{ color: '#666', fontSize: '0.9rem' }}>평균 달성률</div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Records */}
                        <div className={styles.card}>
                            <h2 style={{ marginBottom: '15px' }}>최근 기록</h2>
                            {recentRecords.length === 0 ? (
                                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>아직 기록이 없습니다.</p>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f9fafb' }}>
                                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>날짜</th>
                                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>행동1</th>
                                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>행동2</th>
                                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>달성률</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentRecords.map((r, idx) => (
                                            <tr key={idx}>
                                                <td style={{ padding: '10px', borderBottom: '1px solid #f3f4f6' }}>{r.Date}</td>
                                                <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #f3f4f6' }}>
                                                    <span style={{ color: r.TargetBehavior1 === 'O' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                                                        {r.TargetBehavior1 === 'O' ? '⭕' : '❌'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #f3f4f6' }}>
                                                    <span style={{ color: r.TargetBehavior2 === 'O' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                                                        {r.TargetBehavior2 === 'O' ? '⭕' : '❌'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #f3f4f6', fontWeight: 'bold' }}>
                                                    {r.AchievementRate}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
        </AuthCheck>
    );
}
