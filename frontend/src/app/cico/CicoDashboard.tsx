"use client";

import React, { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { maskName } from "../utils";

// CICO 관리 탭 상단 대시보드: 이 달 대상 현황 숫자 + 월별 추이·학급별·판정 분포 차트
export interface DashTarget { code: string; class: string; active: boolean; target_behavior: string; record_count: number; }
export interface DashDecision { code: string; decision: string; decision_color: string; }

const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const C = { keep: "#3b82f6", fresh: "#10b981", ended: "#ef4444", muted: "#94a3b8" };
const DECISION_COLORS: Record<string, string> = {
  "Tier1 하향": "#10b981", "양호": "#3b82f6", "병행": "#8b5cf6", "수정 검토": "#f59e0b", "Tier3 상향": "#ef4444", "기록 부족": "#94a3b8",
};

export default function CicoDashboard({ month, targets, history, names, decisions }: {
  month: number;
  targets: DashTarget[];
  history: Record<string, string[]>;
  names: Record<string, { name: string; class: string }>;
  decisions: DashDecision[];
}) {
  const stats = useMemo(() => {
    const setOf = (m: number) => new Set(history[String(m)] || []);
    const cur = setOf(month);
    const prev = month > 3 ? setOf(month - 1) : null;
    const active = targets.filter(t => t.active);
    return {
      students: cur.size,
      goals: active.length,
      fresh: prev ? [...cur].filter(c => !prev.has(c)) : [],
      ended: prev ? [...prev].filter(c => !cur.has(c)) : [],
      released: targets.filter(t => !t.active).length,
      unset: active.filter(t => !t.target_behavior.trim()).length,
      noRecord: active.filter(t => t.record_count === 0).length,
      hasPrev: !!prev,
    };
  }, [month, targets, history]);

  // 월별 추이: 기록이 있는 달만, 이전 달 대비 계속·신규·종료
  const trend = useMemo(() => MONTHS.filter(m => history[String(m)]?.length).map(m => {
    const cur = new Set(history[String(m)]);
    const prev = new Set(history[String(m - 1)] || []);
    const first = m === 3 || !history[String(m - 1)]?.length;
    const fresh = first ? 0 : [...cur].filter(c => !prev.has(c)).length;
    return {
      month: `${m}월`,
      계속: cur.size - fresh,
      신규: fresh,
      종료: first ? 0 : [...prev].filter(c => !cur.has(c)).length,
    };
  }), [history]);

  const byClass = useMemo(() => {
    const map = new Map<string, Set<string>>();
    targets.filter(t => t.active).forEach(t => {
      const k = t.class || "미지정";
      map.set(k, (map.get(k) || new Set()).add(t.code));
    });
    return [...map.entries()].map(([cls, s]) => ({ cls, 학생: s.size })).sort((a, b) => a.cls.localeCompare(b.cls));
  }, [targets]);

  const byDecision = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    decisions.forEach(d => {
      // 서버 판정색은 유지·병행·기록부족이 모두 파랑이라 원그래프에서 구분되도록 따로 칠한다
      const color = Object.entries(DECISION_COLORS).find(([k]) => d.decision.includes(k))?.[1] || d.decision_color;
      const e = map.get(d.decision) || { name: d.decision, value: 0, color };
      e.value += 1;
      map.set(d.decision, e);
    });
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [decisions]);

  const label = (c: string) => `${maskName(names[c]?.name || "") || c}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Kpi label="대상 학생" value={stats.students} unit="명" color={C.keep} />
        <Kpi label="목표 줄" value={stats.goals} unit="줄" color="#6366f1" hint="학생 1명이 목표 여러 개면 여러 줄" />
        <Kpi label="신규" value={stats.hasPrev ? stats.fresh.length : "-"} unit={stats.hasPrev ? "명" : ""} color={C.fresh} hint={stats.hasPrev ? `${month - 1}월에 없던 학생` : "3월은 학년도 첫 달"} />
        <Kpi label="종료" value={stats.hasPrev ? stats.ended.length : "-"} unit={stats.hasPrev ? "명" : ""} color={C.ended} hint={stats.hasPrev ? `${month - 1}월에 있다 빠진 학생` : "3월은 학년도 첫 달"} />
        <Kpi label="이 달 해제 줄" value={stats.released} unit="줄" color={C.muted} hint="대상 해제한 목표 줄" />
        <Kpi label="목표 미설정" value={stats.unset} unit="줄" color={stats.unset ? "#f59e0b" : C.muted} hint="목표행동이 빈 줄" />
        <Kpi label="기록 없음" value={stats.noRecord} unit="줄" color={stats.noRecord ? "#f59e0b" : C.muted} hint="이 달 기록이 하루도 없는 줄" />
      </div>

      {stats.hasPrev && (stats.fresh.length > 0 || stats.ended.length > 0) && (
        <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, fontSize: "0.8rem" }}>
          {stats.fresh.length > 0 && <ChipRow title="🟢 신규" color={C.fresh} items={stats.fresh.map(label)} />}
          {stats.ended.length > 0 && <ChipRow title="🔴 종료" color={C.ended} items={stats.ended.map(label)} />}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <ChartCard title="📈 월별 대상 학생 수 (계속·신규·종료)">
          {trend.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, n: string) => [`${v}명`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="계속" stackId="a" fill={C.keep} />
                <Bar dataKey="신규" stackId="a" fill={C.fresh} radius={[4, 4, 0, 0]} />
                <Line dataKey="종료" stroke={C.ended} strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`🏫 ${month}월 학급별 대상 학생`}>
          {byClass.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(160, byClass.length * 26 + 30)}>
              <BarChart data={byClass} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="cls" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}명`, "대상 학생"]} />
                <Bar dataKey="학생" fill={C.keep} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`🧭 ${month}월 CICO 판정 분포 (목표 줄)`}>
          {byDecision.length === 0 ? <Empty text="판정할 기록이 아직 없습니다." /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byDecision} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}
                  label={({ value }) => `${value}`}>
                  {byDecision.map(d => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [`${v}줄`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ label, value, unit, color, hint }: { label: string; value: number | string; unit: string; color: string; hint?: string }) {
  return (
    <div className="card" style={{ padding: "12px 14px", borderTop: `3px solid ${color}` }} title={hint}>
      <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 900, color }}>{value}<span style={{ fontSize: "0.8rem", marginLeft: 2 }}>{unit}</span></div>
      {hint && <div style={{ fontSize: "0.65rem", color: "#94a3b8" }}>{hint}</div>}
    </div>
  );
}

function ChipRow({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <strong style={{ color, minWidth: 56 }}>{title} {items.length}명</strong>
      {items.map((t, i) => <span key={i} style={{ padding: "2px 8px", borderRadius: 999, background: `${color}15`, color }}>{t}</span>)}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ text = "자료가 없습니다." }: { text?: string }) {
  return <p style={{ color: "#94a3b8", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>{text}</p>;
}
