"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import AppShell from "../../components/AppShell";
import { useDateRange } from "../../components/GlobalNav";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import { maskName, formatWeek } from "../../utils";

interface BehaviorType { name: string; value: number; }
interface WeeklyTrend { week: string; count: number; }

interface Tier3Student {
  code: string; name: string; class: string; tier: string; beable_code: string; memo: string;
  incidents: number; max_intensity: number; avg_intensity: number;
  behavior_types: BehaviorType[]; weekly_trend: WeeklyTrend[];
  weekly_trend_freq?: WeeklyTrend[];
  decision: string; decision_color: string;
  zero_week_alert?: boolean; zero_weeks_count?: number;
}

interface Tier3ReportData {
  students: Tier3Student[];
  summary: {
    total_students: number;
    total_incidents: number;
    avg_intensity: number;
    weekly_trend?: WeeklyTrend[];
  };
}

const DECISION_OPTIONS = [
  { label: "Tier3 유지", color: "#ef4444" },
  { label: "Tier3 유지 (관찰)", color: "#f59e0b" },
  { label: "Tier2(CICO) 하향 검토", color: "#10b981" },
  { label: "Tier2(SST) 전환", color: "#3b82f6" },
  { label: "Tier3+ 상향 검토", color: "#7c3aed" },
  { label: "Tier3+ 유지 (위기)", color: "#7c3aed" },
];

const PIE_COLORS = ['#3b82f6','#f59e0b','#ef4444','#22c55e','#8b5cf6','#06b6d4','#f97316'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', boxShadow: '0 4px 8px rgba(0,0,0,0.08)', fontSize: '12px' }}>
        {label && <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>}
        {payload.map((p: any, i: number) => <p key={i} style={{ margin: '2px 0', color: p.color }}>{p.name}: <b>{p.value}</b></p>)}
      </div>
    );
  }
  return null;
};

export default function Tier3Report() {
  const { user, isAdmin } = useAuth();
  const { startDate, endDate } = useDateRange();
  const [data, setData] = useState<Tier3ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const apiUrl = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_API_URL || "" : "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (startDate && endDate) { params.append("start_date", startDate); params.append("end_date", endDate); }
      if (!isAdmin() && user?.class_id) params.append("class_id", user.class_id);
      const queryString = params.toString();
      const url = queryString ? `${apiUrl}/api/v1/analytics/tier3-report?${queryString}` : `${apiUrl}/api/v1/analytics/tier3-report`;
      const res = await axios.get(url, { timeout: 30000 });
      setData(res.data);
    } catch (err: unknown) {
      console.error(err);
      if (axios.isAxiosError(err) && err.response?.status === 500) {
        setError("서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } else if (axios.isAxiosError(err) && err.code === 'ECONNABORTED') {
        setError("응답 시간이 초과되었습니다. 날짜 범위를 좁혀서 다시 시도해주세요.");
      } else {
        setError(err instanceof Error ? err.message : "데이터 로딩 실패");
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, apiUrl, user?.class_id, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Backend /api/v1/analytics/tier3-report already scopes `data.students` to the
  // caller's own class for non-admins (server derives+overrides class_id from the
  // session) — no client-side re-filtering needed here.
  const students = data ? data.students : [];

  return (
    <AuthCheck>
      <AppShell
        currentPage="report-tier3"
        title="🧩 FBA/BIP관리"
        subtitle={`Tier 3(Tier3+) 대상학생 기능적행동평가(FBA) 기반 행동중재계획(BIP) 수립·관리 ${startDate && endDate ? `(${startDate} ~ ${endDate})` : ""}`}
        headerActions={
          <button onClick={fetchData} className="btn btn-secondary">
            🔄 새로고침
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {loading && (
            <div className="card" style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px", animation: "spin 2s linear infinite" }}>⏳</div>
              <p style={{ fontWeight: 700 }}>위기행동 분석 데이터를 불러오고 있습니다...</p>
            </div>
          )}

          {error && (
            <div className="card" style={{ padding: "20px", background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", textAlign: "center" }}>
              ⚠️ {error}
              <button onClick={fetchData} className="btn btn-primary" style={{ marginLeft: "12px" }}>다시 시도</button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Decision Legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "4px", padding: "12px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                <span style={{ color: "#64748b", fontSize: "0.75rem", alignSelf: "center", fontWeight: 600 }}>의사결정 기준:</span>
                {DECISION_OPTIONS.map(opt => (
                  <span key={opt.label} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: opt.color, background: `${opt.color}15`, padding: "3px 8px", borderRadius: "4px" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: opt.color }} />
                    {opt.label}
                  </span>
                ))}
              </div>

              <MeetingNotesSection apiUrl={apiUrl} meetingType="tier3" title="Tier 3 사례회의록 (학급 공통)" />

              {/* ===== Per-student FBA/BIP frames ===== */}
              {students.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", color: "#64748b" }}>
                  Tier3 대상 학생이 없습니다.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {students.map(s => (
                    <StudentFBAFrame key={s.code} student={s} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* 해석 가이드 */}
          <div style={{ marginTop:12, padding:"22px 26px", background:"linear-gradient(135deg,#fff1f2,#ffe4e6)", borderRadius:20, border:"1px solid #fecdd3" }}>
            <h3 style={{ margin:"0 0 14px 0", fontSize:"1rem", fontWeight:800, color:"#881337" }}>📖 FBA/BIP관리 해석 가이드</h3>
            <div className="grid-responsive" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:"0.75rem", color:"#0f172a", lineHeight:1.7 }}>
              {[
                {t:"학생별 프레임", b:"Tier3 대상학생마다 FBA 관련 추세 차트(주간빈도·행동유형·강도)를 한눈에 보여주는 트리아지 화면입니다. BIP 작성·AI 초안·EBP 선택·위기절차·협의기록·데이터기반 의사결정 제안은 '상세'·'BIP 작성/수정' 버튼으로 이동하는 통합 BIP 페이지에서 관리합니다."},
                {t:"의사결정 배지", b:"학생 카드 상단의 배지(Tier3 유지/하향 검토 등)는 최근 기간 데이터를 기준으로 한 참고 신호입니다. 실제 조정 여부는 통합 BIP 페이지의 데이터기반 의사결정 제안과 팀 협의를 거쳐 결정하세요."},
                {t:"Tier 3 사례회의록", b:"이 페이지 상단의 협의록은 학급 공통(Tier3 전체) 기록입니다. 학생 개인별 개별화교육지원팀 협의 기록은 통합 BIP 페이지에 따로 있습니다."},
              ].map((item,i) => (
                <div key={i} style={{ background:"#fff", borderRadius:10, padding:"10px 12px", border:"1px solid #fecdd3" }}>
                  <div style={{ fontWeight:800, color:"#be123c", marginBottom:3 }}>{item.t}</div>
                  <div style={{ color:"#334155" }}>{item.b}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    </AuthCheck>
  );
}

// ====== 학생별 FBA 요약 프레임 (트리아지 전용 — BIP 작성/수정은 통합 페이지로 이동) ======
function StudentFBAFrame({ student: s }: { student: Tier3Student }) {
  const getIntensityColor = (i: number) => i >= 5 ? "#ef4444" : i >= 3 ? "#f59e0b" : "#22c55e";
  const maxIncidents = Math.max(s.incidents, 1);

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
      {/* Frame header */}
      <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #fef2f2, #fff)', borderBottom: '2px solid #fecdd3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700, color: s.tier === "Tier3+" ? "#7c3aed" : "#ef4444", background: s.tier === "Tier3+" ? "#7c3aed15" : "#ef444415" }}>{s.tier}</span>
          <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{maskName(s.name) || s.code}</strong>
          <span style={{ color: '#64748b', fontSize: '0.78rem' }}>{s.code} · {s.class}</span>
          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 600, color: s.decision_color, background: `${s.decision_color}12`, border: `1px solid ${s.decision_color}30` }}>{s.decision}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => window.location.href = `/student/${s.code}`} style={{ padding: "5px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>상세</button>
          <button onClick={() => window.location.href = `/student/${s.code}/bip`} style={{ padding: "5px 12px", background: "#8b5cf6", color: "white", border: "none", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>BIP 작성/수정</button>
        </div>
      </div>

      <div style={{ padding: '18px 20px' }}>
        {/* 3 FBA trend charts + BIP CTA (4-col) — AI 초안생성/EBP선택/위기절차/협의기록/DBDM 편집기는
            중복 편집 화면을 없애기 위해 /student/{code}/bip 통합 페이지로 이동했습니다. */}
        <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <div style={{ background: '#fafafa', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '10px', color: '#0f172a' }}>📈 주간 발생빈도 추이</div>
            {s.weekly_trend_freq && s.weekly_trend_freq.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={s.weekly_trend_freq}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" style={{ fontSize: '8px' }} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={formatWeek} />
                  <YAxis allowDecimals={false} style={{ fontSize: '8px' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="count" name="발생빈도" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '20px 0' }}>데이터 없음</p>}
          </div>

          <div style={{ background: '#fafafa', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '10px', color: '#0f172a' }}>🎭 행동 유형 분포</div>
            {s.behavior_types.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={s.behavior_types.map(b => ({ ...b, name: b.name.split(':')[0] }))} cx="50%" cy="50%" outerRadius={55} innerRadius={30} paddingAngle={3} dataKey="value">
                    {s.behavior_types.map((_: any, idx: number) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v}건`, '']} />
                  <Legend wrapperStyle={{ fontSize: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '20px 0' }}>데이터 없음</p>}
          </div>

          <div style={{ background: '#fafafa', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '10px', color: '#0f172a' }}>⚡ 행동 강도 정보</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
              {[
                { label: '최대 강도', val: s.max_intensity, max: 5 },
                { label: '평균 강도', val: s.avg_intensity, max: 5 },
                { label: '보고 건수', val: s.incidents, max: maxIncidents },
              ].map((item, idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '3px' }}>
                    <span style={{ color: '#64748b' }}>{item.label}</span>
                    <span style={{ fontWeight: 700, color: getIntensityColor(item.val) }}>{item.val}{idx < 2 ? '/5' : '건'}</span>
                  </div>
                  <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (item.val / item.max) * 100)}%`, height: '100%', background: idx === 2 ? '#ef4444' : getIntensityColor(item.val), borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #faf5ff, #fff)', borderRadius: '12px', padding: '14px', border: '1px solid #ddd5f5', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 8 }}>
            <div style={{ fontSize: '1.4rem' }}>🧩</div>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#7c3aed' }}>AI 초안·EBP 선택·위기절차·협의기록·DBDM 제안은 통합 BIP 페이지에서 관리합니다</div>
            <button
              onClick={() => window.location.href = `/student/${s.code}/bip`}
              style={{ marginTop: 4, padding: '8px 14px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}
            >
              BIP 작성/수정 열기 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== 회의록/협의기록 섹션 (학급 공통 또는 학생별, 누적기록) ======
function MeetingNotesSection({ apiUrl, meetingType, title, studentCode }: { apiUrl: string, meetingType: string, title: string, studentCode?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotes = async () => {
    try {
      const params = new URLSearchParams({ meeting_type: meetingType });
      if (studentCode) params.append("student_code", studentCode);
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?${params.toString()}`);
      setNotes(res.data.notes || []);
    } catch (e) { }
  };

  useEffect(() => { if (expanded) fetchNotes(); }, [expanded]);

  const saveNote = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, { meeting_type: meetingType, date: new Date().toISOString().split('T')[0], content, author: "Teacher", student_code: studentCode || "" });
      setContent(""); fetchNotes(); alert("저장되었습니다.");
    } catch { alert("저장 실패"); } finally { setLoading(false); }
  };

  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: expanded ? "#0f172a" : "#f8fafc" }}>
        <h3 style={{ margin: 0, fontSize: "0.95rem", color: expanded ? "#e2e8f0" : "#1e293b" }}>📝 {title}</h3>
        <span style={{ color: expanded ? "#94a3b8" : "#64748b", fontSize: '0.85rem' }}>{expanded ? "▲ 접기" : "▼ 펼치기"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "20px", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ marginBottom: "16px" }}>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="협의 내용을 비식별화하여 입력하세요..."
              style={{ width: "100%", minHeight: "80px", padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#1e293b", marginBottom: "8px", fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <button onClick={saveNote} disabled={loading || !content.trim()}
              style={{ padding: "8px 16px", background: "#6366f1", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem", opacity: loading ? 0.7 : 1 }}>
              {loading ? "저장 중..." : "협의 기록 저장 (누적)"}
            </button>
          </div>
          <h4 style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#64748b" }}>📋 누적 기록</h4>
          {notes.length === 0 ? <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>기록이 없습니다.</p> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "200px", overflowY: "auto" }}>
              {notes.map(n => (
                <li key={n.id} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px dashed #e2e8f0" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>{n.date} | {n.author}</div>
                  <div style={{ fontSize: "0.9rem", color: "#1e293b", whiteSpace: "pre-wrap" }}>{n.content}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
