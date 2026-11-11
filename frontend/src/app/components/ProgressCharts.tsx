"use client";

import React, { useMemo } from "react";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { baselineVsRecent, cumulative, movingAvg, intensityByMonth, BASE_WEEKS } from "../lib/progress";

const INK = "#0f172a", SUB = "#475569", MUTE = "#94a3b8";
const GOOD = "#16a34a", BAR = "#bfdbfe", LINE = "#1d4ed8";
const kd = (iso: string) => { const [, m, d] = iso.split("-"); return `${+m}. ${+d}.`; };

export type WeekRow = { week: string; count: number };

/** 변화를 한 줄로 알려주는 띠. 줄었으면 초록, 늘었으면 중립(숨기지 않고 그대로 표시). */
export function ChangeBanner({ weekly, unit = "건" }: { weekly: WeekRow[]; unit?: string }) {
  const r = useMemo(() => baselineVsRecent(weekly.map(w => w.count)), [weekly]);
  if (!r) return <p style={{ margin: "8px 0 0", fontSize: "0.82rem", color: MUTE }}>기록이 4주 이상 쌓이면 처음과 지금을 비교해 보여줍니다.</p>;
  const down = r.recent < r.base, same = r.recent === r.base;
  return (
    <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 12, background: down ? "#f0fdf4" : "#f8fafc", border: `1px solid ${down ? "#bbf7d0" : "#e2e8f0"}`, display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "baseline" }}>
      <span style={{ fontSize: "0.82rem", color: SUB }}>처음 {r.weeks}주 평균 <b style={{ color: INK }}>주 {r.base}{unit}</b></span>
      <span style={{ color: MUTE }}>→</span>
      <span style={{ fontSize: "0.82rem", color: SUB }}>최근 {r.weeks}주 평균 <b style={{ color: down ? GOOD : INK }}>주 {r.recent}{unit}</b></span>
      {r.pct !== null && !same && (
        <b style={{ fontSize: "1.05rem", color: down ? GOOD : SUB }}>{down ? "▼" : "▲"} {Math.abs(r.pct)}% {down ? "감소" : "증가"}</b>
      )}
      {same && <b style={{ fontSize: "0.95rem", color: SUB }}>변화 없음</b>}
    </div>
  );
}

/** 주별 건수(연한 막대) + 4주 이동평균(굵은 선) + 처음 4주 기준선(점선) + 중재 시작선. 축은 0부터. */
export function WeeklyTrendChart({ weekly, planStart, height = 260, intensity, weekLabel = kd }: {
  weekly: (WeekRow & { avg?: number | null })[]; planStart?: string; height?: number; intensity?: boolean; weekLabel?: (w: string) => string;
}) {
  const data = useMemo(() => {
    const ma = movingAvg(weekly.map(w => w.count), BASE_WEEKS);
    return weekly.map((w, i) => ({ ...w, ma: ma[i] }));
  }, [weekly]);
  const bl = useMemo(() => baselineVsRecent(weekly.map(w => w.count)), [weekly]);
  const planWeek = planStart && data.find(d => d.week >= planStart)?.week;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: intensity ? 8 : 12, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="week" tickFormatter={weekLabel} tick={{ fontSize: 11, fill: SUB }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis yAxisId="c" allowDecimals={false} domain={[0, (m: number) => Math.max(3, m)]} tick={{ fontSize: 11, fill: SUB }} axisLine={false} tickLine={false} />
          {intensity && <YAxis yAxisId="i" orientation="right" domain={[0, 5]} tick={{ fontSize: 11, fill: SUB }} axisLine={false} tickLine={false} />}
          <Tooltip
            labelFormatter={(l: any) => `${weekLabel(String(l))} 주`}
            formatter={(v: any, n: any) => [n === "ma" ? `${v}건` : n === "avg" ? v : `${v}건`, n === "ma" ? "4주 평균" : n === "avg" ? "평균 강도" : "그 주 건수"]}
          />
          {bl && <ReferenceLine yAxisId="c" y={bl.base} stroke={MUTE} strokeDasharray="5 4" label={{ value: `처음 ${bl.weeks}주 평균 ${bl.base}`, position: "insideTopRight", fontSize: 10, fill: SUB }} />}
          {planWeek && <ReferenceLine yAxisId="c" x={planWeek} stroke="#7c3aed" strokeDasharray="4 4" label={{ value: "중재 시작", position: "insideTopRight", fontSize: 10, fill: "#7c3aed" }} />}
          <Bar yAxisId="c" dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Line yAxisId="c" dataKey="ma" stroke={LINE} strokeWidth={3} dot={false} isAnimationActive={false} />
          {intensity && <Line yAxisId="i" dataKey="avg" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="2 3" dot={{ r: 2 }} connectNulls isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 누적 기록 곡선: 기울기가 완만해지면 발생 속도가 줄었다는 뜻이다(행동분석 표준 그래프). */
export function CumulativeChart({ weekly, height = 220 }: { weekly: WeekRow[]; height?: number }) {
  const data = useMemo(() => {
    const cum = cumulative(weekly.map(w => w.count));
    return weekly.map((w, i) => ({ week: w.week, cum: cum[i] }));
  }, [weekly]);
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="week" tickFormatter={kd} tick={{ fontSize: 11, fill: SUB }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis allowDecimals={false} domain={[0, "auto"]} tick={{ fontSize: 11, fill: SUB }} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={(l: any) => `${kd(String(l))} 주까지`} formatter={(v: any) => [`${v}건`, "누적"]} />
          <Area dataKey="cum" type="stepAfter" stroke={LINE} fill="#dbeafe" strokeWidth={2.5} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 월별 강도 구성(100%): 고강도 비율이 줄고 저강도 비율이 늘었는지 본다. 월 표본이 적으면 건수를 함께 보여준다. */
export function IntensityShiftChart({ rows, height = 220 }: { rows: { date: string; intensity: number | null }[]; height?: number }) {
  const data = useMemo(() => intensityByMonth(rows).map(m => ({ ...m, label: `${+m.month.slice(5)}월 (${m.n}건)` })), [rows]);
  if (data.length < 2) return <p style={{ color: MUTE, fontSize: "0.85rem", margin: "12px 0 0" }}>강도가 기록된 달이 2개월 이상 쌓이면 변화를 보여줍니다.</p>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: SUB }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: SUB }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: any, n: any) => [`${v}%`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="lowPct" name="약함(1~2)" stackId="s" fill="#86efac" isAnimationActive={false} />
          <Bar dataKey="midPct" name="보통(3)" stackId="s" fill="#fde68a" isAnimationActive={false} />
          <Bar dataKey="highPct" name="강함(4~5)" stackId="s" fill="#fca5a5" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
