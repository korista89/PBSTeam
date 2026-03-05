
"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../page.module.css';
import GlobalNav from '../components/GlobalNav';
import { AuthCheck } from '../components/AuthProvider';
import { DOMAINS, VBS, STU_COUNT } from './constants';

export default function PictureWordPage() {
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedStudent, setSelectedStudent] = useState(1);
    const [loading, setLoading] = useState(false);
    const [overviewData, setOverviewData] = useState<any[]>([]);
    const [vocabData, setVocabData] = useState<any[]>([]);
    const [certData, setCertData] = useState<any[]>([]);
    const [lessons, setLessons] = useState<any[]>([]);
    const [minutes, setMinutes] = useState<any[]>([]);

    const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "") + "/api/v1/picture-words";

    useEffect(() => {
        if (activeTab === 'overview') fetchOverview();
        if (activeTab === 'checklist') fetchVocab(selectedStudent);
        if (activeTab === 'certification') fetchCert(selectedStudent);
        if (activeTab === 'lessons') fetchLessons();
        if (activeTab === 'minutes') fetchMinutes();
    }, [activeTab, selectedStudent]);

    const fetchOverview = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_BASE}/overview`);
            setOverviewData(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchVocab = async (stNum: number) => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_BASE}/student/${stNum}/vocab`);
            setVocabData(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchCert = async (stNum: number) => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_BASE}/student/${stNum}/certification`);
            setCertData(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchLessons = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_BASE}/lessons`);
            setLessons(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchMinutes = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_BASE}/minutes`);
            setMinutes(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateVocab = async (vocabId: number, field: string, value: any) => {
        try {
            const updates = { [field]: value };
            await axios.patch(`${API_BASE}/student/${selectedStudent}/vocab/${vocabId}`, updates);
            // Update local state for responsiveness
            setVocabData(prev => prev.map(v => v.번호 === vocabId ? { ...v, [field]: value } : v));
        } catch (e) {
            alert('업데이트 실패');
        }
    };

    const handleUpdateLesson = async (lessonNum: number, field: string, value: any) => {
        try {
            const updates = { [field]: value };
            await axios.patch(`${API_BASE}/lessons/${lessonNum}`, updates);
            setLessons(prev => prev.map(l => l.차시 === lessonNum ? { ...l, [field]: value } : l));
        } catch (e) {
            alert('업데이트 실패');
        }
    };

    const handleInit = async () => {
        if (!confirm('기존 시트를 초기화하고 재생성하시겠습니까? (약 1분 소요)')) return;
        try {
            setLoading(true);
            await axios.post(`${API_BASE}/init`);
            alert('초기화 완료');
            fetchOverview();
        } catch (e) {
            alert('초기화 실패');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthCheck>
            <div className={styles.container}>
                <GlobalNav currentPage="picture-word" />
                <main className={styles.main} style={{ marginTop: '20px' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h1 style={{ fontSize: '1.8rem', color: '#1e3a8a', margin: 0 }}>🎨 경은그림말 (의사소통 중심 어휘 교육)</h1>
                        <button
                            onClick={handleInit}
                            style={{ padding: '8px 16px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            🚀 시스템 초기화 (동기화)
                        </button>
                    </div>

                    {/* Sub Navigation */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e5e7eb', paddingBottom: '10px' }}>
                        {[
                            { id: 'overview', label: '📊 학급현황', icon: '📈' },
                            { id: 'checklist', label: '📝 학생 체크리스트', icon: '☑️' },
                            { id: 'certification', label: '🏅 인증제 현황표', icon: '🏆' },
                            { id: 'lessons', label: '📚 수업 가이드', icon: '📖' },
                            { id: 'minutes', label: '🔄 협의록', icon: '📋' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    padding: '12px 24px',
                                    border: 'none',
                                    background: activeTab === tab.id ? 'linear-gradient(135deg, #2563eb, #1e40af)' : '#f8fafc',
                                    color: activeTab === tab.id ? 'white' : '#64748b',
                                    borderRadius: '16px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: activeTab === tab.id ? '0 10px 20px -5px rgba(37, 99, 235, 0.4)' : '0 2px 4px rgba(0,0,0,0.05)',
                                    transform: activeTab === tab.id ? 'translateY(-2px)' : 'none'
                                }}
                                onMouseEnter={(e) => {
                                    if (activeTab !== tab.id) {
                                        e.currentTarget.style.backgroundColor = '#f1f5f9';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (activeTab !== tab.id) {
                                        e.currentTarget.style.backgroundColor = '#f8fafc';
                                        e.currentTarget.style.transform = 'none';
                                    }
                                }}
                            >
                                <span>{tab.icon}</span> {tab.label}
                            </button>
                        ))}
                    </div>

                    {loading && (
                        <div style={{ textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#3b82f6' }}>
                            ⏳ 데이터를 불러오는 중입니다...
                        </div>
                    )}

                    {/* Tab Content */}
                    {!loading && activeTab === 'overview' && (
                        <div className={styles.card}>
                            <h2>📊 영역별 어휘 습득 현황 (최소 1개 이상 VB 습득)</h2>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f3f4f6' }}>
                                            <th style={{ padding: '12px', border: '1px solid #ddd' }}>영역</th>
                                            {Array.from({ length: STU_COUNT }).map((_, i) => (
                                                <th key={i} style={{ padding: '12px', border: '1px solid #ddd' }}>학생{i + 1}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DOMAINS.map(domain => (
                                            <tr key={domain}>
                                                <td style={{ padding: '12px', border: '1px solid #ddd', fontWeight: 'bold' }}>{domain}</td>
                                                {overviewData.map((st, i) => {
                                                    const count = st.domain_progress[domain] || 0;
                                                    let bg = '#f9fafb';
                                                    if (count === 12) bg = '#dcfce7';
                                                    else if (count >= 6) bg = '#f0fdf4';
                                                    else if (count > 0) bg = '#fefce8';

                                                    return (
                                                        <td key={i} style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center', background: bg, fontWeight: 'bold', color: count === 12 ? '#166534' : '#374151' }}>
                                                            {count}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'checklist' && (
                        <div>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                                {Array.from({ length: STU_COUNT }).map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedStudent(i + 1)}
                                        style={{
                                            padding: '8px 20px',
                                            border: 'none',
                                            backgroundColor: selectedStudent === i + 1 ? '#2563eb' : '#eff6ff',
                                            color: selectedStudent === i + 1 ? 'white' : '#1e40af',
                                            borderRadius: '20px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            fontSize: '0.9rem',
                                            transition: 'all 0.2s',
                                            boxShadow: selectedStudent === i + 1 ? '0 4px 10px rgba(37, 99, 235, 0.2)' : 'none'
                                        }}
                                    >
                                        학생{i + 1}
                                    </button>
                                ))}
                            </div>
                            <div className={styles.card} style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#1e3a8a', color: 'white' }}>
                                            <th style={{ padding: '10px', border: '1px solid #334155' }}>번호</th>
                                            <th style={{ padding: '10px', border: '1px solid #334155' }}>범주</th>
                                            <th style={{ padding: '10px', border: '1px solid #334155' }}>어휘</th>
                                            {VBS.map(vb => <th key={vb} style={{ padding: '10px', border: '1px solid #334155', fontSize: '0.8rem' }}>{vb}</th>)}
                                            <th style={{ padding: '10px', border: '1px solid #334155' }}>합계</th>
                                            <th style={{ padding: '10px', border: '1px solid #334155' }}>협의내용</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vocabData.map(v => {
                                            const sum = VBS.reduce((acc, vb) => acc + (v[vb] ? 1 : 0), 0);
                                            return (
                                                <tr key={v.번호} style={{ backgroundColor: sum >= 6 ? '#f0fdf4' : (sum >= 1 ? '#fefce8' : 'white') }}>
                                                    <td style={{ padding: '8px', border: '1px solid #e5e7eb', textAlign: 'center', fontSize: '0.8rem' }}>{v.번호}</td>
                                                    <td style={{ padding: '8px', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>{v.범주}</td>
                                                    <td style={{ padding: '8px', border: '1px solid #e5e7eb', fontWeight: 'bold' }}>{v.어휘}</td>
                                                    {VBS.map(vb => (
                                                        <td key={vb} style={{ padding: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={v[vb]}
                                                                onChange={(e) => handleUpdateVocab(v.번호, vb, e.target.checked)}
                                                            />
                                                        </td>
                                                    ))}
                                                    <td style={{ padding: '8px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold' }}>{sum}</td>
                                                    <td style={{ padding: '0', border: '1px solid #e5e7eb' }}>
                                                        <input
                                                            type="text"
                                                            defaultValue={v.평가협의내용}
                                                            onBlur={(e) => handleUpdateVocab(v.번호, '평가협의내용', e.target.value)}
                                                            style={{ width: '100%', height: '100%', border: 'none', padding: '8px', background: 'transparent' }}
                                                            placeholder="입력..."
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'certification' && (
                        <div>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                                {Array.from({ length: STU_COUNT }).map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedStudent(i + 1)}
                                        style={{
                                            padding: '8px 20px',
                                            border: 'none',
                                            backgroundColor: selectedStudent === i + 1 ? '#2563eb' : '#eff6ff',
                                            color: selectedStudent === i + 1 ? 'white' : '#1e40af',
                                            borderRadius: '20px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            fontSize: '0.9rem',
                                            transition: 'all 0.2s',
                                            boxShadow: selectedStudent === i + 1 ? '0 4px 10px rgba(37, 99, 235, 0.2)' : 'none'
                                        }}
                                    >
                                        학생{i + 1}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                                {certData.map(d => (
                                    <div key={d.domain} className={styles.card} style={{
                                        border: d.is_achieved ? '2px solid #10b981' : '1px solid #e5e7eb',
                                        background: d.is_achieved ? '#f0fdf4' : 'white',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}>
                                        {d.is_achieved && (
                                            <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '3rem', opacity: 0.1 }}>🏅</div>
                                        )}
                                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>{d.domain}</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            <div style={{ flex: 1, height: '12px', background: '#e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${(d.met_words / 6) * 100}%`, height: '100%', background: d.is_achieved ? '#10b981' : '#f59e0b' }}></div>
                                            </div>
                                            <span style={{ fontWeight: 'bold' }}>{d.met_words} / 6</span>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '10px' }}>
                                            {d.is_achieved ? '🏅 인증 획득 완료!' : '⚪ 기준: 2가지 이상 VB 사용 어휘 6개'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'lessons' && (
                        <div className={styles.card} style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#475569', color: 'white' }}>
                                        <th style={{ padding: '12px', border: '1px solid #334155' }}>차시</th>
                                        <th style={{ padding: '12px', border: '1px solid #334155' }}>영역</th>
                                        <th style={{ padding: '12px', border: '1px solid #334155' }}>VB</th>
                                        <th style={{ padding: '12px', border: '1px solid #334155' }}>제재</th>
                                        <th style={{ padding: '12px', border: '1px solid #334155' }}>목표</th>
                                        <th style={{ padding: '12px', border: '1px solid #334155' }}>수업날짜</th>
                                        <th style={{ padding: '12px', border: '1px solid #334155' }}>협의내용</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lessons.map(l => (
                                        <tr key={l.차시}>
                                            <td style={{ padding: '10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{l.차시}</td>
                                            <td style={{ padding: '10px', border: '1px solid #e5e7eb', fontSize: '0.9rem' }}>{l.영역}</td>
                                            <td style={{ padding: '10px', border: '1px solid #e5e7eb', fontWeight: 'bold' }}>{l.언어행동}</td>
                                            <td style={{ padding: '10px', border: '1px solid #e5e7eb' }}>{l.제재}</td>
                                            <td style={{ padding: '10px', border: '1px solid #e5e7eb', fontSize: '0.85rem', color: '#374151' }}>{l.목표}</td>
                                            <td style={{ padding: '0', border: '1px solid #e5e7eb' }}>
                                                <input
                                                    type="date"
                                                    defaultValue={l.수업날짜}
                                                    onChange={(e) => handleUpdateLesson(l.차시, '수업날짜', e.target.value)}
                                                    style={{ width: '100%', border: 'none', padding: '8px' }}
                                                />
                                            </td>
                                            <td style={{ padding: '0', border: '1px solid #e5e7eb' }}>
                                                <textarea
                                                    defaultValue={l.준비협의내용}
                                                    onBlur={(e) => handleUpdateLesson(l.차시, '준비협의내용', e.target.value)}
                                                    style={{ width: '100%', border: 'none', padding: '8px', fontSize: '0.85rem' }}
                                                    rows={2}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && activeTab === 'minutes' && (
                        <div className={styles.card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h2 style={{ margin: 0, color: '#1e3a8a' }}>📋 협의록 전체 취합 (날짜순)</h2>
                                <button
                                    onClick={fetchMinutes}
                                    style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
                                >
                                    🔄 새로고침
                                </button>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '12px', overflow: 'hidden' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                                            <th style={{ padding: '15px', borderBottom: '2px solid #e2e8f0', textAlign: 'left', width: '120px' }}>날짜</th>
                                            <th style={{ padding: '15px', borderBottom: '2px solid #e2e8f0', textAlign: 'left', width: '200px' }}>학생 / 차시</th>
                                            <th style={{ padding: '15px', borderBottom: '2px solid #e2e8f0', textAlign: 'center', width: '100px' }}>구분</th>
                                            <th style={{ padding: '15px', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>협의내용</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {minutes.length > 0 ? minutes.map((m, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: m.type === '수업협의' ? '#f8fafc' : 'white' }}>
                                                <td style={{ padding: '15px', fontSize: '0.9rem', color: '#64748b' }}>{m.date}</td>
                                                <td style={{ padding: '15px', fontWeight: 'bold', color: '#1e293b' }}>{m.source}</td>
                                                <td style={{ padding: '15px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        backgroundColor: m.type === '수업협의' ? '#e0f2fe' : '#fef9c3',
                                                        color: m.type === '수업협의' ? '#0369a1' : '#a16207'
                                                    }}>
                                                        {m.type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '15px', color: '#334155', lineHeight: '1.5' }}>{m.content}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} style={{ padding: '50px', textAlign: 'center', color: '#94a3b8' }}>
                                                    기록된 협의 내용이 없습니다.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                </main>
            </div>
        </AuthCheck>
    );
}
