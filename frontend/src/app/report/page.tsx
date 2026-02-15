"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  PieChart, Pie, Cell, Legend, ResponsiveContainer
} from "recharts";
import { DashboardData } from "../types";
import { AuthCheck } from "../components/AuthProvider";
import GlobalNav, { useDateRange } from "../components/GlobalNav";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function MonthlyReport() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Date State from GlobalNav (localStorage)
  const { startDate, endDate } = useDateRange();

  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  useEffect(() => {
    if (!startDate || !endDate) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        let url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/analytics/dashboard`;
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

  // Early return if no data
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
        .report-section { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
        h1 { font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #1e3a8a; }
        h2 { font-size: 18px; color: #333; border-left: 5px solid #3b82f6; padding-left: 10px; margin: 20px 0 10px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
        th { background-color: #eff6ff; color: #1e40af; }
        .summary-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
        .stat-box { padding: 15px; border-radius: 8px; background: linear-gradient(135deg, #f0f9ff, #e0f2fe); text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: #1e40af; }
        .stat-label { font-size: 11px; color: #64748b; margin-top: 5px; }
      `}</style>

        {/* Controller */}
        <div className="no-print" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: '#666' }}>분석 기간: {startDate} ~ {endDate}</span>
          </div>
          <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🖨️ 리포트 인쇄 / PDF 저장</button>
        </div>

        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1>🏫 Tier 1: 학교 행동 지원 종합 리포트 (월간)</h1>
          <p style={{ color: '#666' }}>발행일: {date} | 작성주체: PBS 리더십팀</p>
        </header>

        {/* 0. AI Insight */}
        {data?.ai_comment && (
          <section className="report-section" style={{ backgroundColor: '#f5f3ff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
            <h2 style={{ marginTop: 0, borderLeft: 'none', paddingLeft: 0, color: '#6d28d9' }}>🤖 AI 행동 분석 요약</h2>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.5' }}>
              {data.ai_comment}
            </div>
          </section>
        )}

        {/* 1. Summary */}
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
        </section>

        {/* 2. Tier 1 Big 5 */}
        <section className="report-section">
          <h2>2. 학교 전체 패턴 (Big 5 Analysis)</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ flex: 1, minWidth: '300px', height: '250px' }}>
              <h3>주요 발생 장소</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.big5.locations} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} style={{ fontSize: '12px' }} />
                  <Bar dataKey="value" fill="#3b82f6" barSize={20}>
                    <LabelList dataKey="value" position="right" fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: '300px', height: '250px' }}>
              <h3>주요 행동 유형</h3>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.big5.behaviors}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {data.big5.behaviors.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={{ marginTop: '20px' }}>
            <h3>* 데이터 해석 및 제언</h3>
            <div style={{ border: '1px solid #ddd', padding: '10px', borderRadius: '4px', backgroundColor: '#fafafa', fontSize: '12px', minHeight: '60px' }}>
              (여기에 교사 회의 코멘트를 수기 작성하거나, 시스템이 자동 생성한 인사이트가 표시됩니다.)
            </div>
          </div>
        </section>

        {/* 3. Detailed Pattern Analysis */}
        <section className="report-section">
          <h2>3. 상세 패턴 분석 (Detailed Pattern Analysis)</h2>

          {/* Row 1: Temporal Patterns */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '30px' }}>
            <div style={{ flex: 1, minWidth: '300px', height: '250px' }}>
              <h3>시간대별 패턴 (Time of Day)</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.big5.times} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Bar dataKey="value" fill="#8b5cf6" barSize={30}>
                    <LabelList dataKey="value" position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: '300px', height: '250px' }}>
              <h3>요일별 패턴 (Day of Week)</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.big5.weekdays} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Bar dataKey="value" fill="#f59e0b" barSize={30}>
                    <LabelList dataKey="value" position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2: Functional Patterns */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ flex: 1, minWidth: '300px', height: '250px' }}>
              <h3>행동의 기능 (Function) - '왜?'</h3>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.functions}
                    cx="50%" cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {data.functions.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ flex: 1, minWidth: '300px', height: '250px' }}>
              <h3>배경 사건 (Antecedent) - '언제?'</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.antecedents} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} style={{ fontSize: '11px' }} />
                  <Bar dataKey="value" fill="#ef4444" barSize={15}>
                    <LabelList dataKey="value" position="right" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <div className="page-break"></div>

        {/* 4. Tier 2/3 List */}
        <section className="report-section">
          <h2>4. 학생 지원 현황 (Tier 2 & 3 Support)</h2>

          <h3>🚨 고위험군 안전 알림 (Safety Alerts - Last 30 Days)</h3>
          {data.safety_alerts && data.safety_alerts.length > 0 ? (
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
          ) : (
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>해당 기간 동안 보고된 고위험(강도 5) 행동이 없습니다.</p>
          )}

          <h3>⚠️ 소그룹/개별 지원 대상자 (Screening List)</h3>
          <table>
            <thead>
              <tr>
                <th style={{ width: '15%' }}>Tier</th>
                <th style={{ width: '20%' }}>학생명</th>
                <th style={{ width: '20%' }}>학급</th>
                <th style={{ width: '15%' }}>발생횟수 (월)</th>
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
        </section>

        {/* 5. Action Plan & Meeting Notes */}
        <section className="report-section" style={{ borderBottom: 'none' }}>
          <h2>5. 이달의 실행 계획 (Action Plan) 및 회의록</h2>
          <MeetingNotesSection apiUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"} meetingType="tier1" title="전체 교직원 회의록" />
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
      <div
        className="no-print"
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "10px", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          backgroundColor: "#f1f5f9", borderRadius: "8px", marginBottom: "10px"
        }}
      >
        <h3 style={{ margin: 0, fontSize: "14px", color: "#334155" }}>📝 {title} (입력/조회)</h3>
        <span style={{ fontSize: "12px", color: "#64748b" }}>{expanded ? "접기" : "펼치기"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 5px" }}>
          <div className="no-print" style={{ marginBottom: "20px" }}>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="회의 결정사항 및 실행계획을 입력하세요..."
              style={{
                width: "100%", minHeight: "80px", padding: "10px",
                border: "1px solid #cbd5e1", borderRadius: "4px",
                marginBottom: "8px", fontFamily: "inherit"
              }}
            />
            <button
              onClick={saveNote}
              disabled={loading || !content.trim()}
              style={{
                padding: "6px 12px", backgroundColor: "#3b82f6", color: "white",
                border: "none", borderRadius: "4px", cursor: "pointer",
                fontSize: "12px"
              }}
            >
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
