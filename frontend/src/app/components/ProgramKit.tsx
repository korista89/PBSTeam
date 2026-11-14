"use client";

import React, { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { maskName } from "../utils";

// SST관리·Tier3+관리가 같이 쓰는 프로그램 부품: 폼, 효과 모니터링, 성과 요약 배지·비교 차트
export interface Program {
  id: number; name: string; type: string; start: number; end: number;
  targets: string[]; skills: string; staff: string; memo: string; agency?: string;
}
export type ProgramDraft = Omit<Program, "id"> & { id?: number };
export interface Student { 학생코드: string; 학생이름: string; 학급: string; 재학여부?: string; }
export interface Summary {
  id: number; name: string; start: number; end: number; targets?: string[];
  crisis_pre: number | null; crisis_during: number | null; crisis_change_pct: number | null;
  improved: number; worse: number; students: number;
  cico_pre: number | null; cico_during: number | null; cico_change: number | null; verdict: string;
}
interface MonitorMonth { month: number; phase: string; crisis_avg: number | null; intensity_avg: number | null; cico_avg: number | null; cico_n: number; }
export interface Monitor {
  program: Program; summary: Omit<Summary, "id" | "name" | "start" | "end">; months: MonitorMonth[];
  students: { code: string; name: string; class: string; crisis: Record<string, number>; intensity: Record<string, number | null>; cico: Record<string, number | null> }[];
}

export const SCHOOL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
export const idx = (m: number) => SCHOOL_MONTHS.indexOf(m);
export const nowMonth = () => new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;

export function statusOf(p: { start: number; end: number }) {
  const n = idx(nowMonth());
  if (n < idx(p.start)) return { label: "운영 예정", color: "#64748b" };
  if (n > idx(p.end)) return { label: "운영 종료", color: "#94a3b8" };
  return { label: "운영 중", color: "#10b981" };
}

export const VERDICT_COLORS: Record<string, string> = {
  "효과 있음": "#10b981", "소폭 개선": "#22c55e", "위기행동 없음 유지": "#10b981", "변화 없음": "#64748b",
  "재검토 필요": "#ef4444", "기초선 없음": "#94a3b8", "운영 전": "#94a3b8",
  // Tier1 프로그램 판정
  "목표 달성": "#10b981", "감소(목표 미달)": "#22c55e", "감소": "#22c55e", "증가 — 재검토": "#ef4444",
};

export function VerdictBadge({ s }: { s?: Pick<Summary, "verdict" | "crisis_change_pct"> }) {
  if (!s) return null;
  const c = VERDICT_COLORS[s.verdict] || "#64748b";
  return (
    <span style={{ fontSize: "0.7rem", fontWeight: 800, color: c, background: `${c}18`, padding: "2px 8px", borderRadius: 6 }}>
      {s.verdict}{s.crisis_change_pct != null ? ` · 위기행동 ${s.crisis_change_pct > 0 ? "+" : ""}${s.crisis_change_pct}%` : ""}
    </span>
  );
}

export function SummaryCompare({ items, title }: { items: Summary[]; title: string }) {
  const data = items.filter(i => i.crisis_change_pct != null).map(i => ({ name: i.name.length > 14 ? i.name.slice(0, 13) + "…" : i.name, 변화율: i.crisis_change_pct, verdict: i.verdict }));
  if (!data.length) return null;
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 6 }}>{title}</div>
      <ResponsiveContainer width="100%" height={Math.max(140, data.length * 34 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
          <ReferenceLine x={0} stroke="#94a3b8" />
          <ReferenceLine x={-20} stroke="#10b981" strokeDasharray="4 4" label={{ value: "-20% 효과 기준", fontSize: 10, fill: "#10b981", position: "top" }} />
          <Tooltip formatter={(v: number) => [`${v}%`, "운영 전 대비 위기행동 변화"]} />
          <Bar dataKey="변화율" radius={[0, 4, 4, 0]}>
            {data.map(d => <Cell key={d.name} fill={VERDICT_COLORS[d.verdict] || "#64748b"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>※ 운영 전 1개월(기초선) 대비 운영 중 월평균 위기행동 기록 변화. 왼쪽(음수)일수록 줄었습니다.</p>
    </div>
  );
}

export function ProgramForm({ value, types, roster, busy, onChange, onSave, onCancel, single = false, title, accent = "#8b5cf6",
  namePlaceholder, skillsLabel = "목표 기술", skillsPlaceholder, staffPlaceholder = "예: 담당 교사·치료사", showAgency = false }: {
  value: ProgramDraft; types: string[]; roster: Student[]; busy: boolean;
  onChange: (v: ProgramDraft) => void; onSave: () => void; onCancel: () => void;
  single?: boolean; title: string; accent?: string; namePlaceholder?: string;
  skillsLabel?: string; skillsPlaceholder?: string; staffPlaceholder?: string; showAgency?: boolean;
}) {
  const [q, setQ] = useState("");
  const set = (patch: Partial<Program>) => onChange({ ...value, ...patch });
  const toggle = (code: string) => single
    ? set({ targets: value.targets[0] === code ? [] : [code] })
    : set({ targets: value.targets.includes(code) ? value.targets.filter(c => c !== code) : [...value.targets, code] });
  const groups = useMemo(() => {
    const g = new Map<string, Student[]>();
    roster.filter(s => !q || `${s.학급} ${s.학생이름} ${s.학생코드}`.includes(q))
      .sort((a, b) => a.학생코드.localeCompare(b.학생코드))
      .forEach(s => g.set(s.학급 || "미지정", [...(g.get(s.학급 || "미지정") || []), s]));
    return [...g.entries()];
  }, [roster, q]);
  const endOptions = SCHOOL_MONTHS.filter(m => idx(m) >= idx(value.start));

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, border: `2px solid ${accent}` }}>
      <div style={{ fontWeight: 800 }}>{value.id ? "프로그램 수정" : title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <Field label="프로그램 이름"><input value={value.name} onChange={e => set({ name: e.target.value })} placeholder={namePlaceholder} style={inputStyle} /></Field>
        <Field label="유형">
          <select value={value.type} onChange={e => set({ type: e.target.value })} style={inputStyle}>{types.map(t => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="시작월">
          <select value={value.start} onChange={e => { const s = Number(e.target.value); set({ start: s, end: idx(value.end) < idx(s) ? s : value.end }); }} style={inputStyle}>
            {SCHOOL_MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </Field>
        <Field label="종료월">
          <select value={value.end} onChange={e => set({ end: Number(e.target.value) })} style={inputStyle}>
            {endOptions.map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </Field>
        {showAgency && <Field label="연계 기관"><input value={value.agency || ""} onChange={e => set({ agency: e.target.value })} placeholder="예: OO병원 소아정신과, 교육청 지원단" style={inputStyle} /></Field>}
        <Field label="담당"><input value={value.staff} onChange={e => set({ staff: e.target.value })} placeholder={staffPlaceholder} style={inputStyle} /></Field>
      </div>
      <Field label={skillsLabel}><input value={value.skills} onChange={e => set({ skills: e.target.value })} placeholder={skillsPlaceholder} style={inputStyle} /></Field>
      <Field label={single ? `대상 학생 (1명${value.targets[0] ? ` · ${value.targets[0]} 선택` : ""})` : `대상 학생 (${value.targets.length}명 선택)`}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="학급·이름·코드로 찾기" style={{ ...inputStyle, marginBottom: 6 }} />
        <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
          {groups.map(([cls, list]) => (
            <div key={cls} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b" }}>{cls}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {list.map(s => {
                  const on = value.targets.includes(s.학생코드);
                  return (
                    <button key={s.학생코드} type="button" onClick={() => toggle(s.학생코드)}
                      style={{ ...chip(on ? accent : "#94a3b8"), border: on ? `1.5px solid ${accent}` : "1px solid #e2e8f0", cursor: "pointer", fontWeight: on ? 700 : 400 }}>
                      {on ? "✓ " : ""}{maskName(s.학생이름)} {s.학생코드}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Field>
      <Field label="메모"><input value={value.memo} onChange={e => set({ memo: e.target.value })} style={inputStyle} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>취소</button>
        <button className="btn btn-primary" onClick={onSave} disabled={busy || !value.name.trim() || value.targets.length === 0}>저장</button>
      </div>
    </div>
  );
}

export function MonitorPanel({ data, nameOf, accent = "#8b5cf6" }: { data: Monitor | null; nameOf: (c: string) => string; accent?: string }) {
  if (!data) return <div className="card" style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>효과 자료를 모으는 중...</div>;
  const chart = data.months.map(m => ({ label: `${m.month}월`, phase: m.phase, 위기행동: m.crisis_avg, 강도: m.intensity_avg, CICO: m.cico_avg }));
  const during = chart.filter(c => c.phase === "운영 중");
  const s = data.summary;
  const single = data.students.length === 1;
  const box = (label: string, value: React.ReactNode, sub?: string) => (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 900, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>{sub}</div>}
    </div>
  );
  const pct = (v: number | null) => (v == null ? "-" : `${v > 0 ? "+" : ""}${v}%`);

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800 }}>📈 {data.program.name} — 운영 기간 성과</div>
        <VerdictBadge s={s} />
      </div>
      {data.months.length === 0 ? <p style={{ color: "#94a3b8" }}>아직 운영 기간이 오지 않았습니다.</p> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {box("위기행동 (월평균)", <span style={{ color: "#ef4444" }}>{s.crisis_pre ?? "-"} → {s.crisis_during ?? "-"}건</span>, "운영 전 → 운영 중")}
            {box("위기행동 변화", <span style={{ color: (s.crisis_change_pct ?? 0) <= -20 ? "#10b981" : (s.crisis_change_pct ?? 0) > 10 ? "#ef4444" : "#64748b" }}>{pct(s.crisis_change_pct)}</span>, "-20% 이하면 ‘효과 있음’")}
            {box("CICO 수행률", <span style={{ color: "#3b82f6" }}>{s.cico_pre ?? "-"} → {s.cico_during ?? "-"}%</span>, s.cico_change != null ? `변화 ${pct(s.cico_change)}p` : "CICO 대상이 아니면 -")}
            {!single && box("개선 학생", <span style={{ color: "#10b981" }}>{s.improved}/{s.students}명</span>, `늘어난 학생 ${s.worse}명`)}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              {during.length > 0 && <ReferenceArea x1={during[0].label} x2={during[during.length - 1].label} yAxisId="l" fill={accent} fillOpacity={0.07} label={{ value: "운영 기간", fontSize: 11, fill: accent, position: "insideTop" }} />}
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" allowDecimals tick={{ fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v: number, n: string) => [v == null ? "-" : n === "CICO" ? `${v}%` : n === "강도" ? `${v}/5` : `${v}건`,
                n === "CICO" ? "CICO 수행률" : n === "강도" ? "평균 강도" : single ? "위기행동 기록" : "위기행동(학생 평균)"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n: string) => (n === "CICO" ? "CICO 수행률(%)" : n === "강도" ? "평균 강도(1~5)" : "위기행동 기록(건)")} />
              <Bar yAxisId="l" dataKey="위기행동" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line yAxisId="l" dataKey="강도" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
              <Line yAxisId="r" dataKey="CICO" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569" }}>
                  <th style={cell}>학생</th>
                  {data.months.map(m => <th key={m.month} style={{ ...cell, color: m.phase === "운영 중" ? accent : "#475569" }}>{m.month}월<div style={{ fontWeight: 400, fontSize: "0.65rem" }}>{m.phase}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {data.students.map(st => (
                  <tr key={st.code} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={cell}><strong>{maskName(st.name) || nameOf(st.code)}</strong> <span style={{ color: "#94a3b8" }}>{st.class}</span></td>
                    {data.months.map(m => {
                      const k = String(m.month);
                      return (
                        <td key={m.month} style={{ ...cell, textAlign: "center" }}>
                          <span style={{ color: "#ef4444" }}>{st.crisis[k] ?? 0}건</span>
                          {st.intensity?.[k] != null && <span style={{ color: "#b45309" }}> (강도 {st.intensity[k]})</span>}
                          <span style={{ color: "#cbd5e1" }}> · </span>
                          <span style={{ color: "#3b82f6" }}>{st.cico[k] != null ? `${st.cico[k]}%` : "-"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 6 }}>
              ※ 칸마다 ‘위기행동 기록 건수(평균 강도) · CICO 수행률’입니다. 운영 전·후는 1개월씩이며 아직 오지 않은 달은 빠집니다. 판정: -20% 이하 효과 있음 · 0~-20% 소폭 개선 · +10%까지 변화 없음 · 그 이상 재검토 필요.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block" }}><span style={{ display: "block", fontSize: "0.72rem", color: "#64748b", fontWeight: 700, marginBottom: 4 }}>{label}</span>{children}</label>;
}

export const chip = (color: string): React.CSSProperties => ({ padding: "2px 8px", borderRadius: 999, background: `${color}15`, color, fontSize: "0.72rem" });
export const smallBtn: React.CSSProperties = { padding: "4px 10px", fontSize: "0.75rem" };
export const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem", background: "#fff" };
const cell: React.CSSProperties = { padding: "6px 8px", verticalAlign: "top", textAlign: "left" };
