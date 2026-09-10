"use client";

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis,
  BarChart, Bar, LabelList, ComposedChart, Area
} from "recharts";
import { StudentData } from "../../types";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import AppShell from "../../components/AppShell";
import { useSheetLiveSync } from "../../hooks/useSheetLiveSync";
import { useDateRange } from "../../components/GlobalNav";
import { TIER_COLORS } from "../../constants";
import WeeklyAnalysisChart from "../../components/WeeklyAnalysisChart";
import ReadableAIResult from "../../components/ReadableAIResult";
import CrisisDetailPanel from "../../components/CrisisDetailPanel";
import { maskName } from "../../utils";

export default function StudentDetail() {
  const params = useParams();
  const router = useRouter();
  const studentName = decodeURIComponent(params.id as string);
  const { startDate, endDate } = useDateRange();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  const [data, setData] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fbaEvidence, setFbaEvidence] = useState<any>(null);
  const [crisisLogs, setCrisisLogs] = useState<any[]>([]);
  const [expandedCrisisId, setExpandedCrisisId] = useState<string | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const sparams = new URLSearchParams();
      if (startDate && endDate) {
        sparams.append("start_date", startDate);
        sparams.append("end_date", endDate);
      }
      const queryString = sparams.toString();
      const url = `${apiUrl}/api/v1/students/${encodeURIComponent(studentName)}?${queryString}`;
      const response = await axios.get(url);
      setData(response.data);
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 404) setError("학생을 찾을 수 없습니다.");
      else if (err.response?.status === 403) setError("이 학생의 데이터에 접근할 권한이 없습니다. 본인 배정 학급 학생의 데이터만 열람 가능합니다.");
      else setError("데이터 로딩 실패");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiUrl, studentName, startDate, endDate]);

  useEffect(() => {
    if (studentName) fetchData();
  }, [fetchData, studentName]);
  useSheetLiveSync(() => fetchData(true), { enabled: Boolean(studentName) });

  // FBA 증거 요약 — build_fba_evidence_summary()를 그대로 노출하는 결정론적(비-LLM) 엔드포인트.
  // 화면 렌더링과 EBP 추천 근거로 함께 쓴다.
  const studentCode = data?.profile?.student_code;
  useEffect(() => {
    if (!studentCode) return;
    axios.get(`${apiUrl}/api/v1/bip/students/${studentCode}/fba-evidence`)
      .then(res => setFbaEvidence(res.data))
      .catch(() => setFbaEvidence(null));
  }, [apiUrl, studentCode]);

  // 위기대응 이력 — 결재 상태와 무관하게 크리스코드가 있는 로그만 모아
  // "제지 등 법정기록"을 학생 단위로 언제든 다시 확인할 수 있게 한다.
  useEffect(() => {
    if (!studentCode) return;
    axios.get(`${apiUrl}/api/v1/behavior-log/timeline/${encodeURIComponent(studentCode)}`)
      .then(res => {
        const logs = (res.data?.logs || []).filter((l: any) => l.crisis_details);
        logs.sort((a: any, b: any) => String(b.타임스탬프 || "").localeCompare(String(a.타임스탬프 || "")));
        setCrisisLogs(logs);
      })
      .catch(() => setCrisisLogs([]));
  }, [apiUrl, studentCode]);

  if (loading) return (
    <AuthCheck>
      <AppShell currentPage="roster" title="🔬 학생 FBA 프로파일">
        <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
           <div style={{ fontSize: '2.5rem', animation: 'spin 2s linear infinite', marginBottom: '12px' }}>💿</div>
           <p style={{ fontWeight: 800 }}>{maskName(studentName)} 학생의 행동 데이터를 심층 분석하고 있습니다...</p>
        </div>
      </AppShell>
    </AuthCheck>
  );

  if (error || !data) return (
    <AuthCheck>
      <AppShell currentPage="roster" title="🔬 학생 FBA 프로파일">
        <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚠️</div>
          <p style={{ fontWeight: 800, color: 'var(--tier3)' }}>{error || "데이터가 없습니다."}</p>
          <button onClick={() => router.push('/')} className="btn btn-primary" style={{ marginTop: '16px' }}>대시보드로 돌아가기</button>
        </div>
      </AppShell>
    </AuthCheck>
  );

  if (!data) return null;

  const profile = data.profile || { name: studentName, student_code: "-", class: "-", tier: "Tier 1", total_incidents: 0, avg_intensity: 0 };
  const abc_data = data.abc_data || [];
  const functions = data.functions || [];
  const cico_trend = data.cico_trend || [];

  return (
    <AuthCheck>
      <AppShell
        currentPage="roster"
        title={`🔬 ${maskName(profile.name)} 학생 FBA 프로파일`}
        subtitle={`${profile.class} (${profile.student_code}) · ${profile.tier || "Tier 1"} 중재 대상자 · 기능적행동평가(FBA) — 행동중재계획(BIP) 작성은 별도 페이지`}
        headerActions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => router.push(`/student/${encodeURIComponent(studentName)}/bip`)}
              className="btn btn-ai"
            >
              📝 BIP 작성/수정
            </button>
            <button
              onClick={() => router.push(`/logs?q=${encodeURIComponent(profile.student_code || studentName)}`)}
              className="btn btn-secondary"
            >
              🗂️ 전체 로그에서 보기
            </button>
            <button
              onClick={() => router.push(`/behavior-log/quick`)}
              className="btn btn-secondary"
              style={{ color: '#b91c1c' }}
            >
              🚨 빠른 위기 기록
            </button>
            <button onClick={() => router.back()} className="btn btn-secondary">
              ← 뒤로가기
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* KPI Cards */}
            <div className="grid-responsive" style={{ marginBottom: '24px' }}>
               {[
                { label: "총 행동 발생", value: `${profile.total_incidents}건`, icon: "📈", color: "#6366f1" },
                { label: "평균 행동 강도", value: profile.avg_intensity.toFixed(1), icon: "⚡", color: profile.avg_intensity >= 3.5 ? "#ef4444" : "#f59e0b" },
                { label: "위험 수준", value: (profile.tier || "").includes("3") ? "높음" : "보통", icon: "🚨", color: (profile.tier || "").includes("3") ? "#ef4444" : "#10b981" }
               ].map((c, i) => (
                 <div key={i} className="glass-panel" style={{ padding: '28px', borderRadius: '24px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '12px' }}>{c.icon}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>{c.label}</div>
                    <div style={{ fontSize: '2.2rem', fontWeight: 950, color: c.color }}>{c.value}</div>
                 </div>
               ))}
            </div>

            {/* FBA Evidence Summary — 이 페이지에서 "행동/배경/기능"을 요약하는 유일한 섹션.
                예전엔 이 위에 별도로 그럴듯하게 기능을 추측해 보여주는 "FBA Summary" 3박스가
                있었는데, 실제 기능 데이터가 없는 학생에서도 그럴듯한 값을 채워 보여줘 아래
                증거요약(정직하게 "미상"으로 표기)과 서로 다른 답을 보여주는 문제가 있었다.
                하나로 합쳐 페이지 안에서 근거 없이 서로 다른 결론이 나오지 않게 한다. */}
            <FBAEvidencePanel evidence={fbaEvidence} />

            {/* 위기대응 이력 — 결재함(Pending)에서만 보이던 위기대응 상세기록을 결재 여부와
                무관하게 학생 단위로 상시 열람 가능하게 한다. 담임/IEP팀이 제지·개별학생교육지원
                등 법정기록을 다시 찾아보려 할 때 결재함을 뒤질 필요가 없도록 하는 것이 목적. */}
            {crisisLogs.length > 0 && (
              <div>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', fontWeight: 900, color: '#475569' }}>🚨 위기대응 이력 ({crisisLogs.length}건)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {crisisLogs.map((log, i) => {
                    const logId = log.Log_ID || String(i);
                    const isExpanded = expandedCrisisId === logId;
                    const isCrisis = String(log["물리적제지여부"] || "").startsWith("O");
                    const missingLegal = isCrisis && (
                      !String(log.crisis_details["관리자_보고_시간"] || "").trim() ||
                      !String(log.crisis_details["학부모_알림_시간"] || "").trim()
                    );
                    return (
                      <div key={logId} className="card" style={{ padding: '14px 18px', border: missingLegal ? '1px solid #f59e0b' : '1px solid var(--border-subtle)' }}>
                        <div
                          onClick={() => setExpandedCrisisId(isExpanded ? null : logId)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            {log["행동발생날짜"]} ({log["시간대"]}) · {log["행동유형"]} · {log["장소"]}
                            {missingLegal && <span style={{ marginLeft: '8px', color: '#b91c1c', fontSize: '0.8rem' }}>⚠️ 법정 보고/알림 미기록</span>}
                          </div>
                          <span style={{ color: '#94a3b8' }}>{isExpanded ? "▲ 접기" : "▼ 상세 보기"}</span>
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: '12px' }}>
                            <CrisisDetailPanel crisisDetails={log.crisis_details} isCrisis={isCrisis} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Charts Grid */}
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                <ChartSection title="📍 ABC 패턴 맵 (장소 x 시간 x 강도)">
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                      <XAxis type="category" dataKey="x" name="시간" />
                      <YAxis type="category" dataKey="y" name="장소" width={100} tick={{fontSize: 10}} />
                      <ZAxis type="number" dataKey="z" range={[100, 800]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter name="행동" data={abc_data} fill="#6366f1" opacity={0.6} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartSection>

                <ChartSection title="🎭 행동 기능 분포">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={functions} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                        {Array.isArray(functions) && functions.length > 0 && functions.map((_, i) => <Cell key={i} fill={['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartSection>
            </div>

            {/* 발생 추이 — 주별/일별/요일별을 흩어 놓지 않고 한 클러스터로 모아 "언제 발생하는가"를
                한 번에 훑어볼 수 있게 한다. */}
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', fontWeight: 900, color: '#475569' }}>📈 발생 추이</h3>
              <div className="responsive-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
                <WeeklyAnalysisChart
                  data={data.weekly_trend || []}
                  title="주별 발생 추이"
                  color="#6366f1"
                />
                <ChartSection title="📉 일별 추이 (전체 기간)" height={340}>
                   <ResponsiveContainer>
                      <ComposedChart data={cico_trend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="count" fill="#6366f110" stroke="#6366f1" strokeWidth={3} />
                        <Bar dataKey="count" fill="#6366f1" barSize={10} radius={[5,5,0,0]} />
                      </ComposedChart>
                   </ResponsiveContainer>
                </ChartSection>
                <ChartSection title="📅 요일별 패턴" height={340}>
                  <ResponsiveContainer>
                      <BarChart data={data.weekday_dist || []}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#f59e0b" radius={[10, 10, 10, 10]} barSize={20}>
                              <LabelList dataKey="value" position="top" style={{ fontSize: 11, fontWeight: 800, fill: '#f59e0b' }} />
                          </Bar>
                      </BarChart>
                  </ResponsiveContainer>
                </ChartSection>
              </div>
            </div>

            {/* 지원 도구 — 상담/관찰 기록과 AI 종합 분석 */}
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px', alignItems: 'start' }}>
               <ConsultationLog studentCode={profile.student_code} />
               <StudentAIAnalysis studentCode={profile.student_code} apiUrl={apiUrl} />
            </div>

            {/* Be-Able 39 EBP Matched Recommendations — grounded in the real FBA evidence packet
                (teacher_inferred_function_distribution / setting_event_cue_distribution) instead of
                a naive string match on the chart's top function label. */}
            <EBPRecommendationSection
                studentCode={profile.student_code}
                functionCode={mapFunctionLabelToCode((fbaEvidence?.deterministic_metrics?.teacher_inferred_function_distribution || [])[0]?.item || "")}
                settingEvents={(fbaEvidence?.deterministic_metrics?.setting_event_cue_distribution || []).map((s: any) => s.item)}
                currentTier={profile.tier || "Tier 1"}
                apiUrl={apiUrl}
            />
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
    <section style={{ background: '#fff', padding: '32px', borderRadius: '28px', boxShadow: '0 4px 25px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>🔬</span> FBA 증거 요약
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

function ChartSection({ title, children, height = 340 }: { title: string, children: React.ReactNode, height?: number }) {
  return (
    <section className="glass-panel" style={{ padding: '28px', borderRadius: '28px' }}>
       <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 900, color: '#475569' }}>{title}</h3>
       <div style={{ height }}>
          {children}
       </div>
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
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

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
    <div style={{ background: '#fff', padding: '32px', borderRadius: '28px', border: '1px solid rgba(0,0,0,0.03)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.25rem', fontWeight: 900 }}>📝 상담 및 관찰 기록</h3>
      <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="학생 관찰 내용이나 학부모 상담 내용을 기록하십시오..." style={{ width: '100%', minHeight: '120px', padding: '16px', borderRadius: '16px', border: '1px solid #f1f5f9', background: '#f8fafc', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }} />
      <div style={{ textAlign: 'right', marginTop: '12px' }}>
          <button onClick={handleSave} disabled={loading || !content.trim()} style={{ padding: '12px 28px', borderRadius: '14px', background: '#1e293b', color: '#fff', fontWeight: 800, border: 'none', cursor: 'pointer' }}>기록 저장</button>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">
         {notes.map((n, i) => (
           <div key={n.id || i} style={{ padding: '16px', borderRadius: '20px', background: '#f8fafc', border: '1px solid rgba(0,0,0,0.02)' }}>
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
    <div style={{ background: '#fff', padding: '28px', borderRadius: '24px', border: '2.5px solid #2563eb', boxShadow: '0 10px 30px rgba(37, 99, 235, 0.15)' }}>
       {!visible ? (
         <button onClick={requestAnalysis} style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', borderRadius: '14px', border: '2.5px solid #2563eb', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)', transition: 'transform 0.2s' }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}>
           🤖 AI 종합 분석 리포트 생성
         </button>
       ) : (
         <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, color: '#1d4ed8', fontWeight: 900, fontSize: '1.05rem' }}>🤖 AI 전문가 정밀 분석</h4>
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
    <section style={{ background: '#fff', padding: '32px', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 4px 25px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
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
