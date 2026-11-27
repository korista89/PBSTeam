"use client";

// 위기행동관리: 학교행동중재지원팀 회의용 브리핑. 기간을 고르면 대상(Tier3·Tier3+) 학생의
// 위기행동을 앞 기간과 비교해 보여 주고, 회의 메모를 MeetingNotes(유형 crisis)에 남긴다.
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import PrintGuard, { requestPrint } from "../components/PrintGuard";
import { API_BASE_URL } from "@/app/lib/api";
import { maskName } from "../utils";
import { ChartCard, Empty, Kpi } from "../cico/CicoDashboard";

type Dist = { name: string; value: number }[];
interface Student {
  code: string; name: string; class: string; level: string; incidents: number; occurrences: number; max_intensity: number;
  avg_intensity: number; high: number; prev_incidents: number; delta: number; signal: string; top_type: string[];
  top_function: string[]; top_time: string[]; top_place: string[]; restraint: number; support: number; injury: number;
  pending: number; last_date: string; weekly: number[]; records: Rec[];
}
interface Rec {
  date: string; time: string; place: string; type: string; intensity: number; count: number; function: string; setting: string;
  antecedent: string; consequence: string; action: string; note: string; teacher: string; log_id: string; status: string; report: boolean;
}
interface Briefing {
  period: { start: string; end: string; days: number }; prev_period: { start: string; end: string }; target_source: string;
  summary: Record<string, number>; school: Record<string, number>; weekly: { week: string; school: number; count: number; high: number; target_high: number }[];
  by_time: Dist; by_place: Dist; by_type: Dist; by_function: Dist; by_antecedent: Dist; by_setting: Dist;
  students: Student[];
  watch: { code: string; name: string; class: string; incidents: number; max_intensity: number; prev_incidents: number; top_type: string[] }[];
  serious: { date: string; code: string; name: string; time: string; place: string; type: string; intensity: number; action: string; note: string; log_id: string; status: string; report: boolean }[];
}
interface Note { id: string; date: string; content: string; author: string; student_code: string; period_start: string; period_end: string; created_at?: string; }
type Draft = { what: string; who: string; check: string };

const kst = () => new Date(Date.now() + 9 * 3600_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (s: string, days: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
const kd = (s: string) => { const [y, m, d] = s.split("-"); return `${+y}. ${+m}. ${+d}.`; };
const md = (s: string) => { const [, m, d] = s.split("-"); return `${+m}. ${+d}.`; };
const SIG: Record<string, string> = { 증가: "#dc2626", 감소: "#2563eb", 유지: "#64748b", 무발생: "#16a34a" };
const ACT: Record<string, string> = { 제지: "제지", 교육지원: "개별학생교육지원", 상해: "상해" };

function presets() {
  const t = iso(kst());
  const d = kst(); const monthStart = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const lastStart = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
  const lastEnd = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)));
  return [
    { label: "최근 2주", s: shift(t, -13), e: t },
    { label: "최근 4주", s: shift(t, -27), e: t },
    { label: "이번 달", s: monthStart, e: t },
    { label: "지난달", s: lastStart, e: lastEnd },
  ];
}

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  if (!prev && !now) return null;
  const c = d > 0 ? "#dc2626" : d < 0 ? "#2563eb" : "#64748b";
  return <span style={{ color: c, fontWeight: 800, fontSize: "0.75rem", marginLeft: 4 }}>{d > 0 ? "▲" : d < 0 ? "▼" : "–"}{Math.abs(d)}</span>;
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 22 }} title={values.join(" · ")}>
      {values.map((v, i) => <span key={i} style={{ width: 7, height: Math.max(2, (v / max) * 22), background: v ? "#ef4444" : "#e2e8f0", borderRadius: 2 }} />)}
    </span>
  );
}

function DistChart({ title, data, color }: { title: string; data: Dist; color: string }) {
  return (
    <ChartCard title={title}>
      {data.length ? (
        <ResponsiveContainer width="100%" height={Math.max(120, data.length * 26)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" allowDecimals={false} fontSize={11} />
            <YAxis type="category" dataKey="name" width={130} interval={0} fontSize={11} tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + "…" : v} />
            <Tooltip />
            <Bar dataKey="value" name="건수" fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : <Empty />}
    </ChartCard>
  );
}

export default function CrisisPage() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const p = presets();
  const [start, setStart] = useState(p[0].s);
  const [end, setEnd] = useState(p[0].e);
  const [data, setData] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState<Draft>({ what: "", who: "", check: "" });
  const [decMsg, setDecMsg] = useState("");
  const [memo, setMemo] = useState("");
  const [memoMsg, setMemoMsg] = useState("");

  const load = useCallback(async (s: string, e: string) => {
    setLoading(true); setErr("");
    try {
      const r = await axios.get(`${API_BASE_URL}/api/v1/analytics/crisis-briefing`, { params: { start_date: s, end_date: e } });
      setData(r.data);
    } catch (x: any) {
      setErr(x?.response?.data?.detail || "브리핑을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally { setLoading(false); }
  }, []);
  const loadNotes = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE_URL}/api/v1/meeting-notes`, { params: { meeting_type: "crisis" } });
      const list = (r.data?.notes || []) as Note[];
      setNotes([...list].sort((a, b) => String(b.created_at || b.date).localeCompare(String(a.created_at || a.date))));
    } catch { setNotes([]); }
  }, []);
  useEffect(() => { void load(start, end); if (admin) void loadNotes(); }, [admin]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (s: string, e: string) => { setStart(s); setEnd(e); void load(s, e); };
  const saveMemo = async () => {
    if (!memo.trim()) return;
    try {
      await axios.post(`${API_BASE_URL}/api/v1/meeting-notes`, { meeting_type: "crisis", date: iso(kst()), content: memo.trim(), period_start: start, period_end: end });
      setMemo(""); setMemoMsg("회의 메모를 저장했습니다."); void loadNotes();
    } catch { setMemoMsg("저장하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
  };

  // 학생별 결정은 학생코드를 붙여, 회의 전체 메모는 학생코드 없이 저장한다(같은 유형 crisis)
  const general = notes.filter(n => !String(n.student_code || "").trim()).slice(0, 5);
  const decisions = (code: string) => notes.filter(n => String(n.student_code || "").trim() === code);
  const openDecision = (code: string) => { setEditing(editing === code ? "" : code); setDraft({ what: "", who: "", check: "" }); setDecMsg(""); };
  const saveDecision = async (code: string) => {
    if (!draft.what.trim()) return;
    const content = [`결정: ${draft.what.trim()}`, draft.who.trim() && `담당: ${draft.who.trim()}`, draft.check && `다음 확인: ${draft.check}`].filter(Boolean).join("\n");
    try {
      await axios.post(`${API_BASE_URL}/api/v1/meeting-notes`, { meeting_type: "crisis", date: iso(kst()), content, student_code: code, period_start: start, period_end: end });
      setEditing(""); setDecMsg(""); void loadNotes();
    } catch { setDecMsg("저장하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
  };

  const s = data?.summary || {};
  const sc = data?.school || {};
  const [openRec, setOpenRec] = useState("");
  const input = { padding: "6px 8px", borderRadius: 8, border: "1.5px solid #cbd5e1", fontWeight: 700, fontSize: "0.82rem" };
  const th: React.CSSProperties = { padding: "8px 6px", textAlign: "left", fontSize: "0.74rem", color: "#475569", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "8px 6px", fontSize: "0.8rem", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" };

  return (
    <AuthCheck>
      <AppShell
        currentPage="crisis"
        hideDateFilter
        title="🚦 위기행동관리"
        subtitle="학교행동중재지원팀 회의용 브리핑 — 대상 학생(Tier3·Tier3+)의 위기행동을 앞 기간과 비교합니다"
        headerActions={
          <div className="no-print" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {p.map(x => (
              <button key={x.label} onClick={() => pick(x.s, x.e)} className="btn btn-secondary"
                style={{ fontSize: "0.78rem", padding: "5px 10px", ...(x.s === start && x.e === end ? { background: "#4f46e5", color: "#fff" } : {}) }}>{x.label}</button>
            ))}
            <input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} style={input} />
            <span>~</span>
            <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} style={input} />
            <button onClick={() => load(start, end)} className="btn btn-primary" style={{ fontSize: "0.8rem" }}>조회</button>
            <button onClick={requestPrint} className="btn btn-secondary" style={{ fontSize: "0.8rem" }}>🖨️ 인쇄</button>
          </div>
        }
      >
        <PrintGuard doc="위기행동관리 브리핑" />
        {err && <div className="card" style={{ padding: 14, color: "#dc2626", fontWeight: 700 }}>{err}</div>}
        {loading && !data && <Empty text="브리핑을 만드는 중입니다…" />}
        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: loading ? 0.5 : 1 }}>
            <div style={{ fontSize: "0.85rem", color: "#475569" }}>
              <b style={{ color: "#0f172a" }}>{kd(data.period.start)} ~ {kd(data.period.end)}</b> ({data.period.days}일)
              <span style={{ marginLeft: 8 }}>비교: 앞 기간 {kd(data.prev_period.start)} ~ {kd(data.prev_period.end)}</span>
              <span style={{ marginLeft: 8, color: "#94a3b8" }}>대상 출처: {data.target_source === "Tier3_월별" ? "Tier3관리 월별 명단" : "TierStatus"}</span>
            </div>

            {/* A. 학교 전체 추이 */}
            <div style={{ fontWeight: 900, fontSize: "1.05rem", borderLeft: "5px solid #0ea5e9", paddingLeft: 10 }}>🏫 학교 전체 추이 <span style={{ fontWeight: 500, fontSize: "0.78rem", color: "#94a3b8" }}>전교생 위기행동 기록 기준</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <Kpi label="전교 위기행동 기록" value={sc.incidents ?? 0} unit="건" color="#0284c7" hint={`앞 기간 ${sc.prev_incidents ?? 0}건`} />
              <Kpi label="발생 학생" value={sc.students ?? 0} unit="명" color="#0891b2" hint={`앞 기간 ${sc.prev_students ?? 0}명`} />
              <Kpi label="발생 횟수 합" value={sc.occurrences ?? 0} unit="회" color="#ea580c" hint={`앞 기간 ${sc.prev_occurrences ?? 0}회`} />
              <Kpi label="강도 4 이상" value={sc.high ?? 0} unit="건" color="#b91c1c" hint={`평균 강도 ${sc.avg_intensity ?? 0}`} />
              <Kpi label="제지·교육지원·상해" value={(sc.restraint ?? 0) + (sc.support ?? 0) + (sc.injury ?? 0)} unit="건" color="#0f766e"
                hint={`제지 ${sc.restraint ?? 0} · 교육지원 ${sc.support ?? 0} · 상해 ${sc.injury ?? 0}`} />
              <Kpi label="대상 학생 비중" value={sc.target_share ?? 0} unit="%" color="#7c3aed" hint="전교 기록 중 Tier3·Tier3+ 학생 기록" />
            </div>
            {/* 3. 추이와 패턴 */}
            <ChartCard title="📈 주별 위기행동 — 학교 전체와 대상 학생">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={data.weekly.map(w => ({ ...w, label: md(w.week) + " 주" }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="school" name="학교 전체" fill="#bae6fd" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="count" name="대상 학생" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                  <Line dataKey="high" name="강도 4 이상(전교)" stroke="#b91c1c" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
              <DistChart title="⏰ 시간대" data={data.by_time} color="#f97316" />
              <DistChart title="📍 장소" data={data.by_place} color="#0ea5e9" />
              <DistChart title="🧷 행동 유형" data={data.by_type} color="#ef4444" />
              <DistChart title="🎯 추정 기능" data={data.by_function} color="#8b5cf6" />
              <DistChart title="⚡ 선행사건" data={data.by_antecedent} color="#14b8a6" />
              <DistChart title="🌙 배경사건" data={data.by_setting} color="#64748b" />
            </div>

            {/* B. 학교행동중재지원팀 대상 학생 */}
            <div style={{ fontWeight: 900, fontSize: "1.05rem", borderLeft: "5px solid #7c3aed", paddingLeft: 10, marginTop: 8 }}>👥 학교행동중재지원팀 대상 학생 <span style={{ fontWeight: 500, fontSize: "0.78rem", color: "#94a3b8" }}>Tier3·Tier3+ 학생별 위기행동 발생 정보</span></div>

            {/* 1. 한눈에 보기 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <Kpi label="대상 학생" value={s.targets ?? 0} unit="명" color="#7c3aed" hint={`Tier3+ ${s.tier3plus ?? 0}명 · 발생 학생 ${s.with_incidents ?? 0}명`} />
              <Kpi label="위기행동 기록" value={s.incidents ?? 0} unit="건" color="#dc2626" hint={`앞 기간 ${s.prev_incidents ?? 0}건`} />
              <Kpi label="발생 횟수 합" value={s.occurrences ?? 0} unit="회" color="#ea580c" hint={`앞 기간 ${s.prev_occurrences ?? 0}회`} />
              <Kpi label="강도 4 이상" value={s.high ?? 0} unit="건" color="#b91c1c" hint={`평균 강도 ${s.avg_intensity ?? 0}`} />
              <Kpi label="제지·교육지원·상해" value={(s.restraint ?? 0) + (s.support ?? 0) + (s.injury ?? 0)} unit="건" color="#0f766e"
                hint={`제지 ${s.restraint ?? 0} · 교육지원 ${s.support ?? 0} · 상해 ${s.injury ?? 0}`} />
              <Kpi label="증가한 학생" value={s.increased ?? 0} unit="명" color="#e11d48" hint="앞 기간보다 20% 이상 늘어남" />
              <Kpi label="결재 대기" value={s.pending ?? 0} unit="건" color="#f59e0b" hint="대상 학생 기록 중 미결재" />
              <Kpi label="의뢰 검토 후보" value={s.watch ?? 0} unit="명" color="#475569" hint="대상 밖: 3건 이상 또는 강도 4 이상" />
            </div>

            {/* 2. 학생별 현황 — 회의 안건 순서 */}
            <div className="card" style={{ padding: 14, overflowX: "auto" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>👥 대상 학생별 현황 <span style={{ fontWeight: 500, fontSize: "0.75rem", color: "#94a3b8" }}>기록 많은 순 · 이름을 누르면 이 기간에 입력된 기록이 펼쳐집니다 · ↗는 개별학생 행동중재</span></div>
              {data.students.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    {["학생", "단계", "기록", "앞 기간", "주별", "최고 강도", "주요 행동", "주요 기능", "주요 시간대·장소", "제지/교육지원/상해", "결재 대기", "최근 발생", "신호", ...(admin ? ["팀 결정"] : [])].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {data.students.map(r => { const past = decisions(r.code); return (
                      <React.Fragment key={r.code}>
                      <tr>
                        <td style={td}>
                          <button onClick={() => setOpenRec(openRec === r.code ? "" : r.code)} title="이 기간 기록 보기"
                            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontWeight: 800, color: openRec === r.code ? "#dc2626" : "#1e293b", fontSize: "0.85rem", textDecoration: "underline dotted" }}>
                            {openRec === r.code ? "▾" : "▸"} {maskName(r.name) || r.code}</button>
                          <Link className="no-print" href={`/target-behavior?student=${encodeURIComponent(r.code)}`} title="개별학생 행동중재" style={{ marginLeft: 4, fontSize: "0.75rem", textDecoration: "none" }}>↗</Link>
                          <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{r.class}</div></td>
                        <td style={td}><span className={`badge ${r.level === "Tier3+" ? "badge-tier3" : "badge-tier2"}`}>{r.level}</span></td>
                        <td style={{ ...td, fontWeight: 900, fontSize: "1rem" }}>{r.incidents}<Delta now={r.incidents} prev={r.prev_incidents} /></td>
                        <td style={td}>{r.prev_incidents}</td>
                        <td style={td}><Spark values={r.weekly} /></td>
                        <td style={{ ...td, fontWeight: 800, color: r.max_intensity >= 4 ? "#b91c1c" : "#334155" }}>{r.max_intensity || "-"}</td>
                        <td style={td}>{r.top_type[0] || "-"}</td>
                        <td style={td}>{r.top_function[0] || "-"}</td>
                        <td style={td}>{r.top_time[0] || "-"}<div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{r.top_place[0] || ""}</div></td>
                        <td style={td}>{r.restraint} / {r.support} / {r.injury}</td>
                        <td style={{ ...td, color: r.pending ? "#b45309" : "#94a3b8", fontWeight: 700 }}>{r.pending}</td>
                        <td style={td}>{r.last_date ? md(r.last_date) : "-"}</td>
                        <td style={td}><span style={{ fontWeight: 800, color: SIG[r.signal] }}>{r.signal}</span></td>
                        {admin && <td style={{ ...td, minWidth: 200, maxWidth: 280 }}>
                          {past[0] ? <div style={{ fontSize: "0.74rem", whiteSpace: "pre-wrap", color: "#334155" }}><b style={{ color: "#7c3aed" }}>{md(String(past[0].date))}</b> {past[0].content}</div>
                            : <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>결정 없음</div>}
                          <button className="no-print" onClick={() => openDecision(r.code)} style={{ display: "block", marginTop: 4, fontSize: "0.72rem", fontWeight: 700, border: "1px solid #c4b5fd", background: editing === r.code ? "#ede9fe" : "#fff", color: "#6d28d9", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>
                            {editing === r.code ? "닫기" : "✏️ 결정 기록"}</button>
                        </td>}
                      </tr>
                      {openRec === r.code && (
                        <tr><td colSpan={admin ? 14 : 13} style={{ background: "#fff7ed", padding: "10px 12px", borderBottom: "1px solid #fed7aa" }}>
                          <div style={{ fontWeight: 800, fontSize: "0.82rem", marginBottom: 6 }}>{maskName(r.name) || r.code} — {kd(data.period.start)} ~ {kd(data.period.end)} 기록 {r.records.length}건</div>
                          {r.records.length ? (
                            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8 }}>
                              <thead><tr>{["날짜", "시간대·장소", "행동", "강도", "횟수", "기능", "배경·선행 → 후속", "조치", "특기사항", "입력", ""].map(h => <th key={h} style={{ ...th, fontSize: "0.7rem" }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {r.records.map((x, i) => (
                                  <tr key={x.log_id || i}>
                                    <td style={{ ...td, fontWeight: 800, whiteSpace: "nowrap" }}>{md(x.date)}</td>
                                    <td style={{ ...td, fontSize: "0.75rem" }}>{x.time}<div style={{ color: "#94a3b8" }}>{x.place}</div></td>
                                    <td style={{ ...td, fontSize: "0.75rem" }}>{x.type}</td>
                                    <td style={{ ...td, fontWeight: 800, color: x.intensity >= 4 ? "#b91c1c" : undefined }}>{x.intensity || "-"}</td>
                                    <td style={td}>{x.count}</td>
                                    <td style={{ ...td, fontSize: "0.75rem" }}>{x.function || "-"}</td>
                                    <td style={{ ...td, fontSize: "0.72rem", color: "#475569", maxWidth: 220 }}>{[x.setting, x.antecedent].filter(Boolean).join(" / ") || "-"}{x.consequence ? <div>→ {x.consequence}</div> : null}</td>
                                    <td style={{ ...td, fontSize: "0.75rem" }}>{ACT[x.action] || "-"}</td>
                                    <td style={{ ...td, fontSize: "0.74rem", color: "#334155", maxWidth: 360, whiteSpace: "pre-wrap" }}>{x.note || "-"}</td>
                                    <td style={{ ...td, fontSize: "0.72rem", color: "#94a3b8", whiteSpace: "nowrap" }}>{x.teacher}{x.status !== "Approved" ? <div style={{ color: "#b45309", fontWeight: 700 }}>결재 대기</div> : null}</td>
                                    <td style={td}>{x.report && x.log_id && <Link className="no-print" href={`/report/crisis/${encodeURIComponent(x.log_id)}`} style={{ fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap" }}>보고서 →</Link>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : <div style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 700 }}>이 기간에 입력된 위기행동 기록이 없습니다.</div>}
                        </td></tr>
                      )}
                      {admin && editing === r.code && (
                        <tr className="no-print"><td colSpan={14} style={{ background: "#faf5ff", padding: 12, borderBottom: "1px solid #e9d5ff" }}>
                          <div style={{ fontWeight: 800, fontSize: "0.82rem", marginBottom: 6 }}>{maskName(r.name) || r.code} — 이번 회의 결정 <span style={{ fontWeight: 500, fontSize: "0.72rem", color: "#7c3aed" }}>저장하면 담임도 개별학생 행동중재 ① 학생 현황에서 봅니다</span></div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                            <textarea autoFocus value={draft.what} onChange={e => setDraft({ ...draft, what: e.target.value })} rows={2}
                              placeholder="결정 사항 (예: 등교 시간 환경 조정, BIP 예방 전략 수정)" style={{ flex: 1, minWidth: 260, padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.82rem", fontFamily: "inherit" }} />
                            <input value={draft.who} onChange={e => setDraft({ ...draft, who: e.target.value })} placeholder="담당 (예: 담임·보조인력)"
                              style={{ width: 170, padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.82rem" }} />
                            <label style={{ fontSize: "0.75rem", color: "#475569", display: "flex", flexDirection: "column" }}>다음 확인일
                              <input type="date" value={draft.check} min={iso(kst())} onChange={e => setDraft({ ...draft, check: e.target.value })} style={{ padding: 6, borderRadius: 8, border: "1px solid #cbd5e1" }} /></label>
                            <button onClick={() => saveDecision(r.code)} disabled={!draft.what.trim()} className="btn btn-primary" style={{ fontSize: "0.8rem" }}>저장</button>
                          </div>
                          {decMsg && <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 4 }}>{decMsg}</div>}
                          {past.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#6d28d9" }}>지난 결정</div>
                              {past.slice(0, 5).map(n => (
                                <div key={n.id} style={{ fontSize: "0.76rem", padding: "4px 0", borderBottom: "1px dashed #e9d5ff", whiteSpace: "pre-wrap" }}>
                                  <b>{n.date}</b> <span style={{ color: "#94a3b8" }}>{n.author}</span>{"\n"}{n.content}
                                </div>
                              ))}
                            </div>
                          )}
                        </td></tr>
                      )}
                      </React.Fragment>
                    ); })}
                  </tbody>
                </table>
              ) : <Empty text="이 기간의 대상 학생이 없습니다. Tier3관리에서 월별 명단을 확인하세요." />}
            </div>

            {/* 4. 주요 사건 */}
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>🚨 함께 볼 사건 <span style={{ fontWeight: 500, fontSize: "0.75rem", color: "#94a3b8" }}>강도 4 이상 또는 제지·개별학생교육지원·상해 · 최근 순</span></div>
              {data.serious.length ? data.serious.map(x => (
                <div key={x.log_id || x.date + x.code} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1f5f9", alignItems: "flex-start", flexWrap: "wrap" }}>
                  <span style={{ minWidth: 56, fontWeight: 800 }}>{md(x.date)}</span>
                  <span style={{ minWidth: 80, fontWeight: 800 }}>{maskName(x.name) || x.code}</span>
                  <span style={{ minWidth: 150, color: "#475569", fontSize: "0.8rem" }}>{x.time} · {x.place}</span>
                  <span style={{ fontSize: "0.8rem" }}>{x.type} · 강도 <b style={{ color: x.intensity >= 4 ? "#b91c1c" : undefined }}>{x.intensity}</b>{ACT[x.action] ? ` · ${ACT[x.action]}` : ""}</span>
                  <span style={{ flex: 1, minWidth: 200, fontSize: "0.78rem", color: "#64748b" }}>{x.note}</span>
                  {x.report && x.log_id && <Link className="no-print" href={`/report/crisis/${encodeURIComponent(x.log_id)}`} style={{ fontSize: "0.75rem", fontWeight: 700 }}>보고서 →</Link>}
                </div>
              )) : <Empty text="이 기간에는 해당 사건이 없습니다." />}
            </div>

            {/* 5. 의뢰 검토 후보 */}
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>🔎 의뢰 검토 후보 <span style={{ fontWeight: 500, fontSize: "0.75rem", color: "#94a3b8" }}>대상이 아닌 학생 중 기간 내 3건 이상 또는 강도 4 이상</span></div>
              {data.watch.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {data.watch.map(w => (
                    <Link key={w.code} href={`/target-behavior?student=${encodeURIComponent(w.code)}`} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", textDecoration: "none", color: "#0f172a" }}>
                      <b>{maskName(w.name) || w.code}</b> <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{w.class}</span>
                      <div style={{ fontSize: "0.78rem" }}>{w.incidents}건<Delta now={w.incidents} prev={w.prev_incidents} /> · 최고 강도 {w.max_intensity} · {w.top_type[0] || ""}</div>
                    </Link>
                  ))}
                </div>
              ) : <Empty text="검토할 학생이 없습니다." />}
            </div>

            {/* 6. 회의 메모(팀 기록이라 관리자만) */}
            {admin && <div className="card no-print" style={{ padding: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>📝 회의 전체 메모 <span style={{ fontWeight: 500, fontSize: "0.75rem", color: "#94a3b8" }}>학교 전체 안건·공통 결정을 적습니다. 학생별 결정은 위 표의 ✏️ 결정 기록에서 남깁니다</span></div>
              <textarea value={memo} onChange={e => { setMemo(e.target.value); setMemoMsg(""); }} rows={4}
                placeholder="예) 등교 시간 위기행동 증가 — 통학버스 하차 동선 점검, 다음 회의에서 확인"
                style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <button onClick={saveMemo} disabled={!memo.trim()} className="btn btn-primary" style={{ fontSize: "0.8rem" }}>메모 저장</button>
                {memoMsg && <span style={{ fontSize: "0.8rem", color: "#475569" }}>{memoMsg}</span>}
              </div>
              {general.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#475569" }}>지난 회의 메모</div>
                  {general.map(n => (
                    <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: "0.8rem" }}>
                      <b>{n.date}</b> <span style={{ color: "#94a3b8" }}>{n.author}{n.period_start ? ` · 기간 ${n.period_start} ~ ${n.period_end}` : ""}</span>
                      <div style={{ whiteSpace: "pre-wrap", color: "#334155" }}>{n.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>}
          </div>
        )}
      </AppShell>
    </AuthCheck>
  );
}
