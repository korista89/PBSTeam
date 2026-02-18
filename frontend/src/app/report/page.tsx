"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
  LineChart, Line, Tooltip, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { DashboardData } from "../types";
import { AuthCheck } from "../components/AuthProvider";
import GlobalNav, { useDateRange } from "../components/GlobalNav";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const apiUrl = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL || "") : "";

// ====== AI Analysis Card Component ======
function AIAnalysisCard({ sectionName, dataContext, startDate, endDate }: { sectionName: string; dataContext: any; startDate?: string; endDate?: string }) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const requestAnalysis = async () => {
    setLoading(true);
    setVisible(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-section-analysis`, {
        section_name: sectionName,
        data_context: dataContext || {},
        start_date: startDate || null,
        end_date: endDate || null
      });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch (e) {
      console.error(e);
      setAnalysis("⚠️ AI 분석 요청 실패. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="no-print" style={{ marginTop: '15px' }}>
      {!visible ? (
        <button
          onClick={requestAnalysis}
          style={{
            padding: '8px 16px', backgroundColor: '#7c3aed', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: '600',
            boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
            transition: 'all 0.2s'
          }}
        >
          🤖 BCBA AI 분석 요청
        </button>
      ) : (
        <div style={{
          backgroundColor: '#f5f3ff', padding: '16px', borderRadius: '10px',
          border: '1px solid #ddd5f5', marginTop: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ margin: 0, color: '#6d28d9', fontSize: '0.9rem' }}>🤖 BCBA AI 분석 — {sectionName}</h4>
            <button onClick={() => setVisible(false)} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#9ca3af'
            }}>✕ 닫기</button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#7c3aed' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
              AI가 데이터를 분석하고 있습니다...
            </div>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.6', color: '#334155' }}>
              {analysis}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ====== Main Report Component ======
export default function MonthlyReport() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { startDate, endDate } = useDateRange();
  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  useEffect(() => {
    if (!startDate || !endDate) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        let url = `${apiUrl}/api/v1/analytics/dashboard`;
        const params = new URLSearchParams();
        params.append("start_date", startDate);
        params.append("end_date", endDate);
        url += `?${params.toString()}`;
        const response = await axios.get(url);
        setData(response.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [startDate, endDate]);

  //   const handleTierChange = async (studentCode: string, newTier: string) => {
  //     if (!confirm(`${studentCode} 학생의 Tier를 ${newTier}(으)로 변경하시겠습니까?`)) return;
  //     try {
  //       await axios.post(`${apiUrl}/api/v1/students/tier-update`, {
  //         student_code: studentCode,
  //         tier: newTier
  //       });
  //       alert("변경되었습니다.");
  //     } catch (e) {
  //       console.error(e);
  //       alert("변경 실패");
  //     }
  //   };

  if (!data) {
    return (
      <AuthCheck>
        <GlobalNav currentPage="report" />
        <div style={{ padding: '50px', textAlign: 'center' }}>
          <p>📊 데이터를 불러오는 중...</p>
        </div>
      </AuthCheck>
    );
  }

  return (
    <AuthCheck>
      <GlobalNav currentPage="report" />
      <div className="report-container" style={{ padding: '20px', maxWidth: '210mm', margin: '0 auto', backgroundColor: 'white' }}>
        <style jsx global>{`
        @media print {
            body { background: white; -webkit-print-color-adjust: exact; }
            .no-print { display: none; }
            .page-break { page-break-before: always; }
        }
        @media (max-width: 768px) {
            .report-container { padding: 10px !important; }
            .summary-stats { grid-template-columns: repeat(2, 1fr) !important; }
            .grid-2 { grid-template-columns: 1fr !important; }
            .chart-box { height: 350px !important; }
        }
        .report-section { margin-bottom: 3rem; border-bottom: 1px solid #eee; padding-bottom: 2rem; }
        h1 { font-size: 26px; font-weight: 800; margin-bottom: 10px; color: #1e3a8a; letter-spacing: -0.5px; }
        h2 { font-size: 20px; font-weight: 700; color: #1e293b; border-left: 6px solid #3b82f6; padding-left: 12px; margin: 40px 0 24px 0; display: flex; align-items: center; }
        
        .summary-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 30px; }
        .stat-box { padding: 20px; border-radius: 16px; background: white; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .stat-value { font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.2; }
        .stat-label { font-size: 13px; font-weight: 600; color: #64748b; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        
        /* Grid Layout for Charts */
        .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 24px; }
        .chart-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; height: 420px; display: flex; flex-direction: column; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
        .chart-title { font-size: 16px; font-weight: 700; margin-bottom: 20px; color: #334155; display: flex; align-items: center; gap: 8px; }
        
        table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background-color: #f8fafc; color: #475569; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
        td { color: #334155; }
        tr:last-child td { border-bottom: none; }
        `}</style>

        {/* Controller */}
        <div className="no-print" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>분석 기간: {startDate} ~ {endDate}</span>
          <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>🖨️ PDF 저장</button>
        </div>

        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1>🏫 Tier 1: 학교 행동 지원 종합 리포트 (월간)</h1>
          <p style={{ color: '#666' }}>발행일: {date} | 작성주체: PBS 리더십팀</p>
        </header>

        {/* ===== Section 1: 총괄 현황 ===== */}
        <section className="report-section">
          <h2>1. 총괄 현황 (Overview)</h2>
          <div className="summary-stats">
            <div className="stat-box">
              <div className="stat-value">{data.summary.total_incidents}건</div>
              <div className="stat-label">총 행동 발생 (ODR)</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{data.summary.avg_intensity.toFixed(2)}</div>
              <div className="stat-label">평균 행동 강도 (1-5)</div>
            </div>
            <div className="stat-box">
              <div className="stat-value" style={{ color: '#ef4444' }}>{data.summary.risk_student_count}명</div>
              <div className="stat-label">집중 지원 대상 (Tier 2/3)</div>
            </div>
          </div>
          <AIAnalysisCard
            sectionName="총괄 현황"
            dataContext={{ total_incidents: data.summary.total_incidents, avg_intensity: data.summary.avg_intensity, risk_count: data.summary.risk_student_count }}
            startDate={startDate} endDate={endDate}
          />
        </section>

        {/* ===== Section 2: 추이 ===== */}
        <section className="report-section">
          <h2>2. 행동 발생 추이 (Trends)</h2>
          <div className="grid-2">
            <div className="chart-box">
              <div className="chart-title">📅 일별 발생 추이</div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trends}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" style={{ fontSize: '11px' }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis style={{ fontSize: '11px' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} name="발생 건수" dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-box">
              <div className="chart-title">📊 주별 발생 추이</div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weekly_trends || []} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="week" style={{ fontSize: '11px' }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis style={{ fontSize: '11px' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="count" fill="#8b5cf6" name="발생 건수" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="count" position="top" fontSize={12} fill="#6b7280" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <AIAnalysisCard
            sectionName="행동 발생 추이"
            dataContext={{ daily_trends: (data.trends || []).slice(-7), weekly_trends: data.weekly_trends }}
            startDate={startDate} endDate={endDate}
          />
        </section>

        {/* ===== Section 3: Big 5 + 상세 패턴 합병 ===== */}
        <section className="report-section">
          <h2>3. 학교 전체 패턴 분석 (Big 5 & ABC)</h2>

          {/* Row 1: Location & Behavior Type */}
          {/* Row 1: Location & Behavior Type */}
          <div className="grid-2">
            <div className="chart-box">
              <div className="chart-title">📍 주요 발생 장소</div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.big5.locations} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={100} style={{ fontSize: '12px' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="#3b82f6" barSize={24} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" fontSize={12} fill="#3b82f6" fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-box">
              <div className="chart-title">🤔 주요 행동 유형</div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.big5.behaviors} cx="50%" cy="50%" outerRadius={100} innerRadius={60} paddingAngle={2} dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}>
                    {data.big5.behaviors.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2: Time & Day */}
          {/* Row 2: Time & Day */}
          <div className="grid-2">
            <div className="chart-box">
              <div className="chart-title">⏰ 시간대별 패턴</div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.big5.times} margin={{ top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" style={{ fontSize: '11px' }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis axisLine={false} tickLine={false} style={{ fontSize: '11px' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="#8b5cf6" barSize={32} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="value" position="top" fontSize={12} fill="#6b7280" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-box">
              <div className="chart-title">📅 요일별 패턴</div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.big5.weekdays} margin={{ top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" style={{ fontSize: '11px' }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis axisLine={false} tickLine={false} style={{ fontSize: '11px' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="#f59e0b" barSize={32} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="value" position="top" fontSize={12} fill="#6b7280" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 3: Function & Antecedent & Consequence */}
          {/* Row 3: Function & Antecedent */}
          <div className="grid-2">
            <div className="chart-box">
              <div className="chart-title">❓ 행동의 기능 (Why)</div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.functions} cx="50%" cy="50%" outerRadius={100} innerRadius={60} paddingAngle={2} dataKey="value"
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {data.functions.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-box">
              <div className="chart-title">⚡ 배경 사건 (When)</div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.antecedents} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={110} style={{ fontSize: '11px' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="#ef4444" barSize={20} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" fontSize={11} fill="#ef4444" fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 4: Consequence & Heatmap */}
          <div className="grid-2">
            <div className="chart-box">
              <div className="chart-title">🎁 후속 결과 (Consequence)</div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.consequences} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={110} style={{ fontSize: '11px' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="#f59e0b" barSize={20} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" fontSize={11} fill="#f59e0b" fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-box">
              <div className="chart-title">🔥 Hot Spot (장소 x 시간)</div>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid stroke="#e2e8f0" />
                  <XAxis type="category" dataKey="x" name="시간" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="y" name="장소" tick={{ fontSize: 11 }} width={80} axisLine={false} tickLine={false} />
                  <ZAxis type="number" dataKey="value" range={[50, 400]} name="빈도" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '8px' }} />
                  <Scatter name="Incidents" data={data.heatmap} fill="#e02424" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <AIAnalysisCard
            sectionName="학교 전체 패턴 (Big 5 & ABC 분석)"
            dataContext={{
              top_locations: data.big5.locations?.slice(0, 3),
              top_behaviors: data.big5.behaviors?.slice(0, 3),
              top_times: data.big5.times?.slice(0, 3),
              functions: data.functions?.slice(0, 3),
              antecedents: data.antecedents?.slice(0, 3),
              consequences: data.consequences?.slice(0, 3),
            }}
            startDate={startDate} endDate={endDate}
          />
        </section>

        <div className="page-break"></div>

        {/* ===== Section 4: Tier 2/3 List ===== */}
        <section className="report-section">
          <h2>4. 학생 지원 현황 (Tier 2 & 3 Support)</h2>

          <h3>🚨 고위험군 안전 알림 (Safety Alerts)</h3>
          {data.safety_alerts && data.safety_alerts.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ marginBottom: '20px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '20%' }}>날짜</th>
                    <th style={{ width: '20%' }}>학생</th>
                    <th>내용</th>
                    <th style={{ width: '10%' }}>강도</th>
                  </tr>
                </thead>
                <tbody>
                  {data.safety_alerts.map((alert, idx) => (
                    <tr key={idx}>
                      <td>{alert.date}</td>
                      <td>{alert.student}</td>
                      <td>{alert.location}에서 {alert.type}</td>
                      <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{alert.intensity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>해당 기간 동안 보고된 고위험(강도 5) 행동이 없습니다.</p>
          )}

          <h3>⚠️ 소그룹/개별 지원 대상자</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Tier</th>
                  <th style={{ width: '20%' }}>학생명</th>
                  <th style={{ width: '20%' }}>학급</th>
                  <th style={{ width: '15%' }}>발생횟수</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {data.risk_list.map((s, idx) => (
                  <tr key={idx}>
                    <td>
                      <span style={{
                        padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
                        backgroundColor: s.tier === 'Tier 3' ? '#fee2e2' : '#fef3c7',
                        color: s.tier === 'Tier 3' ? '#991b1b' : '#92400e'
                      }}>
                        {s.tier}
                      </span>
                    </td>
                    <td>{s.name}</td>
                    <td>{s.class}</td>
                    <td>{s.count}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AIAnalysisCard
            sectionName="학생 지원 현황 (Tier 조정 의사결정)"
            dataContext={{
              safety_alerts_count: data.safety_alerts?.length || 0,
              risk_students: data.risk_list?.slice(0, 5).map(s => ({ name: s.name, tier: s.tier, count: s.count })),
            }}
            startDate={startDate} endDate={endDate}
          />
        </section>

        {/* ===== Section 5: Meeting Notes ===== */}
        <section className="report-section" style={{ borderBottom: 'none' }}>
          <h2>5. 이달의 실행 계획 (Action Plan) 및 회의록</h2>
          <MeetingNotesSection apiUrl={apiUrl} meetingType="tier1" title="전체 교직원 회의록" />
        </section>
      </div>
    </AuthCheck>
  );
}

// Sub-component for Meeting Notes
function MeetingNotesSection({ apiUrl, meetingType, title }: { apiUrl: string, meetingType: string, title: string }) {
  const [expanded, setExpanded] = useState(true);
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=${meetingType}`);
      setNotes(res.data.notes || []);
    } catch (e) { console.error(e); }
  };

  const saveNote = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
        meeting_type: meetingType,
        date: new Date().toISOString().split('T')[0],
        content,
        author: "Teacher"
      });
      setContent("");
      fetchNotes();
      alert("저장되었습니다.");
    } catch (e) {
      alert("저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '10px' }}>
      <div className="no-print" onClick={() => setExpanded(!expanded)}
        style={{ padding: "10px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f1f5f9", borderRadius: "8px", marginBottom: "10px" }}>
        <h3 style={{ margin: 0, fontSize: "14px", color: "#334155" }}>📝 {title}</h3>
        <span style={{ fontSize: "12px", color: "#64748b" }}>{expanded ? "접기" : "펼치기"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 5px" }}>
          <div className="no-print" style={{ marginBottom: "20px" }}>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder="회의 결정사항 및 실행계획을 입력하세요..."
              style={{ width: "100%", minHeight: "80px", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "4px", marginBottom: "8px", fontFamily: "inherit" }} />
            <button onClick={saveNote} disabled={loading || !content.trim()}
              style={{ padding: "6px 12px", backgroundColor: "#3b82f6", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>
              {loading ? "저장 중..." : "회의록 저장"}
            </button>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#334155" }}>📋 기록 목록</h4>
            {notes.length === 0 ? (
              <div style={{ border: '1px dashed #bbb', padding: '20px', minHeight: '100px', textAlign: 'center' }}>
                <p style={{ color: '#999', fontSize: '12px' }}>저장된 회의록이 없습니다.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {notes.map(n => (
                  <div key={n.id} style={{ paddingBottom: "15px", borderBottom: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>📅 {n.date} | ✍️ {n.author}</div>
                    <div style={{ fontSize: "13px", color: "#1e293b", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>{n.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
