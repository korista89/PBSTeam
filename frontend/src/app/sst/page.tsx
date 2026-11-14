"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { maskName } from "../utils";
import { API_BASE_URL } from "@/app/lib/api";

// SST 관리: 학년도 최대 6개 프로그램(월 단위 기간·대상 학생) + 위기행동·CICO로 효과 모니터링 + Tier현황 SST 맞춤
interface Program {
  id: number; name: string; type: string; start: number; end: number;
  targets: string[]; skills: string; staff: string; memo: string;
}
interface Student { 학생코드: string; 학생이름: string; 학급: string; 재학여부?: string; }
interface MonitorMonth { month: number; phase: string; crisis_avg: number | null; cico_avg: number | null; cico_n: number; }
interface Monitor {
  program: Program;
  months: MonitorMonth[];
  students: { code: string; name: string; class: string; crisis: Record<string, number>; cico: Record<string, number | null> }[];
}
interface SyncRow { code: string; name: string; class: string; programs: string[]; }
interface Sync { month: number; running: string[]; need_on: SyncRow[]; need_off: SyncRow[]; matched: number; unknown: string[]; }

const SCHOOL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
const EMPTY: Omit<Program, "id"> = { name: "", type: "의사소통", start: 3, end: 5, targets: [], skills: "", staff: "", memo: "" };
const idx = (m: number) => SCHOOL_MONTHS.indexOf(m);
const nowMonth = () => new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;

function statusOf(p: Program) {
  const n = idx(nowMonth());
  if (n < idx(p.start)) return { label: "운영 예정", color: "#64748b" };
  if (n > idx(p.end)) return { label: "운영 종료", color: "#94a3b8" };
  return { label: "운영 중", color: "#10b981" };
}

export default function SstPage() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [max, setMax] = useState(6);
  const [types, setTypes] = useState<string[]>(["의사소통", "사회적 기술", "정서·자기조절", "기타"]);
  const [roster, setRoster] = useState<Student[]>([]);
  const [editing, setEditing] = useState<(Omit<Program, "id"> & { id?: number }) | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [syncMonth, setSyncMonth] = useState(nowMonth);
  const [sync, setSync] = useState<Sync | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPrograms = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/sst/programs`);
      setPrograms(data.programs || []);
      setMax(data.max || 6);
      if (data.types) setTypes(data.types);
    } catch (e: any) {
      setStatus(`⚠ 불러오기 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  const loadSync = useCallback(async () => {
    if (!admin) return;
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/sst/tier-sync`, { params: { month: syncMonth } });
      setSync(data);
    } catch { setSync(null); }
  }, [admin, syncMonth]);

  useEffect(() => { void loadPrograms(); }, [loadPrograms]);
  useEffect(() => { void loadSync(); }, [loadSync]);
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/tier/status`)
      .then(r => setRoster((r.data.students || []).filter((s: Student) => s.학생코드 && String(s.재학여부 ?? "O").trim() !== "X")))
      .catch(() => setRoster([]));
  }, []);
  useEffect(() => {
    if (selected == null) { setMonitor(null); return; }
    setMonitor(null);
    axios.get(`${API_BASE_URL}/api/v1/sst/programs/${selected}/monitor`)
      .then(r => setMonitor(r.data))
      .catch(e => setStatus(`⚠ 효과 자료 실패 — ${e?.response?.data?.detail || e.message}`));
  }, [selected, programs]);

  const run = async (label: string, fn: () => Promise<any>, after?: () => void) => {
    setBusy(true);
    setStatus(`${label} 중...`);
    try {
      const res = await fn();
      setStatus(`✓ ${res?.data?.message || label + " 완료"}`);
      after?.();
      await Promise.all([loadPrograms(), loadSync()]);
    } catch (e: any) {
      setStatus(`⚠ ${label} 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = () => editing && run("저장", () => {
    const { id, ...body } = editing;
    return id ? axios.put(`${API_BASE_URL}/api/v1/sst/programs/${id}`, body) : axios.post(`${API_BASE_URL}/api/v1/sst/programs`, body);
  }, () => setEditing(null));
  const remove = (p: Program) => {
    if (!window.confirm(`'${p.name}' 프로그램을 삭제할까요? (시트에는 '삭제' 표시로 남습니다)`)) return;
    void run("삭제", () => axios.delete(`${API_BASE_URL}/api/v1/sst/programs/${p.id}`), () => { if (selected === p.id) setSelected(null); });
  };
  const setTier = (code: string, on: boolean) => run(on ? "SST 켜기" : "SST 끄기", () => axios.post(`${API_BASE_URL}/api/v1/sst/tier-sync`, { code, on }));
  const turnOnAll = async () => {
    if (!sync) return;
    for (const r of sync.need_on) await setTier(r.code, true);
  };

  const nameOf = useMemo(() => {
    const m = new Map(roster.map(s => [s.학생코드, s]));
    return (code: string) => maskName(m.get(code)?.학생이름 || "") || code;
  }, [roster]);

  return (
    <AuthCheck>
      <AppShell
        currentPage="sst"
        title="🤝 SST 관리"
        subtitle="의사소통·사회적 기술 프로그램을 월 단위로 운영하고, 위기행동·CICO 자료로 효과를 확인합니다"
        headerActions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {status && <span className={`badge ${status.startsWith("⚠") ? "badge-tier3" : "badge-tier1"}`} style={{ fontSize: "0.78rem" }}>{status}</span>}
            {admin && (
              <button className="btn btn-primary" disabled={busy || programs.length >= max} onClick={() => setEditing({ ...EMPTY })}
                title={programs.length >= max ? `학년도마다 ${max}개까지` : ""}>
                ➕ 새 프로그램 ({programs.length}/{max})
              </button>
            )}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {editing && (
            <ProgramForm value={editing} types={types} roster={roster} busy={busy}
              onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />
          )}

          {loading ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>불러오는 중...</div>
          ) : programs.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              이 학년도 SST 프로그램이 없습니다.{admin && " 오른쪽 위 ‘새 프로그램’으로 만드세요."}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {programs.map(p => {
                const st = statusOf(p);
                const active = selected === p.id;
                return (
                  <div key={p.id} className="card" style={{ padding: 14, border: active ? "2px solid #3b82f6" : undefined, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{p.name}</div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{p.type} · {p.start}월 ~ {p.end}월{p.staff && ` · ${p.staff}`}</div>
                      </div>
                      <span style={{ alignSelf: "flex-start", fontSize: "0.7rem", fontWeight: 700, color: st.color, background: `${st.color}18`, padding: "2px 8px", borderRadius: 6 }}>{st.label}</span>
                    </div>
                    {p.skills && <div style={{ fontSize: "0.75rem", color: "#334155" }}>🎯 {p.skills}</div>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {p.targets.map(c => <span key={c} style={chip("#8b5cf6")}>{nameOf(c)}</span>)}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                      <button className="btn btn-primary" style={smallBtn} onClick={() => setSelected(active ? null : p.id)}>{active ? "닫기" : "📈 효과 보기"}</button>
                      {admin && <button className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={() => setEditing({ ...p })}>수정</button>}
                      {admin && <button className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={() => remove(p)}>삭제</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selected != null && <MonitorPanel data={monitor} nameOf={nameOf} />}

          {admin && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 800 }}>🔗 Tier현황 SST 맞추기</div>
                <select value={syncMonth} onChange={e => setSyncMonth(Number(e.target.value))} style={selectStyle}>
                  {SCHOOL_MONTHS.map(m => <option key={m} value={m}>{m}월 기준</option>)}
                </select>
              </div>
              <p style={{ fontSize: "0.72rem", color: "#64748b", margin: "6px 0 10px" }}>
                사이트의 SST 표시(대시보드 Tier 인원, CICO 병행 판정, 브리핑)는 Tier현황의 ‘Tier2(SST)’ 칸을 따릅니다. 이 달 운영 중인 프로그램 대상과 다르면 여기서 맞추세요.
              </p>
              {!sync ? <p style={{ color: "#94a3b8", fontSize: "0.8rem" }}>불러오는 중...</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: "0.8rem" }}>
                  <div>운영 중: {sync.running.length ? sync.running.join(", ") : "없음"} · 일치 {sync.matched}명</div>
                  <SyncList title="프로그램 대상인데 Tier현황 SST가 꺼진 학생" color="#f59e0b" rows={sync.need_on} busy={busy}
                    action="SST 켜기" onAction={c => setTier(c, true)}
                    bulk={sync.need_on.length > 1 ? { label: `모두 켜기 (${sync.need_on.length}명)`, run: turnOnAll } : undefined} />
                  {sync.running.length > 0 ? (
                    <SyncList title="Tier현황 SST가 켜져 있는데 이 달 프로그램이 없는 학생" color="#64748b" rows={sync.need_off} busy={busy}
                      action="SST 끄기" onAction={c => { if (window.confirm(`${maskName(sync.need_off.find(r => r.code === c)?.name || c)} 학생의 Tier현황 SST를 끌까요?`)) void setTier(c, false); }} />
                  ) : (
                    <div style={{ color: "#94a3b8" }}>이 달 운영 중인 프로그램이 없어 ‘끄기’ 후보는 보여 주지 않습니다(Tier현황 SST {sync.need_off.length}명 그대로).</div>
                  )}
                  {sync.unknown.length > 0 && <div style={{ color: "#ef4444" }}>※ Tier현황에 없는 학생코드: {sync.unknown.join(", ")}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </AppShell>
    </AuthCheck>
  );
}

function ProgramForm({ value, types, roster, busy, onChange, onSave, onCancel }: {
  value: Omit<Program, "id"> & { id?: number };
  types: string[]; roster: Student[]; busy: boolean;
  onChange: (v: Omit<Program, "id"> & { id?: number }) => void; onSave: () => void; onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const set = (patch: Partial<Program>) => onChange({ ...value, ...patch });
  const toggle = (code: string) => set({ targets: value.targets.includes(code) ? value.targets.filter(c => c !== code) : [...value.targets, code] });
  const groups = useMemo(() => {
    const g = new Map<string, Student[]>();
    roster.filter(s => !q || `${s.학급} ${s.학생이름} ${s.학생코드}`.includes(q))
      .sort((a, b) => a.학생코드.localeCompare(b.학생코드))
      .forEach(s => g.set(s.학급 || "미지정", [...(g.get(s.학급 || "미지정") || []), s]));
    return [...g.entries()];
  }, [roster, q]);
  const endOptions = SCHOOL_MONTHS.filter(m => idx(m) >= idx(value.start));

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, border: "2px solid #8b5cf6" }}>
      <div style={{ fontWeight: 800 }}>{value.id ? "프로그램 수정" : "새 SST 프로그램"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <Field label="프로그램 이름"><input value={value.name} onChange={e => set({ name: e.target.value })} placeholder="예: 의사소통 교육 프로그램" style={inputStyle} /></Field>
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
        <Field label="담당"><input value={value.staff} onChange={e => set({ staff: e.target.value })} placeholder="예: 담당 교사·치료사" style={inputStyle} /></Field>
      </div>
      <Field label="목표 기술"><input value={value.skills} onChange={e => set({ skills: e.target.value })} placeholder="예: 도움 요청하기, 차례 기다리기" style={inputStyle} /></Field>
      <Field label={`대상 학생 (${value.targets.length}명 선택)`}>
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
                      style={{ ...chip(on ? "#8b5cf6" : "#94a3b8"), border: on ? "1.5px solid #8b5cf6" : "1px solid #e2e8f0", cursor: "pointer", fontWeight: on ? 700 : 400 }}>
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

function MonitorPanel({ data, nameOf }: { data: Monitor | null; nameOf: (c: string) => string }) {
  if (!data) return <div className="card" style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>효과 자료를 모으는 중...</div>;
  const chart = data.months.map(m => ({ label: `${m.month}월`, phase: m.phase, 위기행동: m.crisis_avg, CICO: m.cico_avg }));
  const during = chart.filter(c => c.phase === "운영 중");
  const avgOf = (phase: string, key: "crisis_avg" | "cico_avg") => {
    const v = data.months.filter(m => m.phase === phase).map(m => m[key]).filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const phases = ["운영 전", "운영 중", "운영 후"].filter(ph => data.months.some(m => m.phase === ph));

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontWeight: 800 }}>📈 {data.program.name} — 효과 모니터링</div>
      {data.months.length === 0 ? <p style={{ color: "#94a3b8" }}>아직 운영 기간이 오지 않았습니다.</p> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {phases.map(ph => (
              <div key={ph} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b" }}>{ph} 평균</div>
                <div style={{ fontSize: "0.85rem", marginTop: 4 }}>위기행동 <strong style={{ color: "#ef4444" }}>{avgOf(ph, "crisis_avg") ?? "-"}</strong>건/월</div>
                <div style={{ fontSize: "0.85rem" }}>CICO <strong style={{ color: "#3b82f6" }}>{avgOf(ph, "cico_avg") ?? "-"}</strong>%</div>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              {during.length > 0 && <ReferenceArea x1={during[0].label} x2={during[during.length - 1].label} yAxisId="l" fill="#8b5cf6" fillOpacity={0.07} label={{ value: "운영 기간", fontSize: 11, fill: "#8b5cf6", position: "insideTop" }} />}
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" allowDecimals tick={{ fontSize: 11 }} label={{ value: "위기행동(건/월)", angle: -90, position: "insideLeft", fontSize: 10, dx: 14 }} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v: number, n: string) => [v == null ? "-" : n === "CICO" ? `${v}%` : `${v}건`, n === "CICO" ? "CICO 수행률(평균)" : "위기행동(학생 평균)"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n: string) => (n === "CICO" ? "CICO 수행률(평균)" : "위기행동 기록(학생 평균)")} />
              <Bar yAxisId="l" dataKey="위기행동" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line yAxisId="r" dataKey="CICO" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569" }}>
                  <th style={cell}>학생</th>
                  {data.months.map(m => <th key={m.month} style={{ ...cell, color: m.phase === "운영 중" ? "#8b5cf6" : "#475569" }}>{m.month}월<div style={{ fontWeight: 400, fontSize: "0.65rem" }}>{m.phase}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {data.students.map(s => (
                  <tr key={s.code} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={cell}><strong>{maskName(s.name) || nameOf(s.code)}</strong> <span style={{ color: "#94a3b8" }}>{s.class}</span></td>
                    {data.months.map(m => (
                      <td key={m.month} style={{ ...cell, textAlign: "center" }}>
                        <span style={{ color: "#ef4444" }}>{s.crisis[String(m.month)] ?? 0}건</span>
                        <span style={{ color: "#cbd5e1" }}> · </span>
                        <span style={{ color: "#3b82f6" }}>{s.cico[String(m.month)] != null ? `${s.cico[String(m.month)]}%` : "-"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 6 }}>
              ※ 칸마다 ‘위기행동 기록 건수 · CICO 수행률’입니다. CICO가 ‘-’면 그 달 CICO 대상이 아니거나 기록이 없습니다. 운영 전·후는 1개월씩이며 아직 오지 않은 달은 빠집니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function SyncList({ title, color, rows, busy, action, onAction, bulk }: {
  title: string; color: string; rows: SyncRow[]; busy: boolean; action: string;
  onAction: (code: string) => void; bulk?: { label: string; run: () => void };
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong style={{ color }}>{title} {rows.length}명</strong>
        {bulk && <button className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={bulk.run}>{bulk.label}</button>}
      </div>
      {rows.length === 0 ? <div style={{ color: "#94a3b8", marginTop: 4 }}>없음</div> : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {rows.map(r => (
            <span key={r.code} style={{ ...chip(color), display: "inline-flex", alignItems: "center", gap: 6 }}>
              {maskName(r.name) || r.code} <span style={{ opacity: 0.7 }}>{r.class}</span>
              <button disabled={busy} onClick={() => onAction(r.code)} style={{ border: "none", background: "#fff", color, borderRadius: 6, padding: "1px 6px", cursor: "pointer", fontSize: "0.7rem", fontWeight: 700 }}>{action}</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block" }}><span style={{ display: "block", fontSize: "0.72rem", color: "#64748b", fontWeight: 700, marginBottom: 4 }}>{label}</span>{children}</label>;
}

const chip = (color: string): React.CSSProperties => ({ padding: "2px 8px", borderRadius: 999, background: `${color}15`, color, fontSize: "0.72rem" });
const smallBtn: React.CSSProperties = { padding: "4px 10px", fontSize: "0.75rem" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem", background: "#fff" };
const selectStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.8rem", background: "#fff" };
const cell: React.CSSProperties = { padding: "6px 8px", verticalAlign: "top", textAlign: "left" };
