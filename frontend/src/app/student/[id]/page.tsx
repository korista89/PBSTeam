"use client";

// 개별학생대시보드 — 위에서 아래로 "누구인가 → 지금 어떤가 → 언제·어디서·왜 → 최근 기록 → 지원 도구" 순서로 읽힌다.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, Line, ComposedChart,
} from "recharts";
import { StudentData } from "../../types";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import AppShell from "../../components/AppShell";
import { useSheetLiveSync } from "../../hooks/useSheetLiveSync";
import { useDateRange } from "../../components/GlobalNav";
import ReadableAIResult from "../../components/ReadableAIResult";
import LogDetailPanel from "../../components/LogDetailPanel";
import { maskName } from "../../utils";
import { API_BASE_URL } from "@/app/lib/api";

// ── 디자인 토큰(이 화면 전용) ────────────────────────────────
const C = {
  ink: "#0f172a", sub: "#475569", mute: "#94a3b8", line: "#e8edf3", soft: "#f8fafc",
  blue: "#2563eb", blueSoft: "#eff6ff", red: "#dc2626", redSoft: "#fef2f2",
  amber: "#d97706", amberSoft: "#fffbeb", green: "#16a34a", greenSoft: "#f0fdf4", violet: "#7c3aed",
};
const card: React.CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" };
const h3: React.CSSProperties = { margin: 0, fontSize: "1rem", fontWeight: 800, color: C.ink };
const hint: React.CSSProperties = { margin: "4px 0 0", fontSize: "0.8rem", color: C.mute };

// ── 로그 가공 ────────────────────────────────────────────────
type Log = Record<string, any>;
const dOf = (l: Log) => String(l["행동발생날짜"] || "").slice(0, 10);
const short = (v: unknown) => String(v ?? "").split(":")[0].split("(")[0].trim() || "미기재";
const intensity = (l: Log) => { const s = String(l["강도"] ?? "").trim(); return /^\d/.test(s) ? Number(s[0]) : null; };
const isCrisis = (l: Log) => String(l["물리적제지여부"] || "").startsWith("O");
const slots = (l: Log) => String(l["시간대"] || "").split(",").map(s => s.trim()).filter(Boolean);
const slotNo = (s: string) => { const m = s.match(/(\d+)구간/); return m ? Number(m[1]) : 99; };
const slotLabel = (s: string) => { const [a, b] = s.split(":"); return b ? `${slotNo(s)}구간 ${b.trim().replace(/\(.*?\)/g, "").split("/")[0]}` : a; };
const slotSummary = (l: Log) => { const ss = slots(l).map(slotLabel); return ss.length ? ss[0] + (ss.length > 1 ? ` 외 ${ss.length - 1}` : "") : "-"; };
// 날짜 계산은 UTC 기준으로만 한다(로컬 시간대가 끼면 toISOString에서 하루씩 밀린다)
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const kd = (iso: string) => { const [, m, d] = iso.split("-"); return `${+m}. ${+d}.`; };
const mondayOf = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const todayIso = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function countBy<T>(arr: T[], key: (t: T) => string | string[]) {
  const m = new Map<string, number>();
  arr.forEach(a => ([] as string[]).concat(key(a)).forEach(k => m.set(k, (m.get(k) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// ── 작은 화면 조각 ───────────────────────────────────────────
function Kpi({ label, value, unit, note, tone }: { label: string; value: string | number; unit?: string; note?: React.ReactNode; tone?: string }) {
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: C.sub }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: "1.9rem", fontWeight: 900, color: tone || C.ink, lineHeight: 1.1 }}>
        {value}<span style={{ fontSize: "0.95rem", fontWeight: 700, marginLeft: 2 }}>{unit}</span>
      </div>
      {note && <div style={{ marginTop: 6, fontSize: "0.78rem", color: C.sub }}>{note}</div>}
    </div>
  );
}

function HBars({ data, color, total, keepOrder }: { data: [string, number][]; color: string; total: number; keepOrder?: boolean }) {
  const max = Math.max(1, ...data.map(d => d[1]));
  if (data.length === 0 || (!keepOrder && data.every(d => !d[1]))) return <div style={{ color: C.mute, fontSize: "0.85rem" }}>기록 없음</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map(([k, v]) => (
        <div key={k}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: C.ink }}>{k}</span>
            <span style={{ color: C.sub }}><b style={{ color: C.ink }}>{v}</b>건 · {total ? Math.round((v / total) * 100) : 0}%</span>
          </div>
          <div style={{ height: 8, background: C.soft, borderRadius: 99 }}>
            <div style={{ width: `${(v / max) * 100}%`, height: "100%", background: color, borderRadius: 99 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ logs }: { logs: Log[] }) {
  const places = countBy(logs, l => short(l["장소"])).slice(0, 6).map(p => p[0]);
  const slotList = [...new Set(logs.flatMap(slots))].sort((a, b) => slotNo(a) - slotNo(b));
  const cell = new Map<string, number>();
  logs.forEach(l => slots(l).forEach(s => { const k = `${short(l["장소"])}|${s}`; cell.set(k, (cell.get(k) || 0) + 1); }));
  const max = Math.max(1, ...cell.values());
  if (!places.length || !slotList.length) return <div style={{ color: C.mute, fontSize: "0.85rem" }}>장소·시간대 기록이 없습니다.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 4, fontSize: "0.78rem" }}>
        <thead>
          <tr>
            <th />
            {slotList.map(s => <th key={s} style={{ color: C.sub, fontWeight: 700, padding: "0 4px", width: 84, maxWidth: 84, lineHeight: 1.3 }}>{slotLabel(s)}</th>)}
          </tr>
        </thead>
        <tbody>
          {places.map(p => (
            <tr key={p}>
              <td style={{ fontWeight: 800, color: C.ink, paddingRight: 8, whiteSpace: "nowrap" }}>{p}</td>
              {slotList.map(s => {
                const v = cell.get(`${p}|${s}`) || 0;
                const a = v / max;
                return (
                  <td key={s} title={`${p} · ${slotLabel(s)}: ${v}건`}
                    style={{ height: 40, width: 84, borderRadius: 8, textAlign: "center", fontWeight: 800,
                      background: v ? `rgba(220,38,38,${0.12 + a * 0.75})` : C.soft, color: a > 0.5 ? "#fff" : C.ink }}>
                    {v || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { key: "notes", label: "📝 상담·관찰 기록" },
  { key: "ebp", label: "📚 EBP 추천" },
  { key: "fba", label: "🔬 FBA 증거" },
  { key: "ai", label: "🤖 AI 종합 분석" },
  { key: "med", label: "💊 약물 반응 의견서" },
] as const;

export default function StudentDetail() {
  const params = useParams();
  const router = useRouter();
  const studentKey = decodeURIComponent(params.id as string);
  const { startDate, endDate } = useDateRange();
  const apiUrl = API_BASE_URL;

  const [data, setData] = useState<StudentData | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fbaEvidence, setFbaEvidence] = useState<any>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("notes");
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [crisisOnly, setCrisisOnly] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const q = startDate && endDate ? `?start_date=${startDate}&end_date=${endDate}` : "";
      const res = await axios.get(`${apiUrl}/api/v1/students/${encodeURIComponent(studentKey)}${q}`);
      setData(res.data);
    } catch (err: any) {
      if (err.response?.status === 404) setError("학생을 찾을 수 없습니다.");
      else if (err.response?.status === 403) setError("이 학생의 데이터에 접근할 권한이 없습니다. 담당 학급 학생만 볼 수 있습니다.");
      else setError("데이터를 불러오지 못했습니다.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiUrl, studentKey, startDate, endDate]);

  const studentCode = data?.profile?.student_code;
  const fetchLogs = useCallback(async () => {
    if (!studentCode) return;
    try {
      const res = await axios.get(`${apiUrl}/api/v1/behavior-log/timeline/${encodeURIComponent(studentCode)}`);
      setLogs(res.data?.logs || []);
    } catch { setLogs([]); }
  }, [apiUrl, studentCode]);

  useEffect(() => { if (studentKey) void fetchData(); }, [fetchData, studentKey]);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  useSheetLiveSync(() => { void fetchData(true); void fetchLogs(); }, { enabled: Boolean(studentKey) });
  useEffect(() => {
    if (!studentCode) return;
    axios.get(`${apiUrl}/api/v1/bip/students/${studentCode}/fba-evidence`).then(r => setFbaEvidence(r.data)).catch(() => setFbaEvidence(null));
  }, [apiUrl, studentCode]);

  // 분석기간 안의 기록만 쓴다(상단 기간 필터와 일치)
  const inRange = useMemo(() => logs.filter(l => {
    const d = dOf(l);
    return d && (!startDate || d >= startDate) && (!endDate || d <= endDate);
  }), [logs, startDate, endDate]);

  const stats = useMemo(() => {
    const today = todayIso();
    const last14 = logs.filter(l => dOf(l) > addDays(today, -14)).length;
    const prev14 = logs.filter(l => dOf(l) > addDays(today, -28) && dOf(l) <= addDays(today, -14)).length;
    const lastDate = logs.map(dOf).filter(Boolean).sort().pop() || "";
    const ints = inRange.map(intensity).filter((v): v is number => v !== null);
    const weeks = new Map<string, { count: number; sum: number; n: number }>();
    inRange.forEach(l => {
      const w = mondayOf(dOf(l)); const e = weeks.get(w) || { count: 0, sum: 0, n: 0 };
      const i = intensity(l); e.count += 1; if (i !== null) { e.sum += i; e.n += 1; } weeks.set(w, e);
    });
    const firstW = mondayOf(startDate || [...weeks.keys()].sort()[0] || today);
    const lastW = mondayOf(endDate && endDate < today ? endDate : today);
    const weekly: { week: string; count: number; avg: number | null }[] = [];
    for (let w = firstW; w <= lastW && weekly.length < 60; w = addDays(w, 7)) {
      const e = weeks.get(w);
      weekly.push({ week: kd(w), count: e?.count || 0, avg: e && e.n ? +(e.sum / e.n).toFixed(1) : null });
    }
    return {
      total: inRange.length, last14, prev14, lastDate,
      daysSince: lastDate ? Math.round((Date.parse(today) - Date.parse(lastDate)) / 86400000) : null,
      avg: ints.length ? ints.reduce((a, b) => a + b, 0) / ints.length : 0,
      high: ints.filter(i => i >= 4).length,
      crisis: inRange.filter(isCrisis).length,
      types: countBy(inRange, l => short(l["행동유형"])).slice(0, 5),
      places: countBy(inRange, l => short(l["장소"])),
      slotsTop: countBy(inRange, l => slots(l).map(slotLabel)),
      weekly,
    };
  }, [logs, inRange, startDate, endDate]);

  if (loading || error || !data) return (
    <AuthCheck>
      <AppShell currentPage="student" title="👤 개별학생대시보드">
        <div style={{ ...card, padding: 60, textAlign: "center" }}>
          {loading ? <p style={{ fontWeight: 800, color: C.sub }}>⏳ {maskName(studentKey)} 학생의 기록을 불러오는 중입니다...</p> : (
            <>
              <p style={{ fontWeight: 800, color: C.red }}>⚠️ {error || "데이터가 없습니다."}</p>
              <button onClick={() => router.push("/student")} className="btn btn-primary" style={{ marginTop: 16 }}>학생 목록으로</button>
            </>
          )}
        </div>
      </AppShell>
    </AuthCheck>
  );

  const profile = data.profile;
  const code = profile.student_code;
  const tierText = profile.tier || "Tier 1";
  const tierLevel = tierText.includes("3") ? 3 : tierText.includes("2") ? 2 : 1;
  const tierColor = tierLevel === 3 ? C.red : tierLevel === 2 ? C.amber : C.green;
  const functions = (data.functions || []).map(f => [short(f.name), f.value] as [string, number]);
  const fnTotal = functions.reduce((a, f) => a + f[1], 0);
  const diff = stats.last14 - stats.prev14;
  const trendTone = diff > 0 ? C.red : diff < 0 ? C.green : C.sub;
  const recent = [...inRange].filter(l => !crisisOnly || isCrisis(l))
    .sort((a, b) => (dOf(b) + String(b["타임스탬프"] || "")).localeCompare(dOf(a) + String(a["타임스탬프"] || ""))).slice(0, 10);

  const insights = [
    stats.places[0] && stats.slotsTop[0] && `주로 **${stats.places[0][0]}**에서, **${stats.slotsTop[0][0]}**에 많이 일어납니다.`,
    stats.types[0] && `가장 많은 행동은 **${stats.types[0][0]}**(${stats.types[0][1]}건)입니다.`,
    functions[0] && `교사가 추정한 주된 기능은 **${functions[0][0]}**(${Math.round((functions[0][1] / Math.max(1, fnTotal)) * 100)}%)입니다.`,
    diff !== 0 ? `최근 2주 **${stats.last14}건**으로, 그 전 2주(${stats.prev14}건)보다 **${diff > 0 ? "늘었습니다" : "줄었습니다"}**.` : `최근 2주 ${stats.last14}건으로 그 전 2주와 같습니다.`,
  ].filter(Boolean) as string[];

  return (
    <AuthCheck>
      <AppShell currentPage="student" title="👤 개별학생대시보드" subtitle={`분석기간 ${startDate || "처음"} ~ ${endDate || "오늘"} 기준`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* 1. 학생 헤더 */}
          <section style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ height: 6, background: tierColor }} />
            <div style={{ padding: "20px 24px", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: `${tierColor}18`, color: tierColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", fontWeight: 900, flexShrink: 0 }}>
                {maskName(profile.name)[0] || "학"}
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 900, color: C.ink }}>{maskName(profile.name)}</h2>
                  {tierText.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} style={{ padding: "3px 10px", borderRadius: 99, fontSize: "0.75rem", fontWeight: 800,
                      background: t.includes("3") ? C.redSoft : t.includes("2") ? C.amberSoft : C.greenSoft,
                      color: t.includes("3") ? C.red : t.includes("2") ? C.amber : C.green }}>{t}</span>
                  ))}
                </div>
                <div style={{ marginTop: 6, color: C.sub, fontSize: "0.9rem" }}>
                  {profile.class} · 학생코드 {code}
                  {stats.lastDate && <> · 마지막 위기행동 <b style={{ color: C.ink }}>{kd(stats.lastDate)}</b> ({stats.daysSince === 0 ? "오늘" : `${stats.daysSince}일 전`})</>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => router.push(`/behavior?student=${encodeURIComponent(code)}`)} className="btn" style={{ background: C.red, color: "#fff" }}>🚨 위기행동 기록</button>
                <button onClick={() => router.push(`/student/${encodeURIComponent(code)}/bip`)} className="btn btn-ai">🧩 행동중재계획(BIP)</button>
                <button onClick={() => router.push(`/target-behavior?student=${encodeURIComponent(code)}`)} className="btn btn-secondary">📉 표적행동</button>
                <button onClick={() => router.push(`/logs?q=${encodeURIComponent(code)}`)} className="btn btn-secondary">🗂️ 전체 로그</button>
              </div>
            </div>
          </section>

          {/* 2. 핵심 지표 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
            <Kpi label="기간 내 위기행동" value={stats.total} unit="건" note={`평균 강도 ${stats.avg.toFixed(1)} / 5`} />
            <Kpi label="최근 2주" value={stats.last14} unit="건" tone={trendTone}
              note={<span style={{ color: trendTone, fontWeight: 700 }}>{diff > 0 ? `▲ ${diff}건 증가` : diff < 0 ? `▼ ${-diff}건 감소` : "변화 없음"} <span style={{ color: C.mute, fontWeight: 500 }}>(그 전 2주 {stats.prev14}건)</span></span>} />
            <Kpi label="고강도(4~5)" value={stats.high} unit="건" tone={stats.high ? C.red : C.ink} note="강도 4 이상" />
            <Kpi label="위기조치(제지 등)" value={stats.crisis} unit="건" tone={stats.crisis ? C.red : C.ink} note="보고서 작성 사안" />
          </div>

          {/* 3. 한눈에 */}
          {insights.length > 0 && (
            <section style={{ ...card, background: C.blueSoft, borderColor: "#dbeafe" }}>
              <h3 style={{ ...h3, color: "#1e40af" }}>💡 한눈에 보기</h3>
              <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, color: C.ink, fontSize: "0.95rem", lineHeight: 1.6 }}>
                {insights.map((t, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: t.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }} />
                ))}
              </ul>
            </section>
          )}

          {/* 4. 주별 추이 */}
          <section style={card}>
            <h3 style={h3}>📈 주별 발생 추이</h3>
            <p style={hint}>막대 = 주별 건수, 선 = 그 주 평균 강도</p>
            <div style={{ height: 260, marginTop: 12 }}>
              {stats.total === 0 ? <div style={{ color: C.mute, paddingTop: 100, textAlign: "center" }}>기간 내 기록이 없습니다.</div> : (
                <ResponsiveContainer>
                  <ComposedChart data={stats.weekly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.sub }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="c" allowDecimals={false} tick={{ fontSize: 11, fill: C.sub }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="i" orientation="right" domain={[0, 5]} tick={{ fontSize: 11, fill: C.sub }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any, n: any) => [n === "count" ? `${v}건` : v, n === "count" ? "건수" : "평균 강도"]} labelFormatter={(l) => `${l} 주`} />
                    <Bar yAxisId="c" dataKey="count" fill={C.blue} radius={[6, 6, 0, 0]} maxBarSize={28} />
                    <Line yAxisId="i" dataKey="avg" stroke={C.red} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* 5. 언제·어디서 */}
          <section style={card}>
            <h3 style={h3}>🗺️ 언제·어디서 일어나나</h3>
            <p style={hint}>칸이 진할수록 그 장소·시간대에 자주 일어납니다.</p>
            <div style={{ marginTop: 14 }}><Heatmap logs={inRange} /></div>
          </section>

          {/* 6. 무엇을·왜 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
            <section style={card}>
              <h3 style={h3}>🧭 행동 유형</h3>
              <div style={{ marginTop: 14 }}><HBars data={stats.types} color={C.blue} total={stats.total} /></div>
            </section>
            <section style={card}>
              <h3 style={h3}>🎯 추정 기능 (왜 하나)</h3>
              <div style={{ marginTop: 14 }}><HBars data={functions.slice(0, 5)} color={C.violet} total={fnTotal} /></div>
            </section>
            <section style={card}>
              <h3 style={h3}>📅 요일별</h3>
              <div style={{ marginTop: 14 }}><HBars data={["월", "화", "수", "목", "금"].map(d => [d, (data.weekday_dist || []).find(w => w.name === d)?.value || 0] as [string, number])} color={C.amber} total={stats.total} keepOrder /></div>
            </section>
          </div>

          {/* 7. 최근 기록 */}
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h3 style={h3}>🕒 최근 기록</h3>
                <p style={hint}>누르면 상세 내용을 보고 수정·삭제할 수 있습니다.</p>
              </div>
              <label style={{ fontSize: "0.85rem", color: C.sub, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={crisisOnly} onChange={e => setCrisisOnly(e.target.checked)} /> 위기조치(보고서)만
              </label>
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {recent.length === 0 && <div style={{ color: C.mute }}>기록이 없습니다.</div>}
              {recent.map((l, i) => {
                const id = l["Log_ID"] || `${dOf(l)}-${i}`;
                const crisis = isCrisis(l);
                const it = intensity(l);
                return (
                  <div key={id} style={{ border: `1px solid ${crisis ? "#fecaca" : C.line}`, borderLeft: `5px solid ${crisis ? C.red : (it ?? 0) >= 4 ? C.amber : "#cbd5e1"}`, borderRadius: 12, background: crisis ? C.redSoft : "#fff" }}>
                    <button onClick={() => setOpenLog(openLog === id ? null : id)}
                      style={{ width: "100%", display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 900, color: C.ink, minWidth: 64 }}>{dOf(l) ? kd(dOf(l)) : "-"}</span>
                      <span title={slots(l).map(slotLabel).join(", ")} style={{ color: C.sub, fontSize: "0.85rem", width: 210, flexShrink: 0 }}>{slotSummary(l)} · {short(l["장소"])}</span>
                      <span style={{ fontWeight: 700, color: C.ink, flex: 1 }}>{short(l["행동유형"])}</span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: (it ?? 0) >= 4 ? C.red : C.sub }}>강도 {it ?? "-"}</span>
                      {crisis && <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#fff", background: C.red, borderRadius: 6, padding: "2px 8px" }}>{short(l["제지유형_원문"] || "위기조치")}</span>}
                      {l["Status"] === "Pending" && <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#fff", background: C.amber, borderRadius: 6, padding: "2px 8px" }}>결재 대기</span>}
                      <span style={{ color: C.mute }}>{openLog === id ? "▲" : "▼"}</span>
                    </button>
                    {openLog === id && (
                      <div style={{ padding: "0 14px 14px" }}>
                        <LogDetailPanel log={l} isCrisis={crisis} onSaved={() => void fetchLogs()} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 8. 지원 도구(탭) */}
          <section style={{ ...card, padding: 0 }}>
            <div style={{ display: "flex", gap: 4, padding: "10px 12px 0", borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ padding: "10px 14px", border: "none", background: "none", cursor: "pointer", whiteSpace: "nowrap", fontSize: "0.9rem",
                    fontWeight: tab === t.key ? 800 : 600, color: tab === t.key ? C.blue : C.sub,
                    borderBottom: `3px solid ${tab === t.key ? C.blue : "transparent"}` }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ padding: 20 }}>
              {tab === "notes" && <ConsultationLog studentCode={code} />}
              {tab === "ebp" && (
                <EBPRecommendationSection
                  studentCode={code}
                  functionCode={mapFunctionLabelToCode((fbaEvidence?.deterministic_metrics?.teacher_inferred_function_distribution || [])[0]?.item || "")}
                  settingEvents={(fbaEvidence?.deterministic_metrics?.setting_event_cue_distribution || []).map((s: any) => s.item)}
                  currentTier={tierText}
                  apiUrl={apiUrl}
                />
              )}
              {tab === "fba" && (fbaEvidence ? <FBAEvidencePanel evidence={fbaEvidence} /> : <div style={{ color: C.mute }}>FBA 증거를 불러오는 중이거나 자료가 없습니다.</div>)}
              {tab === "ai" && <StudentAIAnalysis studentCode={code} apiUrl={apiUrl} />}
              {tab === "med" && <MedicationResponseReport studentCode={code} apiUrl={apiUrl} />}
            </div>
          </section>
        </div>
      </AppShell>
    </AuthCheck>
  );
}

// normalize.py의 한국어 기능 라벨("과제회피"/"불편해소"/"관심끌기"/"감각추구"/"물건·활동획득")을
// EBP 카탈로그의 FunctionCode enum으로 매핑한다. build_fba_evidence_summary의 실제 증거에서
// 상위 기능을 뽑아 쓰므로, 화면에 표시되는 기능 추정과 EBP 추천 근거가 항상 일치한다.
function mapFunctionLabelToCode(label: string): string {
  if (!label) return "UNKNOWN";
  if (label.includes("과제") || label.includes("회피")) return "ESCAPE_DEMAND";
  if (label.includes("불편")) return "DISCOMFORT_RELIEF";
  if (label.includes("관심")) return "ATTENTION";
  if (label.includes("감각")) return "AUTOMATIC_SENSORY";
  if (label.includes("물건") || label.includes("활동")) return "TANGIBLE_ACTIVITY";
  return "UNKNOWN";
}

// EBP 추천 섹션 부제목에 FunctionCode 원본값("UNKNOWN" 등)을 그대로 노출하면 교사가
// 읽기 어렵다 — 사람이 읽는 한글 라벨로 바꿔서 보여준다.
const FUNCTION_CODE_LABELS: Record<string, string> = {
  ESCAPE_DEMAND: "과제/요구 회피",
  DISCOMFORT_RELIEF: "불편 해소",
  ATTENTION: "관심 끌기",
  AUTOMATIC_SENSORY: "감각 추구",
  TANGIBLE_ACTIVITY: "물건/활동 획득",
  UNKNOWN: "미상 (기능 데이터 부족)",
};

function FBAEvidencePanel({ evidence }: { evidence: any }) {
  if (!evidence) return null;
  const dq = evidence.data_quality_and_guards || {};
  const dm = evidence.deterministic_metrics || {};
  const nc = evidence.narrative_and_abc_coverage || {};
  const samples = evidence.representative_evidence_samples || [];
  const insufficient = dq.is_insufficient_sample;

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
          <span>🔬</span> FBA 증거 요약
        </h3>
        <span style={{
          padding: '4px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 800,
          background: insufficient ? '#fef3c7' : '#dcfce7', color: insufficient ? '#b45309' : '#166534'
        }}>
          {insufficient ? `⚠️ 데이터 부족 (${dq.sample_size_n ?? 0}/${dq.minimum_required_n ?? 3}건)` : `✅ 분석 가능 (${dq.sample_size_n ?? 0}건)`}
        </span>
      </div>

      <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: '누적 사건', value: `${dm.total_episodes_n ?? 0}건` },
          { label: '평균 강도', value: `${dm.average_intensity_1_to_5 ?? 0}/5` },
          { label: '고강도(4~5) 건수', value: `${dm.high_intensity_4_5_count ?? 0}건` },
          { label: '물리적 제지/안전사건', value: `${dm.physical_restraint_or_safety_event_count ?? 0}건` },
        ].map((c, i) => (
          <div key={i} style={{ background: '#f8fafc', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>{c.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0f172a' }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: '#eff6ff', borderRadius: 14, padding: '16px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>ABC 서술 커버리지 (선행사건·행동·후속결과가 실제 기록된 건수)</div>
          <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.7 }}>
            <div>선행사건 기록: {nc.explicit_antecedent_present_count ?? 0}건</div>
            <div>행동 서술 기록: {nc.explicit_behavior_description_present_count ?? 0}건</div>
            <div>후속결과 기록: {nc.explicit_consequence_present_count ?? 0}건</div>
            <div>완전한 ABC 기록: {nc.explicit_abc_complete_count ?? 0}건</div>
          </div>
        </div>
        <div style={{ background: '#fdf4ff', borderRadius: 14, padding: '16px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#7c3aed', marginBottom: 8 }}>교사 추정 기능 분포</div>
          <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.7 }}>
            {(dm.teacher_inferred_function_distribution || []).slice(0, 4).map((f: any, i: number) => (
              <div key={i}>{f.item}: {f.count}건 ({f.pct}%)</div>
            ))}
            {(!dm.teacher_inferred_function_distribution || dm.teacher_inferred_function_distribution.length === 0) && <div style={{ color: '#94a3b8' }}>기록 없음</div>}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>대표 사건 {samples.length}건</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {samples.map((ev: any, i: number) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem', color: '#334155' }}>
              <div style={{ fontWeight: 700, color: '#475569', marginBottom: 2 }}>{ev.selection_reason} · {ev.date}</div>
              <div>{ev.location} / {ev.time_slot} / 강도 {ev.intensity} / {ev.behavior_type}</div>
              {ev.narrative_notes && <div style={{ color: '#64748b', marginTop: 2 }}>&ldquo;{ev.narrative_notes}&rdquo;</div>}
            </div>
          ))}
          {samples.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>대표 사건이 없습니다.</div>}
        </div>
      </div>
      {dq.interpretation_limit && (
        <p style={{ marginTop: 16, marginBottom: 0, fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.6 }}>{dq.interpretation_limit}</p>
      )}
    </section>
  );
}

function ConsultationLog({ studentCode }: { studentCode: string }) {
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const { user, isAdmin } = useAuth();
  const apiUrl = API_BASE_URL;

  const fetchNotes = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?student_code=${studentCode}&meeting_type=consultation`);
      setNotes(res.data.notes || []);
    } catch (e) { console.error(e); }
  }, [apiUrl, studentCode]);

  useEffect(() => { if (studentCode) fetchNotes(); }, [studentCode, fetchNotes]);
  useSheetLiveSync(fetchNotes, { enabled: Boolean(studentCode) && editingId === null });

  const handleUpdate = async (id: string) => {
    try {
      await axios.patch(`${apiUrl}/api/v1/meeting-notes/${id}`, {
        content: editContent,
        user_id: user?.id || "Teacher",
        role: isAdmin() ? "admin" : "teacher"
      });
      setEditingId(null); fetchNotes();
    } catch (e: any) {
      const errorMsg = e.response?.data?.detail || e.message || "알 수 없는 오류";
      alert("수정 실패: " + errorMsg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
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

  const handleSave = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
        meeting_type: "consultation", date: new Date().toISOString().split('T')[0],
        content, author: user?.id || "Admin", student_code: studentCode
      });
      setContent(""); fetchNotes();
    } catch (e: any) {
      const errorMsg = e.response?.data?.detail || e.message || "알 수 없는 오류";
      alert("저장 실패: " + errorMsg);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>📝 상담 및 관찰 기록</h3>
      <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="학생 관찰 내용이나 학부모 상담 내용을 기록하십시오..." style={{ width: '100%', minHeight: '110px', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }} />
      <div style={{ textAlign: 'right', marginTop: '10px' }}>
          <button onClick={handleSave} disabled={loading || !content.trim()} className="btn btn-primary">기록 저장</button>
      </div>

      <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">
         {notes.map((n, i) => (
           <div key={n.id || i} style={{ padding: '14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                 <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8' }}>📅 {n.date}</span>
                 <div style={{ display: 'flex', gap: '10px' }}>
                    {(isAdmin() || n.author === user?.id) && (
                      <>
                        <button onClick={()=>{setEditingId(n.id); setEditContent(n.content);}} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 800, fontSize: '0.75rem' }}>수정</button>
                        <button onClick={()=>handleDelete(n.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 800, fontSize: '0.75rem' }}>삭제</button>
                      </>
                    )}
                 </div>
              </div>
              {editingId === n.id ? (
                <div>
                   <textarea value={editContent} onChange={e=>setEditContent(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #6366f1', borderRadius: '12px' }} />
                   <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button onClick={()=>handleUpdate(n.id)} style={{ padding: '6px 12px', background: '#6366f1', color: '#fff', borderRadius: '6px', border: 'none', fontWeight: 700 }}>저장</button>
                      <button onClick={()=>setEditingId(null)} style={{ padding: '6px 12px', background: '#94a3b8', color: '#fff', borderRadius: '6px', border: 'none' }}>취소</button>
                   </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.content}</p>
              )}
              <div style={{ marginTop: '8px', textAlign: 'right', fontSize: '0.7rem', color: '#94a3b8' }}>작성자: {n.author}</div>
           </div>
         ))}
      </div>
    </div>
  );
}

function StudentAIAnalysis({ studentCode, apiUrl }: { studentCode: string, apiUrl: string }) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const requestAnalysis = async () => {
    setLoading(true); setVisible(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-student-analysis`, { student_code: studentCode }, { timeout: 240000 });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch (e: any) { setAnalysis("⚠️ AI 전문가 분석 요청 실패. (" + (e?.response?.data?.detail || e?.message || "타임아웃") + ")"); } finally { setLoading(false); }
  };

  return (
    <div>
       {!visible ? (
         <button onClick={requestAnalysis} style={{ width: '100%', padding: '14px', background: '#2563eb', color: '#fff', borderRadius: '10px', border: 'none', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
           🤖 AI 종합 분석 리포트 생성
         </button>
       ) : (
         <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, color: '#1d4ed8', fontWeight: 800, fontSize: '0.95rem' }}>🤖 AI 전문가 정밀 분석</h4>
                <button onClick={()=>setVisible(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            {loading ? (
                <div style={{ color: '#2563eb', fontWeight: 700, textAlign: 'center', padding: '20px' }}>패턴 분석 및 데이터 요약 중... 🧠</div>
            ) : (
                <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#1e293b', maxHeight: '520px', overflowY: 'auto' }} className="custom-scrollbar"><ReadableAIResult text={analysis} /></div>
            )}
         </div>
       )}
    </div>
  );
}

interface MedicationEntry { name: string; dose: string; }

function MedicationEntryList({ title, entries, onChange }: {
  title: string; entries: MedicationEntry[]; onChange: (entries: MedicationEntry[]) => void;
}) {
  const inputStyle = { flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px', display: 'block' };

  const updateEntry = (i: number, field: 'name' | 'dose', value: string) => {
    onChange(entries.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };
  const removeEntry = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const addEntry = () => onChange([...entries, { name: '', dose: '' }]);

  return (
    <div>
      <label style={labelStyle}>{title}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {entries.map((entry, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px' }}>
            <input value={entry.name} onChange={e => updateEntry(i, 'name', e.target.value)} placeholder="예: 메틸페니데이트" style={inputStyle} />
            <input value={entry.dose} onChange={e => updateEntry(i, 'dose', e.target.value)} placeholder="용량 (예: 10mg)" style={{ ...inputStyle, flex: '0 0 120px' }} />
            <button onClick={() => removeEntry(i)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', width: '32px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>
      {entries.length === 0 && <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>약물을 추가하지 않으면 &quot;미복용&quot;으로 기록됩니다.</p>}
      <button onClick={addEntry} style={{ marginTop: '6px', background: 'none', border: 'none', color: '#2563eb', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>+ 약물 추가</button>
    </div>
  );
}

function MedicationResponseReport({ studentCode, apiUrl }: { studentCode: string, apiUrl: string }) {
  const [beforeMeds, setBeforeMeds] = useState<MedicationEntry[]>([{ name: "", dose: "" }]);
  const [afterMeds, setAfterMeds] = useState<MedicationEntry[]>([{ name: "", dose: "" }]);
  const [beforeStart, setBeforeStart] = useState("");
  const [beforeEnd, setBeforeEnd] = useState("");
  const [afterStart, setAfterStart] = useState("");
  const [afterEnd, setAfterEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [copyLabel, setCopyLabel] = useState("복사하기");

  const canSubmit = !!(beforeStart && beforeEnd && afterStart && afterEnd);

  const requestReport = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-medication-response-report`, {
        student_code: studentCode,
        before_medications: beforeMeds.filter(m => m.name.trim()),
        after_medications: afterMeds.filter(m => m.name.trim()),
        before_start: beforeStart, before_end: beforeEnd,
        after_start: afterStart, after_end: afterEnd,
      }, { timeout: 240000 });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch (e: any) {
      setAnalysis("⚠️ 의견서 생성 실패. (" + (e?.response?.data?.detail || e?.message || "타임아웃") + ")");
    } finally { setLoading(false); }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(analysis);
      setCopyLabel("복사됨 ✓");
      setTimeout(() => setCopyLabel("복사하기"), 1500);
    } catch { /* clipboard unavailable — no-op */ }
  };

  const dateInputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px', display: 'block' };

  return (
    <div>
      <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>💊 약물 반응 모니터링 의견서</h3>
      <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
        약물 복용 변경 전·후 기간을 설정하면 교실에서 관찰된 행동 변화를 정리한 담임교사 의견서를 만듭니다.
        약물 시작 전(미복용)·병용 약물 등 여러 건을 함께 입력할 수 있습니다.
        정신건강의학과 진료 시 참고 자료로 제출할 수 있습니다. <strong>진단이나 처방을 대신하지는 않습니다.</strong>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
        <MedicationEntryList title="변경 전 복용 약물" entries={beforeMeds} onChange={setBeforeMeds} />
        <MedicationEntryList title="변경 후 복용 약물" entries={afterMeds} onChange={setAfterMeds} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <label style={labelStyle}>약물 변경 전 기간</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input type="date" value={beforeStart} onChange={e => setBeforeStart(e.target.value)} style={dateInputStyle} />
            <input type="date" value={beforeEnd} onChange={e => setBeforeEnd(e.target.value)} style={dateInputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>약물 변경 후 기간</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input type="date" value={afterStart} onChange={e => setAfterStart(e.target.value)} style={dateInputStyle} />
            <input type="date" value={afterEnd} onChange={e => setAfterEnd(e.target.value)} style={dateInputStyle} />
          </div>
        </div>
      </div>

      <button onClick={requestReport} disabled={!canSubmit || loading} className="btn btn-primary" style={{ width: '100%', opacity: (!canSubmit || loading) ? 0.5 : 1 }}>
        {loading ? "관찰 의견서 작성 중... 🧠" : "📋 담임교사 관찰 의견서 생성"}
      </button>

      {analysis && !loading && (
        <div style={{ marginTop: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button onClick={copyToClipboard} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 10px', fontSize: '0.75rem', color: '#475569', cursor: 'pointer' }}>{copyLabel}</button>
          </div>
          <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#1e293b', maxHeight: '520px', overflowY: 'auto' }} className="custom-scrollbar">
            <ReadableAIResult text={analysis} />
          </div>
        </div>
      )}
    </div>
  );
}

function EBPRecommendationSection({ studentCode, functionCode, settingEvents, currentTier, apiUrl }: {
  studentCode: string; functionCode: string; settingEvents: string[]; currentTier: string; apiUrl: string;
}) {
  const [bundle, setBundle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const settingEventsKey = settingEvents.join(",");

  useEffect(() => {
    const fetchBundle = async () => {
      try {
        setLoading(true);
        const res = await axios.post(`${apiUrl}/api/v1/ebp/recommend`, {
          function_code: functionCode,
          setting_events: settingEvents,
          current_tier: currentTier,
        });
        setBundle(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchBundle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentCode, functionCode, settingEventsKey, currentTier, apiUrl]);

  if (loading) return null;
  if (!bundle) return null;

  const functionLabel = FUNCTION_CODE_LABELS[functionCode] || functionCode;
  const isUnknown = functionCode === "UNKNOWN";

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
            <span>📚</span> 경기 Be-Able 39 EBP 맞춤 추천 번들
          </h3>
          <p style={{ margin: '6px 0 0 0', color: '#64748b', fontSize: '0.88rem' }}>
            FBA 증거 요약의 기능 추정({functionLabel})에 부합하는 근거기반 3단계(예방-교수-강화) 중재 후보군
          </p>
        </div>
      </div>

      {isUnknown && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px', fontSize: '0.85rem', color: '#92400e' }}>
          ⚠️ 이 학생은 행동기록에 추정기능이 입력된 건이 없어 기능을 특정할 수 없습니다. 아래는 기능과 무관한 일반 후보군입니다 — 행동기록 입력 시 &ldquo;추정기능&rdquo; 항목을 채우면 이 추천이 더 정확해집니다.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Prevent */}
        <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '16px', border: '1px solid #bae6fd' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0369a1', marginBottom: '12px' }}>
            🛡️ 1단계 선행사건 예방 전략
          </div>
          {bundle.prevent?.map((s: any) => (
            <div key={s.ebp_code} style={{ background: '#fff', padding: '14px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #e0f2fe' }}>
              {s.official_no && (
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, marginBottom: '2px' }}>
                  {String(s.official_no).padStart(2, '0')}/39 · {s.official_domain}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{s.name}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7' }}>{s.ebp_code}</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 8px 0' }}>{s.summary}</p>
              <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600 }}>권장: {s.reasons?.[0]}</div>
            </div>
          ))}
        </div>

        {/* Teach */}
        <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '16px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#15803d', marginBottom: '12px' }}>
            💡 2단계 기능적 대체행동 교수
          </div>
          {bundle.teach?.map((s: any) => (
            <div key={s.ebp_code} style={{ background: '#fff', padding: '14px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #dcfce7' }}>
              {s.official_no && (
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, marginBottom: '2px' }}>
                  {String(s.official_no).padStart(2, '0')}/39 · {s.official_domain}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{s.name}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{s.ebp_code}</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 8px 0' }}>{s.summary}</p>
              <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>권장: {s.reasons?.[0]}</div>
            </div>
          ))}
        </div>

        {/* Reinforce */}
        <div style={{ background: '#fffbeb', padding: '20px', borderRadius: '16px', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#b45309', marginBottom: '12px' }}>
            ⭐ 3단계 차별강화 및 유지
          </div>
          {bundle.reinforce?.map((s: any) => (
            <div key={s.ebp_code} style={{ background: '#fff', padding: '14px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #fef3c7' }}>
              {s.official_no && (
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, marginBottom: '2px' }}>
                  {String(s.official_no).padStart(2, '0')}/39 · {s.official_domain}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{s.name}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d97706' }}>{s.ebp_code}</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 8px 0' }}>{s.summary}</p>
              <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>권장: {s.reasons?.[0]}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
