"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import GlobalNav from "../../components/GlobalNav";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart, Area
} from "recharts";

interface TrendItem {
  month: string;
  rate: string;
}

interface CICOStudent {
  code: string;
  name?: string;
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
              {/* Summary Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "24px" }}>
                {[
                  { label: "CICO 대상", value: data.summary.total_students, unit: "명", icon: "👥", color: "#3b82f6" },
                  { label: "평균 수행률", value: `${data.summary.avg_rate}%`, unit: "", icon: "📊", color: getRateColor(data.summary.avg_rate) },
                  { label: "목표 달성", value: data.summary.achieved_count, unit: "명", icon: "✅", color: "#10b981" },
                  { label: "목표 미달성", value: data.summary.not_achieved_count, unit: "명", icon: "⚠️", color: "#f59e0b" },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: "#fff",
                    border: `1px solid ${card.color}20`,
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                    borderRadius: "12px",
                    padding: "16px",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "1.5rem", marginBottom: "4px" }}>{card.icon}</div>
                    <div style={{ color: card.color, fontSize: "1.5rem", fontWeight: 700 }}>
                      {card.value}<span style={{ fontSize: "0.8rem", color: "#64748b" }}>{card.unit}</span>
                    </div>
                    <div style={{ color: "#64748b", fontSize: "0.75rem" }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* CICO Data Insights Charts */}
              <div style={{
                marginBottom: "24px",
                padding: "20px",
                background: "white",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
              }}>
                <h3 style={{ margin: "0 0 20px 0", fontSize: "1.1rem", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>📈 {month}월 CICO 데이터 인사이트</span>
                  <span style={{ fontSize: "0.75rem", background: "#f1f5f9", padding: "2px 8px", borderRadius: "12px", color: "#64748b", fontWeight: "normal" }}>BCBA 분석 리포트</span>
                </h3>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
                  {/* 1. Student Achievement Bar Chart */}
                  <div style={{ height: "300px", padding: "12px", border: "1px solid #f1f5f9", borderRadius: "12px" }}>
                    <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", fontWeight: 700, color: "#475569" }}>👤 학생별 목표 수행률 (%)</p>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={data.students.map(s => ({
                        name: s.code,
                        rate: s.rate_num || 0,
                        target: parseInt(s.goal_criteria) || 80
                      }))} layout="vertical" margin={{ left: -10, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" domain={[0, 100]} fontSize={10} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" fontSize={10} width={60} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: '#f8fafc'}} />
                        <Bar dataKey="rate" name="수행률" radius={[0, 4, 4, 0]} barSize={18}>
                          {data.students.map((s, idx) => {
                            const rate = s.rate_num || 0;
                            const target = parseInt(s.goal_criteria) || 80;
                            return <Cell key={`cell-${idx}`} fill={rate >= target ? "#10b981" : "#f59e0b"} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 2. Achievement Status Pie Chart */}
                  <div style={{ height: "300px", padding: "12px", border: "1px solid #f1f5f9", borderRadius: "12px" }}>
                    <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", fontWeight: 700, color: "#475569" }}>🎯 목표 달성 비율</p>
                    <ResponsiveContainer width="100%" height="90%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: '달성', value: data.summary.achieved_count },
                            { name: '미달', value: data.summary.not_achieved_count }
                          ]}
                          cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          <Cell fill="#10b981" />
                          <Cell fill="#f59e0b" />
                        </Pie>
                        <Tooltip />
                        <Legend iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 3. Average Trend Line Chart */}
                  <div style={{ height: "300px", padding: "12px", border: "1px solid #f1f5f9", borderRadius: "12px" }}>
                    <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", fontWeight: 700, color: "#475569" }}>📈 최근 3개월 평균 수행 추이</p>
                    <ResponsiveContainer width="100%" height="90%">
                      <ComposedChart data={(() => {
                        const monthsMap: { [m: string]: number[] } = {};
                        data.students.forEach(s => {
                          s.trend.forEach(t => {
                            if (!monthsMap[t.month]) monthsMap[t.month] = [];
                            try {
                              let r = parseFloat(t.rate.replace("%", ""));
                              if (r <= 1) r *= 100;
                              if (!isNaN(r)) monthsMap[t.month].push(r);
                            } catch {}
                          });
                        });
                        const monthsList = ["3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
                        return Object.keys(monthsMap)
                          .sort((a, b) => monthsList.indexOf(a) - monthsList.indexOf(b))
                          .map(m => ({
                            month: m,
                            avg: Math.round(monthsMap[m].reduce((a, b) => a + b, 0) / monthsMap[m].length)
                          }));
                      })()}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} fontSize={10} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="avg" fill="#6366f110" stroke="none" />
                        <Line type="monotone" dataKey="avg" name="전체 평균" stroke="#6366f1" strokeWidth={3} dot={{ r: 5, fill: '#6366f1' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 4. Behavior Type Distribution */}
                  <div style={{ height: "300px", padding: "12px", border: "1px solid #f1f5f9", borderRadius: "12px" }}>
                    <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", fontWeight: 700, color: "#475569" }}>🎭 중재 행동 유형 분포</p>
                    <ResponsiveContainer width="100%" height="90%">
                      <PieChart>
                        <Pie
                          data={(() => {
                            const counts: { [k: string]: number } = {};
                            data.students.forEach(s => {
                              const t = s.behavior_type || "미지정";
                              counts[t] = (counts[t] || 0) + 1;
                            });
                            return Object.keys(counts).map(name => ({ name, value: counts[name] }));
                          })()}
                          cx="50%" cy="50%" outerRadius={85} dataKey="value"
                        >
                          {['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'].map((color, i) => (
                            <Cell key={`cell-${i}`} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

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
                  <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#fff", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          {["학생코드", "학생명", "학급", "목표행동", "유형", "척도", "달성기준", "수행률", "달성", "추이", "시스템 의사결정 제안", "팀 협의"].map(h => (
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
                          <tr
                            key={i}
                            style={{
                              background: i % 2 === 0 ? "#fff" : "#f8fafc",
                              borderBottom: "1px solid #f1f5f9",
                            }}
                          >
                            <td style={{ padding: "12px 8px", color: "#0f172a", fontWeight: 600 }}>{s.code}</td>
                            <td style={{ padding: "12px 8px", color: "#334155", fontWeight: 500 }}>{s.name || "-"}</td>
                            <td style={{ padding: "12px 8px", color: "#475569" }}>{s.class}</td>
                            <td style={{ padding: "12px 8px", color: "#1e293b", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.target_behavior}
                            </td>
                            <td style={{ padding: "12px 8px", color: "#64748b" }}>{s.behavior_type}</td>
                            <td style={{ padding: "12px 8px", color: "#64748b" }}>{s.scale}</td>
                            <td style={{ padding: "12px 8px", color: "#64748b" }}>{s.goal_criteria}</td>
                            <td style={{
                              padding: "12px 8px", fontWeight: 700,
                              color: getRateColor(s.rate_num),
                            }}>
                              {s.rate || "-"}
                            </td>
                            <td style={{
                              padding: "12px 8px", textAlign: "center",
                              color: s.achieved === "O" ? "#10b981" : "#ef4444",
                              fontWeight: 700,
                            }}>
                              {s.achieved === "O" ? "✅" : s.achieved === "X" ? "❌" : "-"}
                            </td>
                            <td style={{ padding: "8px" }}>
                              {miniTrendBar(s.trend)}
                            </td>
                            <td style={{
                              padding: "12px 8px",
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
                              padding: "12px 8px", color: "#64748b",
                              maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                            }}>
                              {s.team_talk || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
