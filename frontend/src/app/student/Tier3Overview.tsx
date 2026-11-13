"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { WeeklyTrendChart, ChangeBanner } from "../components/ProgressCharts";
import { withoutVacation, schoolYearStart } from "../lib/progress";
import { useAuth } from "../components/AuthProvider";
import { maskName, formatWeek } from "../utils";
import { API_BASE_URL } from "@/app/lib/api";

interface BehaviorType { name: string; value: number; }
interface WeeklyTrend { week: string; count: number; }

interface Tier3Student {
  code: string; name: string; class: string; tier: string; beable_code: string; memo: string;
  incidents: number; max_intensity: number; avg_intensity: number;
  behavior_types: BehaviorType[]; weekly_trend: WeeklyTrend[];
  weekly_trend_freq?: WeeklyTrend[];
  decision: string; decision_color: string;
  zero_week_alert?: boolean; zero_weeks_count?: number;
}

interface Tier3ReportData {
  students: Tier3Student[];
  summary: {
    total_students: number;
    total_incidents: number;
    avg_intensity: number;
    weekly_trend?: WeeklyTrend[];
  };
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

export default function Tier3Overview() {
  const { user, isAdmin } = useAuth();
  // 기본 기간: 그 학년도 3월 1일 ~ 오늘(날짜 필터와 무관하게 고정)
  const endDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const startDate = schoolYearStart(endDate);
  const [data, setData] = useState<Tier3ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (startDate && endDate) { params.append("start_date", startDate); params.append("end_date", endDate); }
      if (!isAdmin() && user?.class_id) params.append("class_id", user.class_id);
      const qs = params.toString();
      const res = await axios.get(`${API_BASE_URL}/api/v1/analytics/tier3-report${qs ? `?${qs}` : ""}`, { timeout: 30000 });
      setData(res.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) && err.code === "ECONNABORTED" ? "응답 시간이 초과되었습니다. 날짜 범위를 좁혀 다시 시도해주세요." : "Tier3 현황을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, [startDate, endDate, user?.class_id, isAdmin]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // 서버가 비관리자에게는 자기 학급 학생만 내려 준다.
  const students = data?.students || [];
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>🚨 Tier3 학생 현황 <span style={{ fontWeight: 500, color: "#64748b", fontSize: "0.8rem" }}>{startDate && endDate ? `${startDate} ~ ${endDate}` : ""}</span></h2>
        <button onClick={fetchData} className="btn btn-secondary">🔄 새로고침</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <span style={{ color: "#64748b", fontSize: "0.75rem", alignSelf: "center", fontWeight: 600 }}>의사결정 기준:</span>
        {DECISION_OPTIONS.map(opt => (
          <span key={opt.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.7rem", color: opt.color, background: `${opt.color}15`, padding: "3px 8px", borderRadius: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: opt.color }} />{opt.label}
          </span>
        ))}
      </div>
      {loading && <div className="card" style={{ padding: 20 }}>⏳ Tier3 학생 자료를 불러오는 중...</div>}
      {error && <div className="card" style={{ padding: 16, background: "#fef2f2", color: "#dc2626" }}>⚠️ {error}</div>}
      {!loading && !error && (students.length === 0
        ? <div className="card" style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Tier3 대상 학생이 없습니다.</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{students.map(s => <StudentFBAFrame key={s.code} student={s} />)}</div>)}
    </section>
  );
}

// ====== 학생별 FBA 요약 프레임 (트리아지 전용 — BIP 작성/수정은 통합 페이지로 이동) ======
function StudentFBAFrame({ student: s }: { student: Tier3Student }) {
  const getIntensityColor = (i: number) => i >= 5 ? "#ef4444" : i >= 3 ? "#f59e0b" : "#22c55e";
  const maxIncidents = Math.max(s.incidents, 1);

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
      {/* Frame header */}
      <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #fef2f2, #fff)', borderBottom: '2px solid #fecdd3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700, color: s.tier === "Tier3+" ? "#7c3aed" : "#ef4444", background: s.tier === "Tier3+" ? "#7c3aed15" : "#ef444415" }}>{s.tier}</span>
          <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{maskName(s.name) || s.code}</strong>
          <span style={{ color: '#64748b', fontSize: '0.78rem' }}>{s.code} · {s.class}</span>
          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 600, color: s.decision_color, background: `${s.decision_color}12`, border: `1px solid ${s.decision_color}30` }}>{s.decision}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => window.location.href = `/student/${encodeURIComponent(s.code)}`} style={{ padding: "5px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>개별 대시보드</button>
        </div>
      </div>

      <div style={{ padding: '18px 20px' }}>
        {/* 3 FBA trend charts + BIP CTA (4-col) — AI 초안생성/EBP선택/위기절차/협의기록/DBDM 편집기는
            행동중재 작성은 /target-behavior 에서 한다. */}
        <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <div style={{ background: '#fafafa', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '10px', color: '#0f172a' }}>📈 주간 발생빈도 추이 <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "0.7rem" }}>(굵은 선 = 4주 평균)</span></div>
            {s.weekly_trend_freq && s.weekly_trend_freq.length > 0 ? (
              <>
                <ChangeBanner weekly={withoutVacation(s.weekly_trend_freq)} />
                <div style={{ marginTop: 8 }}><WeeklyTrendChart weekly={s.weekly_trend_freq} height={170} weekLabel={formatWeek} /></div>
              </>
            ) : <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '20px 0' }}>데이터 없음</p>}
          </div>

          <div style={{ background: '#fafafa', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '10px', color: '#0f172a' }}>🎭 행동 유형 분포</div>
            {s.behavior_types.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={s.behavior_types.map(b => ({ ...b, name: b.name.split(':')[0] }))} cx="50%" cy="50%" outerRadius={55} innerRadius={30} paddingAngle={3} dataKey="value">
                    {s.behavior_types.map((_: any, idx: number) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v}건`, '']} />
                  <Legend wrapperStyle={{ fontSize: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '20px 0' }}>데이터 없음</p>}
          </div>

          <div style={{ background: '#fafafa', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '10px', color: '#0f172a' }}>⚡ 행동 강도 정보</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
              {[
                { label: '최대 강도', val: s.max_intensity, max: 5 },
                { label: '평균 강도', val: s.avg_intensity, max: 5 },
                { label: '보고 건수', val: s.incidents, max: maxIncidents },
              ].map((item, idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '3px' }}>
                    <span style={{ color: '#64748b' }}>{item.label}</span>
                    <span style={{ fontWeight: 700, color: getIntensityColor(item.val) }}>{item.val}{idx < 2 ? '/5' : '건'}</span>
                  </div>
                  <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (item.val / item.max) * 100)}%`, height: '100%', background: idx === 2 ? '#ef4444' : getIntensityColor(item.val), borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #faf5ff, #fff)', borderRadius: '12px', padding: '14px', border: '1px solid #ddd5f5', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 8 }}>
            <div style={{ fontSize: '1.4rem' }}>🧩</div>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#7c3aed' }}>FBA 보고서·BIP·모니터링·의사결정·의뢰서는 개별학생 행동중재 화면에서 이어서 작성합니다</div>
            <button
              onClick={() => window.location.href = `/target-behavior?student=${encodeURIComponent(s.code)}`}
              style={{ marginTop: 4, padding: '8px 14px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}
            >
              행동중재 화면 열기 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

