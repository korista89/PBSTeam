"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
  LineChart, Line, Tooltip, ScatterChart, Scatter, ZAxis,
  AreaChart, Area,
} from "recharts";
import { DashboardData, RiskStudent, SafetyAlert } from "./types";
import { AuthCheck, useAuth } from "./components/AuthProvider";
import GlobalNav, { useDateRange } from "./components/GlobalNav";

const apiUrl = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL || "") : "";

const TIER_COLORS: Record<string, string> = {
  "Tier 1 (보편)": "#22c55e",
  "Tier 2-CICO (선별)": "#f59e0b",
  "Tier 2-SST (집중)": "#f97316",
  "Tier 3 (개별집중)": "#ef4444",
  "Tier 3+ (위기)": "#7c3aed",
};

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
      setAnalysis("⚠️ AI 분석 요청 실패. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="no-print" style={{ marginTop: '15px' }}>
      {!visible ? (
        <button onClick={requestAnalysis} style={{
          padding: '8px 16px', backgroundColor: '#7c3aed', color: 'white',
          border: 'none', borderRadius: '8px', cursor: 'pointer',
          fontSize: '0.85rem', fontWeight: '600',
          boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
        }}>🤖 BCBA AI 분석 요청</button>
      ) : (
        <div style={{ backgroundColor: '#f5f3ff', padding: '16px', borderRadius: '10px', border: '1px solid #ddd5f5', marginTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ margin: 0, color: '#6d28d9', fontSize: '0.9rem' }}>🤖 BCBA AI 분석 — {sectionName}</h4>
            <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#9ca3af' }}>✕ 닫기</button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#7c3aed' }}>⏳ AI가 데이터를 분석하고 있습니다...</div>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.6', color: '#334155' }}>{analysis}</div>
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
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <p style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: '0.85rem' }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ margin: '2px 0', color: p.color || '#3b82f6', fontSize: '0.8rem' }}>{p.name}: <strong>{p.value}</strong></p>
        ))}
      </div>
    );
  }
  return null;
};

// Chart wrapper
function ChartBox({ title, children, height = 340 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>{title}</div>
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

  const summary = data?.summary || { total_incidents: 0, avg_intensity: 0, risk_student_count: 0, enrolled_count: 0 };
  const big5 = data?.big5 || { locations: [], behaviors: [], times: [], weekdays: [] };
  const riskList = data?.risk_list || [];
  const safetyAlerts = data?.safety_alerts || [];
  const tierDist: any[] = (data as any)?.tier_distribution || [];
  const monthlyTrend: any[] = (data as any)?.monthly_trend || [];

  // Calculate total for tier % display
  const tierTotal = tierDist.reduce((s: number, t: any) => s + t.value, 0);

  return (
    <AuthCheck>
      <div className="container">
        <GlobalNav currentPage="dashboard" />

        {loading && !data && (
          <div style={{ padding: '50px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📊</div>
            <p>데이터를 불러오는 중...</p>
          </div>
        )}

        {fetchError && (
          <div style={{ padding: '50px', textAlign: 'center', color: '#ef4444' }}>
            <p>⚠️ {fetchError}</p>
            <p style={{ fontSize: '0.8rem', marginTop: '10px', color: '#64748b' }}>날짜 필터를 조정해보세요.</p>
          </div>
        )}

        {data && (
          <div style={{ padding: '20px', maxWidth: '1400px', margin: '20px auto' }}>
            <style jsx global>{`
              @media print { body { background: white; -webkit-print-color-adjust: exact; } .no-print { display: none; } }
              @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr !important; } .grid-3 { grid-template-columns: 1fr !important; } }
              .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px; }
              .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px; }
              .section-heading { font-size: 1.1rem; font-weight: 700; color: #0f172a; border-left: 4px solid #3b82f6; padding-left: 12px; margin: 32px 0 16px 0; display: flex; align-items: center; gap: 8px; }
            `}</style>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                  📊 {isAdmin() ? "PBS 행동 지원 종합 대시보드" : `${user?.class_name || '학급'} 행동 지원 리포트`}
                </h1>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                  {startDate} ~ {endDate} | {date}
                </p>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>🖨️ PDF 저장</button>
              </div>
            </div>

            {/* ===== KPI Cards ===== */}
            <div className="grid-3" style={{ marginBottom: '24px' }}>
              {[
                { label: "보고된 행동 건수", value: `${summary.total_incidents}건`, sub: "구글폼 제출 기준", color: "#3b82f6", icon: "📋" },
                { label: "평균 행동 강도", value: `${(summary.avg_intensity || 0).toFixed(1)}/5`, sub: "강도 1(경미) ~ 5(위기)", color: summary.avg_intensity >= 4 ? "#ef4444" : summary.avg_intensity >= 3 ? "#f59e0b" : "#22c55e", icon: "⚡" },
                { label: isAdmin() ? "집중 지원 대상자" : "학급 위험군", value: `${isAdmin() ? summary.risk_student_count : riskList.length}명`, sub: "Tier 2/3 해당 학생", color: "#ef4444", icon: "🚨" },
              ].map((card, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '1.5rem', opacity: 0.2 }}>{card.icon}</div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</div>
                  <div style={{ color: card.color, fontSize: '2rem', fontWeight: 800, margin: '4px 0' }}>{card.value}</div>
                  <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* ===== Section 1: PBIS Tier 분포 + 월별 추이 ===== */}
            <div className="section-heading">1. PBIS Tier 분포 및 행동 추이</div>
            <div className="grid-2">
              {/* Tier Distribution Donut */}
              <ChartBox title="🎯 PBIS Tier 분포 (재학생 기준)">
                <PieChart>
                  <Pie data={tierDist} cx="45%" cy="50%" outerRadius={110} innerRadius={65} paddingAngle={3} dataKey="value"
                    label={({ name, value, cx, x, y, midAngle }: any) => {
                      const pct = tierTotal > 0 ? Math.round(value / tierTotal * 100) : 0;
                      return <text x={x} y={y} fill={TIER_COLORS[name] || '#333'} fontSize={11} fontWeight={700} textAnchor={x > cx ? 'start' : 'end'}>{pct}%</text>;
                    }}>
                    {tierDist.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color || TIER_COLORS[entry.name] || '#ccc'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any, name: any) => [`${val}명 (${tierTotal > 0 ? Math.round(val / tierTotal * 100) : 0}%)`, name]} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} formatter={(value: any) => {
                    const t = tierDist.find((d: any) => d.name === value);
                    return `${value}: ${t?.value || 0}명`;
                  }} />
                </PieChart>
              </ChartBox>

              {/* Monthly Trend */}
              <ChartBox title="📊 월별 보고빈도 추이">
                <BarChart data={monthlyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" style={{ fontSize: '11px' }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis style={{ fontSize: '11px' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="보고 건수" radius={[6, 6, 0, 0]}
                    fill="url(#monthGrad)"
                    label={{ position: 'top', fontSize: 11, fill: '#64748b' }}>
                    <defs>
                      <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#60a5fa" />
                      </linearGradient>
                    </defs>
                  </Bar>
                </BarChart>
              </ChartBox>
            </div>

            <AIAnalysisCard sectionName="PBIS Tier 분포 및 추이" dataContext={{ tier_distribution: tierDist, monthly_trend: monthlyTrend }} startDate={startDate} endDate={endDate} />

            {/* ===== Section 2: Big 5 행동 패턴 ===== */}
            <div className="section-heading">2. 행동 패턴 분석 (Big 5)</div>
            <div className="grid-2">
              {/* Location */}
              <ChartBox title="📍 주요 발생 장소 (Top 장소)">
                <BarChart
                  data={[...(big5.locations || [])].sort((a: any, b: any) => b.value - a.value).slice(0, 8)}
                  layout="vertical" margin={{ left: 5, right: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={100} style={{ fontSize: '11px' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="보고 건수" fill="#3b82f6" barSize={22} radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: '#3b82f6', fontWeight: 700 }}
                      formatter={(v: number) => `${v}건 (${big5.locations ? Math.round(v / summary.total_incidents * 100) : 0}%)`} />
                  </Bar>
                </BarChart>
              </ChartBox>

              {/* Behavior Types Pie */}
              <ChartBox title="🎭 주요 행동 유형">
                <PieChart>
                  <Pie data={big5.behaviors || []} cx="45%" cy="50%" outerRadius={105} innerRadius={55} paddingAngle={3} dataKey="value">
                    {(big5.behaviors || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={['#3b82f6','#f59e0b','#ef4444','#22c55e','#8b5cf6','#06b6d4','#f97316'][index % 7]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => [`${val}건 (${summary.total_incidents > 0 ? Math.round(val / summary.total_incidents * 100) : 0}%)`, '']} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} formatter={(v: any, e: any) => `${v}: ${e.payload?.value || 0}건`} />
                </PieChart>
              </ChartBox>
            </div>

            <div className="grid-2">
              {/* Time Slots */}
              <ChartBox title="⏰ 시간대별 발생 패턴">
                <BarChart data={big5.times || []} margin={{ top: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" style={{ fontSize: '10px' }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis axisLine={false} tickLine={false} style={{ fontSize: '11px' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="보고 건수" fill="#8b5cf6" barSize={30} radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: '#6b7280' }} />
                  </Bar>
                </BarChart>
              </ChartBox>

              {/* Weekday */}
              <ChartBox title="📅 요일별 발생 패턴">
                <BarChart data={(big5.weekdays || []).filter((d: any) => !['토', '일'].includes(d.name))} margin={{ top: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" style={{ fontSize: '12px' }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis axisLine={false} tickLine={false} style={{ fontSize: '11px' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="보고 건수" fill="#f59e0b" barSize={36} radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: '#6b7280' }} />
                  </Bar>
                </BarChart>
              </ChartBox>
            </div>

            <AIAnalysisCard sectionName="행동 패턴 분석 (Big 5)" dataContext={{ top_locations: (big5.locations || []).slice(0,3), top_behaviors: (big5.behaviors || []).slice(0,3), top_times: (big5.times || []).slice(0,3) }} startDate={startDate} endDate={endDate} />

            {/* ===== Section 3: ABC 기능 분석 ===== */}
            <div className="section-heading">3. ABC 기능 분석 (FBA 기반 중재 설계)</div>
            <div className="grid-3">
              {/* Function (Why) */}
              <ChartBox title="❓ 행동의 기능 (Why)" height={300}>
                <PieChart>
                  <Pie data={(data as any).functions || []} cx="50%" cy="50%" outerRadius={95} innerRadius={50} paddingAngle={3} dataKey="value">
                    {((data as any).functions || []).map((_: any, index: number) => (
                      <Cell key={index} fill={['#3b82f6','#f59e0b','#ef4444','#22c55e','#8b5cf6','#06b6d4'][index % 6]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v}건`, '']} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ChartBox>

              {/* Antecedents */}
              <ChartBox title="⚡ 선행사건 (Antecedent)" height={300}>
                <BarChart data={[...((data as any).antecedents || [])].sort((a: any, b: any) => b.value - a.value).slice(0, 6)} layout="vertical" margin={{ left: 5, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={90} style={{ fontSize: '10px' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="건수" fill="#ef4444" barSize={18} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 10, fill: '#ef4444', fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ChartBox>

              {/* Consequences */}
              <ChartBox title="🎁 후속 결과 (Consequence)" height={300}>
                <BarChart data={[...((data as any).consequences || [])].sort((a: any, b: any) => b.value - a.value).slice(0, 6)} layout="vertical" margin={{ left: 5, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={90} style={{ fontSize: '10px' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="건수" fill="#f59e0b" barSize={18} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 10, fill: '#f59e0b', fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ChartBox>
            </div>

            {/* Hot Spot */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>🔥 행동 Hot Spot — 장소 × 시간대</div>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 60 }}>
                  <CartesianGrid stroke="#f1f5f9" />
                  <XAxis type="category" dataKey="x" name="시간대" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="y" name="장소" tick={{ fontSize: 10 }} width={90} axisLine={false} tickLine={false} />
                  <ZAxis type="number" dataKey="value" range={[60, 500]} name="건수" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
                        <b>{d.y}</b> × <b>{d.x}</b><br />{d.value}건
                      </div>;
                    }
                    return null;
                  }} />
                  <Scatter name="행동 발생" data={(data as any).heatmap || []} fill="#ef4444" opacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <AIAnalysisCard sectionName="ABC 기능 분석" dataContext={{ functions: ((data as any).functions || []).slice(0,3), antecedents: ((data as any).antecedents || []).slice(0,3), consequences: ((data as any).consequences || []).slice(0,3) }} startDate={startDate} endDate={endDate} />

            {/* ===== Section 4: 집중 지원 대상 ===== */}
            <div className="section-heading">4. 집중 지원 대상자 현황</div>

            {safetyAlerts.length > 0 && (
              <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: '8px', fontSize: '0.9rem' }}>🚨 고강도 행동 알림 (강도 5)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {safetyAlerts.slice(0, 5).map((alert: SafetyAlert, idx: number) => (
                    <div key={idx} style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem' }}>
                      <span style={{ color: '#64748b' }}>{alert.date}</span> | <span style={{ fontWeight: 600 }}>{alert.student}</span> | {alert.location} | {alert.type}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* At-risk table */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Tier', '학생', '학급', '보고 건수', '빈도 막대', '상세'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, borderBottom: '2px solid #e2e8f0', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riskList.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>감지된 집중 지원 대상이 없습니다.</td></tr>
                  ) : riskList.map((s: RiskStudent, idx: number) => {
                    const maxCount = Math.max(...riskList.map((r: RiskStudent) => r.count || 0), 1);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: s.tier === 'Tier 3' ? '#fee2e2' : '#fef3c7', color: s.tier === 'Tier 3' ? '#991b1b' : '#92400e' }}>{s.tier}</span>
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>{s.name}</td>
                        <td style={{ padding: '10px 16px', color: '#64748b' }}>{s.class}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: s.count >= 10 ? '#ef4444' : '#1e293b' }}>{s.count}건</td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ background: '#f1f5f9', borderRadius: '4px', height: '8px', width: '120px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, (s.count / maxCount) * 100)}%`, height: '100%', background: s.tier === 'Tier 3' ? '#ef4444' : '#f59e0b', borderRadius: '4px', transition: 'width 0.5s' }} />
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <button className="no-print" onClick={() => window.location.href = `/student/${encodeURIComponent(s.name)}`}
                            style={{ padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>분석</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ===== Section 5: 실행 계획 ===== */}
            <div className="section-heading">5. 실행 계획 및 회의록</div>
            <MeetingNotesSection apiUrl={apiUrl} meetingType={isAdmin() ? "tier1" : `class_${user?.class_id}`} title={isAdmin() ? "전체 교직원 회의록" : `${user?.class_name} 실행 계획`} />
          </div>
        )}
      </div>
    </AuthCheck>
  );
}

// Meeting Notes Component
function MeetingNotesSection({ apiUrl, meetingType, title }: { apiUrl: string, meetingType: string, title: string }) {
  const [expanded, setExpanded] = useState(true);
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchNotes(); }, [meetingType]);

  const fetchNotes = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=${meetingType}`);
      setNotes(res.data.notes || []);
    } catch (e) { }
  };

  const saveNote = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, { meeting_type: meetingType, date: new Date().toISOString().split('T')[0], content, author: "User" });
      setContent(""); fetchNotes(); alert("저장되었습니다.");
    } catch (e) { alert("저장 실패"); } finally { setLoading(false); }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b' }}>📝 {title}</h3>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{expanded ? '▲ 접기' : '▼ 펼치기'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '20px' }}>
          <div className="no-print" style={{ marginBottom: '16px' }}>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="내용을 입력하세요..." style={{ width: '100%', minHeight: '80px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px', fontFamily: 'inherit', fontSize: '0.9rem' }} />
            <button onClick={saveNote} disabled={loading || !content.trim()} style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>{loading ? '저장 중...' : '저장하기'}</button>
          </div>
          <div>
            {notes.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>기록된 내용이 없습니다.</p> : notes.map(n => (
              <div key={n.id} style={{ paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px dashed #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>📅 {n.date} | ✍️ {n.author}</div>
                <div style={{ fontSize: '0.9rem', color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{n.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
