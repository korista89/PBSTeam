"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import GlobalNav, { useDateRange } from "../../components/GlobalNav";
import { AuthCheck, useAuth } from "../../components/AuthProvider";

interface BehaviorType { name: string; value: number; }
interface WeeklyTrend { week: string; count: number; }

interface Tier3Student {
  code: string; name: string; class: string; tier: string; beable_code: string; memo: string;
  incidents: number; max_intensity: number; avg_intensity: number;
  behavior_types: BehaviorType[]; weekly_trend: WeeklyTrend[];
  weekly_trend_freq?: WeeklyTrend[];
  decision: string; decision_color: string;
}

interface Tier3ReportData {
  students: Tier3Student[];
  summary: { total_students: number; total_incidents: number; avg_intensity: number; };
}

const DECISION_OPTIONS = [
  { label: "Tier3 유지", color: "#ef4444" },
  { label: "Tier3 유지 (관찰)", color: "#f59e0b" },
  { label: "Tier2(CICO) 하향 검토", color: "#10b981" },
  { label: "Tier2(SST) 전환", color: "#3b82f6" },
  { label: "Tier3+ 상향 검토", color: "#7c3aed" },
  { label: "Tier3+ 유지 (위기)", color: "#7c3aed" },
];

const PIE_COLORS = ['#3b82f6','#f59e0b','#ef4444','#22c55e','#8b5cf6','#06b6d4','#f97316'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', boxShadow: '0 4px 8px rgba(0,0,0,0.08)', fontSize: '12px' }}>
        {label && <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>}
        {payload.map((p: any, i: number) => <p key={i} style={{ margin: '2px 0', color: p.color }}>{p.name}: <b>{p.value}</b></p>)}
      </div>
    );
  }
  return null;
};

export default function Tier3Report() {
  const { user, isAdmin } = useAuth();
  const { startDate, endDate } = useDateRange();
  const [data, setData] = useState<Tier3ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const apiUrl = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_API_URL || "" : "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (startDate && endDate) { params.append("start_date", startDate); params.append("end_date", endDate); }
      if (!isAdmin() && user?.class_id) params.append("class_id", user.class_id);
      const queryString = params.toString();
      const url = queryString ? `${apiUrl}/api/v1/analytics/tier3-report?${queryString}` : `${apiUrl}/api/v1/analytics/tier3-report`;
      const res = await axios.get(url, { timeout: 30000 });
      setData(res.data);
    } catch (err: unknown) {
      console.error(err);
      if (axios.isAxiosError(err) && err.response?.status === 500) {
        setError("서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } else if (axios.isAxiosError(err) && err.code === 'ECONNABORTED') {
        setError("응답 시간이 초과되었습니다. 날짜 범위를 좁혀서 다시 시도해주세요.");
      } else {
        setError(err instanceof Error ? err.message : "데이터 로딩 실패");
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, apiUrl, user?.class_id, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTierChange = async (studentCode: string, newTier: string) => {
    if (!confirm(`${studentCode}님의 Tier를 ${newTier}로 변경하시겠습니까?`)) return;
    try {
      await axios.post(`${apiUrl}/api/v1/students/tier-update`, { student_code: studentCode, tier: newTier });
      alert("변경되었습니다.");
      fetchData();
    } catch (e) { alert("변경 실패"); }
  };

  const getIntensityColor = (i: number) => i >= 5 ? "#ef4444" : i >= 3 ? "#f59e0b" : "#22c55e";
  const getIntensityBar = (val: number) => {
    const pct = Math.min(100, (val / 5) * 100);
    return (
      <div style={{ width: '60px', height: '8px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: getIntensityColor(val) }} />
      </div>
    );
  };

  // Filter students for class managers
  const students = data ? data.students.filter(s => {
    if (isAdmin()) return true;
    return s.code && String(s.code).startsWith(String(user?.class_id || ""));
  }) : [];

  // Max incidents for comparison chart
  const maxIncidents = students.length > 0 ? Math.max(...students.map(s => s.incidents), 1) : 1;

  return (
    <AuthCheck>
      <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#1e293b" }}>
        <GlobalNav />
        <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px 20px" }}>

          {/* Header */}
          <div style={{ marginBottom: "24px" }}>
            <h1 style={{ color: "#0f172a", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
              🔴 T3 리포트 — 위기행동 집중 관리
            </h1>
            <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "4px 0 0" }}>
              Tier 3 대상 학생 위기행동 현황 및 의사결정 지원 {startDate && endDate ? `(${startDate} ~ ${endDate})` : ""}
            </p>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
              <p>데이터 로딩 중... (최대 30초 소요될 수 있습니다)</p>
            </div>
          )}

          {error && (
            <div style={{ padding: "20px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", color: "#dc2626", textAlign: "center", marginBottom: "16px" }}>
              ⚠️ {error}
              <button onClick={fetchData} style={{ marginLeft: '12px', padding: '4px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>다시 시도</button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Summary Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "24px" }}>
                {[
                  { label: "Tier3 대상 학생", value: data.summary.total_students, unit: "명", icon: "👥", color: "#ef4444" },
                  { label: "총 위기행동 보고", value: data.summary.total_incidents, unit: "건", icon: "📋", color: "#f59e0b" },
                  { label: "평균 행동 강도", value: data.summary.avg_intensity, unit: "/5", icon: "⚡", color: getIntensityColor(data.summary.avg_intensity) },
                ].map((card, i) => (
                  <div key={i} style={{ background: "#fff", border: `1px solid ${card.color}20`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", borderRadius: "14px", padding: "20px", textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", marginBottom: "6px" }}>{card.icon}</div>
                    <div style={{ color: card.color, fontSize: "1.8rem", fontWeight: 700 }}>{card.value}<span style={{ fontSize: "0.8rem", color: "#64748b" }}>{card.unit}</span></div>
                    <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "4px" }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* ===== Chart 1: Student Comparison Bar ===== */}
              {students.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 24px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '16px', color: '#0f172a' }}>📊 Tier3 학생별 보고빈도 비교</div>
                  <ResponsiveContainer width="100%" height={Math.max(200, students.length * 42)}>
                    <BarChart data={students.map(s => ({
                      name: s.name ? `${s.name} (${s.code})` : s.code,
                      보고건수: s.incidents,
                      class: s.class,
                      tier: s.tier
                    }))} layout="vertical" margin={{ left: 10, right: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} style={{ fontSize: '11px' }} />
                      <YAxis dataKey="name" type="category" width={70} style={{ fontSize: '11px' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="보고건수" fill="#ef4444" barSize={22} radius={[0, 6, 6, 0]}>
                        <LabelList dataKey="보고건수" position="right" style={{ fontSize: 11, fill: '#ef4444', fontWeight: 700 }}
                          formatter={(v: number) => `${v}건`} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ===== Decision Legend ===== */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px", padding: "12px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                <span style={{ color: "#64748b", fontSize: "0.75rem", alignSelf: "center", fontWeight: 600 }}>의사결정 기준:</span>
                {DECISION_OPTIONS.map(opt => (
                  <span key={opt.label} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: opt.color, background: `${opt.color}15`, padding: "3px 8px", borderRadius: "4px" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: opt.color }} />
                    {opt.label}
                  </span>
                ))}
              </div>

              {/* Meeting Notes */}
              <div style={{ marginBottom: "24px" }}>
                <MeetingNotesSection apiUrl={apiUrl} meetingType="tier3" title="Tier 3 사례회의록" />
              </div>

              {/* ===== Student Table with Expandable Charts ===== */}
              {students.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", color: "#64748b" }}>
                  Tier3 대상 학생이 없습니다.
                </div>
              ) : (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ overflowX: 'auto', width: '100%' }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Tier", "성명", "학생코드", "학급", "보고건수", "최대강도", "평균강도", "주요행동", "의사결정 제안", "관리", "상세차트"].map(h => (
                          <th key={h} style={{ padding: "12px 10px", color: "#475569", fontWeight: 600, borderBottom: "2px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap", fontSize: '0.78rem' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, i) => (
                        <>
                          <tr key={i} style={{ borderBottom: expandedStudent === s.code ? 'none' : '1px solid #f1f5f9', background: expandedStudent === s.code ? '#fef9ff' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: "10px" }}>
                              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700, color: s.tier === "Tier3+" ? "#7c3aed" : "#ef4444", background: s.tier === "Tier3+" ? "#7c3aed15" : "#ef444415" }}>{s.tier}</span>
                            </td>
                            <td style={{ padding: "10px", fontWeight: 700, color: '#0f172a' }}>{s.name || "-"}</td>
                            <td style={{ padding: "10px", color: '#64748b', fontSize: '0.75rem' }}>{s.code}</td>
                            <td style={{ padding: "10px", color: "#64748b", fontSize: '0.75rem' }}>{s.class}</td>
                            <td style={{ padding: "10px", fontWeight: 700, color: s.incidents >= 6 ? "#ef4444" : "#1e293b" }}>{s.incidents}건</td>
                            <td style={{ padding: "10px" }}>
                              {getIntensityBar(s.max_intensity)}{" "}
                              <span style={{ color: getIntensityColor(s.max_intensity), fontSize: "0.75rem", fontWeight: 600 }}>{s.max_intensity}</span>
                            </td>
                            <td style={{ padding: "10px" }}>
                              {getIntensityBar(s.avg_intensity)}{" "}
                              <span style={{ color: getIntensityColor(s.avg_intensity), fontSize: "0.75rem" }}>{s.avg_intensity}</span>
                            </td>
                            <td style={{ padding: "10px", color: "#64748b", maxWidth: "130px" }}>
                              {s.behavior_types.length > 0 ? s.behavior_types.slice(0, 2).map(b => b.name.split(':')[0]).join(", ") : "-"}
                            </td>
                            <td style={{ padding: "10px" }}>
                              <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 600, color: s.decision_color, background: `${s.decision_color}12`, border: `1px solid ${s.decision_color}30`, whiteSpace: "nowrap" }}>{s.decision}</span>
                            </td>
                            <td style={{ padding: "10px" }}>
                              <div style={{ display: 'flex', gap: '4px', flexDirection: 'column' }}>
                                <button onClick={() => window.location.href = `/student/${s.code}`} style={{ padding: "3px 8px", background: "#3b82f6", color: "white", border: "none", borderRadius: "4px", fontSize: "0.7rem", cursor: "pointer" }}>상세</button>
                                <button onClick={() => window.location.href = `/student/${s.code}/bip`} style={{ padding: "3px 8px", background: "#8b5cf6", color: "white", border: "none", borderRadius: "4px", fontSize: "0.7rem", cursor: "pointer" }}>BIP</button>
                              </div>
                            </td>
                            <td style={{ padding: "10px" }}>
                              <button onClick={() => setExpandedStudent(expandedStudent === s.code ? null : s.code)}
                                style={{ padding: "4px 10px", background: expandedStudent === s.code ? '#7c3aed' : '#f1f5f9', color: expandedStudent === s.code ? 'white' : '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                {expandedStudent === s.code ? '▲ 접기' : '📈 차트'}
                              </button>
                            </td>
                          </tr>

                          {/* Expandable Charts Row */}
                          {expandedStudent === s.code && (
                            <tr key={`${i}-charts`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td colSpan={10} style={{ padding: '20px', background: '#faf5ff' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                                  
                                  {/* Weekly Trend (Report Frequency) */}
                                  <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '12px', color: '#0f172a' }}>📈 주간 보고빈도 추이 (행정/관찰 지표)</div>
                                    {s.weekly_trend.length > 0 ? (
                                      <ResponsiveContainer width="100%" height={160}>
                                        <LineChart data={s.weekly_trend.slice(-12)}>
                                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                          <XAxis dataKey="week" style={{ fontSize: '9px' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                          <YAxis allowDecimals={false} style={{ fontSize: '9px' }} axisLine={false} tickLine={false} />
                                          <Tooltip content={<CustomTooltip />} />
                                          <Line type="monotone" dataKey="count" name="보고건수" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    ) : <p style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>데이터 없음</p>}
                                  </div>

                                  {/* Weekly Trend (Occurrence Frequency - The ONE specific chart) */}
                                  <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '12px', color: '#0f172a' }}>📈 주간 발생빈도 추이 (경은PBST 핵심지표)</div>
                                    {s.weekly_trend_freq && s.weekly_trend_freq.length > 0 ? (
                                      <ResponsiveContainer width="100%" height={160}>
                                        <LineChart data={s.weekly_trend_freq.slice(-12)}>
                                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                          <XAxis dataKey="week" style={{ fontSize: '9px' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                          <YAxis allowDecimals={false} style={{ fontSize: '9px' }} axisLine={false} tickLine={false} />
                                          <Tooltip content={<CustomTooltip />} />
                                          <Line type="monotone" dataKey="count" name="발생빈도" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    ) : <p style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>데이터 없음</p>}
                                  </div>

                                  {/* Behavior Types Pie */}
                                  <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '12px', color: '#0f172a' }}>🎭 행동 유형 분포</div>
                                    {s.behavior_types.length > 0 ? (
                                      <ResponsiveContainer width="100%" height={160}>
                                        <PieChart>
                                          <Pie data={s.behavior_types.map(b => ({ ...b, name: b.name.split(':')[0] }))} cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3} dataKey="value">
                                            {s.behavior_types.map((_: any, idx: number) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                                          </Pie>
                                          <Tooltip formatter={(v: any) => [`${v}건`, '']} />
                                          <Legend wrapperStyle={{ fontSize: '9px' }} />
                                        </PieChart>
                                      </ResponsiveContainer>
                                    ) : <p style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>데이터 없음</p>}
                                  </div>

                                  {/* Intensity Bar */}
                                  <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '12px', color: '#0f172a' }}>⚡ 행동 강도 정보</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px' }}>
                                      {[
                                        { label: '최대 강도', val: s.max_intensity, max: 5 },
                                        { label: '평균 강도', val: s.avg_intensity, max: 5 },
                                        { label: '보고 건수 비율', val: s.incidents, max: maxIncidents },
                                      ].map((item, idx) => (
                                        <div key={idx}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                                            <span style={{ color: '#64748b' }}>{item.label}</span>
                                            <span style={{ fontWeight: 700, color: getIntensityColor(item.val) }}>{item.val}{idx === 0 || idx === 1 ? '/5' : '건'}</span>
                                          </div>
                                          <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden' }}>
                                            <div style={{ width: `${Math.min(100, (item.val / item.max) * 100)}%`, height: '100%', background: idx === 2 ? '#ef4444' : getIntensityColor(item.val), borderRadius: '5px', transition: 'width 0.6s' }} />
                                          </div>
                                        </div>
                                      ))}
                                      <div style={{ marginTop: '8px', padding: '8px', background: `${s.decision_color}10`, borderRadius: '8px', border: `1px solid ${s.decision_color}25` }}>
                                        <span style={{ fontSize: '0.78rem', color: s.decision_color, fontWeight: 700 }}>💡 {s.decision}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* AI Analysis */}
              <Tier3AIAnalysis apiUrl={apiUrl} startDate={startDate} endDate={endDate} />
            </>
          )}
        </main>
      </div>
    </AuthCheck>
  );
}

function Tier3AIAnalysis({ apiUrl, startDate, endDate }: { apiUrl: string; startDate?: string; endDate?: string }) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const requestAnalysis = async () => {
    setLoading(true); setVisible(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-tier3-analysis`, { start_date: startDate || null, end_date: endDate || null }, { timeout: 60000 });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch { setAnalysis("⚠️ AI 분석 요청 실패. 잠시 후 다시 시도해주세요."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ marginTop: "20px" }}>
      {!visible ? (
        <button onClick={requestAnalysis} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "white", border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600, boxShadow: "0 4px 12px rgba(124,58,237,0.3)" }}>
          🤖 BCBA AI 종합 분석
        </button>
      ) : (
        <div style={{ background: "rgba(124,58,237,0.04)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "12px", padding: "20px", marginTop: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, color: "#6d28d9", fontSize: "1rem" }}>🤖 BCBA AI 분석 — Tier 3 학생 종합</h3>
            <button onClick={() => setVisible(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}>✕ 닫기</button>
          </div>
          {loading ? <div style={{ textAlign: "center", padding: "30px", color: "#7c3aed" }}>⏳ AI가 분석 중입니다...</div>
            : <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: "1.7", color: "#334155" }}>{analysis}</div>}
        </div>
      )}
    </div>
  );
}

function MeetingNotesSection({ apiUrl, meetingType, title }: { apiUrl: string, meetingType: string, title: string }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotes = async () => {
    try { const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=${meetingType}`); setNotes(res.data.notes || []); } catch (e) { }
  };

  useEffect(() => { if (expanded) fetchNotes(); }, [expanded]);

  const saveNote = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, { meeting_type: meetingType, date: new Date().toISOString().split('T')[0], content, author: "Teacher" });
      setContent(""); fetchNotes(); alert("저장되었습니다.");
    } catch { alert("저장 실패"); } finally { setLoading(false); }
  };

  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: expanded ? "#0f172a" : "#f8fafc" }}>
        <h3 style={{ margin: 0, fontSize: "0.95rem", color: expanded ? "#e2e8f0" : "#1e293b" }}>📝 {title}</h3>
        <span style={{ color: expanded ? "#94a3b8" : "#64748b", fontSize: '0.85rem' }}>{expanded ? "▲ 접기" : "▼ 펼치기"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "20px", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ marginBottom: "16px" }}>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="회의 내용을 비식별화하여 입력하세요..."
              style={{ width: "100%", minHeight: "80px", padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#1e293b", marginBottom: "8px", fontFamily: 'inherit' }} />
            <button onClick={saveNote} disabled={loading || !content.trim()}
              style={{ padding: "8px 16px", background: "#6366f1", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem", opacity: loading ? 0.7 : 1 }}>
              {loading ? "저장 중..." : "회의록 저장"}
            </button>
          </div>
          <h4 style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#64748b" }}>📋 최근 기록</h4>
          {notes.length === 0 ? <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>기록이 없습니다.</p> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "200px", overflowY: "auto" }}>
              {notes.map(n => (
                <li key={n.id} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px dashed #e2e8f0" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>{n.date} | {n.author}</div>
                  <div style={{ fontSize: "0.9rem", color: "#1e293b", whiteSpace: "pre-wrap" }}>{n.content}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
