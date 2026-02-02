"use client";

import React, { useEffect, useState } from 'react';
import styles from './page.module.css';
import axios from 'axios';
import { MeetingAnalysisResponse, StudentMeetingData } from '../types';

export default function MeetingPage() {
    const [data, setData] = useState<MeetingAnalysisResponse | null>(null);
    const [selectedStudent, setSelectedStudent] = useState<StudentMeetingData | null>(null);
    const [opinion, setOpinion] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMeetingData = async () => {
            try {
                // Use environment variable for API URL
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                const response = await axios.get(`${apiUrl}/api/v1/analytics/meeting`);
                setData(response.data);
                
                // Select first student if available and special cases exist, otherwise first one
                if (response.data.students && response.data.students.length > 0) {
                    setSelectedStudent(response.data.students[0]);
                }
            } catch (error) {
                console.error("Failed to fetch meeting data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchMeetingData();
    }, []);

    const handleCopyMinutes = () => {
        if (!selectedStudent) return;
        const text = `
[행동중재지원팀 협의록]
일시: ${new Date().toLocaleDateString()}
대상학생: ${selectedStudent.name} (${selectedStudent.class})

1. 현황 분석 (최근 4주)
- 총 발생 건수: ${selectedStudent.total_incidents}건
- 주간 평균: ${selectedStudent.weekly_avg}건
- 위기/긴급 여부: ${selectedStudent.is_emergency ? "해당 (사유: " + selectedStudent.emergency_reason + ")" : "미해당"}

2. 시스템 권고안
- ${selectedStudent.decision_recommendation}

3. 담임/팀 의견
- ${opinion}

4. 결정 사항
- ( ) Tier 유지
- ( ) Tier 상향 (⮕ ${selectedStudent.decision_recommendation.includes('Tier 3') ? 'Tier 3' : 'Tier 2'})
- ( ) 외부 전문가 의뢰
        `.trim();
        
        navigator.clipboard.writeText(text);
        alert("협의록 초안이 복사되었습니다!");
    };

    if (loading) return <div className={styles.loading}>데이터 분석 중...</div>;
    if (!data) return <div className={styles.loading}>데이터를 불러올 수 없습니다.</div>;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.title}>
                    <h1>📅 학교행동중재지원팀 정기 협의회</h1>
                    <p>분석 기간: {data.period} (최근 4주)</p>
                </div>
                <div>
                    <span className={styles.badge} style={{background:'#d32f2f', marginRight: 10, fontSize: '0.9rem', padding: '5px 10px'}}>
                        🚨 긴급 안건: {data.summary.emergency_count}명
                    </span>
                    <span className={styles.badge} style={{background:'#ef6c00', fontSize: '0.9rem', padding: '5px 10px'}}>
                        ⚠️ Tier 2 진입 대상: {data.summary.tier2_candidate_count}명
                    </span>
                </div>
            </header>

            <div className={styles.mainLayout}>
                {/* Sidebar List */}
                <aside className={styles.sidebar}>
                    <div className={styles.sidebarTitle}>대상 학생 목록 ({data.students.length}명)</div>
                    <ul className={styles.studentList}>
                        {data.students.map((student, idx) => (
                            <li 
                                key={idx} 
                                className={`${styles.studentItem} ${selectedStudent?.name === student.name ? styles.activeStudent : ''}`}
                                onClick={() => {
                                    setSelectedStudent(student);
                                    setOpinion(""); // Reset opinion
                                }}
                            >
                                <span className={styles.studentName}>
                                    {student.name}
                                    {student.is_emergency && <span className={`${styles.badge} ${styles.badgeRed}`} style={{marginLeft: 5}}>긴급</span>}
                                    {!student.is_emergency && student.is_tier2_candidate && <span className={`${styles.badge} ${styles.badgeOrange}`} style={{marginLeft: 5}}>Tier 2 대상</span>}
                                </span>
                                <div className={styles.studentMeta}>
                                    <span>{student.class}</span> | 
                                    <span>총 {student.total_incidents}건</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </aside>

                {/* Main Content Area */}
                <main className={styles.contentArea}>
                    {selectedStudent ? (
                        <>
                            <div className={styles.recommendationBox}>
                                <div className={styles.recommendationTitle}>🧠 시스템 분석 결과</div>
                                <div style={{display:'flex', alignItems:'center', gap: 10}}>
                                    <span style={{fontSize: '1.2rem', fontWeight: 'bold'}}>
                                        {selectedStudent.decision_recommendation}
                                    </span>
                                    {selectedStudent.is_emergency && <span style={{color: '#d32f2f'}}>사유: {selectedStudent.emergency_reason}</span>}
                                </div>
                                <p style={{marginTop: 5, color: '#555', fontSize: '0.9rem'}}>
                                    * 최근 4주간 주당 평균 {selectedStudent.weekly_avg}회 발생하였습니다.
                                    {selectedStudent.is_tier2_candidate && (
                                        <>
                                            <br/>
                                            * 2주 연속 주 2회 이상 발생 패턴이 감지되었습니다.
                                        </>
                                    )}
                                </p>
                            </div>

                            <div className={styles.card}>
                                <h3>📝 담임교사 / 팀 의견 작성</h3>
                                <p style={{fontSize:'0.85rem', color:'#666', marginBottom: 5}}>
                                    학생의 최근 상태, 가정 환경 변화, 선행 사건 등 정성적인 관찰 내용을 입력해주세요.
                                </p>
                                <textarea 
                                    className={styles.textarea} 
                                    placeholder="예: 최근 자리 배치를 바꾸면서 교우 관계 갈등이 잦아짐. 가정 내 불화가 있다는 상담 내용 있음."
                                    value={opinion}
                                    onChange={(e) => setOpinion(e.target.value)}
                                />
                                
                                <div className={styles.actionButtons}>
                                    <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleCopyMinutes}>
                                        📋 협의록 초안 복사
                                    </button>
                                    <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => window.open(`/student/${selectedStudent.name}`, '_blank')}>
                                        상세 그래프 보기 ↗
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100%', color:'#aaa'}}>
                            좌측 목록에서 학생을 선택해주세요.
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
