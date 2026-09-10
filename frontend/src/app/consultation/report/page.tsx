"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import AppShell from "../../components/AppShell";
import { useDateRange } from "../../components/GlobalNav";
import { maskName } from "../../utils";

export default function ConsultationReportPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState({ start: "", end: "" });
    const [reportData, setReportData] = useState<any>(null);
    const { startDate: globalStart, endDate: globalEnd } = useDateRange();
    // "3. 안건 및 논의 사항" 편집 — 백엔드는 이미 PATCH/POST meeting-notes API를 갖고 있으므로
    // 여기서는 편집 UI만 얹는다. 초안이 없으면 새로 만들고, 있으면 가장 최근 것을 고쳐 쓴다.
    const [editingAgenda, setEditingAgenda] = useState(false);
    const [agendaDraft, setAgendaDraft] = useState("");
    const [savingAgenda, setSavingAgenda] = useState(false);

    // 상단 전역 날짜 필터에서 보고 있던 기간을 그대로 이어받는다 — 예전 "월별 정기회의록"
    // 페이지처럼 매번 기간을 다시 고를 필요 없게 하기 위함. 전역 필터가 없으면 이번 달로.
    useEffect(() => {
        if (globalStart && globalEnd) {
            setDateRange({ start: globalStart, end: globalEnd });
            return;
        }
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        setDateRange({ start, end });
    }, [globalStart, globalEnd]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const dashboardRes = await axios.get(`${apiUrl}/api/v1/analytics/dashboard?start_date=${dateRange.start}&end_date=${dateRange.end}`);
            const notesRes = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=tier1`);

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
                <AppShell
                    currentPage="consultation-report"
                    title="📑 월별 정기회의록 / 공식 협의록 출력"
                    subtitle="학교장 결재 및 보관용 A4 표준 인쇄 양식 · 다른 페이지에서 보던 기간이 기본값으로 채워집니다"
                    hideDateFilter={true}
                >
                    <div className="card" style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '14px' }}>📅 출력 대상 기간 선택</div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
                            <input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }} />
                            <span>~</span>
                            <input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }} />
                        </div>
                        <button onClick={fetchReport} className="btn btn-primary" style={{ width: '100%' }}>
                            공식 보고서 생성 ➔
                        </button>
                    </div>
                </AppShell>
            </AuthCheck>
        );
    }

    if (loading) return <div>로딩 중...</div>;

    const { dashboard, notes } = reportData;
    const today = new Date().toLocaleDateString('ko-KR');
    const latestAgendaNote = notes && notes.length > 0 ? notes[0] : null;

    const startEditAgenda = () => {
        setAgendaDraft(latestAgendaNote?.content || "");
        setEditingAgenda(true);
    };

    const saveAgenda = async () => {
        setSavingAgenda(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            if (latestAgendaNote?.id) {
                await axios.patch(`${apiUrl}/api/v1/meeting-notes/${latestAgendaNote.id}`, { content: agendaDraft });
            } else {
                await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
                    meeting_type: "tier1",
                    date: new Date().toISOString().split('T')[0],
                    content: agendaDraft,
                    author: user?.name || user?.id || "",
                    period_start: dateRange.start,
                    period_end: dateRange.end,
                });
            }
            const notesRes = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=tier1`);
            setReportData((prev: any) => ({ ...prev, notes: notesRes.data.notes }));
            setEditingAgenda(false);
        } catch (e: any) {
            alert("저장 실패: " + (e.response?.data?.detail || e.message));
        } finally {
            setSavingAgenda(false);
        }
    };

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
                    <button onClick={() => router.push('/meeting')} style={{ marginLeft: '10px', padding: '10px 20px', fontSize: '16px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        🤝 AI 초안 생성하러 가기
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

                    <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>3. 안건 및 논의 사항</span>
                        {!editingAgenda && (
                            <button onClick={startEditAgenda} className="no-print" style={{ padding: '4px 12px', fontSize: '12px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                ✏️ 편집
                            </button>
                        )}
                    </div>
                    {editingAgenda ? (
                        <div className="no-print">
                            <textarea
                                value={agendaDraft}
                                onChange={e => setAgendaDraft(e.target.value)}
                                style={{ width: '100%', minHeight: '260px', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', lineHeight: 1.6, boxSizing: 'border-box' }}
                                placeholder="이번 기간 안건 및 논의 사항을 입력하세요. /meeting에서 만든 AI 초안을 붙여넣어도 됩니다."
                            />
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <button onClick={saveAgenda} disabled={savingAgenda} className="btn btn-primary" style={{ padding: '8px 16px' }}>
                                    {savingAgenda ? '저장 중...' : '💾 저장'}
                                </button>
                                <button onClick={() => setEditingAgenda(false)} className="btn btn-secondary" style={{ padding: '8px 16px' }}>취소</button>
                            </div>
                        </div>
                    ) : (
                        <div className="content-box" style={{ minHeight: '300px' }}>
                            {dashboard.ai_comment && (
                                <div>
                                    <strong>[AI 분석 요약]</strong>
                                    <br />
                                    {dashboard.ai_comment}
                                    <br /><br />
                                </div>
                            )}
                            <strong>[주요 논의 기록]</strong>
                            <br />
                            {latestAgendaNote ? latestAgendaNote.content : "(기록된 회의록 없음 — 위 \"편집\" 버튼으로 바로 작성하거나 \"AI 초안 생성하러 가기\"로 이동하세요.)"}
                        </div>
                    )}
                </div>

                <div className="page-break"></div>

                {/* Page 2: Tier 2 Analysis */}
                <div className="report-page">
                    <h1 className="report-title">Tier 2: 소그룹 지원 대상자 분석</h1>
                    <div className="section-title">1. CICO (Check-In/Check-Out) 수행 현황</div>
                    <div className="content-box" style={{ minHeight: '400px' }}>
                        {dashboard.risk_list.filter((s: any) => s.tier.includes('Tier 2')).map((s: any, idx: number) => (
                            <div key={idx} style={{ marginBottom: '15px' }}>
                                <strong>{idx + 1}. {maskName(s.name)} ({s.class})</strong>
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
                                    <td>{maskName(s.name)}</td>
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
