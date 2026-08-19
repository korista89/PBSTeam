"use client";

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
  LineChart, Line, Tooltip
} from "recharts";
import { DashboardData } from "./types";
import { AuthCheck, useAuth } from "./components/AuthProvider";
import { useDateRange } from "./components/GlobalNav";
import AppShell from "./components/AppShell";
import WeeklyAnalysisChart from "./components/WeeklyAnalysisChart";
import { maskName, formatWeek } from "./utils";

const apiUrl = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL || "") : "";

const TIER_COLORS: Record<string, string> = {
  "Tier 1 (보편)": "#10b981",
  "Tier 2-CICO (선별)": "#f59e0b",
  "Tier 2-SST (집중)": "#f97316",
  "Tier 3 (개별집중)": "#ef4444",
  "Tier 3+ (위기)": "#8b5cf6",
};

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(4px)', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 10px 15px rgba(0,0,0,0.05)', zIndex: 100 }}>
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

// ====== 5대 영역별 AI 정밀 분석 버튼 컴포넌트 (신규 추가: 빨간색 외곽선) ======
function SectionAIButton({
  sectionName,
  title,
  dataContext,
  startDate,
  endDate,
  buttonLabel = "📊 차트 해석",
  modalLabel
}: {
  sectionName: string;
  title: string;
  dataContext: any;
  startDate: string;
  endDate: string;
  buttonLabel?: string;
  modalLabel?: string;
}) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleRequest = async () => {
    setLoading(true);
    setOpen(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-section-analysis`, {
        section_name: sectionName,
        data_context: dataContext || {},
        start_date: startDate || null,
        end_date: endDate || null
      }, { timeout: 180000 });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch (e: any) {
      const errDetail = typeof e?.response?.data?.detail === "string"
        ? e.response.data.detail
        : Array.isArray(e?.response?.data?.detail)
          ? e.response.data.detail.map((d: any) => d.msg).join(", ")
          : e?.message || "요청 실패";
      setAnalysis(`⚠️ AI 영역별 정밀 분석 요청 실패. (${errDetail})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleRequest}
        style={{
          padding: '6px 12px',
          background: '#fff',
          color: '#dc2626',
          border: '2.5px solid #ef4444', /* 빨간색 외곽선 (신규 추가 버튼) */
          borderRadius: '10px',
          fontSize: '0.78rem',
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          transition: 'all 0.2s'
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.background = '#fef2f2';
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.background = '#fff';
        }}
      >
        <span>🤖</span> {buttonLabel}
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '20px'
        }}>
          <div style={{
            background: '#fff', borderRadius: '24px',
            maxWidth: '850px', width: '100%', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '2.5px solid #ef4444', /* 빨간색 외곽선 (신규 추가 모달) */
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px 28px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'linear-gradient(135deg, #fff5f5, #ffffff)'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🤖 {modalLabel || `${title} 차트 해석`}
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleRequest} style={{ padding: '6px 14px', borderRadius: '8px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>🔄 새로고침</button>
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            <div style={{ padding: '28px', overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', lineHeight: '1.85', fontSize: '0.95rem', color: '#334155' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#ef4444' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '16px', animation: 'pulse 1.5s infinite' }}>🧠</div>
                  <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{title} 데이터를 바탕으로 BCBA 정밀 분석 중입니다...</p>
                </div>
              ) : (
                analysis
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Truncated axis/legend label with full text on hover (native SVG <title>)
function truncateLabel(str: string, max = 9) {
  const s = String(str || "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function TruncatedYAxisTick({ x, y, payload }: any) {
  const full = String(payload?.value ?? "");
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text x={-4} y={0} dy={4} textAnchor="end" fontSize={10} fontWeight={700} fill="#334155">
        {truncateLabel(full, 9)}
      </text>
    </g>
  );
}

function truncatedLegendFormatter(value: string) {
  return <span title={value}>{truncateLabel(value, 12)}</span>;
}

// Chart wrapper
function ChartBox({ title, description, children, height = 340, action }: { title: string; description?: string; children: React.ReactNode; height?: number; action?: React.ReactNode }) {
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
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <div title={description} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: description ? 'help' : undefined }}>
            <div style={{ width: '4px', height: '18px', background: '#6366f1', borderRadius: '2px' }} />
            {title}
          </div>
          {action && <div>{action}</div>}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ====== Tier 상향 검토 대상자 명단 컴포넌트 (T2/T3 공용) ======
const PIE_COLORS_FUNC = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
const PIE_COLORS_TYPE = ['#3b82f6','#f59e0b','#ef4444','#22c55e','#8b5cf6','#06b6d4','#f97316'];

function TierUpgradeList({
  riskList,
  startDate,
  endDate,
  targetTier,
  label,
  accent
}: {
  riskList: any[];
  startDate: string;
  endDate: string;
  targetTier: 'Tier 2' | 'Tier 3';
  label: string;
  accent: string;
}) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [chartData, setChartData] = useState<Record<string, any>>({});
  const [loadingCode, setLoadingCode] = useState<string | null>(null);

  const t2List = riskList.filter((s: any) => s.tier === targetTier);

  const toggleChart = async (s: any) => {
    const code = s.student_code || s.name;
    if (expandedCode === code) { setExpandedCode(null); return; }
    setExpandedCode(code);
    if (chartData[code]) return;

    setLoadingCode(code);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      const identifier = s.student_code || s.name;
      const res = await axios.get(`${apiUrl}/api/v1/students/${encodeURIComponent(identifier)}?${params.toString()}`);
      setChartData(prev => ({ ...prev, [code]: res.data }));
    } catch {
      setChartData(prev => ({ ...prev, [code]: { error: true } }));
    } finally {
      setLoadingCode(null);
    }
  };

  const getIntensityColor = (v: number) => v >= 5 ? '#ef4444' : v >= 3 ? '#f59e0b' : '#22c55e';

  const maxCount = Math.max(...t2List.map((s: any) => s.count), 1);

  const listHeader = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '20px 24px', borderBottom: t2List.length ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
      <div style={{ fontWeight: 900, fontSize: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '4px', height: '18px', background: accent, borderRadius: '2px', display: 'inline-block' }} />
        {label} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>({t2List.length}명)</span>
      </div>
      {t2List.length > 0 && (
        <SectionAIButton
          sectionName="tier_upgrade_candidates"
          title={label}
          dataContext={{ target_tier: targetTier, candidates: t2List.slice(0, 20) }}
          startDate={startDate}
          endDate={endDate}
          buttonLabel="🤖 선정 근거 요약"
          modalLabel={`${label} 선정 근거 및 행동데이터 요약`}
        />
      )}
    </div>
  );

  if (t2List.length === 0) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', borderRadius: '24px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)' }}>
        {listHeader}
        <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>{label} 대상자가 없습니다.</div>
      </div>
    );
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', borderRadius: '24px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
      {listHeader}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead style={{ background: 'rgba(0,0,0,0.02)' }}>
          <tr>
            {['우선순위', '학생명', '학급', '누적 빈도', '위험도', '차트'].map(h => (
              <th key={h} style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 800, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t2List.map((s: any, idx: number) => {
            const code = s.student_code || s.name;
            const isExpanded = expandedCode === code;
            const cd = chartData[code];
            return (
              <React.Fragment key={idx}>
                <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(0,0,0,0.03)', background: isExpanded ? '#f0f9ff' : idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{ padding: '4px 12px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 900, background: `${accent}18`, color: accent }}>{targetTier}</span>
                  </td>
                  <td style={{ padding: '16px 24px', fontWeight: 800, color: '#1e293b' }}>{maskName(s.name)}</td>
                  <td style={{ padding: '16px 24px', color: '#64748b', fontWeight: 500 }}>{s.class}</td>
                  <td style={{ padding: '16px 24px', fontWeight: 900, color: '#1e293b' }}>{s.count} <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>회</span></td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ width: '100px', height: '6px', background: '#e2e8f0', borderRadius: '10px' }}>
                      <div style={{ width: `${Math.min(100, (s.count / maxCount) * 100)}%`, height: '100%', background: accent, borderRadius: '10px' }} />
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <button
                      onClick={() => toggleChart(s)}
                      style={{ padding: '6px 14px', borderRadius: '10px', background: isExpanded ? accent : '#f1f5f9', color: isExpanded ? '#fff' : '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', transition: 'all 0.2s' }}
                    >
                      {loadingCode === code ? '⏳' : isExpanded ? '▲ 접기' : '📈 차트'}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <td colSpan={6} style={{ padding: '20px 24px', background: '#f8fbff' }}>
                      {loadingCode === code && <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>⏳ 데이터 로딩 중...</div>}
                      {cd?.error && <div style={{ textAlign: 'center', padding: '20px', color: '#ef4444' }}>⚠️ 데이터를 불러오지 못했습니다.</div>}
                      {cd && !cd.error && (
                        <div>
                          {/* 1행: 주간 보고빈도 + 주간 발생빈도 */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '10px', color: '#0f172a' }}>📈 주간 보고빈도 추이</div>
                              {(cd.weekly_trend || []).length > 0 ? (
                                <ResponsiveContainer width="100%" height={140}>
                                  <LineChart data={cd.weekly_trend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="week" style={{ fontSize: '9px' }} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={formatWeek} />
                                    <YAxis allowDecimals={false} style={{ fontSize: '9px' }} axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="count" name="보고건수" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              ) : <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '18px 0' }}>데이터 없음</p>}
                            </div>
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '10px', color: '#0f172a' }}>📈 주간 발생빈도 추이</div>
                              {(cd.cico_trend || []).length > 0 ? (
                                <ResponsiveContainer width="100%" height={140}>
                                  <LineChart data={cd.cico_trend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="date" style={{ fontSize: '9px' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                    <YAxis allowDecimals={false} style={{ fontSize: '9px' }} axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="count" name="발생빈도" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              ) : <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '18px 0' }}>데이터 없음</p>}
                            </div>
                          </div>
                          {/* 2행: 행동유형 + 행동기능 + 행동강도 (3분할) */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '10px', color: '#0f172a' }}>🎭 행동 유형 분포</div>
                              {(cd.behavior_types || []).length > 0 ? (
                                <ResponsiveContainer width="100%" height={150}>
                                  <PieChart>
                                    <Pie data={(cd.behavior_types || []).map((b: any) => ({ ...b, name: b.name.split(':')[0] }))} cx="50%" cy="50%" outerRadius={55} innerRadius={28} paddingAngle={3} dataKey="value">
                                      {(cd.behavior_types || []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS_TYPE[i % PIE_COLORS_TYPE.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(v: any) => [`${v}건`, '']} />
                                    <Legend wrapperStyle={{ fontSize: '8px' }} />
                                  </PieChart>
                                </ResponsiveContainer>
                              ) : <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '18px 0' }}>데이터 없음</p>}
                            </div>
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '10px', color: '#0f172a' }}>❓ 행동 기능 분포</div>
                              {(cd.functions || []).length > 0 ? (
                                <ResponsiveContainer width="100%" height={150}>
                                  <PieChart>
                                    <Pie data={cd.functions || []} cx="50%" cy="50%" outerRadius={55} innerRadius={28} paddingAngle={3} dataKey="value">
                                      {(cd.functions || []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS_FUNC[i % PIE_COLORS_FUNC.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(v: any) => [`${v}건`, '']} />
                                    <Legend wrapperStyle={{ fontSize: '8px' }} />
                                  </PieChart>
                                </ResponsiveContainer>
                              ) : <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '18px 0' }}>데이터 없음</p>}
                            </div>
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '10px', color: '#0f172a' }}>⚡ 행동 강도 정보</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '6px' }}>
                                {[
                                  { label: '평균 강도', val: cd.profile?.avg_intensity || 0, max: 5, suffix: '/5' },
                                  { label: '보고 건수', val: cd.profile?.total_incidents || 0, max: maxCount, suffix: '건' },
                                ].map((item, i) => (
                                  <div key={i}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
                                      <span style={{ color: '#64748b' }}>{item.label}</span>
                                      <span style={{ fontWeight: 700, color: getIntensityColor(item.val) }}>{item.val}{item.suffix}</span>
                                    </div>
                                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                      <div style={{ width: `${Math.min(100, (item.val / item.max) * 100)}%`, height: '100%', background: getIntensityColor(item.val), borderRadius: '4px', transition: 'width 0.5s' }} />
                                    </div>
                                  </div>
                                ))}
                                <div style={{ marginTop: '6px', padding: '8px 10px', background: `${accent}12`, borderRadius: '8px', border: `1px solid ${accent}40` }}>
                                  <span style={{ fontSize: '0.75rem', color: accent, fontWeight: 700 }}>⚠️ {label} 기준 검토 필요</span>
                                  <div style={{ fontSize: '0.7rem', color: '#78350f', marginTop: '2px' }}>누적 빈도 {s.count}회 · 최대 강도 {s.max_intensity || '-'}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
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
  const tierDist: any[] = (data as any)?.tier_distribution || [];
  const weeklyTrends: any[] = (data as any)?.weekly_trends || [];
  const safetyAlerts: any[] = (data as any)?.safety_alerts || [];
  const tier1Count = tierDist.find((t: any) => String(t.name).includes('Tier 1'))?.value || 0;
  const t2CandidateCount = riskList.filter((s: any) => s.tier === 'Tier 2').length;
  const t3CandidateCount = riskList.filter((s: any) => s.tier === 'Tier 3').length;

  return (
    <AuthCheck>
      <AppShell
        currentPage="dashboard"
        title={isAdmin() ? "📊 전교 PBST 종합 통계 대시보드" : "📊 학급 PBST 지원 대시보드"}
        subtitle={`${user?.class_name || user?.class_id || (isAdmin() ? "전교 통합" : "담임")} · ${startDate} ~ ${endDate} 기준`}
        headerActions={
          <button
            onClick={() => window.print()}
            className="btn btn-secondary no-print"
          >
            📄 PDF 내보내기
          </button>
        }
      >
        {loading && !data && (
          <div className="card" style={{ padding: "60px", textAlign: "center", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px", animation: "spin 2s linear infinite" }}>📀</div>
            <p style={{ fontWeight: 700, fontSize: "1.05rem" }}>심층 분석 데이터를 구성하고 있습니다...</p>
          </div>
        )}

        {fetchError && (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--tier3)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>⚠️</div>
            <p style={{ fontWeight: 800 }}>{fetchError}</p>
            <button onClick={() => window.location.reload()} className="btn btn-primary" style={{ marginTop: "16px" }}>다시 시도</button>
          </div>
        )}

        {data && (
          <div style={{ position: "relative" }}>
            <style jsx global>{`
              @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
              .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; }
              .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
              @media (max-width: 1400px) { .grid-4 { grid-template-columns: repeat(2, 1fr); } }
              @media (max-width: 768px) { .grid-2, .grid-4 { grid-template-columns: 1fr; } }
              .section-heading { font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin: 24px 0 12px 0; display: flex; align-items: center; gap: 8px; }
              .section-heading::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
            `}</style>

            {/* ===== Compact KPI Cards Strip ===== */}
            <div className="kpi-grid kpi-grid-8">
              <div className="kpi-card">
                <div className="kpi-label">
                  <span>총 행동기록 건수</span>
                  <span>📊</span>
                </div>
                <div className="kpi-value" style={{ color: "var(--primary-blue)" }}>{summary.total_incidents}건</div>
                <div className="kpi-subtext">분석 기간 내 누적 기록</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>평균 행동 강도</span>
                  <span>⚡</span>
                </div>
                <div className="kpi-value" style={{ color: (summary.avg_intensity || 0) >= 3.5 ? "var(--tier3)" : "var(--tier2)" }}>
                  {(summary.avg_intensity || 0).toFixed(1)} <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 500 }}>/ 5</span>
                </div>
                <div className="kpi-subtext">강도 4~5 위기행동 주의</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>Tier 2/3 중점 지원군</span>
                  <span>🚨</span>
                </div>
                <div className="kpi-value" style={{ color: "var(--tier3)" }}>
                  {isAdmin() ? summary.risk_student_count : riskList.length}명
                </div>
                <div className="kpi-subtext">집중 중재 및 모니터링 대상</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>등록 재학생 수</span>
                  <span>🏫</span>
                </div>
                <div className="kpi-value" style={{ color: "var(--text-primary)" }}>
                  {summary.enrolled_count || 35}명
                </div>
                <div className="kpi-subtext">전교 긍정적 행동지원 대상</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>Tier 1 (보편) 학생</span>
                  <span>🟢</span>
                </div>
                <div className="kpi-value" style={{ color: "var(--tier1)" }}>{tier1Count}명</div>
                <div className="kpi-subtext">보편적 지원 단계</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>T2 상향 검토</span>
                  <span>🟠</span>
                </div>
                <div className="kpi-value" style={{ color: "var(--tier2)" }}>{t2CandidateCount}명</div>
                <div className="kpi-subtext">Tier1→2 상향 검토 대상</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>T3 상향 검토</span>
                  <span>🔴</span>
                </div>
                <div className="kpi-value" style={{ color: "var(--tier3)" }}>{t3CandidateCount}명</div>
                <div className="kpi-subtext">Tier2→3 상향 검토 대상</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>안전 경보 건수</span>
                  <span>🚨</span>
                </div>
                <div className="kpi-value" style={{ color: "var(--tier3)" }}>{safetyAlerts.length}건</div>
                <div className="kpi-subtext">물리적 제지/상해 관련 기록</div>
              </div>
            </div>

            {/* 8종 핵심 차트 (4열 2행) */}
            <div className="section-heading"><span>01</span> 행동 데이터 종합 분석</div>
            <div className="grid-4">
              <ChartBox title="🎯 지원 단계별 분포" description="전교생이 Tier1~3+ 중 어느 지원 단계에 얼마나 분포되어 있는지 보여줍니다.">
                <PieChart>
                  <Pie data={tierDist} cx="50%" cy="50%" outerRadius={110} innerRadius={70} paddingAngle={4} dataKey="value" stroke="none">
                    {tierDist.map((entry: any, index: number) => (
                      <Cell key={index} fill={TIER_COLORS[entry.name] || '#cbd5e1'} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} formatter={truncatedLegendFormatter} />
                </PieChart>
              </ChartBox>

              <WeeklyAnalysisChart
                data={weeklyTrends}
                title="주별 행동 발생 추이"
                color="#6366f1"
                yLabel="건수"
              />

              <ChartBox
                title="⏰ 시간대별 분석"
                description="어느 시간대(교시)에 행동이 가장 많이 발생하는지 보여줍니다."
                action={<SectionAIButton sectionName="time" title="시간대" dataContext={big5.times || []} startDate={startDate} endDate={endDate} />}
              >
                <BarChart data={[...(big5.times || [])].slice(0, 8)} layout="vertical" margin={{ right: 40 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={70} axisLine={false} tickLine={false} tick={<TruncatedYAxisTick />} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="건수" radius={[0, 8, 8, 0]} fill="#8b5cf6" barSize={14}>
                      <LabelList dataKey="value" position="right" style={{ fontSize: 10, fontWeight: 800, fill: '#8b5cf6' }} formatter={(v:any)=>`${v}건`} />
                  </Bar>
                </BarChart>
              </ChartBox>

              <ChartBox
                title="📍 장소별 분석"
                description="어느 장소에서 행동이 가장 많이 발생하는지 보여줍니다."
                action={<SectionAIButton sectionName="location" title="장소별" dataContext={big5.locations || []} startDate={startDate} endDate={endDate} />}
              >
                <BarChart data={[...(big5.locations || [])].sort((a,b)=>b.value-a.value).slice(0, 6)} layout="vertical" margin={{ right: 40 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={70} axisLine={false} tickLine={false} tick={<TruncatedYAxisTick />} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="건수" radius={[0, 8, 8, 0]} fill="#6366f1" barSize={14}>
                      <LabelList dataKey="value" position="right" style={{ fontSize: 10, fontWeight: 800, fill: '#6366f1' }} formatter={(v:any)=>`${v}건`} />
                  </Bar>
                </BarChart>
              </ChartBox>

              <ChartBox
                title="🎭 행동 유형별 프로필"
                description="공격/자해/방해 등 행동 유형별 발생 비중을 보여줍니다."
                action={<SectionAIButton sectionName="type" title="행동유형별" dataContext={big5.behaviors || []} startDate={startDate} endDate={endDate} />}
              >
                <PieChart>
                  <Pie data={big5.behaviors || []} cx="50%" cy="50%" outerRadius={105} innerRadius={0} dataKey="value" stroke="#fff" strokeWidth={3}>
                    {(big5.behaviors || []).map((_, i) => <Cell key={i} fill={['#6366f1','#8b5cf6','#d946ef','#f43f5e','#f97316','#f59e0b'][i%6]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} formatter={truncatedLegendFormatter} />
                </PieChart>
              </ChartBox>

              <ChartBox
                title="❓ 행동의 기능 분석"
                description="행동이 관심추구/회피/감각 등 어떤 기능(이유) 때문에 나타나는지 보여줍니다."
                action={<SectionAIButton sectionName="function" title="추정기능" dataContext={(data as any).functions || []} startDate={startDate} endDate={endDate} />}
              >
                <PieChart>
                  <Pie data={(data as any).functions || []} cx="50%" cy="50%" outerRadius={95} innerRadius={60} dataKey="value">
                      {((data as any).functions || []).map((_: unknown, i: number) => <Cell key={i} fill={['#10b981','#3b82f6','#f59e0b','#ef4444'][i%4]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} formatter={truncatedLegendFormatter} />
                </PieChart>
              </ChartBox>

              <ChartBox
                title="⚡ 행동 강도 분포"
                description="강도 1~5 단계별로 행동이 몇 건씩 발생했는지 보여줍니다."
                action={<SectionAIButton sectionName="intensity" title="강도/위기" dataContext={(data as any).intensity_distribution || []} startDate={startDate} endDate={endDate} />}
              >
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

              <ChartBox title="⏰ 심각도 시계열 분석" description="시간이 지나면서 평균 행동 강도가 개선되는지 악화되는지 추이를 보여줍니다.">
                <LineChart data={(data as any).intensity_trend || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 5]} hide />
                  <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={4} dot={{ r: 6, fill: '#fa3f5e', stroke: '#fff', strokeWidth: 3 }} />
                  <Tooltip content={<CustomTooltip />} />
                </LineChart>
              </ChartBox>
            </div>

            {/* Tier 상향 검토 대상자 명단 (2열 1행) */}
            <div className="section-heading"><span>02</span> Tier 상향 검토 대상자 명단</div>
            <div className="grid-2">
              <TierUpgradeList riskList={riskList} startDate={startDate} endDate={endDate} targetTier="Tier 2" label="T2 상향 검토 대상자" accent="#f59e0b" />
              <TierUpgradeList riskList={riskList} startDate={startDate} endDate={endDate} targetTier="Tier 3" label="T3 상향 검토 대상자" accent="#ef4444" />
            </div>

            {/* 협의 내용 기록 (1열 1행) */}
            <div className="section-heading"><span>03</span> 협의 내용 기록</div>
            <MeetingNotesContainer title="협의 내용 기록" type="tier1" />

            {/* AI 협의록 자동 생성 (1열 1행) */}
            <div className="section-heading"><span>04</span> 학교행동중재지원팀 협의록 자동 생성</div>
            <TeamMeetingMinutesCard startDate={startDate} endDate={endDate} />
          </div>
        )}
      </AppShell>
    </AuthCheck>
  );
}

// ====== 학교행동중재지원팀 협의록 AI 자동 생성 카드 (협의일/대상기간 선택 → 생성 → 즉시 수기 편집) ======
function TeamMeetingMinutesCard({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [periodStart, setPeriodStart] = useState(startDate);
  const [periodEnd, setPeriodEnd] = useState(endDate);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    if (!periodStart || !periodEnd) {
      alert("대상 기간을 선택해주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-meeting-minutes`, {
        start_date: periodStart,
        end_date: periodEnd,
        context_start_date: `${new Date().getFullYear()}-01-01`,
        context_end_date: periodEnd
      }, { timeout: 180000 });
      setResult(res.data.analysis || "");
    } catch (e: any) {
      alert("협의록 생성 실패: " + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result.trim()) return;
    setSaving(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
        meeting_type: "tier1",
        date: meetingDate,
        content: result,
        author: "PBS Coordinator",
        period_start: periodStart,
        period_end: periodEnd
      });
      alert("협의록이 저장되었습니다.");
    } catch (e: any) {
      alert("저장 실패: " + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>📅 협의일</div>
          <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} className="form-input" />
        </div>
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>📊 대상 기간</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="form-input" />
            <span style={{ color: 'var(--text-muted)' }}>~</span>
            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="form-input" />
          </div>
        </div>
        <button onClick={handleGenerate} disabled={loading} className="btn btn-ai" style={{ padding: '10px 22px', fontSize: '0.88rem' }}>
          {loading ? "협의록 생성 중..." : "🤖 AI 협의록 자동 생성"}
        </button>
        {result && (
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ padding: '10px 22px', fontSize: '0.88rem' }}>
            {saving ? "저장 중..." : "💾 시트에 저장"}
          </button>
        )}
      </div>

      {result ? (
        <textarea
          value={result}
          onChange={e => setResult(e.target.value)}
          style={{
            width: '100%', minHeight: '360px', padding: '18px',
            borderRadius: '12px', border: '1px solid var(--border-subtle)',
            background: 'var(--bg-subtle)', color: 'var(--text-primary)',
            fontSize: '0.9rem', lineHeight: 1.8, fontFamily: 'inherit',
            whiteSpace: 'pre-wrap', boxSizing: 'border-box'
          }}
        />
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🤝</div>
          <div className="empty-state-title">협의일과 대상 기간을 선택하고 AI 협의록을 생성해보세요</div>
          <div className="empty-state-text">생성 후에는 이 칸에서 바로 수기로 수정한 뒤 저장할 수 있습니다.</div>
        </div>
      )}
    </div>
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
        } catch (e: any) {
            const errorMsg = e.response?.data?.detail || e.message || "알 수 없는 오류";
            alert("저장 실패: " + errorMsg);
        } finally { setLoading(false); }
    };

    const handleUpdate = async (id: string) => {
        try {
             await axios.patch(`${apiUrl}/api/v1/meeting-notes/${id}`, {
                 content: editContent,
                 user_id: user?.id || "Teacher",
                 role: isAdmin() ? "admin" : "teacher"
             });
             setEditingId(null);
             fetchNotes();
        } catch (e: any) {
            const errorMsg = e.response?.data?.detail || e.message || "알 수 없는 오류";
            alert("수정 실패: " + errorMsg);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("삭제하시겠습니까?")) return;
        try {
             await axios.delete(`${apiUrl}/api/v1/meeting-notes/${id}`, {
                 params: {
                     user_id: user?.id || "Teacher",
                     role: isAdmin() ? "admin" : "teacher"
                 }
             });
             fetchNotes();
        } catch (e: any) {
            const errorMsg = e.response?.data?.detail || e.message || "알 수 없는 오류";
            alert("삭제 실패: " + errorMsg);
        }
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
                                        <button onClick={()=>{setEditingId(n.id); setEditContent(n.content);}} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}>수정</button>
                                        <button onClick={()=>handleDelete(n.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}>삭제</button>
                                    </>
                                )}
                            </div>
                        </div>
                        {editingId === n.id ? (
                            <div>
                                <textarea value={editContent} onChange={e=>setEditContent(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #6366f1', fontSize: '0.9rem' }} />
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    <button onClick={()=>handleUpdate(n.id)} style={{ padding: '4px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>저장</button>
                                    <button onClick={()=>setEditingId(null)} style={{ padding: '4px 12px', background: '#94a3b8', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>취소</button>
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
