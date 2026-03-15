"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import styles from "../page.module.css";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import GlobalNav from "../components/GlobalNav";
import { useRouter } from "next/navigation";

interface DayValue {
  [day: string]: string;
}

interface CICOStudent {
  row: number;
  번호: string;
  학급: string;
  학생코드: string;
  학생명: string;
  Tier2: string;
  Tier3: string; 
  목표행동: string;
  "목표행동 유형": string;
  척도: string;
  "입력 기준": string; 
  "목표 달성 기준": string;
  수행_발생률: string;
  목표_달성_여부: string;
  days: DayValue;
}

interface DayColumn {
  index: number;
  label: string;
  display?: string; 
}

interface MonthlyData {
  month: number;
  day_columns: DayColumn[];
  students: CICOStudent[];
  col_map: { [key: string]: number };
  weekly_trend?: any[];
  summary?: any;
}

const SCALE_OPTIONS = ["O/X(발생)", "0점/1점/2점", "0~5", "0~7교시", "1~100회", "1~100분"];
const TYPE_OPTIONS = ["증가 목표행동", "감소 목표행동"];
const CRITERIA_INCREASE = ["90% 이상", "80% 이상", "70% 이상", "60% 이상", "50% 이상"];
const CRITERIA_DECREASE = ["10% 이하", "20% 이하", "30% 이하", "40% 이하", "50% 이하"];

const BEHAVIOR_PRESETS = [
    { label: "직접 입력", value: "manual" },
    { label: "[공통] 수업 참여율(OX)", behavior: "수업 참여율", type: "증가 목표행동", scale: "O/X(발생)", criteria: "80% 이상" },
    { label: "[공통] 규칙 준수율(012)", behavior: "규칙 준수율", type: "증가 목표행동", scale: "0점/1점/2점", criteria: "80% 이상" },
    { label: "[증가] 과제 완수", behavior: "과제 완수", type: "증가 목표행동", scale: "O/X(발생)", criteria: "80% 이상" },
    { label: "[감소] 위기행동(빈도)", behavior: "위기행동", type: "감소 목표행동", scale: "1~100회", criteria: "20% 이하" },
    { label: "[감소] 수업 이탈(시간)", behavior: "수업 이탈", type: "감소 목표행동", scale: "1~100분", criteria: "20% 이하" },
];

function getInputOptions(scale: string): string[] {
  const normParams = scale?.trim() || "";
  if (normParams.includes("O/X")) return ["O", "X"];
  if (normParams.includes("0점/1점/2점")) return ["0점", "1점", "2점"];
  if (normParams.includes("0~5")) return ["0", "1", "2", "3", "4", "5"];
  if (normParams.includes("0~7")) return ["0", "1", "2", "3", "4", "5", "6", "7"];
  return [];
}

export default function CICOGridPage() {
  const [month, setMonth] = useState(3);
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [is404, setIs404] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const [pendingUpdates, setPendingUpdates] = useState<{ row: number; col: number; value: string }[]>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; day: string } | null>(null);
  const [editingSettings, setEditingSettings] = useState<{ row: number; field: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");

  const apiUrl = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_API_URL || "" : "";

  useEffect(() => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    if (currentMonth >= 3 && currentMonth <= 12) setMonth(currentMonth);
  }, []);

  const { user, isAdmin } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [monthlyRes, bizDaysRes] = await Promise.all([
        axios.get(`${apiUrl}/api/v1/cico/monthly?month=${month}`),
        axios.get(`${apiUrl}/api/v1/cico/business-days?month=${month}&year=${new Date().getFullYear()}`),
      ]);

      const monthlyData = monthlyRes.data;
      const businessDays: string[] = bizDaysRes.data.business_days || [];

      const businessDayMap: { [key: number]: string } = {};
      businessDays.forEach(d => {
        const parts = d.split('-');
        if (parts.length >= 2) businessDayMap[parseInt(parts[1], 10)] = d;
      });

      const filteredCols: DayColumn[] = [];
      const usedLabels = new Set();

      (monthlyData.day_columns as DayColumn[]).forEach(col => {
        let display = col.label;
        let isVisible = false;

        if (col.label.includes("회차")) {
          isVisible = true;
          display = col.label.replace("회차", "");
        } else if (/^\d{1,2}-\d{1,2}$/.test(col.label)) {
          if (businessDays.includes(col.label)) isVisible = true;
        } else {
          const dayNum = parseInt(col.label, 10);
          if (!isNaN(dayNum) && businessDayMap[dayNum]) {
            isVisible = true;
            display = businessDayMap[dayNum];
          }
        }

        if (isVisible && !usedLabels.has(col.index)) {
          filteredCols.push({ index: col.index, label: col.label, display });
          usedLabels.add(col.index);
        }
      });

      if (filteredCols.length > 0) monthlyData.day_columns = filteredCols;
      setData(monthlyData);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setIs404(true);
        setError(`${month}월 CICO 데이터가 없습니다.`);
      } else {
        setError(err.message || "데이터 로딩 실패");
      }
    } finally {
      setLoading(false);
    }
  }, [month, apiUrl]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (pendingUpdates.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("저장 중...");
      try {
        await axios.post(`${apiUrl}/api/v1/cico/monthly/update`, { month, updates: pendingUpdates });
        setPendingUpdates([]);
        setSaveStatus("✓ 저장 완료");
        setTimeout(() => setSaveStatus(""), 2000);
      } catch (err) {
        setSaveStatus("⚠ 저장 실패");
      }
    }, 1500);
  }, [pendingUpdates, month, apiUrl]);

  const handleCellChange = (student: CICOStudent, dayLabel: string, value: string) => {
    if (!data) return;
    const dayCol = data.day_columns.find(d => d.label === dayLabel);
    if (!dayCol) return;

    const colIdx = dayCol.index + 1;
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        students: prev.students.map(s => s.row === student.row ? { ...s, days: { ...s.days, [dayLabel]: value } } : s),
      };
    });

    setPendingUpdates(prev => [
      ...prev.filter(u => !(u.row === student.row && u.col === colIdx)),
      { row: student.row, col: colIdx, value },
    ]);
    setEditingCell(null);
  };

  const handleSettingsChange = async (student: CICOStudent, updates: { [field: string]: string }) => {
    try {
      await axios.post(`${apiUrl}/api/v1/cico/settings`, {
        month, student_code: student.학생코드, settings: updates, row_index: student.row
      });
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          students: prev.students.map(s => s.row === student.row ? { ...s, ...updates } : s),
        };
      });
      setSaveStatus("✓ 설정 저장 완료");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (err) {
      setSaveStatus("⚠ 설정 저장 실패");
    }
    setEditingSettings(null);
  };

  const getCellColor = (value: string, type: string): string => {
    if (!value) return "transparent";
    if (type === "증가 목표행동") {
      if (value === "O" || value === "2") return "#d1fae5";
      if (value === "X" || value === "0") return "#fee2e2";
      if (value === "1") return "#fef3c7";
    } else {
      if (value === "X" || value === "0") return "#d1fae5";
      if (value === "O") return "#fee2e2";
      if (value === "1") return "#fef3c7";
    }
    return "#f3f4f6";
  };

  const formatRate = (rate: string): string => {
    if (!rate || rate === "-") return "-";
    const num = parseFloat(rate);
    if (isNaN(num)) return rate;
    return num <= 1 ? `${Math.round(num * 100)}%` : `${Math.round(num)}%`;
  };

  const filteredData = React.useMemo(() => {
    if (!data) return null;
    if (isAdmin()) return data;
    if (!user?.class_id) return data;
    return { ...data, students: data.students.filter(s => s.학생코드.startsWith(user.class_id!)) };
  }, [data, user, isAdmin]);

  return (
    <AuthCheck>
      <div className={styles.container}>
        <GlobalNav currentPage="cico" />
        <main className={styles.main} style={{ marginTop: "10px", maxWidth: "100%", padding: "0 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>✍️ CICO 일일 기록 입력</h2>
              <p style={{ color: "#666", margin: "3px 0 0", fontSize: "0.85rem" }}>Tier2 학생들의 일일 행동 데이터를 기록합니다.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button 
                onClick={() => router.push('/report/tier2')}
                style={{ 
                  padding: "8px 16px", 
                  borderRadius: "8px", 
                  border: "1px solid #6366f1", 
                  backgroundColor: "white", 
                  color: "#6366f1", 
                  fontWeight: "bold", 
                  cursor: "pointer" 
                }}
              >
                📊 CICO 리포트 보기
              </button>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: "8px 12px", borderRadius: "8px", border: "2px solid #6366f1", fontWeight: "bold" }}>
                {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <option key={m} value={m}>{String(new Date().getFullYear()).slice(-2)}-{String(m).padStart(2, '0')}월</option>
                ))}
              </select>
              <button onClick={fetchData} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: "#6366f1", color: "white", fontWeight: "bold", cursor: "pointer" }}>🔄 새로고침</button>
            </div>
          </div>

          {loading && <div style={{ textAlign: "center", padding: "50px" }}>📊 데이터 로딩 중...</div>}
          {error && <div style={{ textAlign: "center", padding: "50px", color: "#dc2626" }}>⚠ {error}</div>}

          {!loading && !error && filteredData && (
            <>
              {/* Fragment for the data exists condition */}
              {filteredData.students.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px", backgroundColor: "white", borderRadius: "12px" }}>해당 학급의 CICO 학생이 없습니다.</div>
              ) : (
                <>
                  <div style={{ marginBottom: "15px", padding: "10px", background: "#f8f9fa", borderRadius: "8px", borderLeft: "4px solid #6366f1", fontSize: "0.85rem" }}>
                    💡 <strong>데이터 입력 안내:</strong> 셀을 클릭하여 값을 입력하면 즉시 서버에 임시 저장됩니다. (O/X 및 점수 척도 지원)
                  </div>

                  <div className="table-responsive-wrapper" style={{ overflowX: "auto", borderRadius: "12px", boxShadow: "0 2px 12px rgba(0,0,0,0.1)", backgroundColor: "white" }}>
                    <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%", fontSize: "0.8rem" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>번호</th>
                          <th style={{ ...thStyle, minWidth: "80px" }}>학급</th>
                          <th style={thStyle}>코드</th>
                          <th style={{ ...thStyle, minWidth: "100px" }}>학생명</th>
                          <th style={{ ...thStyle, minWidth: "140px" }}>목표행동</th>
                          <th style={{ ...thStyle, minWidth: "120px" }}>유형</th>
                          <th style={{ ...thStyle, minWidth: "100px" }}>척도</th>
                          <th style={{ ...thStyle, minWidth: "80px" }}>입력 기준</th>
                          <th style={{ ...thStyle, minWidth: "100px" }}>달성 기준</th>
                          {filteredData.day_columns.map(day => (
                            <th key={day.label} style={thStyle}>{day.display || day.label}</th>
                          ))}
                          <th style={{ ...thStyle, backgroundColor: "#e0e7ff", color: "#4338ca" }}>수행률</th>
                          <th style={{ ...thStyle, backgroundColor: "#e0e7ff", color: "#4338ca" }}>달성</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredData.students.map(student => (
                          <tr key={`${student.학생코드}-${student.row}`} style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <td style={tdStyle}>{student.번호}</td>
                            <td style={tdStyle}>{student.학급}</td>
                            <td style={{ ...tdStyle, fontWeight: "bold", color: "#6366f1" }}>{student.학생코드}</td>
                            <td style={{ ...tdStyle, fontWeight: "600" }}>{student.학생명}</td>
                            <td style={{ ...tdStyle, cursor: "pointer", position: "relative" }} onClick={() => setEditingSettings({ row: student.row, field: "목표행동" })}>
                              {editingSettings?.row === student.row && editingSettings?.field === "목표행동" ? (
                                <input
                                  autoFocus
                                  defaultValue={student.목표행동}
                                  onBlur={e => handleSettingsChange(student, { "목표행동": e.target.value })}
                                  onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                  style={{ width: "100%", padding: "1px 2px", border: "1px solid #6366f1", borderRadius: "2px", fontSize: "0.75rem" }}
                                />
                              ) : (
                                student.목표행동 || <span style={{ color: "#ccc" }}>입력</span>
                              )}
                            </td>
                            <td style={{ ...tdStyle, cursor: "pointer" }}>
                              <select
                                value={student["목표행동 유형"]}
                                onChange={e => handleSettingsChange(student, { "목표행동 유형": e.target.value })}
                                style={{ border: "none", background: "transparent", fontSize: "0.75rem", cursor: "pointer", width: "100%" }}
                              >
                                {TYPE_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                            <td style={{ ...tdStyle, cursor: "pointer" }}>
                              <select
                                value={student.척도}
                                onChange={e => handleSettingsChange(student, { "척도": e.target.value })}
                                style={{ border: "none", background: "transparent", fontSize: "0.7rem", cursor: "pointer", width: "100%" }}
                              >
                                {SCALE_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                            <td style={{ ...tdStyle, cursor: "pointer" }} onClick={() => setEditingSettings({ row: student.row, field: "입력 기준" })}>
                              {editingSettings?.row === student.row && editingSettings?.field === "입력 기준" ? (
                                <input
                                  autoFocus
                                  type="number"
                                  defaultValue={student["입력 기준"]}
                                  onBlur={e => handleSettingsChange(student, { "입력 기준": e.target.value })}
                                  onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                  style={{ width: "100%", textAlign: "center", border: "1px solid #6366f1", borderRadius: "4px", fontSize: "0.75rem" }}
                                />
                              ) : (
                                student["입력 기준"] || "0"
                              )}
                            </td>
                            <td style={{ ...tdStyle, cursor: "pointer" }}>
                              <select
                                value={student["목표 달성 기준"]}
                                onChange={e => handleSettingsChange(student, { "목표 달성 기준": e.target.value })}
                                style={{ border: "none", background: "transparent", fontSize: "0.7rem", cursor: "pointer", width: "100%" }}
                              >
                                {(student["목표행동 유형"] === "감소 목표행동" ? CRITERIA_DECREASE : CRITERIA_INCREASE).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                            {filteredData.day_columns.map(day => {
                              const val = student.days[day.label] || "";
                              const isEditing = editingCell?.row === student.row && editingCell?.day === day.label;
                              const options = getInputOptions(student.척도);
                              return (
                                <td 
                                  key={day.label} 
                                  style={{ ...tdStyle, backgroundColor: getCellColor(val, student["목표행동 유형"]), cursor: "pointer", minWidth: "40px" }} 
                                  onClick={() => {
                                    if (options.length > 0 && !isEditing) {
                                      // Cycle through O/X or 0/1/2 for convenience
                                      if (options.length <= 3) {
                                        const currentIdx = options.indexOf(val);
                                        const nextVal = currentIdx === -1 ? options[0] : (currentIdx === options.length - 1 ? "" : options[currentIdx + 1]);
                                        handleCellChange(student, day.label, nextVal);
                                      } else {
                                        setEditingCell({ row: student.row, day: day.label });
                                      }
                                    } else if (options.length === 0) {
                                      setEditingCell({ row: student.row, day: day.label });
                                    }
                                  }}
                                >
                                  {isEditing ? (
                                    options.length > 0 ? (
                                      <select
                                        autoFocus
                                        value={val}
                                        onChange={e => handleCellChange(student, day.label, e.target.value)}
                                        onBlur={() => setEditingCell(null)}
                                        style={{ width: "100%", fontSize: "0.75rem" }}
                                      >
                                        <option value="">-</option>
                                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                                      </select>
                                    ) : (
                                      <input 
                                        autoFocus 
                                        type="number" 
                                        defaultValue={val} 
                                        onBlur={e => handleCellChange(student, day.label, e.target.value)} 
                                        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                        style={{ width: "35px", textAlign: "center", fontSize: "0.75rem" }} 
                                      />
                                    )
                                  ) : (
                                    <span>{val || "·"}</span>
                                  )}
                                </td>
                              );
                            })}
                            <td style={{ ...tdStyle, fontWeight: "bold" }}>{formatRate(student.수행_발생률)}</td>
                            <td style={{ ...tdStyle, fontWeight: "bold" }}>{student.목표_달성_여부}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </AuthCheck>
  );
}

const thStyle: React.CSSProperties = {
  backgroundColor: "#f1f5f9",
  color: "#475569",
  padding: "10px 8px",
  textAlign: "center",
  borderBottom: "2px solid #e2e8f0",
  borderRight: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
  fontWeight: "800",
  fontSize: "0.7rem",
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 6px",
  textAlign: "center",
  borderRight: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
  fontSize: "0.75rem",
};
