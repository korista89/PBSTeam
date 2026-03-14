"use client";

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
  LineChart, Line, Tooltip, ScatterChart, Scatter, ZAxis,
  AreaChart, Area, ComposedChart
} from "recharts";
import { DashboardData, RiskStudent, SafetyAlert } from "./types";
import { AuthCheck, useAuth } from "./components/AuthProvider";
import GlobalNav, { useDateRange } from "./components/GlobalNav";

const apiUrl = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL || "") : "";

const TIER_COLORS: Record<string, string> = {
  "Tier 1 (보편)": "#10b981",
  "Tier 2-CICO (선별)": "#f59e0b",
  "Tier 2-SST (집중)": "#f97316",
  "Tier 3 (개별집중)": "#ef4444",
  "Tier 3+ (위기)": "#8b5cf6",
};

// ====== AI Comprehensive Analysis Component ======
function AIComprehensiveAnalysis({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const requestAnalysis = async () => {
    setLoading(true);
    setVisible(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-comprehensive-analysis`, {
        start_date: startDate,
        end_date: endDate
      });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch (e) {
      setAnalysis("⚠️ 학교 전체 PBS 종합 분석 요청 실패. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="no-print" style={{ marginBottom: '32px' }}>
      {!visible ? (
        <button onClick={requestAnalysis} style={{
          width: '100%', padding: '24px', 
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', 
          color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer',
          fontSize: '1.2rem', fontWeight: '800',
          boxShadow: '0 10px 25px rgba(99, 102, 241, 0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          letterSpacing: '-0.02em'
        }}
        onMouseOver={e => {
            e.currentTarget.style.transform = 'scale(1.02) translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 15px 35px rgba(99, 102, 241, 0.5)';
        }}
        onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1) translateY(0)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(99, 102, 241, 0.4)';
        }}>
          <span style={{ fontSize: '1.6rem' }}>🧙‍♂️</span> BCBA AI 학교 전체 PBS 운영 정밀 분석 리포트 생성
        </button>
      ) : (
        <div style={{ 
            background: 'rgba(255, 255, 255, 0.9)', 
            backdropFilter: 'blur(10px)',
            padding: '32px', borderRadius: '24px', 
            border: '1px solid rgba(99, 102, 241, 0.2)', 
            boxShadow: '0 20px 50px rgba(0,0,0,0.1)' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '1.3rem', fontWeight: 900 }}>🤖 AI Specialist Analysis</h3>
            <div style={{ display: 'flex', gap: '12px' }}>
               <button onClick={requestAnalysis} style={{ padding: '6px 14px', borderRadius: '10px', background: '#f5f3ff', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#6366f1', fontWeight: 700, transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#ede9fe'} onMouseOut={e=>e.currentTarget.style.background='#f5f3ff'}>🔄 Refresh</button>
               <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#94a3b8' }}>✕</button>
            </div>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#6366f1' }}>
              <div style={{ fontSize: '3rem', marginBottom: '20px', animation: 'pulse 2s infinite' }}>🧠</div>
              <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>AI Expert is synthesizing all school-wide data...</p>
              <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '8px' }}>Tier 1-3, CICO, Behavior Logs, Meeting Notes integrated.</p>
            </div>
          ) : (
            <div style={{ 
              whiteSpace: 'pre-wrap', 
              fontSize: '1rem', 
              lineHeight: '1.9', 
              color: '#334155',
              maxHeight: '650px',
              overflowY: 'auto',
              paddingRight: '15px',
              textAlign: 'justify'
            }} className="custom-scrollbar">
              {analysis}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(4px)', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 10px 15px rgba(0,0,0,0.05)' }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 800, color: '#1e293b', fontSize: '0.9rem' }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color || '#3b82f6' }} />
            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{p.name}:</span>
            <span style={{ color: '#1e293b', fontWeight: 800, fontSize: '0.85rem' }}>{p.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Chart wrapper
function ChartBox({ title, children, height = 340 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{ 
        background: 'rgba(255, 255, 255, 0.8)', 
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(226, 232, 240, 0.8)', 
        borderRadius: '24px', 
        padding: '28px', 
        boxShadow: '0 10px 30px rgba(0,0,0,0.02)',
        transition: 'transform 0.3s'
    }}
    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '4px', height: '18px', background: '#6366f1', borderRadius: '2px' }} />
          {title}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ====== Main Dashboard Component ======
export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { user, isAdmin } = useAuth();
  const { startDate, endDate } = useDateRange();
  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const lastParamsRef = React.useRef("");

  useEffect(() => {
    if (!startDate || !endDate) return;
    const isAdminUser = isAdmin();
    const params = new URLSearchParams();
    params.append("start_date", startDate);
    params.append("end_date", endDate);
    if (!isAdminUser && user?.class_id) params.append("class_id", user.class_id);
    const currentParams = params.toString();
    if (currentParams === lastParamsRef.current && data !== null) return;

    const abortController = new AbortController();
    const fetchData = async () => {
      try {
        setLoading(true);
        setFetchError(null);
        lastParamsRef.current = currentParams;
        const url = `${apiUrl}/api/v1/analytics/dashboard?${currentParams}`;
        const response = await axios.get(url, { signal: abortController.signal });
        if (response.data.error) setFetchError(response.data.error);
        else setData(response.data);
      } catch (err: any) {
        if (!axios.isCancel(err)) setFetchError("데이터를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => abortController.abort();
  }, [startDate, endDate, user?.class_id, user?.id]);

  useEffect(() => {
    if (!data || !isAdmin()) return;
    // Log for internal telemetry
    console.log("Dashboard data refreshed", new Date().toISOString());
  }, [data, isAdmin]);

  const summary = data?.summary || { total_incidents: 0, avg_intensity: 0, risk_student_count: 0, enrolled_count: 0 };
  const big5 = data?.big5 || { locations: [], behaviors: [], times: [], weekdays: [] };
  const riskList = data?.risk_list || [];
  const safetyAlerts = data?.safety_alerts || [];
  const tierDist: any[] = (data as any)?.tier_distribution || [];
  const monthlyTrend: any[] = (data as any)?.monthly_trend || [];
  const tierTotal = tierDist.reduce((s: number, t: any) => s + t.value, 0);

  return (
    <AuthCheck>
      <div className="container" style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '60px' }}>
        <GlobalNav currentPage="dashboard" />

        {/* Dynamic Background decorations */}
        <div style={{ position: 'fixed', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'fixed', bottom: -100, left: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {loading && !data && (
          <div style={{ padding: '100px', textAlign: 'center', color: '#64748b' }}>
            <div className="loading-spinner" style={{ fontSize: '3rem', marginBottom: '20px', animation: 'spin 2s linear infinite' }}>📀</div>
            <p style={{ fontWeight: 700, fontSize: '1.2rem' }}>심층 분석 데이터를 구성하고 있습니다...</p>
          </div>
        )}

        {fetchError && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#ef4444' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</div>
            <p style={{ fontWeight: 800 }}>{fetchError}</p>
            <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>다시 시도</button>
          </div>
        )}

        {data && (
          <div style={{ padding: '24px', maxWidth: '1500px', margin: '0 auto', position: 'relative' }}>
            <style jsx global>{`
              @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
              @media print { body { background: white; } .no-print { display: none; } .container { background: white !important; } }
              .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 24px; }
              .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
              @media (max-width: 1024px) { .grid-3 { grid-template-columns: repeat(2, 1fr); } }
              @media (max-width: 768px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
              .section-heading { font-size: 1.3rem; font-weight: 900; color: #0f172a; margin: 48px 0 24px 0; display: flex; align-items: center; gap: 12px; }
              .section-heading::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, #e2e8f0, transparent); }
              .custom-scrollbar::-webkit-scrollbar { width: 6px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
            `}</style>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.03em' }}>
                    {isAdmin() ? "경은PBST 종합 통계 분석" : "Hub 지원 리포트"}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <span style={{ padding: '3px 10px', background: '#e0f2fe', color: '#0369a1', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800 }}>{user?.class_name || 'Admin'}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500 }}>{startDate} ~ {endDate} 기준</span>
                </div>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => window.print()} style={{ padding: '12px 24px', background: '#fff', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '14px', cursor: 'pointer', fontWeight: '700', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>📄</span> Export PDF
                </button>
              </div>
            </div>

            {/* ===== KPI Cards ===== */}
            <div className="grid-3">
              {[
                { label: "총 보고 빈도", value: `${summary.total_incidents}건`, sub: "입력된 전체 로그", color: "#6366f1", icon: "📊", grad: "linear-gradient(135deg, #e0e7ff 0%, #ffffff 100%)" },
                { label: "평균 행동 강도", value: `${(summary.avg_intensity || 0).toFixed(1)}/5`, sub: "전체 행동 강도 평균", color: summary.avg_intensity >= 3.5 ? "#ef4444" : "#f59e0b", icon: "⚡", grad: "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)" },
                { label: "심층 지원 대상", value: `${isAdmin() ? summary.risk_student_count : riskList.length}명`, sub: "Tier 2/3 위기군", color: "#ef4444", icon: "🚨", grad: "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)" },
              ].map((card, i) => (
                <div key={i} style={{ 
                    background: card.grad, border: '1px solid rgba(0,0,0,0.05)', borderRadius: '28px', 
                    padding: '28px', boxShadow: '0 10px 20px rgba(0,0,0,0.01)', position: 'relative', overflow: 'hidden' 
                }}>
                  <div style={{ position: 'absolute', top: '24px', right: '28px', fontSize: '2rem', opacity: 0.15 }}>{card.icon}</div>
                  <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{card.label}</div>
                  <div style={{ color: card.color, fontSize: '2.5rem', fontWeight: 950, letterSpacing: '-0.02em' }}>{card.value}</div>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500, marginTop: '4px' }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Section 1 */}
            <div className="section-heading"><span>01</span> Tier Structure & Trends</div>
            <div className="grid-2">
              <ChartBox title="🎯 Tier Distribution">
                <PieChart>
                  <Pie data={tierDist} cx="50%" cy="50%" outerRadius={120} innerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                    {tierDist.map((entry: any, index: number) => (
                      <Cell key={index} fill={TIER_COLORS[entry.name] || '#cbd5e1'} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" />
                </PieChart>
              </ChartBox>

              <ChartBox title="📈 Incident frequency by Month">
                <BarChart data={monthlyTrend} margin={{ top: 20, right: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="보고 건수" radius={[10, 10, 10, 10]} barSize={24}>
                    {monthlyTrend.map((_, i) => <Cell key={i} fill="#6366f1" />)}
                    <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 800, fill: '#6366f1' }} />
                  </Bar>
                </BarChart>
              </ChartBox>
            </div>

            {/* Section 2 */}
            <div className="section-heading"><span>02</span> Big 5 Pattern Analysis</div>
            <div className="grid-2">
              <ChartBox title="📍 Location Analytics">
                <BarChart data={[...(big5.locations || [])].sort((a,b)=>b.value-a.value).slice(0, 6)} layout="vertical" margin={{ right: 60 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="건수" radius={[0, 10, 10, 0]} fill="#6366f1" barSize={18}>
                      <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 800, fill: '#6366f1' }} formatter={(v:any)=>`${v}건`} />
                  </Bar>
                </BarChart>
              </ChartBox>
              <ChartBox title="🎭 Behavior Profile">
                <PieChart>
                  <Pie data={big5.behaviors || []} cx="50%" cy="50%" outerRadius={110} innerRadius={0} dataKey="value" stroke="#fff" strokeWidth={4}>
                    {(big5.behaviors || []).map((_, i) => <Cell key={i} fill={['#6366f1','#8b5cf6','#d946ef','#f43f5e','#f97316','#f59e0b'][i%6]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" />
                </PieChart>
              </ChartBox>
            </div>

            {/* Section 3 */}
            <div className="section-heading"><span>03</span> ABC Functional Assessment</div>
            <div className="grid-3">
              <ChartBox title="❓ Function of Behavior" height={280}>
                <PieChart>
                  <Pie data={(data as any).functions || []} cx="50%" cy="50%" outerRadius={90} innerRadius={60} dataKey="value">
                      {((data as any).functions || []).map((_, i) => <Cell key={i} fill={['#10b981','#3b82f6','#f59e0b','#ef4444'][i%4]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" />
                </PieChart>
              </ChartBox>
              <ChartBox title="⚡ Intensity Heat" height={280}>
                <BarChart data={(data as any).intensity_distribution || []}>
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                   <Bar dataKey="value" radius={[8,8,8,8]}>
                       {((data as any).intensity_distribution || []).map((e:any, i:number) => {
                           const colors = ['#10b981', '#fbbf24', '#f59e0b', '#ef4444', '#7f1d1d'];
                           return <Cell key={i} fill={colors[parseInt(e.name)-1] || '#ccc'} />;
                       })}
                   </Bar>
                </BarChart>
              </ChartBox>
              <ChartBox title="⏰ Timeline Insight" height={280}>
                <LineChart data={(data as any).intensity_trend || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 5]} hide />
                  <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={4} dot={{ r: 6, fill: '#fa3f5e', stroke: '#fff', strokeWidth: 3 }} />
                  <Tooltip content={<CustomTooltip />} />
                </LineChart>
              </ChartBox>
            </div>

            {/* Section 4 */}
            <div className="section-heading"><span>04</span> Intensive Support Student List</div>
            <div style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', borderRadius: '24px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <tr>
                    {['Priority', 'Student', 'Class', 'Frequency', 'Risk Level', 'Action'].map(h => (
                      <th key={h} style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 800, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riskList.map((s: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.03)' }}>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{ padding: '4px 12px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 900, background: s.tier === 'Tier 3' ? '#fee2e2' : '#fff7ed', color: s.tier === 'Tier 3' ? '#ef4444' : '#f59e0b' }}>{s.tier}</span>
                      </td>
                      <td style={{ padding: '16px 24px', fontWeight: 800, color: '#1e293b' }}>{s.name}</td>
                      <td style={{ padding: '16px 24px', color: '#64748b', fontWeight: 500 }}>{s.class}</td>
                      <td style={{ padding: '16px 24px', fontWeight: 900, color: '#1e293b' }}>{s.count} <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Logs</span></td>
                      <td style={{ padding: '16px 24px' }}>
                         <div style={{ width: '100px', height: '6px', background: '#e2e8f0', borderRadius: '10px' }}>
                             <div style={{ width: `${Math.min(100, (s.count / 15) * 100)}%`, height: '100%', background: s.tier === 'Tier 3' ? '#ef4444' : '#f59e0b', borderRadius: '10px' }} />
                         </div>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <button onClick={()=>window.location.href=`/student/${s.name}`} style={{ padding: '6px 14px', borderRadius: '10px', background: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', color: '#475569', transition: 'all 0.2s' }} onMouseOver={e=>{e.currentTarget.style.background='#1e293b'; e.currentTarget.style.color='#fff'}} onMouseOut={e=>{e.currentTarget.style.background='#f1f5f9'; e.currentTarget.style.color='#475569'}}>View Insight</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 5 */}
            <div className="section-heading"><span>05</span> Action Plan & Meeting Records</div>
            <AIComprehensiveAnalysis startDate={startDate} endDate={endDate} />
            <div className="grid-2">
                <MeetingNotesContainer title="전체 교직원 협의록" type="tier1" />
                <MeetingNotesContainer title="Tier 2/3 운영위원회" type="tier2" />
            </div>
          </div>
        )}
      </div>
    </AuthCheck>
  );
}

// Rewritten Meeting Notes Component with Modern glassmorphism
function MeetingNotesContainer({ title, type }: { title: string, type: string }) {
    const [notes, setNotes] = useState<any[]>([]);
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const { user, isAdmin } = useAuth();

    const fetchNotes = useCallback(async () => {
        try {
            const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=${type}`);
            setNotes(res.data.notes || []);
        } catch (e) { console.error(e); }
    }, [type]);

    useEffect(() => { fetchNotes(); }, [fetchNotes]);

    const handleSave = async () => {
        if (!content.trim()) return;
        setLoading(true);
        try {
            await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
                meeting_type: type,
                date: new Date().toISOString().split('T')[0],
                content,
                author: user?.id || "Teacher"
            });
            setContent("");
            fetchNotes();
        } catch (e) { alert("저장 실패"); } finally { setLoading(true); setLoading(false); }
    };

    const handleUpdate = async (id: string) => {
        try {
             await axios.patch(`${apiUrl}/api/v1/meeting-notes/${id}`, { content: editContent });
             setEditingId(null);
             fetchNotes();
        } catch (e) { alert("수정 실패"); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("삭제하시겠습니까?")) return;
        try {
             await axios.delete(`${apiUrl}/api/v1/meeting-notes/${id}`);
             fetchNotes();
        } catch (e) { alert("삭제 실패"); }
    };

    return (
        <div style={{ background: '#fff', borderRadius: '24px', padding: '28px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: 900, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>📒</span> {title}
            </h3>
            
            <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="회의 결과를 기록하십시오..." style={{ width: '100%', minHeight: '100px', padding: '16px', borderRadius: '16px', border: '1px solid #f1f5f9', background: '#f8fafc', fontSize: '0.9rem', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} onFocus={e=>e.currentTarget.style.borderColor='#6366f1'} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button onClick={handleSave} disabled={loading || !content.trim()} style={{ padding: '10px 24px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', transition: 'transform 0.2s' }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}>저장</button>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto' }} className="custom-scrollbar">
                {notes.map((n, i) => (
                    <div key={i} style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8' }}>{n.date}</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {(isAdmin() || n.author === user?.id) && (
                                    <>
                                        <button onClick={()=>{setEditingId(n.created_at); setEditContent(n.content);}} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}>수정</button>
                                        <button onClick={()=>handleDelete(n.created_at)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}>삭제</button>
                                    </>
                                )}
                            </div>
                        </div>
                        {editingId === n.created_at ? (
                            <div>
                                <textarea value={editContent} onChange={e=>setEditContent(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #6366f1', fontSize: '0.9rem' }} />
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    <button onClick={()=>handleUpdate(n.created_at)} style={{ padding: '4px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>Save</button>
                                    <button onClick={()=>setEditingId(null)} style={{ padding: '4px 12px', background: '#94a3b8', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{n.content}</p>
                        )}
                        <div style={{ marginTop: '8px', textAlign: 'right', fontSize: '0.7rem', color: '#94a3b8' }}>by {n.author}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
