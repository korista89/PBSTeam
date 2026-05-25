"use client";

import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import GlobalNav from "../../components/GlobalNav";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import { maskName } from "../../utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ComposedChart, Area, Line, PieChart, Pie, Legend
} from "recharts";

interface TrendItem {
  month: string;
  rate: string;
}

interface DailyEntry { date: string; value: string; is_prev: boolean; }
interface CICOStudent {
  code: string;
  name?: string;
  class: string;
  target_behavior: string;
  behavior_type: string;
  scale: string;
  goal_criteria: string;
  goal_num?: number;
  rate: string;
  rate_num: number | null;
  achieved: string;
  trend: TrendItem[];
  daily_data?: DailyEntry[];
  prev_daily_data?: DailyEntry[];
  cico_only?: boolean;
  has_sst?: boolean;
  has_t3?: boolean;
  decision: string;
  decision_color: string;
  team_talk: string;
}

interface CICOReportData {
  month: string;
  students: CICOStudent[];
  summary: {
    total_students: number;
    total_roster?: number;
    avg_rate: number;
    achieved_count: number;
    not_achieved_count: number;
    weekly_trend?: { week: string; rate: number }[];
  };
}

const DECISION_OPTIONS = [
  { label: "CICO 유지", color: "#3b82f6" },
  { label: "CICO 유지 (양호)", color: "#3b82f6" },
  { label: "CICO 유지 (T3/SST 병행)", color: "#3b82f6" },
  { label: "Tier1 하향 권장", color: "#10b981" },
  { label: "CICO 수정 검토", color: "#f59e0b" },
  { label: "Tier2(SST) 전환", color: "#8b5cf6" },
  { label: "Tier3 상향 검토", color: "#ef4444" },
];

const RATE_THRESHOLDS = { high: 80, mid: 50 };

// CICO 전문가 의사결정 메시지 생성
function getCICODecisionDetail(s: CICOStudent): { msg: string; color: string; bg: string; icon: string } {
  const rate = s.rate_num ?? 0;
  const goal = s.goal_num || parseInt(s.goal_criteria) || 80;
  const trendVals = s.trend.map(t => { let r = parseFloat(t.rate.replace("%","")); return r <= 1 ? r*100 : r; }).filter(r => !isNaN(r));
  const lastTwo = trendVals.slice(-2);
  const isRising = lastTwo.length >= 2 && lastTwo[1] > lastTwo[0];
  const isFalling = lastTwo.length >= 2 && lastTwo[1] < lastTwo[0];
  const allHighLast2 = lastTwo.every(r => r >= goal);

  if (rate >= goal && allHighLast2)
    return { msg: `수행률 ${rate}% — 목표 달성 2개월 연속. Tier1 하향을 적극 검토하세요.`, color: "#065f46", bg: "#d1fae5", icon: "🟢" };
  if (rate >= goal)
    return { msg: `수행률 ${rate}% — 목표 달성. 1개월 더 유지되면 Tier1 하향 권장.`, color: "#047857", bg: "#ecfdf5", icon: "✅" };
  if (rate >= RATE_THRESHOLDS.mid && isRising)
    return { msg: `수행률 ${rate}% — 상승 추세. CICO 유지하며 목표 행동 강화 계속.`, color: "#1d4ed8", bg: "#dbeafe", icon: "📈" };
  if (rate >= RATE_THRESHOLDS.mid && isFalling)
    return { msg: `수행률 ${rate}% — 하락 추세. CICO 계획 수정 및 강화물 재검토 필요.`, color: "#92400e", bg: "#fef3c7", icon: "⚠️" };
  if (rate >= RATE_THRESHOLDS.mid)
    return { msg: `수행률 ${rate}% — 부분 달성. 목표행동 기준 또는 강화 일정 수정 검토.`, color: "#b45309", bg: "#fef3c7", icon: "🔄" };
  if (rate < RATE_THRESHOLDS.mid && isFalling)
    return { msg: `수행률 ${rate}% — 지속 하락. Tier3 상향 또는 FBA 실시를 긴급 검토하세요.`, color: "#991b1b", bg: "#fee2e2", icon: "🚨" };
  return { msg: `수행률 ${rate}% — 목표 미달. 중재 전략 전면 재검토가 필요합니다.`, color: "#b91c1c", bg: "#fee2e2", icon: "❌" };
}

export default function CICOReport() {
  const [month, setMonth] = useState(3);
  const [data, setData] = useState<CICOReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [is404, setIs404] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const { user, isAdmin } = useAuth();

  const apiUrl =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL || ""
      : "";

  useEffect(() => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    if (currentMonth >= 3 && currentMonth <= 12) {
      setMonth(currentMonth);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    setIs404(false);
    try {
      const res = await axios.get(`${apiUrl}/api/v1/cico/report?month=${month}`);
      setData(res.data);
    } catch (err: unknown) {
      console.error(err);
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setIs404(true);
        setError(`${month}월 CICO 데이터가 없습니다.`);
      } else {
        setError(err instanceof Error ? err.message : "데이터 로딩 실패");
      }
    } finally {
      setLoading(false);
    }
  }, [month, apiUrl]);

  const handleCreateSheet = async () => {
    if (!isAdmin()) {
      alert("관리자만 시트를 생성할 수 있습니다.");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/cico/generate`, { year: new Date().getFullYear(), month: Number(month) });
      alert(`${month}월 시트가 생성되었습니다.`);
      setIs404(false);
      fetchData();
    } catch (e) {
      console.error(e);
      alert("시트 생성 실패");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTierChange = async (studentCode: string, newTier: string) => {
    if (!confirm(`${studentCode} 학생의 Tier를 ${newTier}(으)로 변경하시겠습니까?`)) return;
    try {
      await axios.post(`${apiUrl}/api/v1/students/tier-update`, {
        student_code: studentCode,
        tier: newTier
      });
      alert("변경되었습니다.");
      fetchData(); // Refresh to reflect changes (student might disappear from list if not T2 anymore)
    } catch (e) {
      console.error(e);
      alert("변경 실패");
    }
  };

  const getDecisionBg = (decision: string) => {
    const opt = DECISION_OPTIONS.find(o => o.label === decision);
    return opt ? `${opt.color}18` : "transparent";
  };

  const getRateColor = (rate: number | null) => {
    if (rate === null) return "#94a3b8";
    if (rate >= 80) return "#10b981";
    if (rate >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const miniTrendBar = (trend: TrendItem[]) => {
    const vals = trend.map(t => {
      try {
        let r = parseFloat(t.rate.replace("%", ""));
        if (r <= 1) r *= 100;
        return r;
      } catch {
        return null;
      }
    });

    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "32px" }}>
        {vals.map((v, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{
                width: "14px",
                height: v !== null ? `${Math.max(4, (v / 100) * 28)}px` : "4px",
                backgroundColor: v !== null ? getRateColor(v) : "#e2e8f0",
                borderRadius: "2px 2px 0 0",
              }}
            />
            <span style={{ fontSize: "0.5rem", color: "#94a3b8", marginTop: "1px" }}>
              {trend[i].month.replace("월", "")}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AuthCheck>
      <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#1e293b" }}>
        <GlobalNav />
        <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px 20px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <div>
              <h1 style={{ color: "#0f172a", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
                📋 T2 CICO 리포트
              </h1>
              <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "4px 0 0" }}>
                학교 행동중재 지원팀 의사결정 지원
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                style={{
                  background: "#fff",
                  color: "#1e293b",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontSize: "0.9rem",
                }}
              >
                {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <option key={m} value={m}>{String(new Date().getFullYear()).slice(-2)}-{String(m).padStart(2, '0')}월</option>
                ))}
              </select>
              <button
                onClick={fetchData}
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                조회
              </button>
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
              데이터 로딩 중...
            </div>
          )}

          {error && (
            <div style={{
              padding: "24px", background: "#ef44441a", border: "1px solid #ef444440",
              borderRadius: "12px", color: "#fca5a5", textAlign: "center"
            }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '16px', fontWeight: 'bold' }}>⚠️ {error}</p>

              {is404 && isAdmin() && (
                <button
                  onClick={handleCreateSheet}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '1rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}
                >
                  📅 {month}월 CICO 시트 생성하기
                </button>
              )}
              {is404 && !isAdmin() && (
                <p style={{ color: "#64748b" }}>관리자에게 시트 생성을 요청해주세요.</p>
              )}
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* ── 상단 종합 요약 대시보드 ─────────────────── */}
              <CICOSummaryPanel data={data} month={month} getRateColor={getRateColor} />

              
              {/* Decision Legend */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "16px",
                padding: "12px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px"
              }}>
                <span style={{ color: "#64748b", fontSize: "0.75rem", alignSelf: "center" }}>의사결정 기준:</span>
                {DECISION_OPTIONS.map(opt => (
                  <span key={opt.label} style={{
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    fontSize: "0.7rem", color: opt.color,
                    background: `${opt.color}15`, padding: "3px 8px", borderRadius: "4px"
                  }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: opt.color }} />
                    {opt.label}
                  </span>
                ))}
              </div>

              {/* Student Decision Table */}
              {(() => {
                const students = data.students.filter(s => {
                  if (isAdmin()) return true;
                  const userClassId = user?.class_id || "";
                  return s.code && String(s.code).startsWith(String(userClassId));
                });

                if (students.length === 0) {
                  return (
                    <div style={{
                      textAlign: "center", padding: "40px",
                      background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px",
                      color: "#64748b"
                    }}>
                      {data.month}에 Tier2(CICO) 대상 학생이 없습니다.
                    </div>
                  );
                }

                return (
                  <div className="table-responsive-wrapper" style={{ borderRadius: "24px", overflow: "hidden" }}>
                    <div style={{ overflowX: "auto", width: "100%" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          {["학생명", "학급", "목표행동", "유형", "척도", "달성기준", "수행률", "달성", "추이", "시스템 의사결정 제안", "팀 협의", "차트"].map(h => (
                            <th key={h} style={{
                              padding: "12px 8px", color: "#475569", fontWeight: 600,
                              borderBottom: "1px solid #e2e8f0", textAlign: "left",
                              whiteSpace: "nowrap",
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s, i) => (
                          <React.Fragment key={i}>
                            <tr style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "12px 8px", color: "#334155", fontWeight: 500 }}>{maskName(s.name) || "-"}</td>
                              <td style={{ padding: "12px 8px", color: "#475569" }}>{s.class}</td>
                              <td style={{ padding: "12px 8px", color: "#1e293b", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.target_behavior}</td>
                              <td style={{ padding: "12px 8px", color: "#64748b" }}>{s.behavior_type}</td>
                              <td style={{ padding: "12px 8px", color: "#64748b" }}>{s.scale}</td>
                              <td style={{ padding: "12px 8px", color: "#64748b" }}>{s.goal_criteria}</td>
                              <td style={{ padding: "12px 8px", fontWeight: 700, color: getRateColor(s.rate_num) }}>{s.rate || "-"}</td>
                              <td style={{ padding: "12px 8px", textAlign: "center", color: s.achieved === "O" ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                                {s.achieved === "O" ? "✅" : s.achieved === "X" ? "❌" : "-"}
                              </td>
                              <td style={{ padding: "8px" }}>{miniTrendBar(s.trend)}</td>
                              <td style={{ padding: "12px 8px" }}>
                                <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, color: s.decision_color, background: getDecisionBg(s.decision), border: `1px solid ${s.decision_color}40`, whiteSpace: "nowrap" }}>
                                  {s.decision}
                                </span>
                              </td>
                              <td style={{ padding: "12px 8px", color: "#64748b", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.team_talk || "-"}</td>
                              <td style={{ padding: "8px" }}>
                                <button onClick={() => setExpandedCode(expandedCode === s.code ? null : s.code)} style={{ padding: "5px 12px", borderRadius: "8px", background: expandedCode === s.code ? "#3b82f6" : "#f1f5f9", color: expandedCode === s.code ? "#fff" : "#475569", border: "1px solid #e2e8f0", cursor: "pointer", fontWeight: 700, fontSize: "0.72rem", whiteSpace: "nowrap", transition: "all 0.2s" }}>
                                  {expandedCode === s.code ? "▲ 접기" : "📊 차트"}
                                </button>
                              </td>
                            </tr>
                            {expandedCode === s.code && (
                              <tr style={{ background: "#f0f9ff" }}>
                                <td colSpan={12} style={{ padding: "20px 16px", borderBottom: "2px solid #bfdbfe" }}>
                                  <CICOStudentCharts s={s} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
              })()}

              {/* Footer info */}
              <div style={{
                marginTop: "16px", padding: "12px 16px",
                background: "#f1f5f9", borderRadius: "8px",
                color: "#64748b", fontSize: "0.7rem"
              }}>
                💡 의사결정 기준: 수행률 80%+ 연속 2개월 → Tier1 하향 권장 | 수행률 50~80% → CICO 수정 검토 | 수행률 50% 미만 → Tier3 상향 검토
              </div>

              {/* AI BCBA Analysis */}
              <CICOAIAnalysis month={month} students={data.students} apiUrl={apiUrl} />
              <CICOReportGuide />
            </>
          )}
        </main>
      </div>
    </AuthCheck>
  );
}

function CICOAIAnalysis({ month, students, apiUrl }: { month: number; students: CICOStudent[]; apiUrl: string }) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const requestAnalysis = async () => {
    setLoading(true);
    setVisible(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-cico-analysis`, {
        month,
        students_data: students.map(s => ({
          code: s.code,
          target_behavior: s.target_behavior,
          behavior_type: s.behavior_type,
          scale: s.scale,
          goal_criteria: s.goal_criteria,
          rate: s.rate,
          achieved: s.achieved,
        }))
      });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch {
      setAnalysis("⚠️ AI 분석 요청 실패. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: "20px" }}>
      {!visible ? (
        <button onClick={requestAnalysis} style={{
          padding: "10px 20px", background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
          color: "white", border: "none", borderRadius: "10px", cursor: "pointer",
          fontSize: "0.9rem", fontWeight: 600, boxShadow: "0 4px 12px rgba(124,58,237,0.3)"
        }}>
          🤖 BCBA AI 종합 분석
        </button>
      ) : (
        <div style={{
          background: "rgba(124,58,237,0.05)", border: "1px solid rgba(124,58,237,0.2)",
          borderRadius: "12px", padding: "20px", marginTop: "12px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, color: "#6d28d9", fontSize: "1rem" }}>🤖 BCBA AI 분석 — {month}월 CICO</h3>
            <button onClick={() => setVisible(false)} style={{
              background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.8rem"
            }}>✕ 닫기</button>
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#7c3aed" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>⏳</div>
              AI가 학생 데이터를 분석하고 있습니다...
            </div>
          ) : (
            <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: "1.7", color: "#334155" }}>
              {analysis}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ====== 상단 종합 요약 패널 ======
function CICOSummaryPanel({ data, month, getRateColor }: { data: any; month: number; getRateColor: (r: number|null)=>string }) {
  const students = data.students;
  const s = data.summary;
  const roster = s.total_roster || 0;
  const pct = roster > 0 ? Math.round(s.total_students / roster * 100) : 0;
  const tier1C = students.filter((st: any) => st.decision === "Tier1 하향 권장").length;
  const tier3R = students.filter((st: any) => st.decision === "Tier3 상향 검토").length;
  const modN = students.filter((st: any) => st.decision?.includes("수정")).length;
  const concurrent = students.filter((st: any) => !st.cico_only).length;

  // 학생별 수행률+목표 grouped bar
  const barData = students.map((st: any) => ({
    name: st.name ? (st.name.length >= 3 ? st.name[0]+"O"+st.name[st.name.length-1] : st.name[0]+"O") : st.code.slice(0,4),
    rate: st.rate_num || 0,
    goal: st.goal_num || 80,
    color: (st.rate_num||0) >= (st.goal_num||80) ? "#10b981" : (st.rate_num||0) >= 50 ? "#f59e0b" : "#ef4444",
  }));

  // 월별 평균 추이 (3월부터)
  const MONTHS = ["3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const monthMap: Record<string, number[]> = {};
  students.forEach((st: any) => {
    st.trend?.forEach((t: any) => {
      let r = parseFloat(t.rate?.replace("%","") || "NaN");
      if (r <= 1) r *= 100;
      if (!isNaN(r)) { if (!monthMap[t.month]) monthMap[t.month] = []; monthMap[t.month].push(r); }
    });
  });
  const trendLine = MONTHS.filter(m => monthMap[m]).map(m => ({
    month: m,
    avg: Math.round(monthMap[m].reduce((a,b)=>a+b,0)/monthMap[m].length)
  }));

  // 의사결정 분포 pie
  const decCounts: Record<string, number> = {};
  students.forEach((st: any) => { const d = st.decision || "미결정"; decCounts[d] = (decCounts[d]||0)+1; });
  const decPie = Object.keys(decCounts).map(k => ({ name: k, value: decCounts[k] }));
  const decColors = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];

  // 달성/미달 월별 추이
  const achMap: Record<string, {ach:number,tot:number}> = {};
  students.forEach((st: any) => {
    st.trend?.forEach((t: any) => {
      if (!achMap[t.month]) achMap[t.month] = {ach:0,tot:0};
      achMap[t.month].tot++;
      let r = parseFloat(t.rate?.replace("%","") || "NaN");
      if (r<=1) r*=100;
      if (!isNaN(r) && r >= (st.goal_num||80)) achMap[t.month].ach++;
    });
  });
  const achLine = MONTHS.filter(m => achMap[m]).map(m => ({
    month: m,
    달성: achMap[m].ach,
    미달: achMap[m].tot - achMap[m].ach,
  }));

  return (
    <div style={{ marginBottom: 24 }}>
      {/* KPI 카드 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:14 }}>
        {[
          { label:"CICO 대상", val: s.total_students, unit:"명", sub: roster>0?`전체 ${roster}명 중 ${pct}%`:"", color:"#3b82f6" },
          { label:"평균 수행률", val: s.avg_rate, unit:"%", color: getRateColor(s.avg_rate) },
          { label:"목표 달성", val: s.achieved_count, unit:"명", color:"#10b981" },
          { label:"Tier1 하향 후보", val: tier1C, unit:"명", sub:"2개월 연속 달성(CICO단독)", color:"#10b981" },
          { label:"Tier3 상향 위험", val: tier3R, unit:"명", sub:"수행률 50% 미만", color:"#ef4444" },
        ].map((k,i) => (
          <div key={i} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:"14px 16px" }}>
            <div style={{ fontSize:"0.7rem", color:"#64748b", fontWeight:700, marginBottom:3 }}>{k.label}</div>
            <div style={{ fontSize:"1.6rem", fontWeight:900, color:k.color, lineHeight:1 }}>{k.val}<span style={{ fontSize:"0.75rem", color:"#94a3b8" }}>{k.unit}</span></div>
            {k.sub && <div style={{ fontSize:"0.6rem", color:"#94a3b8", marginTop:2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* 경보 배너 */}
      {(tier3R > 0 || modN > 0 || tier1C > 0) && (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
          {tier1C > 0 && <div style={{ flex:1, minWidth:200, padding:"8px 12px", background:"#d1fae5", borderRadius:10, border:"1px solid #6ee7b7", fontSize:"0.75rem", color:"#065f46", fontWeight:700 }}>🟢 Tier1 하향 후보 {tier1C}명 — 지원팀 최종 확인 필요</div>}
          {modN > 0 && <div style={{ flex:1, minWidth:200, padding:"8px 12px", background:"#fef3c7", borderRadius:10, border:"1px solid #fbbf24", fontSize:"0.75rem", color:"#92400e", fontWeight:700 }}>⚠️ CICO 수정 필요 {modN}명 — 목표행동·강화물 재검토</div>}
          {tier3R > 0 && <div style={{ flex:1, minWidth:200, padding:"8px 12px", background:"#fee2e2", borderRadius:10, border:"1px solid #fca5a5", fontSize:"0.75rem", color:"#991b1b", fontWeight:700 }}>🚨 Tier3 위험 {tier3R}명 — FBA·집중 지원 즉시 검토</div>}
        </div>
      )}

      {/* 차트 4개 2x2 */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {/* 1. 학생별 수행률 vs 목표 (grouped) */}
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:14 }}>
          <div style={{ fontWeight:700, fontSize:"0.83rem", color:"#0f172a", marginBottom:8 }}>👤 학생별 수행률 vs 목표 ({month}월)</div>
          <ResponsiveContainer width="100%" height={Math.max(160, barData.length*22)}>
            <BarChart data={barData} layout="vertical" margin={{ left:-8, right:36 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" domain={[0,100]} fontSize={10} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" fontSize={9} width={50} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any, n: string) => [`${v}%`, n==="rate"?"수행률":"목표"]} />
              <Bar dataKey="goal" name="목표" fill="#e2e8f0" radius={[0,4,4,0]} barSize={10} />
              <Bar dataKey="rate" name="수행률" radius={[0,4,4,0]} barSize={10}>
                {barData.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 2. 월별 평균 수행률 추이 */}
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:14 }}>
          <div style={{ fontWeight:700, fontSize:"0.83rem", color:"#0f172a", marginBottom:8 }}>📈 월별 평균 수행률 추이 (3월~)</div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={trendLine}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis domain={[0,100]} fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => [`${v}%`, "평균 수행률"]} />
              <Area type="monotone" dataKey="avg" fill="#6366f110" stroke="none" />
              <Line type="monotone" dataKey="avg" name="평균" stroke="#6366f1" strokeWidth={3} dot={{ r:4, fill:"#6366f1" }} />
            </ComposedChart>
          </ResponsiveContainer>
          {concurrent > 0 && <div style={{ marginTop:6, fontSize:"0.68rem", color:"#64748b", padding:"4px 8px", background:"#f8fafc", borderRadius:6, borderLeft:"3px solid #3b82f6" }}>ℹ️ {concurrent}명 SST/T3 병행 — 목표 달성 시에도 CICO 유지</div>}
        </div>

        {/* 3. 의사결정 분포 Pie */}
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:14 }}>
          <div style={{ fontWeight:700, fontSize:"0.83rem", color:"#0f172a", marginBottom:8 }}>🗂️ 의사결정 분포 ({month}월)</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={decPie} cx="50%" cy="50%" outerRadius={70} innerRadius={35} paddingAngle={3} dataKey="value" label={({name, percent}: any) => `${(percent*100).toFixed(0)}%`} labelLine={false} style={{ fontSize:"9px" }}>
                {decPie.map((_: any, i: number) => <Cell key={i} fill={decColors[i%decColors.length]} />)}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize:"10px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 4. 달성/미달 월별 추이 stacked bar */}
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:14 }}>
          <div style={{ fontWeight:700, fontSize:"0.83rem", color:"#0f172a", marginBottom:8 }}>📊 월별 달성·미달 추이</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={achLine}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize:"10px" }} />
              <Bar dataKey="달성" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
              <Bar dataKey="미달" stackId="a" fill="#f59e0b" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ====== CICO 학생별 세부 차트 컴포넌트 (재설계) ======
function CICOStudentCharts({ s }: { s: CICOStudent }) {
  const goal = s.goal_num || 80;
  const rate = s.rate_num ?? 0;
  const gaugeColor = rate >= goal ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 44;

  // 전월 일별 차트 데이터
  const prevDays: { label: string; value: number | null }[] = (s.prev_daily_data || []).map(d => {
    const v = d.value;
    if (v === "" || v === "-") return { label: d.date, value: null };
    if (v === "O") return { label: d.date, value: 1 };
    if (v === "X") return { label: d.date, value: 0 };
    const n = parseFloat(v);
    return { label: d.date, value: isNaN(n) ? null : n };
  }).filter(d => d.value !== null);

  // 이번달 일별 차트 데이터
  const curDays: { label: string; value: number | null }[] = (s.daily_data || []).map(d => {
    const v = d.value;
    if (v === "" || v === "-") return { label: d.date, value: null };
    if (v === "O") return { label: d.date, value: 1 };
    if (v === "X") return { label: d.date, value: 0 };
    const n = parseFloat(v);
    return { label: d.date, value: isNaN(n) ? null : n };
  }).filter(d => d.value !== null);

  // 월별 추이
  const trendData = s.trend.map(t => {
    let r = parseFloat(t.rate.replace("%", ""));
    if (r <= 1) r *= 100;
    return { month: t.month, rate: isNaN(r) ? 0 : Math.round(r), goal };
  });

  // 의사결정 배너
  const dec = getCICODecisionDetail(s);

  return (
    <div>
      {/* 의사결정 배너 */}
      <div style={{ marginBottom: 14, padding: "11px 16px", background: dec.bg, borderRadius: 12, border: `1.5px solid ${dec.color}40`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: "1.3rem" }}>{dec.icon}</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: "0.84rem", color: dec.color }}>
            CICO 의사결정 제안
            {!s.cico_only && <span style={{ marginLeft: 8, fontSize: "0.7rem", background: "#e0f2fe", color: "#0369a1", padding: "2px 7px", borderRadius: 6, fontWeight: 700 }}>SST/T3 병행 — 하향 보류</span>}
          </div>
          <div style={{ fontSize: "0.77rem", color: dec.color, marginTop: 2 }}>{dec.msg}</div>
        </div>
      </div>

      {/* 목표·척도 정보 칩 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {[
          { label: "목표행동", val: s.target_behavior },
          { label: "척도", val: s.scale },
          { label: "달성기준", val: s.goal_criteria },
          { label: "유형", val: s.behavior_type },
        ].map(item => (
          <div key={item.label} style={{ padding: "4px 10px", background: "#f1f5f9", borderRadius: 20, fontSize: "0.72rem", color: "#334155" }}>
            <span style={{ color: "#94a3b8", fontWeight: 700 }}>{item.label}: </span>{item.val || "-"}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>

        {/* 1. 전월 일별 데이터 차트 */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: 8, color: "#0f172a" }}>📅 전월 일별 데이터</div>
          {prevDays.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <ComposedChart data={prevDays}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                <XAxis dataKey="label" style={{ fontSize: "8px" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis style={{ fontSize: "8px" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="value" fill="#6366f110" stroke="none" />
                <Line type="monotone" dataKey="value" name="측정값" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <p style={{ color: "#94a3b8", fontSize: "0.75rem", textAlign: "center", paddingTop: 30 }}>전월 데이터 없음</p>}
        </div>

        {/* 2. 이번달 일별 데이터 차트 */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: 8, color: "#0f172a" }}>📅 이번달 일별 데이터</div>
          {curDays.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <ComposedChart data={curDays}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                <XAxis dataKey="label" style={{ fontSize: "8px" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis style={{ fontSize: "8px" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="value" fill="#3b82f610" stroke="none" />
                <Line type="monotone" dataKey="value" name="측정값" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <p style={{ color: "#94a3b8", fontSize: "0.75rem", textAlign: "center", paddingTop: 30 }}>데이터 입력 없음</p>}
        </div>

        {/* 3. 월별 수행률 추이 + 목표선 */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: 8, color: "#0f172a" }}>📈 월별 수행률 추이</div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                <XAxis dataKey="month" style={{ fontSize: "8px" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0,100]} style={{ fontSize: "8px" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => [`${v}%`, ""]} />
                <Area type="monotone" dataKey="rate" fill="#f59e0b10" stroke="none" />
                <Line type="monotone" dataKey="rate" name="수행률" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="goal" name="목표" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <p style={{ color: "#94a3b8", fontSize: "0.75rem", textAlign: "center", paddingTop: 30 }}>데이터 없음</p>}
        </div>

        {/* 4. 현재 달성 게이지 + 팀협의 */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: 8, color: "#0f172a", alignSelf: "flex-start" }}>🎯 현재 달성 현황</div>
          <div style={{ position: "relative", width: 100, height: 100 }}>
            <svg viewBox="0 0 110 110" style={{ transform: "rotate(-90deg)" }}>
              <circle cx={55} cy={55} r={44} fill="none" stroke="#f1f5f9" strokeWidth={12} />
              <circle cx={55} cy={55} r={44} fill="none" stroke={gaugeColor} strokeWidth={12}
                strokeDasharray={`${circumference * Math.min(rate,100) / 100} ${circumference}`} strokeLinecap="round" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: "1.2rem", fontWeight: 900, color: gaugeColor }}>{rate}%</div>
              <div style={{ fontSize: "0.6rem", color: "#94a3b8" }}>목표 {goal}%</div>
            </div>
          </div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#475569", marginTop: 6 }}>
            {s.achieved === "O" ? "✅ 달성" : "❌ 미달"}
          </div>
          {s.team_talk && (
            <div style={{ marginTop: 8, padding: "5px 8px", background: "#f8fafc", borderRadius: 7, fontSize: "0.68rem", color: "#475569", borderLeft: "3px solid #3b82f6", alignSelf: "stretch" }}>
              💬 {s.team_talk}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ====== CICO 리포트 해석 가이드 ======
function CICOReportGuide() {
  return (
    <div style={{ marginTop:32, padding:"24px 28px", background:"linear-gradient(135deg,#f0f9ff,#e0f2fe)", borderRadius:20, border:"1px solid #bae6fd" }}>
      <h3 style={{ margin:"0 0 16px 0", fontSize:"1rem", fontWeight:800, color:"#0c4a6e" }}>📖 CICO 리포트 해석 가이드</h3>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, fontSize:"0.78rem", color:"#0f172a", lineHeight:1.7 }}>
        {[
          { title:"📊 상단 KPI 카드", body:"CICO 대상 학생 수와 전체 재학생 대비 비율, 이달 평균 수행률, 목표 달성자 수, Tier1 하향 후보와 Tier3 위험군 수를 보여줍니다." },
          { title:"👤 학생별 수행률 vs 목표", body:"회색 막대가 개인 목표, 색상 막대가 실제 수행률입니다. 초록=목표달성, 노랑=부분달성, 빨강=미달. 두 막대의 차이가 클수록 집중 지원이 필요합니다." },
          { title:"📈 월별 평균 수행률 추이", body:"3월부터 현재까지 전체 CICO 학생의 월별 평균 수행률 변화입니다. 우상향이면 프로그램 효과가 있는 것, 하락세면 전반적 재검토가 필요합니다." },
          { title:"🗂️ 의사결정 분포", body:"이달 각 학생의 시스템 의사결정 제안 분포입니다. Tier3 상향·CICO수정이 많을수록 지원팀 논의가 필요합니다." },
          { title:"📅 전월/이번달 일별 차트", body:"학생 차트 버튼을 누르면 날짜별 실제 입력값이 꺾은선으로 표시됩니다. 변동이 크면 일관성 문제, 하락 추세면 중재 조정이 필요합니다." },
          { title:"🎯 현재 달성 현황 게이지", body:"원형 게이지가 목표 대비 현재 수행률을 보여줍니다. 초록=달성, 노랑=부분, 빨강=미달. 추세 화살표로 방향을 확인하세요." },
          { title:"🔔 의사결정 제안 기준", body:"Tier1 하향: CICO단독+2개월 연속 목표달성 / CICO수정: 수행률 50~목표% / Tier3 상향: 수행률 50% 미만 / SST·T3 병행 학생은 달성해도 CICO 유지" },
          { title:"⚠️ 주의사항", body:"수행률은 시트에 입력된 원자료로 자동 계산됩니다. 결석·미입력일은 제외하고 계산되므로, 출석 일수와 입력 일수를 함께 확인하세요." },
        ].map((item,i) => (
          <div key={i} style={{ background:"#fff", borderRadius:12, padding:"12px 14px", border:"1px solid #e0f2fe" }}>
            <div style={{ fontWeight:800, color:"#0369a1", marginBottom:4 }}>{item.title}</div>
            <div style={{ color:"#334155" }}>{item.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
