"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { maskName } from "../utils";
import { API_BASE_URL } from "@/app/lib/api";
import { ChartCard, Kpi } from "../cico/CicoDashboard";
import { OUTCOME_COLORS } from "../cico/CicoAnnual";

// Tier3 연간 성과(업무담당자용): 월별 인원·위기행동, 학생별 위기행동 흐름, 끝난 학생의 행선지
interface Trend { month: number; tier3: number; tier3plus: number; new: number | null; ended: number | null; up: number | null; down: number | null; crisis_total: number; crisis_avg: number | null; }
interface Stu { code: string; name: string; class: string; months: number[]; levels: Record<string, string>; crisis: Record<string, number>; first: number | null; last: number | null; outcome: string; }
interface Annual { year: number; months: number[]; trend: Trend[]; students: Stu[];
  summary: { total_students: number; avg_months: number | null; outcomes: Record<string, number>; improved: number; comparable: number; year_crisis_total: number } }

function crisisColor(v: number) {
  if (v === 0) return { background: "#dcfce7", color: "#166534" };
  if (v <= 3) return { background: "#fef9c3", color: "#854d0e" };
  if (v <= 7) return { background: "#fed7aa", color: "#9a3412" };
  return { background: "#fecaca", color: "#991b1b" };
}

export default function Tier3Annual() {
  const [data, setData] = useState<Annual | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/tier3-monthly/annual`, { timeout: 120000 }).then(r => setData(r.data))
      .catch(e => setErr(e?.response?.data?.detail || e.message));
  }, []);
  if (err) return <div className="card" style={{ padding: 30, color: "#ef4444" }}>⚠ 연간 성과를 불러오지 못했습니다: {err}</div>;
  if (!data) return <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>학년도 Tier3 자료를 모으는 중...</div>;

  const s = data.summary;
  const chart = data.trend.map(t => ({ label: `${t.month}월`, Tier3: t.tier3, "Tier3+": t.tier3plus, 평균: t.crisis_avg, 신규: t.new ?? 0, 종료: t.ended ?? 0 }));
  const outcomes = Object.entries(s.outcomes).map(([name, value]) => ({ name, value }));
  const first = data.trend.find(t => t.crisis_avg != null)?.crisis_avg;
  const last = [...data.trend].reverse().find(t => t.crisis_avg != null)?.crisis_avg;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Kpi label={`${data.year}학년도 지원 학생`} value={s.total_students} unit="명" color="#ef4444" hint="한 번이라도 Tier3·Tier3+였던 학생" />
        <Kpi label="평균 지원 기간" value={s.avg_months ?? "-"} unit="개월" color="#6366f1" />
        <Kpi label="위기행동 기록(연간)" value={s.year_crisis_total} unit="건" color="#f97316" hint="그 달 Tier3 학생의 기록 합" />
        <Kpi label="1인당 월 평균" value={first != null && last != null ? `${first}→${last}` : "-"} unit="건" color={last != null && first != null && last < first ? "#10b981" : "#ef4444"} hint="학년도 첫 달 → 이번 달" />
        <Kpi label="개선 학생" value={`${s.improved}/${s.comparable}`} unit="명" color="#10b981" hint="지원 첫 달보다 마지막 달 기록이 적은 학생(2개월 이상 지원)" />
        <Kpi label="단계 하향" value={(s.outcomes["CICO 하향"] || 0) + (s.outcomes["SST 하향"] || 0) + (s.outcomes["Tier1 복귀"] || 0)} unit="명" color="#10b981" hint="Tier3가 끝난 다음 달 CICO·SST·Tier1" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <ChartCard title="📈 월별 인원과 1인당 위기행동">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="n" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="n" dataKey="Tier3" stackId="a" fill="#fca5a5" name="Tier3(명)" />
              <Bar yAxisId="n" dataKey="Tier3+" stackId="a" fill="#7f1d1d" name="Tier3+(명)" />
              <Line yAxisId="c" dataKey="평균" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} connectNulls name="1인당 위기행동(건)" />
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
              <Bar dataKey="신규" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="종료" fill="#10b981" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
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
        <div style={{ fontWeight: 800, marginBottom: 8 }}>👥 학생별 월 위기행동 기록 <span style={{ fontWeight: 500, fontSize: "0.72rem", color: "#94a3b8" }}>· 굵은 칸이 Tier3 대상인 달(+는 Tier3+)</span></div>
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
                  <td style={td}><strong>{maskName(st.name) || st.code}</strong> <span style={{ color: "#94a3b8" }}>{st.class}</span></td>
                  {data.months.map(m => {
                    const inM = st.months.includes(m);
                    const v = st.crisis[String(m)] ?? 0;
                    return (
                      <td key={m} style={{ ...td, textAlign: "center", ...(inM ? { ...crisisColor(v), fontWeight: 800 } : { color: "#cbd5e1" }) }}>
                        {v}{inM && st.levels[String(m)] === "Tier3+" ? "+" : ""}
                      </td>
                    );
                  })}
                  <td style={td}>
                    {st.first != null && st.last != null ? (
                      <span style={{ color: st.last < st.first ? "#16a34a" : st.last > st.first ? "#dc2626" : "#64748b", fontWeight: 700 }}>{st.first}→{st.last}건</span>
                    ) : "-"}
                  </td>
                  <td style={td}><span style={{ color: OUTCOME_COLORS[st.outcome] || "#64748b", fontWeight: 700 }}>{st.outcome}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 6 }}>※ 초록 0건 · 노랑 1~3건 · 주황 4~7건 · 빨강 8건 이상(Log_Main 기록 건수). 흐린 숫자는 Tier3가 아니던 달입니다. 결과는 Tier3가 끝난 다음 달 월별 표 기준입니다.</p>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "5px 8px", whiteSpace: "nowrap" };
