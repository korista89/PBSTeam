"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { maskName } from "../utils";
import { API_BASE_URL } from "@/app/lib/api";
import { ChartCard, ChipRow, Empty, Kpi } from "../cico/CicoDashboard";
import Tier3Annual from "./Tier3Annual";
import Tier3Overview from "./Tier3Overview";
import ViewToggle from "../components/ViewToggle";

// Tier3 관리: Tier3·Tier3+ 월별 명단(단계 포함)과 대시보드. TierStatus는 '지금' 상태, 이 화면은 달마다의 기록.
interface Row {
  row: number; code: string; name: string; class: string; level: string; prev_level: string; memo: string;
  excluded: boolean; crisis: number; crisis_prev: number | null; cico: boolean; sst: string[]; tierstatus: string;
}
interface Overview {
  month: number; prev_month: number | null; is_current: boolean;
  history: Record<string, Record<string, string>>; names: Record<string, { name: string; class: string }>; rows: Row[];
}
interface Student { 학생코드: string; 학생이름: string; 학급: string; 재학여부?: string; }

const SCHOOL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
const C = { t3: "#ef4444", t3p: "#7f1d1d", fresh: "#10b981", ended: "#64748b", up: "#b91c1c", down: "#3b82f6" };
const nowMonth = () => new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;

export default function Tier3Page() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const [month, setMonth] = useState(nowMonth);
  const [data, setData] = useState<Overview | null>(null);
  const [roster, setRoster] = useState<Student[]>([]);
  const [pick, setPick] = useState("");
  const [pickLevel, setPickLevel] = useState("Tier3");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/tier3-monthly/overview`, { params: { month } });
      setData(data);
    } catch (e: any) {
      setStatus(`⚠ 불러오기 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!admin) return;
    axios.get(`${API_BASE_URL}/api/v1/tier/status`)
      .then(r => setRoster((r.data.students || []).filter((s: Student) => s.학생코드 && String(s.재학여부 ?? "O").trim() !== "X")))
      .catch(() => setRoster([]));
  }, [admin]);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(true);
    setStatus(`${label} 중...`);
    try {
      const res = await fn();
      setStatus(`✓ ${res?.data?.message || label + " 완료"}`);
      await load();
    } catch (e: any) {
      setStatus(`⚠ ${label} 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const post = (path: string, body: object) => axios.post(`${API_BASE_URL}/api/v1/tier3-monthly/${path}`, body);

  const active = useMemo(() => (data?.rows || []).filter(r => !r.excluded), [data]);
  const stats = useMemo(() => {
    if (!data) return null;
    const cur = data.history[String(month)] || {};
    const prev = data.prev_month ? data.history[String(data.prev_month)] || {} : null;
    const codes = Object.keys(cur);
    return {
      t3: codes.filter(c => cur[c] === "Tier3").length,
      t3p: codes.filter(c => cur[c] === "Tier3+").length,
      fresh: prev ? codes.filter(c => !prev[c]) : [],
      ended: prev ? Object.keys(prev).filter(c => !cur[c]) : [],
      up: prev ? codes.filter(c => prev[c] === "Tier3" && cur[c] === "Tier3+") : [],
      down: prev ? codes.filter(c => prev[c] === "Tier3+" && cur[c] === "Tier3") : [],
      crisis: active.reduce((n, r) => n + r.crisis, 0),
      crisisPrev: prev ? active.reduce((n, r) => n + (r.crisis_prev || 0), 0) : null,
      cico: active.filter(r => r.cico).length,
      sst: active.filter(r => r.sst.length).length,
      hasPrev: !!prev,
    };
  }, [data, month, active]);

  const trend = useMemo(() => {
    if (!data) return [];
    return SCHOOL_MONTHS.filter(m => Object.keys(data.history[String(m)] || {}).length).map(m => {
      const cur = data.history[String(m)] || {};
      const i = SCHOOL_MONTHS.indexOf(m);
      const prev = i > 0 ? data.history[String(SCHOOL_MONTHS[i - 1])] : undefined;
      const vals = Object.values(cur);
      return {
        month: `${m}월`,
        Tier3: vals.filter(v => v === "Tier3").length,
        "Tier3+": vals.filter(v => v === "Tier3+").length,
        종료: prev ? Object.keys(prev).filter(c => !cur[c]).length : 0,
      };
    });
  }, [data]);
  const byClass = useMemo(() => {
    const map = new Map<string, { cls: string; Tier3: number; "Tier3+": number }>();
    active.forEach(r => {
      const e = map.get(r.class) || { cls: r.class || "미지정", Tier3: 0, "Tier3+": 0 };
      e[r.level === "Tier3+" ? "Tier3+" : "Tier3"] += 1;
      map.set(r.class, e);
    });
    return [...map.values()].sort((a, b) => a.cls.localeCompare(b.cls));
  }, [active]);

  const label = (c: string) => maskName(data?.names[c]?.name || "") || c;
  const listed = new Set((data?.rows || []).map(r => r.code));
  const sorted = [...(data?.rows || [])].sort((a, b) => Number(a.excluded) - Number(b.excluded) || (a.level === b.level ? a.code.localeCompare(b.code) : a.level === "Tier3+" ? -1 : 1));

  return (
    <AuthCheck>
      <AppShell
        currentPage="tier3"
        title="🧩 Tier3 관리"
        subtitle="Tier3·Tier3+ 대상자를 달마다 기록하고 변화를 봅니다. 학생별 분석은 개별학생 행동중재에서 합니다"
        headerActions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {status && <span className={`badge ${status.startsWith("⚠") ? "badge-tier3" : "badge-tier1"}`} style={{ fontSize: "0.78rem" }}>{status}</span>}
            <select value={month} onChange={e => { setMonth(Number(e.target.value)); setStatus(""); }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--primary-blue)", fontWeight: 700, fontSize: "0.82rem", background: "white" }}>
              {SCHOOL_MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
        }
      >
        {view === "year" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ViewToggle value={view} onChange={setView} monthLabel={`${month}월 현황·명단`} />
            <Tier3Annual />
            <Tier3Overview />
          </div>
        ) : loading || !data || !stats ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>불러오는 중...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ViewToggle value={view} onChange={setView} monthLabel={`${month}월 현황·명단`} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              <Kpi label="Tier3" value={stats.t3} unit="명" color={C.t3} />
              <Kpi label="Tier3+" value={stats.t3p} unit="명" color={C.t3p} />
              <Kpi label="신규" value={stats.hasPrev ? stats.fresh.length : "-"} unit={stats.hasPrev ? "명" : ""} color={C.fresh} hint={stats.hasPrev ? `${data.prev_month}월에 없던 학생` : "학년도 첫 달"} />
              <Kpi label="종료" value={stats.hasPrev ? stats.ended.length : "-"} unit={stats.hasPrev ? "명" : ""} color={C.ended} hint={stats.hasPrev ? `${data.prev_month}월에 있다 빠진 학생` : "학년도 첫 달"} />
              <Kpi label="상향 (Tier3→3+)" value={stats.hasPrev ? stats.up.length : "-"} unit={stats.hasPrev ? "명" : ""} color={C.up} />
              <Kpi label="하향 (Tier3+→3)" value={stats.hasPrev ? stats.down.length : "-"} unit={stats.hasPrev ? "명" : ""} color={C.down} />
              <Kpi label="위기행동 기록" value={stats.crisis} unit="건"
                color={stats.crisisPrev != null && stats.crisis > stats.crisisPrev ? "#ef4444" : "#10b981"}
                hint={stats.crisisPrev != null ? `${data.prev_month}월 ${stats.crisisPrev}건 → 이 달 ${stats.crisis}건` : "이 달 명단 학생 합계"} />
              <Kpi label="병행 지원" value={`${stats.cico}·${stats.sst}`} unit="" color="#8b5cf6" hint="CICO 병행 · SST 프로그램 참여(명)" />
            </div>

            {stats.hasPrev && (stats.fresh.length + stats.ended.length + stats.up.length + stats.down.length > 0) && (
              <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, fontSize: "0.8rem" }}>
                {stats.fresh.length > 0 && <ChipRow title="🟢 신규" color={C.fresh} items={stats.fresh.map(label)} />}
                {stats.ended.length > 0 && <ChipRow title="⚪ 종료" color={C.ended} items={stats.ended.map(label)} />}
                {stats.up.length > 0 && <ChipRow title="🔺 상향" color={C.up} items={stats.up.map(label)} />}
                {stats.down.length > 0 && <ChipRow title="🔻 하향" color={C.down} items={stats.down.map(label)} />}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              <ChartCard title="📈 월별 Tier3·Tier3+ 인원">
                {trend.length === 0 ? <Empty text="아직 월별 기록이 없습니다." /> : (
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number, n: string) => [`${v}명`, n]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Tier3" stackId="a" fill={C.t3} />
                      <Bar dataKey="Tier3+" stackId="a" fill={C.t3p} radius={[4, 4, 0, 0]} />
                      <Line dataKey="종료" stroke={C.ended} strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              <ChartCard title={`🏫 ${month}월 학급별`}>
                {byClass.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={Math.max(160, byClass.length * 26 + 30)}>
                    <BarChart data={byClass} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="cls" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number, n: string) => [`${v}명`, n]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Tier3" stackId="a" fill={C.t3} />
                      <Bar dataKey="Tier3+" stackId="a" fill={C.t3p} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {admin && (
              <div className="card" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                <label style={{ flex: "1 1 260px" }}>
                  <span style={labelStyle}>학생 추가</span>
                  <select value={pick} onChange={e => setPick(e.target.value)} disabled={busy} style={inputStyle}>
                    <option value="">학생을 고르세요</option>
                    {roster.filter(s => !listed.has(s.학생코드) || data.rows.find(r => r.code === s.학생코드)?.excluded)
                      .sort((a, b) => a.학생코드.localeCompare(b.학생코드))
                      .map(s => <option key={s.학생코드} value={s.학생코드}>{s.학급} · {maskName(s.학생이름)} ({s.학생코드})</option>)}
                  </select>
                </label>
                <select value={pickLevel} onChange={e => setPickLevel(e.target.value)} style={{ ...inputStyle, width: 110 }}>
                  <option>Tier3</option><option>Tier3+</option>
                </select>
                <button className="btn btn-primary" disabled={busy || !pick}
                  onClick={() => run("추가", () => post("students", { month, code: pick, level: pickLevel })).then(() => setPick(""))}>➕ {month}월에 추가</button>
                <button className="btn btn-secondary" disabled={busy || !data.prev_month} onClick={() => run("지난달 가져오기", () => post("copy-prev", { month }))}>
                  📋 {data.prev_month ? `${data.prev_month}월 명단 그대로 가져오기` : "지난달 없음"}
                </button>
                <button className="btn btn-secondary" disabled={busy} onClick={() => run("Tier현황으로 채우기", () => post("fill", { month }))}
                  title="Tier현황에서 지금 Tier3/Tier3+인 학생 중 이 달 명단에 없는 학생을 넣습니다">🗓️ Tier현황으로 채우기</button>
              </div>
            )}

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>{month}월 명단 <span style={{ color: C.t3 }}>{active.length}명</span></div>
              {sorted.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>{month}월 명단이 없습니다.{admin && " 위에서 지난달 명단을 가져오거나 Tier현황으로 채우세요."}</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", color: "#475569", textAlign: "left" }}>
                        {["학급", "학생", "단계", "지난달", "위기행동(지난달→이 달)", "병행", "메모", ""].map(h => <th key={h} style={cell}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(r => (
                        <tr key={r.row} style={{ opacity: r.excluded ? 0.5 : 1, borderTop: "1px solid #f1f5f9" }}>
                          <td style={cell}>{r.class}</td>
                          <td style={cell}><strong>{maskName(r.name)}</strong> <span style={{ color: "#94a3b8" }}>{r.code}</span></td>
                          <td style={cell}>
                            {admin && !r.excluded ? (
                              <select value={r.level} disabled={busy} onChange={e => run("단계 변경", () => post("row", { month, row: r.row, level: e.target.value }))}
                                style={{ ...inputStyle, width: 90, padding: "4px 6px", color: r.level === "Tier3+" ? C.t3p : C.t3, fontWeight: 700 }}>
                                <option>Tier3</option><option>Tier3+</option>
                              </select>
                            ) : <strong style={{ color: r.level === "Tier3+" ? C.t3p : C.t3 }}>{r.level}</strong>}
                          </td>
                          <td style={cell}>{data.prev_month ? (r.prev_level || <span style={{ color: C.fresh }}>신규</span>) : "-"}</td>
                          <td style={cell}>
                            {r.crisis_prev != null ? <>{r.crisis_prev}건 → </> : null}
                            <strong style={{ color: r.crisis_prev != null && r.crisis > r.crisis_prev ? "#ef4444" : r.crisis_prev != null && r.crisis < r.crisis_prev ? "#10b981" : "#334155" }}>{r.crisis}건</strong>
                          </td>
                          <td style={cell}>
                            {r.cico && <span style={tag("#3b82f6")}>CICO</span>}
                            {r.sst.map(p => <span key={p} style={tag("#8b5cf6")} title={p}>SST</span>)}
                          </td>
                          <td style={cell}>
                            {admin ? (
                              <input defaultValue={r.memo} disabled={busy} placeholder="메모"
                                onBlur={e => { if (e.target.value !== r.memo) void run("메모 저장", () => post("row", { month, row: r.row, memo: e.target.value })); }}
                                style={{ ...inputStyle, padding: "4px 6px", minWidth: 120 }} />
                            ) : r.memo}
                          </td>
                          <td style={{ ...cell, whiteSpace: "nowrap" }}>
                            <a href={`/target-behavior?student=${encodeURIComponent(r.code)}`} style={{ marginRight: 8 }}>행동중재</a>
                            {admin && (
                              <button className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: "0.72rem" }} disabled={busy}
                                onClick={() => run(r.excluded ? "복원" : "명단에서 빼기", () => post("row", { month, row: r.row, excluded: !r.excluded }))}>
                                {r.excluded ? "복원" : "명단에서 빼기"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 6 }}>
                    ※ ‘명단에서 빼기’는 잘못 넣은 줄을 바로잡는 용도입니다(기록은 남음). 달이 바뀔 때의 변화는 위 신규·종료·상향·하향으로 봅니다. 위기행동은 Log_Main 기록 건수입니다.
                  </p>
                </div>
              )}
            </div>

            <p style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
              ※ 이번 달 명단을 바꾸면 Tier현황의 Tier3·Tier3+ 칸이 그 학생만 자동으로 맞춰집니다(Tier3+는 Tier3 칸도 O). 전교생 차이는 Tier현황 탭에서 확인합니다.
            </p>
          </div>
        )}
      </AppShell>
    </AuthCheck>
  );
}

const tag = (color: string): React.CSSProperties => ({ padding: "1px 6px", borderRadius: 6, background: `${color}18`, color, fontSize: "0.68rem", fontWeight: 700, marginRight: 4 });
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.72rem", color: "#64748b", fontWeight: 700, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem", background: "#fff" };
const cell: React.CSSProperties = { padding: "8px 10px", verticalAlign: "middle" };
