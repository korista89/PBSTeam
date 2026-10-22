"use client";

// 관리자 브리핑 — 급할 때는 맨 위 '오늘의 10줄'만 읽으면 된다. 아래는 근거(기간별 그래프·학생 목록).
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart, Legend,
} from "recharts";
import { API_BASE_URL } from "../constants";
import AppShell from "../components/AppShell";
import { AuthCheck, useAuth } from "../components/AuthProvider";

type Pair = [string, number];
interface Student { code: string; label: string; count: number; crisis: number; class: string }
interface Period {
  label: string; start: string; end: string; count: number; students: number; crisis: number;
  avg_intensity: number | null; prev_label: string; prev_count: number; change_pct: number | null;
  by_type: Pair[]; by_place: Pair[]; by_slot: Pair[]; top_students: Student[];
  series: { date?: string; month?: string; count: number; crisis?: number }[];
}
interface DayItem {
  log_id: string; code: string; label: string; class: string; time: string; place: string; type: string;
  intensity: number | null; crisis: boolean; action: string; status: string; note: string; missing_report: boolean;
}
interface Day { date: string; count: number; students: number; crisis: number; items: DayItem[] }
interface Trend { code: string; label: string; class: string; tier: number; recent: number; before: number; actions?: string[]; message?: string }
interface Briefing {
  today: string; ten_lines: string[];
  days: { yesterday: Day; day_before: Day; today: Day };
  periods: { week: Period; month: Period; semester: Period; year: Period };
  increasing: Trend[]; decreasing: Trend[];
  todo: { level: string; text: string; href: string | null }[];
  tier_counts: Record<string, number>; rules: Record<string, string>;
}

const PERIOD_KEYS = ["week", "month", "semester", "year"] as const;
const LEVEL_COLOR: Record<string, string> = { high: "#dc2626", mid: "#d97706", low: "#16a34a" };
const kdate = (iso: string) => { const [, m, d] = iso.split("-"); return `${+m}. ${+d}.`; };

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ color: "#64748b" }}>비교 불가</span>;
  const up = pct > 0;
  return <b style={{ color: up ? "#dc2626" : pct < 0 ? "#16a34a" : "#64748b" }}>{up ? "▲" : pct < 0 ? "▼" : "–"} {Math.abs(pct)}%</b>;
}

function Bars({ title, data }: { title: string; data: Pair[] }) {
  const max = Math.max(1, ...data.map(d => d[1]));
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 6 }}>{title}</div>
      {data.length === 0 && <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>없음</div>}
      {data.map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", marginBottom: 4 }}>
          <span style={{ width: 92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
          <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 4 }}>
            <div style={{ width: `${(v / max) * 100}%`, background: "#3b82f6", height: 12, borderRadius: 4 }} />
          </div>
          <b style={{ width: 28, textAlign: "right" }}>{v}</b>
        </div>
      ))}
    </div>
  );
}

function DayCard({ title, day }: { title: string; day: Day }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>{title} <span style={{ color: "#64748b", fontWeight: 500 }}>({kdate(day.date)})</span></h3>
        <span style={{ fontSize: "0.85rem" }}><b>{day.count}</b>건 · {day.students}명 · 조치 <b style={{ color: "#dc2626" }}>{day.crisis}</b></span>
      </div>
      {day.items.length === 0 ? <div style={{ color: "#16a34a", fontWeight: 700 }}>위기행동 없음</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {day.items.map((i, n) => (
            <div key={i.log_id || n} style={{ fontSize: "0.83rem", padding: "6px 8px", borderRadius: 6, background: i.crisis ? "#fef2f2" : "#f8fafc", borderLeft: `4px solid ${i.crisis ? "#dc2626" : "#cbd5e1"}` }}>
              <b>{i.label}</b> <span style={{ color: "#64748b" }}>{i.class}</span> · {i.place} · {i.type} · 강도 {i.intensity ?? "-"}
              {i.crisis && <span style={{ color: "#dc2626", fontWeight: 700 }}> · {i.action}</span>}
              {i.missing_report && <span style={{ marginLeft: 6, background: "#dc2626", color: "#fff", borderRadius: 4, padding: "0 6px", fontSize: "0.72rem" }}>보고/알림 누락</span>}
              {i.status === "Pending" && <span style={{ marginLeft: 6, background: "#f59e0b", color: "#fff", borderRadius: 4, padding: "0 6px", fontSize: "0.72rem" }}>결재 대기</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BriefingPage() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<Briefing | null>(null);
  const [cico, setCico] = useState<{ month: string; ratio: number | null }[]>([]);
  const [tab, setTab] = useState<(typeof PERIOD_KEYS)[number]>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/briefing${refresh ? "?refresh=true" : ""}`);
      setData(res.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "브리핑을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
    // CICO 추이는 느려서 따로 불러온다(본 브리핑 표시를 막지 않음)
    axios.get(`${API_BASE_URL}/api/v1/briefing/cico`).then(r => setCico(r.data.trend || [])).catch(() => setCico([]));
  }, []);

  useEffect(() => { if (isAdmin()) void load(); }, [isAdmin, load]);

  const p = data?.periods[tab];

  return (
    <AuthCheck>
      <AppShell
        currentPage="briefing"
        title="🗞️ 관리자 브리핑"
        subtitle={data ? `${kdate(data.today)} 기준 · 급하면 맨 위 10줄만 읽으세요` : "학교에서 있었던 일을 한눈에"}
        hideDateFilter={true}
        headerActions={
          <div style={{ display: "flex", gap: 8 }} className="no-print">
            <button onClick={() => void load(true)} className="btn btn-secondary" disabled={loading}>🔄 새로고침</button>
            <button onClick={() => window.print()} className="btn btn-secondary">🖨️ 인쇄</button>
          </div>
        }
      >
        {!isAdmin() ? (
          <div className="card" style={{ padding: 20 }}>관리자만 볼 수 있는 화면입니다.</div>
        ) : loading && !data ? (
          <div className="card" style={{ padding: 30, textAlign: "center" }}>⏳ 브리핑을 만들고 있습니다...</div>
        ) : error ? (
          <div className="card" style={{ padding: 20, background: "#fef2f2", color: "#dc2626" }}>⚠️ {error}</div>
        ) : data && p && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 1. 오늘의 10줄 */}
            <div className="card" style={{ padding: "18px 22px", borderLeft: "6px solid #1e3a8a" }}>
              <h2 style={{ margin: "0 0 10px", fontSize: "1.15rem", color: "#1e3a8a" }}>🔟 오늘의 10줄</h2>
              <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6, fontSize: "1rem", lineHeight: 1.5 }}>
                {data.ten_lines.map((l, i) => <li key={i} style={{ fontWeight: i >= 6 ? 700 : 500 }}>{l}</li>)}
              </ol>
            </div>

            {/* 2. 오늘 할 일 */}
            {data.todo.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>✅ 오늘 할 일</h3>
                {data.todo.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: "0.9rem" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: LEVEL_COLOR[t.level] || "#64748b", flexShrink: 0 }} />
                    {t.href ? <a href={t.href} style={{ color: "#0f172a" }}>{t.text} →</a> : <span>{t.text}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* 3. 어제 / 엊그제 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              <DayCard title="어제 (직전 수업일)" day={data.days.yesterday} />
              <DayCard title="엊그제" day={data.days.day_before} />
            </div>

            {/* 4. 기간 요약 카드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {PERIOD_KEYS.map(k => {
                const x = data.periods[k];
                return (
                  <button key={k} onClick={() => setTab(k)} className="card" style={{ padding: 14, textAlign: "left", cursor: "pointer", border: tab === k ? "2px solid #1e3a8a" : "1px solid #e2e8f0", background: "#fff" }}>
                    <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>{x.label}</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{x.count}<span style={{ fontSize: "0.9rem" }}>건</span></div>
                    <div style={{ fontSize: "0.8rem" }}>{x.students}명 · 조치 {x.crisis}건 · <Change pct={x.change_pct} /> <span style={{ color: "#94a3b8" }}>vs {x.prev_label}</span></div>
                  </button>
                );
              })}
            </div>

            {/* 5. 선택 기간 분석 */}
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>📈 {p.label} 분석 <span style={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>({kdate(p.start)}~{kdate(p.end)} · 평균 강도 {p.avg_intensity ?? "-"})</span></h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={p.series.map(s => ({ ...s, x: s.date ? kdate(s.date) : s.month }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="x" fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="count" name="위기행동" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    {p.series[0]?.date && <Bar dataKey="crisis" name="조치(보고서)" fill="#dc2626" radius={[4, 4, 0, 0]} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 12 }}>
                <Bars title="행동유형" data={p.by_type} />
                <Bars title="장소" data={p.by_place} />
                <Bars title="시간대" data={p.by_slot} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 6 }}>많이 발생한 학생</div>
                  {p.top_students.map(s => (
                    <a key={s.code} href={`/student/${s.code}`} style={{ display: "block", fontSize: "0.82rem", color: "#0f172a", marginBottom: 4 }}>
                      <b>{s.label}</b> {s.count}건{s.crisis ? <span style={{ color: "#dc2626" }}> (조치 {s.crisis})</span> : null}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* 6. 증가 / 감소 학생 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              <div className="card" style={{ padding: 16, borderTop: "4px solid #dc2626" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>⚠️ 눈여겨볼 학생 (증가)</h3>
                {data.increasing.length === 0 ? <div style={{ color: "#64748b" }}>없음</div> : data.increasing.map(s => (
                  <div key={s.code} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <a href={`/student/${s.code}`} style={{ fontWeight: 800, color: "#0f172a" }}>{s.label}</a>
                    <span style={{ color: "#64748b", fontSize: "0.82rem" }}> {s.class} · Tier{s.tier} · {s.before}→<b style={{ color: "#dc2626" }}>{s.recent}</b>건</span>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: "0.85rem" }}>{s.actions?.map(a => <li key={a}>{a}</li>)}</ul>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: 16, borderTop: "4px solid #16a34a" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>👏 칭찬할 학생 (감소)</h3>
                {data.decreasing.length === 0 ? <div style={{ color: "#64748b" }}>없음</div> : data.decreasing.map(s => (
                  <div key={s.code} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <a href={`/student/${s.code}`} style={{ fontWeight: 800, color: "#0f172a" }}>{s.label}</a>
                    <span style={{ color: "#64748b", fontSize: "0.82rem" }}> {s.class} · {s.before}→<b style={{ color: "#16a34a" }}>{s.recent}</b>건</span>
                    <div style={{ fontSize: "0.85rem", marginTop: 2 }}>{s.message}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 7. Tier · CICO */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>🧩 Tier 현황</h3>
                <div style={{ display: "flex", gap: 12 }}>
                  {Object.entries(data.tier_counts).map(([k, v]) => (
                    <div key={k} style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: 8, background: "#f8fafc" }}>
                      <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{k}</div>
                      <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{v}명</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>📝 이번 학기 CICO 목표 달성률</h3>
                {cico.length === 0 ? <div style={{ color: "#64748b", fontSize: "0.85rem" }}>불러오는 중이거나 자료가 없습니다.</div> : (
                  <div style={{ height: 160 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cico}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis domain={[0, 100]} unit="%" fontSize={11} />
                        <Tooltip />
                        <Legend />
                        <Line dataKey="ratio" name="달성률" stroke="#16a34a" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              기준: {Object.values(data.rules).join(" · ")}
            </div>
          </div>
        )}
      </AppShell>
    </AuthCheck>
  );
}
