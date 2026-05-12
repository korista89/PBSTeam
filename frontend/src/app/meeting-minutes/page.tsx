"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
    PieChart, Pie, Cell, Legend, ResponsiveContainer
} from "recharts";
import { DashboardData, ChartData } from "../types";
import { AuthCheck } from "../components/AuthProvider";
import GlobalNav, { useDateRange } from "../components/GlobalNav";
import { maskName } from "../utils";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function MeetingMinutesPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [notes, setNotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const { startDate, endDate } = useDateRange();
    const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    useEffect(() => {
        if (!startDate || !endDate) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

                // 1. Fetch Analytics
                let analyticsUrl = `${apiUrl}/api/v1/analytics/dashboard`;
                const params = new URLSearchParams();
                params.append("start_date", startDate);
                params.append("end_date", endDate);

                const [analyticsRes, notesRes] = await Promise.all([
                    axios.get(`${analyticsUrl}?${params.toString()}`),
                    axios.get(`${apiUrl}/api/v1/meeting-notes`) // Fetch all notes, filter client-side for simplicity or update API to filter range
                ]);

                setData(analyticsRes.data);

                // Filter notes by date range if needed, for now just show all recent or relevant types
                // Ideally API matches period.
                setNotes(notesRes.data.notes || []);

            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [startDate, endDate]);

    if (loading) return (
        <div style={{ padding: '50px', textAlign: 'center' }}>데이터 준비 중... 🖨️</div>
    );

    if (!data) return <div>데이터 없음</div>;

    // Filter notes for the report sections
    const t1Notes = notes.filter(n => n.meeting_type === 'tier1').slice(0, 3);
    const t2Notes = notes.filter(n => n.meeting_type === 'tier2').slice(0, 3);
    const t3Notes = notes.filter(n => n.meeting_type === 'tier3').slice(0, 3);

    return (
        <AuthCheck>
            <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh', paddingBottom: '50px' }}>
                <div className="no-print">
                    <GlobalNav currentPage="meeting" />
                    <div style={{ maxWidth: '210mm', margin: '20px auto', textAlign: 'right' }}>
                        <button
                            onClick={() => window.print()}
                            style={{
                                padding: '10px 20px', backgroundColor: '#2563eb', color: 'white',
                                border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                            }}
                        >
                            🖨️ 인쇄하기 (A4)
                        </button>
                    </div>
                </div>

                <div className="print-container" style={{
                    width: '210mm', minHeight: '297mm', margin: '0 auto',
                    padding: '20mm', backgroundColor: 'white', boxShadow: '0 0 10px rgba(0,0,0,0.1)'
                }}>
                    <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 0; }
                    body { background: white; -webkit-print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .print-container { box-shadow: none !important; margin: 0 !important; width: 100% !important; padding: 15mm !important; }
                    .page-break { page-break-before: always; }
                }
                h1 { font-size: 22px; margin-bottom: 5px; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; }
                h2 { font-size: 16px; margin-top: 20px; margin-bottom: 10px; color: #333; background: #f1f5f9; padding: 5px 10px; border-left: 5px solid #3b82f6; }
                p, li, td { font-size: 11pt; line-height: 1.5; }
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10pt; }
                th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: center; }
                th { background-color: #f8fafc; font-weight: bold; }
                .note-box { border: 1px dashed #94a3b8; padding: 10px; border-radius: 4px; background: #fff; margin-bottom: 10px; font-size: 10pt; }
            `}</style>

                    <header style={{ textAlign: 'center', marginBottom: '30px' }}>
                        <h1 style={{ border: 'none', marginBottom: '5px' }}>학교행동중재지원팀(경은PBST) 정기 협의록</h1>
                        <p>일시: {date} | 장소: 다목적 협의실 | 참석: 경은PBST 팀원 전원</p>
                        <div style={{ borderTop: '2px solid #1e3a8a', width: '100%', marginTop: '10px' }}></div>
                    </header>

                    <section>
                        <h2>1. 현황 요약 (Overview)</h2>
                        <div className="grid-2">
                            <div>
                                <table style={{ width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th>총 행동 발생</th>
                                            <th>평균 강도</th>
                                            <th>위기 학생</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>{data.summary.total_incidents} 건</td>
                                            <td>{data.summary.avg_intensity.toFixed(2)}</td>
                                            <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{data.summary.risk_student_count} 명</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <div style={{ height: '150px' }}>
                                    {/* Mini Big 5 Locations */}
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.big5.locations.slice(0, 5)} layout="vertical" margin={{ left: 0, right: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={70} style={{ fontSize: '10px' }} />
                                            <Bar dataKey="value" fill="#3b82f6" barSize={15}>
                                                <LabelList dataKey="value" position="right" fontSize={10} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '4px', fontSize: '10pt' }}>
                                <strong>🤖 AI 분석 요약:</strong><br />
                                {data.ai_comment ? data.ai_comment.substring(0, 300) + "..." : "데이터가 충분하지 않습니다."}
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2>2. Tier 1: 보편적 지원 협의</h2>
                        <div className="note-box">
                            <strong>[주요 안건 및 결정사항]</strong>
                            {t1Notes.length > 0 ? (
                                <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                    {t1Notes.map(n => (
                                        <li key={n.id}>{n.content} <span style={{ fontSize: '9pt', color: '#666' }}>({n.date})</span></li>
                                    ))}
                                </ul>
                            ) : (
                                <p style={{ color: '#999' }}>기록된 회의 내용이 없습니다.</p>
                            )}
                        </div>
                    </section>

                    <section>
                        <h2>3. Tier 2 & 3: 개별 지원 대상자 협의</h2>
                        {/* Risk List Table */}
                        <div style={{ overflowX: 'auto', width: '100%' }}>
                        <table style={{ fontSize: '9pt' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>Tier</th>
                                    <th>학생명</th>
                                    <th>발생(월)</th>
                                    <th>주요행동/강도</th>
                                    <th>비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.risk_list.slice(0, 5).map((s, i) => (
                                    <tr key={i}>
                                        <td>{s.tier}</td>
                                        <td>{maskName(s.name)}</td>
                                        <td>{s.count}</td>
                                        <td>최대강도 {s.max_intensity}</td>
                                        <td></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>

                        <div className="grid-2">
                            <div className="note-box">
                                <strong>[Tier 2 (CICO) 협의]</strong>
                                {t2Notes.length > 0 ? (
                                    <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                        {t2Notes.map(n => (
                                            <li key={n.id}>{n.content}</li>
                                        ))}
                                    </ul>
                                ) : <p style={{ color: '#999' }}>기록 없음</p>}
                            </div>
                            <div className="note-box">
                                <strong>[Tier 3 (개별중재) 협의]</strong>
                                {t3Notes.length > 0 ? (
                                    <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                        {t3Notes.map(n => (
                                            <li key={n.id}>{n.content}</li>
                                        ))}
                                    </ul>
                                ) : <p style={{ color: '#999' }}>기록 없음</p>}
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2>4. 향후 계획 (Next Steps)</h2>
                        <div style={{ height: '100px', border: '1px solid #cbd5e1', padding: '10px' }}>
                            {/* Empty space for handwriting or additional notes */}
                        </div>
                        <div style={{ marginTop: '20px', textAlign: 'right', fontSize: '11pt' }}>
                            <p>위와 같이 협의하였음.</p>
                            <p style={{ marginTop: '30px' }}>작성자: __________________ (인)</p>
                            <p style={{ marginTop: '10px' }}>확인자: __________________ (인)</p>
                        </div>
                    </section>
                </div>
            </div>
        {/* 협의록 작성 가이드 */}
        <div style={{ marginTop:32, padding:"22px 26px", background:"linear-gradient(135deg,#faf5ff,#ede9fe)", borderRadius:20, border:"1px solid #c4b5fd" }}>
          <h3 style={{ margin:"0 0 14px 0", fontSize:"1rem", fontWeight:800, color:"#4c1d95" }}>📖 학교행동중재지원팀 월별 정기회의 협의록 작성 가이드</h3>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:"0.75rem", color:"#0f172a", lineHeight:1.7 }}>
            {[
              {t:"1. 회의 기본정보 입력", b:"일시·장소·참석자를 정확히 기록합니다. 참석자는 이름과 역할(담임, 특수교사, 상담사 등)을 함께 적습니다."},
              {t:"2. Tier 현황 보고", b:"CICO 리포트·T3 리포트를 참고하여 이달 Tier별 학생 수 변화와 주요 의사결정 제안 내용을 요약 보고합니다."},
              {t:"3. 개별 학생 검토", b:"Tier1 하향 후보·Tier3 상향 후보·CICO 수정 필요 학생을 순서대로 논의하고, 결정 사항과 담당자를 명시합니다."},
              {t:"4. 협의 결과 기록", b:"각 학생별로 '현재 상태 → 협의 내용 → 결정 사항 → 다음 검토 일정' 순서로 간결하게 작성합니다."},
              {t:"5. 차기 회의 준비", b:"다음 달 중점 모니터링 학생, 추가 데이터 수집 계획, 교사 연수 필요 사항 등을 기록합니다."},
              {t:"6. 보관 및 공유", b:"작성 완료 후 팀원 전체에게 공유하고, 학교 행정 파일에 보관합니다. 학생 정보가 포함되므로 외부 공유 금지."},
            ].map((item,i) => (
              <div key={i} style={{ background:"#fff", borderRadius:10, padding:"10px 12px", border:"1px solid #ddd6fe" }}>
                <div style={{ fontWeight:800, color:"#6d28d9", marginBottom:3 }}>{item.t}</div>
                <div style={{ color:"#334155" }}>{item.b}</div>
              </div>
            ))}
          </div>
        </div>
        </AuthCheck>
    );
}
