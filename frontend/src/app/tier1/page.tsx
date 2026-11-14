"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import ViewToggle from "../components/ViewToggle";
import { API_BASE_URL } from "@/app/lib/api";
import { ChartCard, Kpi } from "../cico/CicoDashboard";
import {
  Field, SCHOOL_MONTHS, SummaryCompare, VERDICT_COLORS, VerdictBadge, chip, idx, inputStyle, nowMonth, smallBtn, statusOf, type Summary,
} from "../components/ProgramKit";

// Tier1 관리: 보편적 지원 프로그램(대상 범위·표적 행동·월 단위 기간)과 프로그램별 성과, 학년도 Tier1 현황
interface Program {
  id: number; name: string; type: string; start: number; end: number; scope: string; scope_values: string[];
  behaviors: string[]; places: string[]; goal_pct: number | null; content: string; staff: string; memo: string;
}
type Draft = Omit<Program, "id"> & { id?: number };
interface Options { types: string[]; scopes: string[]; courses: string[]; classes: string[]; behaviors: string[]; places: string[]; }
interface T1Summary { id: number; name: string; start: number; end: number; scope_students: number; per10_pre: number | null; per10_during: number | null; change_pct: number | null; goal_pct: number | null; verdict: string; }
interface MonitorMonth { month: number; phase: string; count: number; per10: number | null; students_with: number; tier1_only_pct: number | null; }
interface Monitor { program: Program; scope_students: number; months: MonitorMonth[]; top_types: [string, number][]; summary: Omit<T1Summary, "id" | "name" | "start" | "end" | "scope_students">; }
interface Annual { year: number; students: number; trend: { month: number; crisis: number; tier1_only: number; tier2: number; tier3: number; tier1_only_pct: number | null }[]; }

const ACCENT = "#16a34a";
const EMPTY: Draft = { name: "", type: "기대행동 교수", start: 3, end: 5, scope: "전교", scope_values: [], behaviors: [], places: [], goal_pct: 20, content: "", staff: "", memo: "" };
const short = (b: string) => b.split(":")[0];

export default function Tier1Page() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const [view, setView] = useState<"month" | "year">("month");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [summaries, setSummaries] = useState<T1Summary[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [annual, setAnnual] = useState<Annual | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/tier1/programs`);
      setPrograms(data.programs || []);
      setOptions(data.options);
      axios.get(`${API_BASE_URL}/api/v1/tier1/summary`, { timeout: 120000 }).then(r => setSummaries(r.data.programs || [])).catch(() => setSummaries([]));
    } catch (e: any) {
      setStatus(`⚠ 불러오기 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (view !== "year" || annual) return;
    axios.get(`${API_BASE_URL}/api/v1/tier1/annual`, { timeout: 120000 }).then(r => setAnnual(r.data)).catch(e => setStatus(`⚠ 연간 현황 실패 — ${e?.response?.data?.detail || e.message}`));
  }, [view, annual]);
  useEffect(() => {
    if (selected == null) { setMonitor(null); return; }
    setMonitor(null);
    axios.get(`${API_BASE_URL}/api/v1/tier1/programs/${selected}/monitor`).then(r => setMonitor(r.data))
      .catch(e => setStatus(`⚠ 성과 자료 실패 — ${e?.response?.data?.detail || e.message}`));
  }, [selected, programs]);

  const run = async (label: string, fn: () => Promise<any>, after?: () => void) => {
    setBusy(true);
    setStatus(`${label} 중...`);
    try {
      const res = await fn();
      setStatus(`✓ ${res?.data?.message || label + " 완료"}`);
      after?.();
      await load();
    } catch (e: any) {
      setStatus(`⚠ ${label} 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const save = () => editing && run("저장", () => {
    const { id, ...body } = editing;
    return id ? axios.put(`${API_BASE_URL}/api/v1/tier1/programs/${id}`, body) : axios.post(`${API_BASE_URL}/api/v1/tier1/programs`, body);
  }, () => setEditing(null));
  const remove = (p: Program) => {
    if (!window.confirm(`'${p.name}' 프로그램을 삭제할까요? (시트에는 '삭제' 표시로 남습니다)`)) return;
    void run("삭제", () => axios.delete(`${API_BASE_URL}/api/v1/tier1/programs/${p.id}`), () => { if (selected === p.id) setSelected(null); });
  };
  const asSummary = (s: T1Summary): Summary => ({
    id: s.id, name: s.name, start: s.start, end: s.end, crisis_pre: s.per10_pre, crisis_during: s.per10_during,
    crisis_change_pct: s.change_pct, improved: 0, worse: 0, students: s.scope_students, cico_pre: null, cico_during: null, cico_change: null, verdict: s.verdict,
  });
  const scopeText = (p: Program) => p.scope === "전교" ? "전교" : `${p.scope}: ${p.scope_values.join(", ")}`;

  return (
    <AuthCheck>
      <AppShell
        currentPage="tier1"
        title="🌱 Tier1 관리"
        subtitle="보편적 지원 프로그램을 월 단위로 운영하고, 대상 범위의 표적 위기행동 변화로 프로그램별 성과를 확인합니다"
        headerActions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {status && <span className={`badge ${status.startsWith("⚠") ? "badge-tier3" : "badge-tier1"}`} style={{ fontSize: "0.78rem" }}>{status}</span>}
            {admin && view === "month" && <button className="btn btn-primary" disabled={busy} onClick={() => setEditing({ ...EMPTY, start: nowMonth(), end: nowMonth() })}>➕ 새 Tier1 프로그램</button>}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ViewToggle value={view} onChange={setView} monthLabel="프로그램·성과" yearLabel="📊 학년도 Tier1 현황" />

          {view === "year" ? <AnnualView data={annual} programs={programs} summaries={summaries} /> : (
            <>
              {editing && options && <T1Form value={editing} options={options} busy={busy} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />}
              {loading ? (
                <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>불러오는 중...</div>
              ) : programs.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
                  이 학년도 Tier1 프로그램이 없습니다.{admin && " 오른쪽 위 ‘새 Tier1 프로그램’으로 만드세요."}
                  <div style={{ fontSize: "0.75rem", marginTop: 8 }}>예: 기대행동 교수(전교, 3~4월, 신체적공격행동 20% 감소) · 급식실 규칙(장소: 급식실) · 경은마트 토큰 강화</div>
                </div>
              ) : (
                <>
                  <SummaryCompare items={summaries.map(asSummary)} title="📊 프로그램별 성과 (운영 전 대비 표적 위기행동, 학생 10명당)" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                    {programs.map(p => {
                      const st = statusOf(p);
                      const active = selected === p.id;
                      const sm = summaries.find(x => x.id === p.id);
                      return (
                        <div key={p.id} className="card" style={{ padding: 14, border: active ? `2px solid ${ACCENT}` : undefined, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <div>
                              <div style={{ fontWeight: 800 }}>{p.name}</div>
                              <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{p.type} · {p.start}월 ~ {p.end}월{p.staff && ` · ${p.staff}`}</div>
                            </div>
                            <span style={{ alignSelf: "flex-start", fontSize: "0.7rem", fontWeight: 700, color: st.color, background: `${st.color}18`, padding: "2px 8px", borderRadius: 6 }}>{st.label}</span>
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#334155" }}>🏫 {scopeText(p)}{sm ? ` (${sm.scope_students}명)` : ""}</div>
                          <div style={{ fontSize: "0.75rem", color: "#334155" }}>
                            🎯 {p.behaviors.length ? p.behaviors.map(short).join(", ") : "모든 행동유형"}{p.places.length ? ` · 장소 ${p.places.join(", ")}` : ""}{p.goal_pct ? ` · ${p.goal_pct}% 감소 목표` : ""}
                          </div>
                          {p.content && <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{p.content}</div>}
                          <div><VerdictBadge s={sm ? { verdict: sm.verdict, crisis_change_pct: sm.change_pct } : undefined} /></div>
                          <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                            <button className="btn btn-primary" style={smallBtn} onClick={() => setSelected(active ? null : p.id)}>{active ? "닫기" : "📈 성과 보기"}</button>
                            {admin && <button className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={() => setEditing({ ...p })}>수정</button>}
                            {admin && <button className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={() => remove(p)}>삭제</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {selected != null && <T1Monitor data={monitor} />}
            </>
          )}
        </div>
      </AppShell>
    </AuthCheck>
  );
}

function Picker({ items, value, onChange, color = ACCENT, label = (x: string) => x }: { items: string[]; value: string[]; onChange: (v: string[]) => void; color?: string; label?: (x: string) => string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 140, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 6 }}>
      {items.map(it => {
        const on = value.includes(it);
        return (
          <button key={it} type="button" title={it} onClick={() => onChange(on ? value.filter(v => v !== it) : [...value, it])}
            style={{ ...chip(on ? color : "#94a3b8"), border: on ? `1.5px solid ${color}` : "1px solid #e2e8f0", cursor: "pointer", fontWeight: on ? 700 : 400 }}>
            {on ? "✓ " : ""}{label(it)}
          </button>
        );
      })}
    </div>
  );
}

function T1Form({ value, options, busy, onChange, onSave, onCancel }: {
  value: Draft; options: Options; busy: boolean; onChange: (v: Draft) => void; onSave: () => void; onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...value, ...patch });
  const endOptions = SCHOOL_MONTHS.filter(m => idx(m) >= idx(value.start));
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, border: `2px solid ${ACCENT}` }}>
      <div style={{ fontWeight: 800 }}>{value.id ? "프로그램 수정" : "새 Tier1 프로그램"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <Field label="프로그램 이름"><input value={value.name} onChange={e => set({ name: e.target.value })} placeholder="예: 기대행동 교수 주간" style={inputStyle} /></Field>
        <Field label="유형"><select value={value.type} onChange={e => set({ type: e.target.value })} style={inputStyle}>{options.types.map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="시작월">
          <select value={value.start} onChange={e => { const s = Number(e.target.value); set({ start: s, end: idx(value.end) < idx(s) ? s : value.end }); }} style={inputStyle}>
            {SCHOOL_MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </Field>
        <Field label="종료월"><select value={value.end} onChange={e => set({ end: Number(e.target.value) })} style={inputStyle}>{endOptions.map(m => <option key={m} value={m}>{m}월</option>)}</select></Field>
        <Field label="목표 감소율(%)"><input type="number" min={1} max={100} value={value.goal_pct ?? ""} onChange={e => set({ goal_pct: e.target.value ? Number(e.target.value) : null })} placeholder="예: 20" style={inputStyle} /></Field>
        <Field label="담당"><input value={value.staff} onChange={e => set({ staff: e.target.value })} placeholder="예: 생활교육부" style={inputStyle} /></Field>
      </div>
      <Field label="대상 범위">
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {options.scopes.map(s => (
            <button key={s} type="button" onClick={() => set({ scope: s, scope_values: [] })} className={value.scope === s ? "btn btn-primary" : "btn btn-secondary"} style={smallBtn}>{s}</button>
          ))}
        </div>
        {value.scope === "과정" && <Picker items={options.courses} value={value.scope_values} onChange={v => set({ scope_values: v })} />}
        {value.scope === "학급" && <Picker items={options.classes} value={value.scope_values} onChange={v => set({ scope_values: v })} />}
      </Field>
      <Field label={`표적 행동유형 (${value.behaviors.length ? `${value.behaviors.length}개` : "비우면 모든 행동"})`}>
        <Picker items={options.behaviors} value={value.behaviors} onChange={v => set({ behaviors: v })} color="#ef4444" label={short} />
      </Field>
      <Field label={`장소 (${value.places.length ? `${value.places.length}곳` : "비우면 모든 장소"})`}>
        <Picker items={options.places} value={value.places} onChange={v => set({ places: v })} color="#0ea5e9" />
      </Field>
      <Field label="운영 내용"><input value={value.content} onChange={e => set({ content: e.target.value })} placeholder="예: 매주 월 1교시 기대행동 수업, 경은마트 토큰 2배" style={inputStyle} /></Field>
      <Field label="메모"><input value={value.memo} onChange={e => set({ memo: e.target.value })} style={inputStyle} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>취소</button>
        <button className="btn btn-primary" onClick={onSave} disabled={busy || !value.name.trim() || (value.scope !== "전교" && value.scope_values.length === 0)}>저장</button>
      </div>
    </div>
  );
}

function T1Monitor({ data }: { data: Monitor | null }) {
  if (!data) return <div className="card" style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>성과 자료를 모으는 중...</div>;
  const s = data.summary;
  const chart = data.months.map(m => ({ label: `${m.month}월`, phase: m.phase, per10: m.per10, t1: m.tier1_only_pct }));
  const during = chart.filter(c => c.phase === "운영 중");
  const c = VERDICT_COLORS[s.verdict] || "#64748b";
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800 }}>📈 {data.program.name} — 프로그램 성과 <span style={{ fontWeight: 500, fontSize: "0.75rem", color: "#94a3b8" }}>대상 {data.scope_students}명</span></div>
        <span style={{ fontSize: "0.75rem", fontWeight: 800, color: c, background: `${c}18`, padding: "3px 10px", borderRadius: 6 }}>{s.verdict}</span>
      </div>
      {data.months.length === 0 ? <p style={{ color: "#94a3b8" }}>아직 운영 기간이 오지 않았습니다.</p> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <Kpi label="학생 10명당 표적 행동(월)" value={`${s.per10_pre ?? "-"}→${s.per10_during ?? "-"}`} unit="건" color="#ef4444" hint="운영 전 → 운영 중" />
            <Kpi label="변화" value={s.change_pct != null ? `${s.change_pct > 0 ? "+" : ""}${s.change_pct}` : "-"} unit="%" color={(s.change_pct ?? 0) < 0 ? "#10b981" : "#ef4444"} />
            <Kpi label="목표" value={s.goal_pct ? `-${s.goal_pct}` : "없음"} unit={s.goal_pct ? "%" : ""} color="#6366f1" />
            <Kpi label="Tier1만 비율(마지막 달)" value={data.months[data.months.length - 1]?.tier1_only_pct ?? "-"} unit="%" color={ACCENT} hint="대상 범위 학생 중 CICO·SST·Tier3가 아닌 비율" />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              {during.length > 0 && <ReferenceArea x1={during[0].label} x2={during[during.length - 1].label} yAxisId="l" fill={ACCENT} fillOpacity={0.07} label={{ value: "운영 기간", fontSize: 11, fill: ACCENT, position: "insideTop" }} />}
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="per10" name="학생 10명당 표적 행동(건)" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line yAxisId="r" dataKey="t1" name="Tier1만 비율(%)" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
            <thead><tr style={{ background: "#f8fafc", color: "#475569" }}>{["월", "구간", "표적 행동 기록", "10명당", "행동한 학생", "Tier1만"].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
            <tbody>
              {data.months.map(m => (
                <tr key={m.month} style={{ borderTop: "1px solid #f1f5f9", color: m.phase === "운영 중" ? "#0f172a" : "#64748b" }}>
                  <td style={cell}>{m.month}월</td><td style={cell}>{m.phase}</td><td style={cell}>{m.count}건</td>
                  <td style={cell}>{m.per10 ?? "-"}</td><td style={cell}>{m.students_with}명</td><td style={cell}>{m.tier1_only_pct ?? "-"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.top_types.length > 0 && (
            <div style={{ fontSize: "0.75rem", color: "#475569" }}>
              자주 나온 행동: {data.top_types.map(([t, n]) => `${short(t)} ${n}건`).join(" · ")}
            </div>
          )}
          <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>
            ※ 대상 범위 재학생의 표적 행동유형·장소에 맞는 Log_Main 기록만 셉니다. 범위 크기가 달라도 비교할 수 있게 학생 10명당으로 봅니다. 판정: 목표 감소율 이상 줄면 ‘목표 달성’.
          </p>
        </>
      )}
    </div>
  );
}

function AnnualView({ data, programs, summaries }: { data: Annual | null; programs: Program[]; summaries: T1Summary[] }) {
  if (!data) return <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>학년도 Tier1 현황을 모으는 중...</div>;
  const last = data.trend[data.trend.length - 1];
  const total = data.trend.reduce((n, t) => n + t.crisis, 0);
  const chart = data.trend.map(t => ({ label: `${t.month}월`, 위기행동: t.crisis, Tier1만: t.tier1_only_pct, "Tier1만 인원": t.tier1_only, Tier2: t.tier2, Tier3: t.tier3 }));
  const months = data.trend.map(t => t.month);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Kpi label="재학생" value={data.students} unit="명" color="#334155" />
        <Kpi label="Tier1만 비율(이번 달)" value={last?.tier1_only_pct ?? "-"} unit="%" color={(last?.tier1_only_pct ?? 0) >= 80 ? ACCENT : "#f59e0b"} hint="SW-PBS 기준 80% 이상이면 보편적 지원이 잘 작동" />
        <Kpi label={`${data.year}학년도 위기행동 기록`} value={total} unit="건" color="#ef4444" />
        <Kpi label="월평균" value={data.trend.length ? Math.round(total / data.trend.length) : "-"} unit="건" color="#f97316" />
        <Kpi label="Tier1 프로그램" value={programs.length} unit="개" color="#6366f1" hint={`목표 달성 ${summaries.filter(s => s.verdict === "목표 달성").length}개`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <ChartCard title="📈 월별 위기행동 기록과 Tier1만 비율">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="c" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="p" orientation="right" domain={[50, 100]} unit="%" tick={{ fontSize: 11 }} />
              <ReferenceLine yAxisId="p" y={80} stroke={ACCENT} strokeDasharray="4 4" label={{ value: "80%", fontSize: 10, fill: ACCENT, position: "right" }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="c" dataKey="위기행동" name="위기행동 기록(건)" fill="#fca5a5" radius={[4, 4, 0, 0]} />
              <Line yAxisId="p" dataKey="Tier1만" name="Tier1만 비율(%)" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="🧱 월별 Tier 분포 (재학생)">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, n: string) => [`${v}명`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Tier1만 인원" stackId="t" fill="#86efac" />
              <Bar dataKey="Tier2" stackId="t" fill="#fde047" name="Tier2(CICO·SST)" />
              <Bar dataKey="Tier3" stackId="t" fill="#f87171" name="Tier3·3+" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>🗓️ Tier1 프로그램 운영 달력과 성과</div>
        {programs.length === 0 ? <p style={{ color: "#94a3b8" }}>프로그램이 없습니다.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead><tr style={{ background: "#f8fafc", color: "#475569" }}><th style={cell}>프로그램</th>{months.map(m => <th key={m} style={{ ...cell, textAlign: "center" }}>{m}월</th>)}<th style={cell}>성과</th></tr></thead>
              <tbody>
                {programs.map(p => {
                  const sm = summaries.find(s => s.id === p.id);
                  return (
                    <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={cell}><strong>{p.name}</strong></td>
                      {months.map(m => <td key={m} style={{ ...cell, background: idx(m) >= idx(p.start) && idx(m) <= idx(p.end) ? "#bbf7d0" : undefined }} />)}
                      <td style={cell}><VerdictBadge s={sm ? { verdict: sm.verdict, crisis_change_pct: sm.change_pct } : undefined} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const cell: React.CSSProperties = { padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" };
