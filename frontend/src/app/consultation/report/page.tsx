"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import AppShell from "../../components/AppShell";
import { useDateRange } from "../../components/GlobalNav";
import { maskName } from "../../utils";

// 조회수정 시점이 다른 지점(페이지 1/2/3 각각 안건 편집)에서 중복 코드 없이
// "메모 있으면 수정, 없으면 새로 작성" 패턴을 공유하기 위한 섹션 컴포넌트.
// 기존 PATCH/POST /meeting-notes API를 meeting_type만 바꿔 그대로 재사용한다.
function AgendaSection({ sectionTitle, meetingType, notes, dateRange, user, onSaved, aiComment, placeholder }: {
    sectionTitle: string; meetingType: string; notes: any[]; dateRange: { start: string; end: string };
    user: any; onSaved: () => void; aiComment?: string; placeholder?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const latest = notes && notes.length > 0 ? notes[0] : null;

    const startEdit = () => { setDraft(latest?.content || ""); setEditing(true); };

    const save = async () => {
        setSaving(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            if (latest?.id) {
                await axios.patch(`${apiUrl}/api/v1/meeting-notes/${latest.id}`, { content: draft });
            } else {
                await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
                    meeting_type: meetingType,
                    date: new Date().toISOString().split('T')[0],
                    content: draft,
                    author: user?.name || user?.id || "",
                    period_start: dateRange.start,
                    period_end: dateRange.end,
                });
            }
            setEditing(false);
            onSaved();
        } catch (e: any) {
            alert("저장 실패: " + (e.response?.data?.detail || e.message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{sectionTitle}</span>
                {!editing && (
                    <button onClick={startEdit} className="no-print" style={{ padding: '4px 12px', fontSize: '12px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        ✏️ 편집
                    </button>
                )}
            </div>
            {editing ? (
                <div className="no-print">
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        style={{ width: '100%', minHeight: '200px', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', lineHeight: 1.6, boxSizing: 'border-box' }}
                        placeholder={placeholder || "안건 및 논의 사항을 입력하세요."}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '8px 16px' }}>
                            {saving ? '저장 중...' : '💾 저장'}
                        </button>
                        <button onClick={() => setEditing(false)} className="btn btn-secondary" style={{ padding: '8px 16px' }}>취소</button>
                    </div>
                </div>
            ) : (
                <div className="content-box" style={{ minHeight: '200px' }}>
                    {aiComment && (
                        <div>
                            <strong>[AI 분석 요약]</strong>
                            <br />
                            {aiComment}
                            <br /><br />
                        </div>
                    )}
                    <strong>[주요 논의 기록]</strong>
                    <br />
                    {latest ? latest.content : "(기록된 회의록 없음 — 위 \"편집\" 버튼으로 작성하세요.)"}
                </div>
            )}
        </>
    );
}

export default function ConsultationReportPage() {
    const router = useRouter();
    const { user, isAdmin } = useAuth();
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState({ start: "", end: "" });
    const [reportData, setReportData] = useState<any>(null);
    const { startDate: globalStart, endDate: globalEnd } = useDateRange();

    // 관리자는 학교 차원 하나의 공유 문서, 담임은 자기 학급 전용 문서로 안건이 섞이지
    // 않게 meeting_type을 분리한다(스키마 변경 없이 문자열 값만 다르게 — meeting/page.tsx와 동일 규칙).
    const scopeSuffix = isAdmin() ? "" : `_class_${user?.class_id || user?.id || "unknown"}`;
    const meetingTypeFor = (tier: 'tier1' | 'tier2' | 'tier3') => `${tier}${scopeSuffix}`;

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

    const fetchNotes = async (tier: 'tier1' | 'tier2' | 'tier3') => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=${meetingTypeFor(tier)}`);
        return res.data.notes;
    };

    const refetchNotes = async (tier: 'tier1' | 'tier2' | 'tier3') => {
        const notes = await fetchNotes(tier);
        setReportData((prev: any) => ({ ...prev, notesByType: { ...prev.notesByType, [tier]: notes } }));
    };

    const fetchReport = async () => {
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const [dashboardRes, tier1Notes, tier2Notes, tier3Notes] = await Promise.all([
                axios.get(`${apiUrl}/api/v1/analytics/dashboard?start_date=${dateRange.start}&end_date=${dateRange.end}`),
                fetchNotes('tier1'), fetchNotes('tier2'), fetchNotes('tier3'),
            ]);

            setReportData({
                dashboard: dashboardRes.data,
                notesByType: { tier1: tier1Notes, tier2: tier2Notes, tier3: tier3Notes }
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
                    title={isAdmin() ? "📑 학교행동중재지원팀 정기 협의록" : "📑 학급행동중재지원팀 정기 협의록"}
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

    const { dashboard, notesByType } = reportData;
    const today = new Date().toLocaleDateString('ko-KR');
    const reportTitle = isAdmin() ? "학교행동중재지원팀 정기 협의록" : `학급행동중재지원팀 정기 협의록 (${user?.class_id || user?.id || ""})`;

    const exportWord = () => {
        const container = document.querySelector('.print-container');
        if (!container) return;
        const clone = container.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.no-print').forEach(el => el.remove());
        const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${reportTitle}</title></head>
<body>${clone.innerHTML}</body></html>`;
        const blob = new Blob(['﻿', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportTitle}_${dateRange.start}_${dateRange.end}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
                    <button onClick={exportWord} style={{ marginLeft: '10px', padding: '10px 20px', fontSize: '16px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        📄 워드로 내보내기
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
                    <h1 className="report-title">{reportTitle}</h1>

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

                    <AgendaSection
                        sectionTitle="3. 안건 및 논의 사항"
                        meetingType={meetingTypeFor('tier1')}
                        notes={notesByType.tier1}
                        dateRange={dateRange}
                        user={user}
                        onSaved={() => refetchNotes('tier1')}
                        aiComment={dashboard.ai_comment}
                        placeholder="이번 기간 안건 및 논의 사항을 입력하세요. /meeting에서 만든 AI 초안을 붙여넣어도 됩니다."
                    />
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

                    <AgendaSection
                        sectionTitle="3. 안건 및 논의 사항"
                        meetingType={meetingTypeFor('tier2')}
                        notes={notesByType.tier2}
                        dateRange={dateRange}
                        user={user}
                        onSaved={() => refetchNotes('tier2')}
                        placeholder="Tier 2(CICO/SST) 관련 안건 및 논의 사항을 입력하세요."
                    />
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

                    <AgendaSection
                        sectionTitle="3. 안건 및 논의 사항"
                        meetingType={meetingTypeFor('tier3')}
                        notes={notesByType.tier3}
                        dateRange={dateRange}
                        user={user}
                        onSaved={() => refetchNotes('tier3')}
                        placeholder="Tier 3(FBA/BIP) 관련 안건 및 논의 사항을 입력하세요."
                    />
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
