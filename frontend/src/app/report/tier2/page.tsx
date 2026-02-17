"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import GlobalNav from "../../components/GlobalNav";
import { AuthCheck, useAuth } from "../../components/AuthProvider";

interface TrendItem {
  month: string;
  rate: string;
}

interface CICOStudent {
  code: string;
  class: string;
  target_behavior: string;
  behavior_type: string;
  scale: string;
  goal_criteria: string;
  rate: string;
  rate_num: number | null;
  achieved: string;
  trend: TrendItem[];
  decision: string;
  decision_color: string;
  team_talk: string;
}

interface CICOReportData {
  month: string;
  students: CICOStudent[];
  summary: {
    total_students: number;
    avg_rate: number;
    achieved_count: number;
    not_achieved_count: number;
  };
}

const DECISION_OPTIONS = [
  { label: "CICO 유지", color: "#3b82f6" },
  { label: "Tier1 하향 권장", color: "#10b981" },
  { label: "CICO 수정 검토", color: "#f59e0b" },
  { label: "Tier2(SST) 전환", color: "#8b5cf6" },
  { label: "Tier3 상향 검토", color: "#ef4444" },
];

export default function CICOReport() {
  const [month, setMonth] = useState(3);
  const [data, setData] = useState<CICOReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [is404, setIs404] = useState(false);
  const { isAdmin } = useAuth();

  const apiUrl =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      : "http://localhost:8000";

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
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
        <GlobalNav />
        <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px 20px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <div>
              <h1 style={{ color: "#f1f5f9", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
                📋 T2 CICO 리포트
              </h1>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "4px 0 0" }}>
                학교 행동중재 지원팀 의사결정 지원
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                style={{
                  background: "#1e293b",
                  color: "#f1f5f9",
                  border: "1px solid #334155",
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
            <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
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
                <p style={{ color: "#94a3b8" }}>관리자에게 시트 생성을 요청해주세요.</p>
              )}
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Summary Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "24px" }}>
                {[
                  { label: "CICO 대상", value: data.summary.total_students, unit: "명", icon: "👥", color: "#3b82f6" },
                  { label: "평균 수행률", value: `${data.summary.avg_rate}%`, unit: "", icon: "📊", color: getRateColor(data.summary.avg_rate) },
                  { label: "목표 달성", value: data.summary.achieved_count, unit: "명", icon: "✅", color: "#10b981" },
                  { label: "목표 미달성", value: data.summary.not_achieved_count, unit: "명", icon: "⚠️", color: "#f59e0b" },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: "rgba(30,41,59,0.8)",
                    border: `1px solid ${card.color}30`,
                    borderRadius: "12px",
                    padding: "16px",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "1.5rem", marginBottom: "4px" }}>{card.icon}</div>
                    <div style={{ color: card.color, fontSize: "1.5rem", fontWeight: 700 }}>
                      {card.value}<span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{card.unit}</span>
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Decision Legend */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "16px",
                padding: "12px 16px", background: "rgba(30,41,59,0.6)", borderRadius: "8px"
              }}>
                <span style={{ color: "#94a3b8", fontSize: "0.75rem", alignSelf: "center" }}>의사결정 기준:</span>
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
              {data.students.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "40px",
                  background: "rgba(30,41,59,0.8)", borderRadius: "12px",
                  color: "#94a3b8"
                }}>
                  {data.month}에 Tier2(CICO) 대상 학생이 없습니다.
                </div>
              ) : (
                <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #334155" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(51,65,85,0.8)" }}>
                        {["학생코드", "학급", "목표행동", "유형", "척도", "달성기준", "수행률", "달성", "추이", "시스템 의사결정 제안", "팀 협의"].map(h => (
                          <th key={h} style={{
                            padding: "10px 8px", color: "#94a3b8", fontWeight: 600,
                            borderBottom: "1px solid #334155", textAlign: "left",
                            whiteSpace: "nowrap",
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.students.map((s, i) => (
                        <tr
                          key={i}
                          style={{
                            background: i % 2 === 0 ? "rgba(30,41,59,0.6)" : "rgba(30,41,59,0.3)",
                            borderBottom: "1px solid #1e293b",
                          }}
                        >
                          <td style={{ padding: "10px 8px", color: "#f1f5f9", fontWeight: 600 }}>{s.code}</td>
                          <td style={{ padding: "10px 8px", color: "#cbd5e1" }}>{s.class}</td>
                          <td style={{ padding: "10px 8px", color: "#e2e8f0", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.target_behavior}
                          </td>
                          <td style={{ padding: "10px 8px", color: "#94a3b8" }}>{s.behavior_type}</td>
                          <td style={{ padding: "10px 8px", color: "#94a3b8" }}>{s.scale}</td>
                          <td style={{ padding: "10px 8px", color: "#94a3b8" }}>{s.goal_criteria}</td>
                          <td style={{
                            padding: "10px 8px", fontWeight: 700,
                            color: getRateColor(s.rate_num),
                          }}>
                            {s.rate || "-"}
                          </td>
                          <td style={{
                            padding: "10px 8px", textAlign: "center",
                            color: s.achieved === "O" ? "#10b981" : "#ef4444",
                            fontWeight: 700,
                          }}>
                            {s.achieved === "O" ? "✅" : s.achieved === "X" ? "❌" : "-"}
                          </td>
                          <td style={{ padding: "8px" }}>
                            {miniTrendBar(s.trend)}
                          </td>
                          <td style={{
                            padding: "10px 8px",
                          }}>
                            <span style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: s.decision_color,
                              background: getDecisionBg(s.decision),
                              border: `1px solid ${s.decision_color}40`,
                              whiteSpace: "nowrap",
                            }}>
                              {s.decision}
                            </span>
                          </td>
                          <td style={{
                            padding: "10px 8px", color: "#94a3b8",
                            maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                          }}>
                            {s.team_talk || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer info */}
              <div style={{
                marginTop: "16px", padding: "12px 16px",
                background: "rgba(30,41,59,0.4)", borderRadius: "8px",
                color: "#64748b", fontSize: "0.7rem"
              }}>
                💡 의사결정 기준: 수행률 80%+ 연속 2개월 → Tier1 하향 권장 | 수행률 50~80% → CICO 수정 검토 | 수행률 50% 미만 → Tier3 상향 검토
              </div>

              {/* AI BCBA Analysis */}
              <CICOAIAnalysis month={month} students={data.students} apiUrl={apiUrl} />
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
          background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.3)",
          borderRadius: "12px", padding: "20px", marginTop: "12px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, color: "#a78bfa", fontSize: "1rem" }}>🤖 BCBA AI 분석 — {month}월 CICO</h3>
            <button onClick={() => setVisible(false)} style={{
              background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.8rem"
            }}>✕ 닫기</button>
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#a78bfa" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>⏳</div>
              AI가 학생 데이터를 분석하고 있습니다...
            </div>
          ) : (
            <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: "1.7", color: "#e2e8f0" }}>
              {analysis}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
