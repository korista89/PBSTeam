"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { maskName } from "../utils";
import { API_BASE_URL } from "@/app/lib/api";
import { ChartCard, Empty, Kpi } from "./CicoDashboard";

// CICO 연간 성과(업무담당자용): 학년도 월별 추이, 학생별 수행률 흐름, 종료 후 행선지
interface Trend { month: number; students: number; goals: number; new: number | null; ended: number | null; avg_rate: number | null; achieved_pct: number | null; decisions: Record<string, number>; }
interface Stu { code: string; name: string; class: string; months: number[]; rates: Record<string, number | null>; first: number | null; last: number | null; outcome: string; }
interface Annual { year: number; months: number[]; trend: Trend[]; students: Stu[];
  summary: { total_students: number; avg_months: number | null; outcomes: Record<string, number>; year_avg_rate: number | null; year_achieved_pct: number | null } }

export const OUTCOME_COLORS: Record<string, string> = {
  "지원 중": "#3b82f6", "Tier1 복귀": "#10b981", "Tier3 상향": "#ef4444", "SST만 지속": "#8b5cf6", "CICO 하향": "#f59e0b", "SST 하향": "#8b5cf6",
};
export const cleanName = (n: string) => maskName((n || "").replace(/\(\d+\)\s*$/, ""));
export function rateColor(v: number | null | undefined) {
  if (v == null) return { background: "#f8fafc", color: "#cbd5e1" };
  if (v >= 80) return { background: "#dcfce7", color: "#166534" };
  if (v >= 50) return { background: "#fef9c3", color: "#854d0e" };
  return { background: "#fee2e2", color: "#991b1b" };
}

export default function CicoAnnual() {
  const [data, setData] = useState<Annual | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/cico/annual`, { timeout: 120000 }).then(r => setData(r.data))
      .catch(e => setErr(e?.response?.data?.detail || e.message));
  }, []);
  if (err) return <div className="card" style={{ padding: 30, color: "#ef4444" }}>⚠ 대시보드를 불러오지 못했습니다: {err}</div>;
  if (!data) return <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>학년도 CICO 자료를 모으는 중... (달마다 계산해 조금 걸립니다)</div>;

  const s = data.summary;
  const chart = data.trend.map(t => ({ label: `${t.month}월`, 대상: t.students, 신규: t.new ?? 0, 종료: t.ended ?? 0, 수행률: t.avg_rate, 달성비율: t.achieved_pct }));
  const outcomes = Object.entries(s.outcomes).map(([name, value]) => ({ name, value }));
  const decisionNames = [...new Set(data.trend.flatMap(t => Object.keys(t.decisions)))];
  const decColors: Record<string, string> = { "Tier1 하향": "#10b981", "양호": "#3b82f6", "병행": "#8b5cf6", "수정 검토": "#f59e0b", "Tier3 상향": "#ef4444", "기록 부족": "#94a3b8" };
  const decColor = (d: string) => Object.entries(decColors).find(([k]) => d.includes(k))?.[1] || "#64748b";
  const decChart = data.trend.map(t => ({ label: `${t.month}월`, ...t.decisions }));
  const ended = s.outcomes["Tier1 복귀"] || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Kpi label={`${data.year}학년도 지원 학생`} value={s.total_students} unit="명" color="#3b82f6" hint="한 번이라도 CICO 대상이었던 학생" />
        <Kpi label="평균 지원 기간" value={s.avg_months ?? "-"} unit="개월" color="#6366f1" />
        <Kpi label="연평균 수행률" value={s.year_avg_rate ?? "-"} unit="%" color="#0ea5e9" hint="달마다 목표 줄 평균의 평균" />
        <Kpi label="연평균 목표 달성 비율" value={s.year_achieved_pct ?? "-"} unit="%" color="#10b981" hint="기록 있는 목표 줄 중 달성(O)" />
        <Kpi label="Tier1 복귀" value={ended} unit="명" color="#10b981" hint="CICO가 끝난 다음 달 어떤 단계에도 없음" />
        <Kpi label="Tier3 상향" value={s.outcomes["Tier3 상향"] || 0} unit="명" color="#ef4444" hint="CICO가 끝난 다음 달 Tier3 명단" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <ChartCard title="📈 월별 대상 학생과 수행률">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="n" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="p" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="n" dataKey="대상" fill="#bfdbfe" name="대상 학생(명)" />
              <Line yAxisId="p" dataKey="수행률" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls name="평균 수행률(%)" />
              <Line yAxisId="p" dataKey="달성비율" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls name="목표 달성 비율(%)" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="🔁 월별 신규·종료">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, n: string) => [`${v}명`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="신규" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="종료" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="🧭 월별 판정 분포 (목표 줄)">
          {decisionNames.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={decChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {decisionNames.map(d => <Bar key={d} dataKey={d} stackId="d" fill={decColor(d)} />)}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="🚪 학생별 결과 (지금 기준)">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={outcomes} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} label={({ value }) => `${value}`}>
                {outcomes.map(o => <Cell key={o.name} fill={OUTCOME_COLORS[o.name] || "#64748b"} />)}
              </Pie>
              <Tooltip formatter={(v: number, n: string) => [`${v}명`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>👥 학생별 월 수행률 <span style={{ fontWeight: 500, fontSize: "0.72rem", color: "#94a3b8" }}>· 목표가 여러 개면 평균, 빈칸은 대상 아님 또는 기록 없음</span></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", color: "#475569" }}>
                <th style={th}>학생</th>
                {data.months.map(m => <th key={m} style={{ ...th, textAlign: "center" }}>{m}월</th>)}
                <th style={th}>처음→마지막</th><th style={th}>결과</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map(st => (
                <tr key={st.code} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={td}><strong>{cleanName(st.name) || st.code}</strong> <span style={{ color: "#94a3b8" }}>{st.class}</span></td>
                  {data.months.map(m => {
                    const inM = st.months.includes(m);
                    const v = st.rates[String(m)];
                    return <td key={m} style={{ ...td, textAlign: "center", ...(inM ? rateColor(v) : { background: "#fff" }) }}>{inM ? (v != null ? Math.round(v) : "·") : ""}</td>;
                  })}
                  <td style={td}>
                    {st.first != null && st.last != null ? (
                      <span style={{ color: st.last > st.first ? "#16a34a" : st.last < st.first ? "#dc2626" : "#64748b", fontWeight: 700 }}>
                        {Math.round(st.first)}→{Math.round(st.last)}%
                      </span>
                    ) : "-"}
                  </td>
                  <td style={td}><span style={{ color: OUTCOME_COLORS[st.outcome] || "#64748b", fontWeight: 700 }}>{st.outcome}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 6 }}>※ 초록 80% 이상 · 노랑 50~79% · 빨강 50% 미만 · ‘·’ 대상이었지만 기록 없음. 결과는 CICO가 끝난 다음 달 월별 표 기준입니다.</p>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "5px 8px", whiteSpace: "nowrap" };
