"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { AuthCheck } from "../../components/AuthProvider";
import GlobalNav from "../../components/GlobalNav";

export default function ConsultationReportPage() {
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState({ start: "", end: "" });
    const [reportData, setReportData] = useState<any>(null);

    useEffect(() => {
        // Default to current month
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        setDateRange({ start, end });
    }, []);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            // Check if backend supports this aggregation. 
            // For now, let's fetch meeting notes and aggregate them on frontend or use existing dashboard API
            // The user wants a specific "Meeting Minutes" report.
            // Let's reuse dashboard data but formatted specifically for Meeting Minutes.

            const dashboardRes = await axios.get(`${apiUrl}/api/v1/analytics/dashboard?start_date=${dateRange.start}&end_date=${dateRange.end}`);
            const notesRes = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=tier1`); // Fetch all or filter by date

            setReportData({
                dashboard: dashboardRes.data,
                notes: notesRes.data.notes
            });
        } catch (e) {
            console.error(e);
            alert("데이터를 불러오는데 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    if (!reportData && !loading) {
        return (
            <AuthCheck>
                <GlobalNav currentPage="consultation" />
                <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
                    <h1>📑 학교행동중재지원팀 협의록 생성</h1>
                    <div style={{ margin: '20px 0', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                        ~
                        <input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
                        <button onClick={fetchReport} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px' }}>
                            보고서 생성
                        </button>
                    </div>
                </div>
            </AuthCheck>
        );
    }

    if (loading) return <div>로딩 중...</div>;

    const { dashboard, notes } = reportData;
    const today = new Date().toLocaleDateString('ko-KR');

    return (
        <AuthCheck>
            <div className="print-container" style={{ backgroundColor: 'white', minHeight: '100vh', color: 'black' }}>
                <style jsx global>{`
                    @media print {
                        @page { size: A4; margin: 20mm; }
                        body { background: white; -webkit-print-color-adjust: exact; }
                        .no-print { display: none; }
                        .page-break { page-break-before: always; }
                    }
                    .report-page {
                        width: 210mm;
                        min-height: 297mm;
                        padding: 20mm;
                        margin: 0 auto;
                        background: white;
                        box-shadow: 0 0 10px rgba(0,0,0,0.1);
                        margin-bottom: 20px;
                        box-sizing: border-box;
                    }
                    .report-title {
                        text-align: center;
                        font-size: 24px;
                        font-weight: bold;
                        margin-bottom: 30px;
                        border-bottom: 2px solid #333;
                        padding-bottom: 15px;
                    }
                    .section-title {
                        font-size: 16px;
                        font-weight: bold;
                        border-left: 4px solid #3b82f6;
                        padding-left: 10px;
                        margin: 25px 0 10px 0;
                        background-color: #f8fafc;
                        padding: 8px;
                    }
                    .info-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 10px;
                        margin-bottom: 20px;
                        font-size: 14px;
                    }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px; }
                    th, td { border: 1px solid #000; padding: 6px; text-align: center; }
                    th { background-color: #f1f5f9; }
                    .content-box {
                        border: 1px solid #000;
                        padding: 10px;
                        min-height: 100px;
                        font-size: 13px;
                        white-space: pre-wrap;
                        line-height: 1.6;
                    }
                `}</style>

                <div className="no-print" style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f1f5f9' }}>
                    <button onClick={() => window.print()} style={{ padding: '10px 20px', fontSize: '16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        🖨️ 인쇄 / PDF 저장
                    </button>
                    <button onClick={() => setReportData(null)} style={{ marginLeft: '10px', padding: '10px 20px', fontSize: '16px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        뒤로 가기
                    </button>
                </div>

                {/* Page 1: Overview & Tier 1/2 */}
                <div className="report-page">
                    <h1 className="report-title">학교행동중재지원팀 정기 협의록</h1>

                    <div className="info-grid">
                        <div><strong>📅 일시:</strong> {today}</div>
                        <div><strong>📍 장소:</strong> 교무실 / 상담실</div>
                        <div><strong>👤 참석자:</strong> PBS 팀원 전원</div>
                        <div><strong>📊 대상기간:</strong> {dateRange.start} ~ {dateRange.end}</div>
                    </div>

                    <div className="section-title">1. 전체 현황 (Tier 1)</div>
                    <table>
                        <thead>
                            <tr>
                                <th>구분</th>
                                <th>총 행동 발생</th>
                                <th>평균 강도</th>
                                <th>위험군 학생수</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>통계</td>
                                <td>{dashboard.summary.total_incidents}건</td>
                                <td>{dashboard.summary.avg_intensity.toFixed(1)}점</td>
                                <td>{dashboard.summary.risk_student_count}명</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="section-title">2. 주요 지원 대상 현황 (Tier 2/3)</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Tier 2 (CICO/SST)</th>
                                <th>Tier 3 (개별약속)</th>
                                <th>Tier 3+ (외부연계)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>{dashboard.tier_stats?.tier2_cico?.count || 0}명 / {dashboard.tier_stats?.tier2_sst?.count || 0}명</td>
                                <td>{dashboard.tier_stats?.tier3?.count || 0}명</td>
                                <td>{dashboard.tier_stats?.tier3_plus?.count || 0}명</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="section-title">3. 안건 및 논의 사항</div>
                    <div className="content-box" style={{ minHeight: '300px' }}>
                        {/* Auto-fill from meeting notes or AI summary if available */}
                        {dashboard.ai_comment ? (
                            <div>
                                <strong>[AI 분석 요약]</strong>
                                <br />
                                {dashboard.ai_comment}
                                <br /><br />
                            </div>
                        ) : "회의 내용이 없습니다."}

                        <strong>[주요 논의 기록]</strong>
                        <br />
                        {notes && notes.length > 0 ? notes.map((n: any) => `[${n.date}] ${n.content}`).join('\n\n') : "(기록된 회의록 없음)"}
                    </div>
                </div>

                <div className="page-break"></div>

                {/* Page 2: Tier 2 Analysis */}
                <div className="report-page">
                    <h1 className="report-title">Tier 2: 소그룹 지원 대상자 분석</h1>
                    <div className="section-title">1. CICO (Check-In/Check-Out) 수행 현황</div>
                    <div className="content-box" style={{ minHeight: '400px' }}>
                        {dashboard.risk_list.filter((s: any) => s.tier.includes('Tier 2')).map((s: any, idx: number) => (
                            <div key={idx} style={{ marginBottom: '15px' }}>
                                <strong>{idx + 1}. {s.name} ({s.class})</strong>
                                <div>- 행동 발생: {s.count}건</div>
                                <div>- 주요 문제행동: (상세 분석 참조)</div>
                                <div style={{ color: '#666', fontSize: '12px' }}>* CICO 수행률 데이터는 별도 첨부</div>
                            </div>
                        ))}
                        {dashboard.risk_list.filter((s: any) => s.tier.includes('Tier 2')).length === 0 && "해당 없음"}
                    </div>

                    <div className="section-title">2. 사회성 기술 훈련 (SST) 대상</div>
                    <div className="content-box" style={{ minHeight: '200px' }}>
                        {/* Placeholder for SST students */}
                        (SST 대상자 명단 및 진행 상황 수기 기록)
                    </div>
                </div>

                <div className="page-break"></div>

                {/* Page 3: Tier 3 Analysis */}
                <div className="report-page">
                    <h1 className="report-title">Tier 3: 개별화 지원 계획 (FBA/BIP)</h1>

                    <div className="section-title">1. 집중 지원 대상자 모니터링</div>
                    <table style={{ fontSize: '11px' }}>
                        <thead>
                            <tr>
                                <th>학생명</th>
                                <th>표적 행동</th>
                                <th>기능(원인)</th>
                                <th>중재 전략 (요약)</th>
                                <th>변화 추이</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dashboard.risk_list.filter((s: any) => s.tier.includes('Tier 3')).map((s: any, idx: number) => (
                                <tr key={idx} style={{ height: '80px' }}>
                                    <td>{s.name}</td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                    <td>{s.count}건 발생</td>
                                </tr>
                            ))}
                            {/* Empty rows for filling */}
                            {[1, 2, 3].map(i => (
                                <tr key={`empty-${i}`} style={{ height: '80px' }}>
                                    <td></td><td></td><td></td><td></td><td></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="section-title">2. 위기 개입 및 외부 연계 (Tier 3+)</div>
                    <div className="content-box" style={{ minHeight: '300px' }}>
                        (외부 전문가 자문, 병원 연계, 학부모 상담 등 진행 사항 기록)
                    </div>
                </div>

                <div className="page-break"></div>

                {/* Page 4: Next Steps */}
                <div className="report-page">
                    <h1 className="report-title">향후 계획 및 제언</h1>

                    <div className="section-title">1. 다음 달 중점 지도 사항</div>
                    <div className="content-box" style={{ minHeight: '200px' }}>
                        -
                        <br /><br />
                        -
                    </div>

                    <div className="section-title">2. 교사 지원 및 연수 계획</div>
                    <div className="content-box" style={{ minHeight: '200px' }}>
                        -
                    </div>

                    <div className="section-title">3. 차기 회의 일정</div>
                    <div style={{ padding: '15px', border: '1px solid #000', textAlign: 'center' }}>
                        2024년 ___월 ___일 (___) ___시 ___분 / 장소: ________
                    </div>

                    <div style={{ marginTop: '50px', textAlign: 'right', fontSize: '14px' }}>
                        <strong>작성자: ________________ (인)</strong>
                        <br /><br />
                        <strong>확인자: ________________ (인)</strong>
                    </div>
                </div>
            </div>
        </AuthCheck>
    );
}
