"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import GlobalNav, { useDateRange } from "../../components/GlobalNav";
import { AuthCheck } from "../../components/AuthProvider";

interface BehaviorType {
  name: string;
  value: number;
}

interface WeeklyTrend {
  week: string;
  count: number;
}

interface Tier3Student {
  code: string;
  class: string;
  tier: string;
  beable_code: string;
  memo: string;
  incidents: number;
  max_intensity: number;
  avg_intensity: number;
  behavior_types: BehaviorType[];
  weekly_trend: WeeklyTrend[];
  decision: string;
  decision_color: string;
}

interface Tier3ReportData {
  students: Tier3Student[];
  summary: {
    total_students: number;
    total_incidents: number;
    avg_intensity: number;
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

export default function Tier3Report() {
  const { startDate, endDate } = useDateRange();
  const [data, setData] = useState<Tier3ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const apiUrl =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      : "http://localhost:8000";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (startDate && endDate) {
        params.append("start_date", startDate);
        params.append("end_date", endDate);
      }
      const queryString = params.toString();
      const url = queryString
        ? `${apiUrl}/api/v1/analytics/tier3-report?${queryString}`
        : `${apiUrl}/api/v1/analytics/tier3-report`;
      const res = await axios.get(url);
      setData(res.data);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "데이터 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, apiUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getIntensityColor = (intensity: number) => {
    if (intensity >= 5) return "#ef4444";
    if (intensity >= 3) return "#f59e0b";
    return "#10b981";
  };

  const getIntensityBar = (val: number, max: number = 5) => {
    const pct = Math.min(100, (val / max) * 100);
    return (
      <div style={{
        width: "60px", height: "8px", borderRadius: "4px",
        background: "#1e293b", overflow: "hidden", display: "inline-block", verticalAlign: "middle"
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: "4px",
          background: getIntensityColor(val),
        }} />
      </div>
    );
  };

  const miniWeeklyChart = (trend: WeeklyTrend[]) => {
    if (trend.length === 0) return <span style={{ color: "#64748b" }}>-</span>;
    const maxCount = Math.max(...trend.map(t => t.count), 1);
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "28px" }}>
        {trend.slice(-6).map((t, i) => (
          <div key={i} style={{
            width: "8px",
            height: `${Math.max(3, (t.count / maxCount) * 24)}px`,
            background: t.count >= 3 ? "#ef4444" : t.count >= 2 ? "#f59e0b" : "#3b82f6",
            borderRadius: "2px 2px 0 0",
          }} title={`${t.week}: ${t.count}건`} />
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
          <div style={{ marginBottom: "24px" }}>
            <h1 style={{ color: "#f1f5f9", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
              🔴 T3 리포트 — 위기행동 관리
            </h1>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "4px 0 0" }}>
              Tier3 대상 학생 위기행동 현황 및 의사결정 지원 {startDate && endDate ? `(${startDate} ~ ${endDate})` : ""}
            </p>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
              데이터 로딩 중...
            </div>
          )}

          {error && (
            <div style={{
              padding: "16px", background: "#ef44441a", border: "1px solid #ef444440",
              borderRadius: "12px", color: "#fca5a5", textAlign: "center"
            }}>
              ⚠️ {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Summary Cards */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px", marginBottom: "24px"
              }}>
                {[
                  { label: "Tier3 대상 학생", value: data.summary.total_students, unit: "명", icon: "🔴", color: "#ef4444" },
                  { label: "총 위기행동 건수", value: data.summary.total_incidents, unit: "건", icon: "⚡", color: "#f59e0b" },
                  { label: "평균 강도", value: data.summary.avg_intensity, unit: "/5", icon: "📈", color: getIntensityColor(data.summary.avg_intensity) },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: "rgba(30,41,59,0.8)",
                    border: `1px solid ${card.color}30`,
                    borderRadius: "12px",
                    padding: "20px",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "1.5rem", marginBottom: "6px" }}>{card.icon}</div>
                    <div style={{ color: card.color, fontSize: "1.8rem", fontWeight: 700 }}>
                      {card.value}<span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{card.unit}</span>
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginTop: "4px" }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Decision Legend */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "16px",
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

              {/* Meeting Notes Section */}
              <div style={{ marginBottom: "24px" }}>
                <MeetingNotesSection apiUrl={apiUrl} meetingType="tier3" title="Tier 3 사례회의록" />
              </div>

              {/* Student Table */}
              {data.students.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "40px",
                  background: "rgba(30,41,59,0.8)", borderRadius: "12px",
                  color: "#94a3b8"
                }}>
                  Tier3 대상 학생이 없습니다.
                </div>
              ) : (
                <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #334155" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(51,65,85,0.8)" }}>
                        {["Tier", "학생코드", "학급", "사건 수", "최대 강도", "평균 강도", "주요 행동", "주간 추이", "시스템 의사결정 제안", "분석"].map(h => (
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
                            background: s.tier === "Tier3+"
                              ? "rgba(124,58,237,0.08)"
                              : i % 2 === 0 ? "rgba(30,41,59,0.6)" : "rgba(30,41,59,0.3)",
                            borderBottom: "1px solid #1e293b",
                          }}
                        >
                          <td style={{ padding: "10px 8px" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: "4px",
                              fontSize: "0.7rem", fontWeight: 700,
                              color: s.tier === "Tier3+" ? "#7c3aed" : "#ef4444",
                              background: s.tier === "Tier3+" ? "#7c3aed20" : "#ef444420",
                            }}>
                              {s.tier}
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px", color: "#f1f5f9", fontWeight: 600 }}>{s.code}</td>
                          <td style={{ padding: "10px 8px", color: "#cbd5e1" }}>{s.class}</td>
                          <td style={{ padding: "10px 8px", color: s.incidents >= 6 ? "#ef4444" : "#e2e8f0", fontWeight: 700 }}>
                            {s.incidents}건
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {getIntensityBar(s.max_intensity)}{" "}
                            <span style={{ color: getIntensityColor(s.max_intensity), fontSize: "0.75rem", fontWeight: 600 }}>
                              {s.max_intensity}
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {getIntensityBar(s.avg_intensity)}{" "}
                            <span style={{ color: getIntensityColor(s.avg_intensity), fontSize: "0.75rem" }}>
                              {s.avg_intensity}
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px", color: "#94a3b8", maxWidth: "140px" }}>
                            {s.behavior_types.length > 0
                              ? s.behavior_types.slice(0, 2).map(b => b.name).join(", ")
                              : "-"}
                          </td>
                          <td style={{ padding: "8px" }}>
                            {miniWeeklyChart(s.weekly_trend)}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <span style={{
                              display: "inline-block", padding: "4px 10px",
                              borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600,
                              color: s.decision_color,
                              background: `${s.decision_color}18`,
                              border: `1px solid ${s.decision_color}40`,
                              whiteSpace: "nowrap",
                            }}>
                              {s.decision}
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <button
                              onClick={() => window.location.href = `/student/${s.code}`} // Assuming code works, or name if preferred
                              style={{
                                padding: "4px 8px",
                                background: "#3b82f6",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "0.7rem",
                                cursor: "pointer"
                              }}
                            >
                              상세
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </AuthCheck>
  );
}

// Sub-component for Meeting Notes to keep code clean
function MeetingNotesSection({ apiUrl, meetingType, title }: { apiUrl: string, meetingType: string, title: string }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotes = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=${meetingType}`);
      setNotes(res.data.notes || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (expanded) fetchNotes();
  }, [expanded]);

  const saveNote = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
        meeting_type: meetingType,
        date: new Date().toISOString().split('T')[0],
        content,
        author: "Teacher"
      });
      setContent("");
      fetchNotes();
      alert("저장되었습니다.");
    } catch (e) {
      alert("저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "rgba(30,41,59,0.6)", borderRadius: "12px", border: "1px solid #334155", overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "16px 20px", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: expanded ? "rgba(30,41,59,0.8)" : "transparent"
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1rem", color: "#e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
          📝 {title}
        </h3>
        <span style={{ color: "#94a3b8" }}>{expanded ? "▲ 접기" : "▼ 펼치기"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "20px", borderTop: "1px solid #334155" }}>
          <div style={{ marginBottom: "20px" }}>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="회의 내용을 비식별화하여 입력하세요..."
              style={{
                width: "100%", minHeight: "80px", padding: "12px",
                background: "#0f172a", border: "1px solid #475569",
                borderRadius: "8px", color: "#f1f5f9", marginBottom: "10px"
              }}
            />
            <button
              onClick={saveNote}
              disabled={loading || !content.trim()}
              style={{
                padding: "8px 16px", background: "#6366f1", color: "white",
                border: "none", borderRadius: "6px", cursor: "pointer",
                fontSize: "0.85rem", opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? "저장 중..." : "회의록 저장"}
            </button>
          </div>

          <div>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "0.9rem", color: "#cbd5e1" }}>📋 최근 기록</h4>
            {notes.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.85rem" }}>기록이 없습니다.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "200px", overflowY: "auto" }}>
                {notes.map(n => (
                  <li key={n.id} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px dashed #334155" }}>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "4px" }}>{n.date} | {n.author}</div>
                    <div style={{ fontSize: "0.9rem", color: "#e2e8f0", whiteSpace: "pre-wrap" }}>{n.content}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
