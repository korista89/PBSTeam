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
import { maskName, formatWeek, parseBIPAIResult } from "../../utils";

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

// 39 Be-Able EBP catalog categories mapped to the 3 selectable EBP columns.
// 위기행동지원절차(CrisisEBP) is not EBP-catalog-driven — it's the school's
// fixed crisis response protocol, edited via CrisisProtocolEditor below.
const EBP_CATEGORY_MAP: Record<string, string[]> = {
  PreventionEBP: ["ANTECEDENT", "SETTING_EVENT"],
  TeachingEBP: ["TEACHING"],
  ConsequenceEBP: ["REINFORCEMENT", "CONSEQUENCE"],
};
const EBP_COLUMN_LABELS: Record<string, string> = {
  PreventionEBP: "🛡️ 예방 전략",
  TeachingEBP: "📚 교수 전략",
  ConsequenceEBP: "🎁 후속결과 전략",
};

// 경은학교 위기행동지원절차 표준 프로토콜 기본값 — 학생별로 자유롭게 수정 가능.
const CRISIS_PROTOCOL_FIELDS: { key: string; label: string; default: string }[] = [
  { key: "precursor", label: "전조", default: "표정이 굳거나 목소리가 커짐, 자리 이탈 시도, 물건을 만지작거리는 등 평소와 다른 신호를 관찰한다. 이 단계에서 즉시 개입하여 고조를 예방한다." },
  { key: "escalation", label: "고조", default: "언어적 자극과 지시·요구를 즉시 중단하고 안전거리를 확보한다. 시각적 지원 도구(감정카드, 진정카드 등)를 제시하여 자기조절을 유도한다." },
  { key: "notification", label: "알림", default: "위기대응팀(또는 관리자·보건교사)에게 즉시 알린다. 학급 내 다른 학생의 안전 확보를 위해 보조인력을 요청한다." },
  { key: "location", label: "장소/이동방법", default: "사전 지정된 안전공간(심리안정실 등)으로 이동한다. 최소 인원으로 측면에서 유도하며 신체 접촉은 최소화한다." },
  { key: "observation", label: "관찰 방법", default: "10분 간격으로 행동강도와 안전상태를 관찰·기록한다. 자해·타해 위험이 지속되는지 우선 확인한다." },
  { key: "response_check", label: "호명반응 확인 방법", default: "이름을 부드럽게 호명하여 반응 여부를 확인한다(눈맞춤, 고개 돌림 등). 반응이 없으면 관찰을 지속하고, 반응이 있으면 회복 단계 전환을 시도한다." },
  { key: "instructions", label: "지시 목록", default: "짧고 단순한 1단계 지시만 사용한다(예: \"앉자\", \"숨 쉬자\"). 여러 지시를 한 번에 주거나 장황하게 설명하지 않으며, 선택형 지시는 지양한다." },
  { key: "recovery_talk", label: "회복대화 방법", default: "행동이 진정된 후 감정을 먼저 인정한다(\"많이 힘들었구나\"). 상황 설명은 짧게 하고 비난·훈계는 하지 않는다." },
  { key: "return_intent", label: "복귀의사 방법", default: "학생에게 교실 복귀 의사를 직접 묻고 스스로 결정할 시간을 준다(예: \"준비되면 알려줘\")." },
  { key: "post_return", label: "복귀 후 반응", default: "복귀 후 15~20분간 참여도와 정서 상태를 관찰한다. 필요 시 과제량을 조정하고 성공 경험을 제공하여 안정을 강화한다." },
];

function withCrisisDefaults(value: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const f of CRISIS_PROTOCOL_FIELDS) result[f.key] = value?.[f.key] ?? f.default;
  return result;
}

function safeParseCrisisProtocol(v: any): Record<string, string> {
  if (!v) return withCrisisDefaults({});
  try {
    const parsed = JSON.parse(v);
    return withCrisisDefaults(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
  } catch { return withCrisisDefaults({}); }
}

interface EBPItem { code?: string; name: string; fidelity: string; }

function safeParseEBP(v: any): EBPItem[] {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

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
  const [ebpCatalog, setEbpCatalog] = useState<any[]>([]);

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

  useEffect(() => {
    axios.get(`${apiUrl}/api/v1/ebp/catalog`).then(res => setEbpCatalog(res.data.strategies || [])).catch(() => {});
  }, [apiUrl]);

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
                    <StudentFBAFrame key={s.code} student={s} apiUrl={apiUrl} startDate={startDate} endDate={endDate} ebpCatalog={ebpCatalog} />
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
                {t:"학생별 프레임", b:"Tier3 대상학생마다 FBA 관련 추세 차트 3개 + 최초 FBA기반BIP작성 제안 AI, EBP 선택/충실도 입력, 개별화교육지원팀 협의 기록, 데이터기반 의사결정 제안 AI를 한 프레임에서 관리합니다."},
                {t:"EBP 선택 & 충실도", b:"39 경기 Be-Able EBP 카탈로그에서 선택하거나 직접 입력할 수 있습니다. 각 전략 옆 충실도 체크포인트에 실제 실행 여부를 한 줄로 기록하면 AI 제안의 근거가 됩니다."},
                {t:"개별화교육지원팀 협의", b:"학생별로 누적 기록됩니다. 회의 때마다 새로 입력해도 이전 기록은 삭제되지 않고 아래에 계속 쌓입니다."},
                {t:"데이터기반 의사결정 제안", b:"저장된 기간 데이터 + 현재 BIP + EBP 충실도 + 협의 기록을 종합해 BIP 유지/수정/Tier 조정 여부를 제안합니다. 실행 전 EBP·협의 내용을 먼저 저장하세요."},
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

// ====== 학생별 FBA/BIP 프레임 (1열, 내부 1행 4열 FBA차트+AI / 2행 4열 EBP선택 / 협의기록 / 종합 AI) ======
interface BIPRecord { [key: string]: any; }

function StudentFBAFrame({ student: s, apiUrl, startDate, endDate, ebpCatalog }: {
  student: Tier3Student; apiUrl: string; startDate?: string; endDate?: string; ebpCatalog: any[];
}) {
  const [bip, setBip] = useState<BIPRecord | null>(null);
  const [ebp, setEbp] = useState<Record<string, EBPItem[]>>({ PreventionEBP: [], TeachingEBP: [], ConsequenceEBP: [] });
  const [crisisProtocol, setCrisisProtocol] = useState<Record<string, string>>(withCrisisDefaults({}));
  const [loadingBip, setLoadingBip] = useState(true);
  const [saving, setSaving] = useState(false);

  const [aiInitial, setAiInitial] = useState<{ loading: boolean; text: string; saved: boolean }>({ loading: false, text: "", saved: false });
  const [aiDecision, setAiDecision] = useState<{ loading: boolean; text: string }>({ loading: false, text: "" });

  const getIntensityColor = (i: number) => i >= 5 ? "#ef4444" : i >= 3 ? "#f59e0b" : "#22c55e";

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${apiUrl}/api/v1/bip/students/${s.code}/bip`);
        const d = res.data || {};
        setBip(d);
        setEbp({
          PreventionEBP: safeParseEBP(d.PreventionEBP),
          TeachingEBP: safeParseEBP(d.TeachingEBP),
          ConsequenceEBP: safeParseEBP(d.ConsequenceEBP),
        });
        setCrisisProtocol(safeParseCrisisProtocol(d.CrisisEBP));
      } catch { setBip({ StudentCode: s.code }); }
      finally { setLoadingBip(false); }
    })();
  }, [apiUrl, s.code]);

  const handleSaveEBP = async () => {
    setSaving(true);
    try {
      await axios.post(`${apiUrl}/api/v1/bip/students/${s.code}/bip`, {
        ...(bip || {}),
        StudentCode: s.code,
        PreventionEBP: JSON.stringify(ebp.PreventionEBP),
        TeachingEBP: JSON.stringify(ebp.TeachingEBP),
        ConsequenceEBP: JSON.stringify(ebp.ConsequenceEBP),
        CrisisEBP: JSON.stringify(crisisProtocol),
      });
      alert("EBP 선택·위기행동지원절차·충실도 체크포인트가 저장되었습니다.");
    } catch { alert("저장 실패"); }
    finally { setSaving(false); }
  };

  const handleInitialBIP = async () => {
    setAiInitial({ loading: true, text: "", saved: false });
    try {
      const res = await axios.post(`${apiUrl}/api/v1/bip/students/${s.code}/ai-bip-full`, {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        medication_status: bip?.MedicationStatus || "",
        reinforcer_info: bip?.ReinforcerInfo || "",
        other_considerations: bip?.OtherConsiderations || "",
      }, { timeout: 180000 });
      const analysisText = res.data.analysis || "분석 결과가 없습니다.";

      // 실제 BIP 문서(1~8번 필드)에 자동 반영 — 기존 내용은 지우지 않고 뒤에 이어붙인다.
      const parsed = parseBIPAIResult(analysisText);
      let saved = false;
      if (Object.keys(parsed).length > 0) {
        const updatedBip: BIPRecord = { ...(bip || {}), StudentCode: s.code };
        for (const [k, v] of Object.entries(parsed)) {
          if (!v) continue;
          const existing = (updatedBip[k] || "").toString().trim();
          updatedBip[k] = existing ? `${existing}\n\n${v}` : v;
        }
        await axios.post(`${apiUrl}/api/v1/bip/students/${s.code}/bip`, updatedBip);
        setBip(updatedBip);
        saved = true;
      }
      setAiInitial({ loading: false, text: analysisText, saved });
    } catch (e: any) {
      setAiInitial({ loading: false, text: "⚠️ 요청 실패: " + (e?.response?.data?.detail || e?.message || "타임아웃"), saved: false });
    }
  };

  const handleDecisionAI = async () => {
    setAiDecision({ loading: true, text: "" });
    try {
      const res = await axios.post(`${apiUrl}/api/v1/bip/students/${s.code}/ai-decision-recommendation`, {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }, { timeout: 180000 });
      setAiDecision({ loading: false, text: res.data.analysis || "분석 결과가 없습니다." });
    } catch (e: any) {
      setAiDecision({ loading: false, text: "⚠️ 요청 실패: " + (e?.response?.data?.detail || e?.message || "타임아웃") });
    }
  };

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
          <button onClick={() => window.location.href = `/student/${s.code}/bip`} style={{ padding: "5px 12px", background: "#8b5cf6", color: "white", border: "none", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>BIP 전문 편집</button>
        </div>
      </div>

      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Row 1: 3 FBA trend charts + AI cell (4-col) */}
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

          <div style={{ background: 'linear-gradient(135deg, #faf5ff, #fff)', borderRadius: '12px', padding: '14px', border: '1px solid #ddd5f5', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '10px', color: '#7c3aed' }}>🤖 AI 분석 결과</div>
            <button
              onClick={handleInitialBIP}
              disabled={aiInitial.loading}
              style={{
                padding: '7px 10px', background: aiInitial.loading ? '#a78bfa' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                color: 'white', border: '2px solid #2563eb', borderRadius: '8px',
                cursor: aiInitial.loading ? 'wait' : 'pointer', fontSize: '0.72rem', fontWeight: 700, marginBottom: '10px'
              }}
            >
              {aiInitial.loading ? "⏳ 분석 중..." : "🤖 최초 FBA기반BIP작성 제안"}
            </button>
            {aiInitial.saved && (
              <div style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                ✅ BIP 문서에 자동 반영됨 —
                <a href={`/student/${s.code}/bip`} style={{ color: '#2563eb', textDecoration: 'underline' }}>전문 편집에서 확인/다듬기</a>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 150, fontSize: '0.72rem', lineHeight: 1.6, color: '#334155', whiteSpace: 'pre-wrap' }}>
              {!aiInitial.text && !aiInitial.loading && <span style={{ color: '#94a3b8' }}>현재 설정 기간 데이터를 바탕으로 최초 BIP 초안을 제안받으세요. (BIP 문서 1~8번 필드에 자동 반영됩니다)</span>}
              {aiInitial.loading && <span style={{ color: '#7c3aed' }}>🧠 FBA 데이터 분석 중...</span>}
              {aiInitial.text}
            </div>
          </div>
        </div>

        {/* Row 2: EBP selection (예방/교수/후속결과) + 위기행동지원절차 (4-col) */}
        <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignItems: 'start' }}>
          {(["PreventionEBP", "TeachingEBP", "ConsequenceEBP"] as const).map(fieldKey => (
            <EBPColumnEditor
              key={fieldKey}
              fieldKey={fieldKey}
              items={ebp[fieldKey]}
              onChange={(items) => setEbp(prev => ({ ...prev, [fieldKey]: items }))}
              catalog={ebpCatalog}
            />
          ))}
          <CrisisProtocolEditor value={crisisProtocol} onChange={setCrisisProtocol} />
        </div>
        <div>
          <button onClick={handleSaveEBP} disabled={saving || loadingBip} style={{ padding: '8px 18px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
            {saving ? "저장 중..." : "💾 EBP 선택·위기행동지원절차 저장"}
          </button>
        </div>

        {/* 개별화교육지원팀 협의 (누적, 학생별) */}
        <MeetingNotesSection apiUrl={apiUrl} meetingType="fba_bip_team" studentCode={s.code} title="개별화교육지원팀 협의 기록" />

        {/* 종합 데이터기반 의사결정 제안 */}
        <div style={{ background: 'linear-gradient(135deg, #eff6ff, #fff)', borderRadius: '14px', border: '1px solid #bfdbfe', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e3a8a' }}>📊 데이터기반 의사결정을 위한 제안 (DBDM)</div>
            <button
              onClick={handleDecisionAI}
              disabled={aiDecision.loading}
              style={{
                padding: '8px 18px', background: aiDecision.loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: 'white', border: '2px solid #1e3a8a', borderRadius: '8px',
                cursor: aiDecision.loading ? 'wait' : 'pointer', fontSize: '0.82rem', fontWeight: 700
              }}
            >
              {aiDecision.loading ? "⏳ 종합 분석 중..." : "🤖 데이터기반 의사결정 제안 받기"}
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: aiDecision.text ? 10 : 0 }}>
            현재 설정 기간 데이터 + 현재 BIP + 위 EBP 실행충실도 + 개별화교육지원팀 협의 기록을 종합 분석합니다. (실행 전 EBP·협의 내용을 먼저 저장하세요)
          </div>
          {aiDecision.loading && <div style={{ textAlign: 'center', padding: '20px', color: '#2563eb', fontWeight: 700, fontSize: '0.82rem' }}>⏳ 종합 분석 중입니다...</div>}
          {aiDecision.text && !aiDecision.loading && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.75, color: '#1e293b', background: '#fff', padding: '14px', borderRadius: '8px', border: '1px solid #dbeafe' }}>
              {aiDecision.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ====== EBP 선택/직접입력 + 충실도 체크포인트 1개 컬럼 ======
function EBPColumnEditor({ fieldKey, items, onChange, catalog }: {
  fieldKey: string; items: EBPItem[]; onChange: (items: EBPItem[]) => void; catalog: any[];
}) {
  const [pickCode, setPickCode] = useState("");
  const [customName, setCustomName] = useState("");
  const categories = EBP_CATEGORY_MAP[fieldKey] || [];
  const options = categories.length > 0 ? catalog.filter(c => categories.includes(c.category)) : [];

  const addFromCatalog = () => {
    const strat = options.find(o => o.code === pickCode);
    if (!strat) return;
    if (items.some(i => i.code === strat.code)) { setPickCode(""); return; }
    onChange([...items, { code: strat.code, name: strat.name, fidelity: "" }]);
    setPickCode("");
  };

  const addCustom = () => {
    if (!customName.trim()) return;
    onChange([...items, { name: customName.trim(), fidelity: "" }]);
    setCustomName("");
  };

  const removeItem = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const updateFidelity = (idx: number, val: string) => onChange(items.map((it, i) => i === idx ? { ...it, fidelity: val } : it));

  return (
    <div style={{ background: '#fafafa', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a' }}>{EBP_COLUMN_LABELS[fieldKey]}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, idx) => (
          <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0f172a' }}>
                {it.code && <span style={{ padding: '1px 5px', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontSize: '0.65rem', marginRight: 5 }}>{it.code}</span>}
                {it.name}
              </span>
              <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
            </div>
            <input
              type="text"
              value={it.fidelity}
              onChange={e => updateFidelity(idx, e.target.value)}
              placeholder="충실도 체크포인트 (예: 매 수업 시작 5분 내 실시 여부)"
              style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.72rem', boxSizing: 'border-box' }}
            />
          </div>
        ))}
        {items.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.74rem', margin: 0 }}>선택된 전략이 없습니다.</p>}
      </div>

      {options.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={pickCode} onChange={e => setPickCode(e.target.value)} style={{ flex: 1, padding: '5px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.72rem' }}>
            <option value="">EBP 카탈로그에서 선택...</option>
            {options.map(o => <option key={o.code} value={o.code}>{o.code} — {o.name}</option>)}
          </select>
          <button onClick={addFromCatalog} disabled={!pickCode} style={{ padding: '5px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}>추가</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          placeholder="직접 입력..."
          style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.72rem' }}
          onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
        />
        <button onClick={addCustom} disabled={!customName.trim()} style={{ padding: '5px 10px', background: '#64748b', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}>추가</button>
      </div>
    </div>
  );
}

// ====== 위기행동지원절차 편집기 (학교 표준 프로토콜 기본값, 학생별 수정 가능) ======
function CrisisProtocolEditor({ value, onChange }: {
  value: Record<string, string>; onChange: (v: Record<string, string>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const update = (key: string, text: string) => onChange({ ...value, [key]: text });
  const resetOne = (key: string, def: string) => onChange({ ...value, [key]: def });

  return (
    <div style={{ background: '#fff5f5', borderRadius: '12px', padding: '14px', border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a' }}>🚨 위기행동지원절차</div>
        <span style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: 700 }}>{expanded ? '▲ 접기' : `▼ ${CRISIS_PROTOCOL_FIELDS.length}단계 펼치기`}</span>
      </div>
      {!expanded && (
        <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>학교 표준 프로토콜 기본값이 적용되어 있습니다. 펼쳐서 학생별로 수정할 수 있습니다.</p>
      )}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CRISIS_PROTOCOL_FIELDS.map(f => (
            <div key={f.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#b91c1c' }}>{f.label}</span>
                {value[f.key] !== f.default && (
                  <button onClick={() => resetOne(f.key, f.default)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'underline' }}>
                    기본값으로
                  </button>
                )}
              </div>
              <textarea
                value={value[f.key] ?? f.default}
                onChange={e => update(f.key, e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #fecaca', fontSize: '0.72rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>
      )}
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
