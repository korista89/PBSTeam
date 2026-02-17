"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import styles from "../page.module.css";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import GlobalNav from "../components/GlobalNav";

interface DayValue {
  [day: string]: string;
}

interface CICOStudent {
  row: number;
  번호: string;
  학급: string;
  학생코드: string;
  Tier2: string;
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
  display?: string; // e.g. "03-03"
}

interface MonthlyData {
  month: string;
  day_columns: DayColumn[];
  students: CICOStudent[];
  col_map: { [key: string]: number };
}

// Scale options from Apps Script
const SCALE_OPTIONS = ["O/X(발생)", "0점/1점/2점", "0~5", "0~7교시", "1~100회", "1~100분"];
const TYPE_OPTIONS = ["증가 목표행동", "감소 목표행동"];
const CRITERIA_INCREASE = ["90% 이상", "80% 이상", "70% 이상", "60% 이상", "50% 이상"];
const CRITERIA_DECREASE = ["10% 이하", "20% 이하", "30% 이하", "40% 이하", "50% 이하"];

function getInputOptions(scale: string): string[] {
  const normParams = scale?.trim() || "";

  if (normParams.includes("O/X")) return ["O", "X"];
  if (normParams.includes("0점/1점/2점") || normParams.includes("0/1/2")) return ["0", "1", "2"];
  if (normParams.includes("0~5")) return ["0", "1", "2", "3", "4", "5"];
  if (normParams.includes("0~7")) return ["0", "1", "2", "3", "4", "5", "6", "7"];

  return []; // Free input
}

export default function CICOGridPage() {
  const [month, setMonth] = useState(3);
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [is404, setIs404] = useState(false);
  const [error, setError] = useState("");
  const [pendingUpdates, setPendingUpdates] = useState<
    { row: number; col: number; value: string }[]
  >([]);
  const [editingCell, setEditingCell] = useState<{ row: number; day: string } | null>(null);
  const [editingSettings, setEditingSettings] = useState<{ row: number; field: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");

  const apiUrl = typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    : "http://localhost:8000";

  // Determine current month on load based on today's date
  useEffect(() => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    if (currentMonth >= 3 && currentMonth <= 12) {
      setMonth(currentMonth);
    }
  }, []);

  const { user, isAdmin } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch monthly data and business days in parallel
      const [monthlyRes, bizDaysRes] = await Promise.all([
        axios.get(`${apiUrl}/api/v1/cico/monthly?month=${month}`),
        axios.get(`${apiUrl}/api/v1/cico/business-days?month=${month}&year=2025`),
      ]);

      const monthlyData = monthlyRes.data;
      const businessDays: string[] = bizDaysRes.data.business_days || [];

      // Improved Header Logic:
      // Map business days for legacy integer column support
      const businessDayMap: { [key: number]: string } = {};
      businessDays.forEach(d => {
        // d is "MM-DD". 
        const parts = d.split('-');
        if (parts.length >= 2) {
          const dayInt = parseInt(parts[1], 10); // Extract Day part
          businessDayMap[dayInt] = d;
        }
      });

      const filteredCols: DayColumn[] = [];
      const usedLabels = new Set();

      (monthlyData.day_columns as DayColumn[]).forEach(col => {
        const label = col.label;
        let display = "";
        let isValidDate = false;

        // Check 1: Label matches MM-DD format directly
        if (/^\d{1,2}-\d{1,2}$/.test(label)) {
          // Verify if this date is in our business days list
          // businessDays format is "MM-DD"
          if (businessDays.includes(label)) {
            display = label;
            isValidDate = true;
          }
        } else {
          // Legacy/Integer Check: Try to treat as day number
          const dayNum = parseInt(label, 10);
          if (!isNaN(dayNum) && businessDayMap[dayNum]) {
            display = businessDayMap[dayNum];
            isValidDate = true;
          }
        }

        // Only add if it's a valid business day (or if it's a special column? No, strictly business days for now)
        if (isValidDate && !usedLabels.has(col.index)) {
          filteredCols.push({
            index: col.index,
            label: col.label,
            display: display
          });
          usedLabels.add(col.index);
        }
      });

      // Always update columns with our processed list
      if (filteredCols.length > 0) {
        monthlyData.day_columns = filteredCols;
      }

      // Filter students if user is a teacher (and not admin)
      // We need to access user from useAuth, but this is inside useCallback.
      // We'll filter in the render or effect, but filtering `data` state is better.
      // However, `user` is available from hook.

      setData(monthlyData);
    } catch (err: unknown) {
      console.error(err);
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setIs404(true);
        setError(`${month}월 CICO 데이터가 없습니다.`);
      } else {
        const msg = err instanceof Error ? err.message : "데이터 로딩 실패";
        setError(msg);
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
      // Ensure month is integer
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


  // Filtered data
  const filteredData = React.useMemo(() => {
    if (!data) return null;
    if (isAdmin()) return data;
    if (!user?.class_id) return data; // Should not happen for teachers

    return {
      ...data,
      students: data.students.filter(s => s.학생코드.startsWith(user.class_id!))
    };
  }, [data, user, isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  // Auto-save pending updates (debounced)
  useEffect(() => {
    if (pendingUpdates.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {

      setSaveStatus("저장 중...");
      try {
        await axios.post(`${apiUrl}/api/v1/cico/monthly/update`, {
          month,
          updates: pendingUpdates,
        });
        setPendingUpdates([]);
        setSaveStatus("✓ 저장 완료");
        setTimeout(() => setSaveStatus(""), 2000);
      } catch (err) {
        console.error("Save failed:", err);
        setSaveStatus("⚠ 저장 실패");
      } finally {

      }
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUpdates]);

  // Handle cell value change
  const handleCellChange = (student: CICOStudent, dayLabel: string, value: string) => {
    if (!data) return;

    // Find column index directly from day object
    const dayCol = data.day_columns.find(d => d.label === dayLabel);
    if (!dayCol) return;

    const colIdx = dayCol.index + 1; // 0-based from backend to 1-based for sheet

    // Update local state
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        students: prev.students.map(s =>
          s.row === student.row
            ? { ...s, days: { ...s.days, [dayLabel]: value } }
            : s
        ),
      };
    });

    // Queue the update
    setPendingUpdates(prev => [
      ...prev.filter(u => !(u.row === student.row && u.col === colIdx)),
      { row: student.row, col: colIdx, value },
    ]);

    setEditingCell(null);
  };

  // Handle settings change (목표행동, 유형, 척도, etc.)
  const handleSettingsChange = async (studentCode: string, field: string, value: string) => {
    try {
      await axios.post(`${apiUrl}/api/v1/cico/settings`, {
        month,
        student_code: studentCode,
        settings: { [field]: value },
      });

      // Update local state
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          students: prev.students.map(s =>
            s.학생코드 === studentCode
              ? { ...s, [field]: value }
              : s
          ),
        };
      });

      setSaveStatus("✓ 설정 저장 완료");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (err) {
      console.error("Settings save failed:", err);
      setSaveStatus("⚠ 설정 저장 실패");
    }
    setEditingSettings(null);
  };

  // Get cell background color based on value and type
  const getCellColor = (value: string, type: string): string => {
    if (!value) return "transparent";

    if (type === "증가 목표행동") {
      if (value === "O" || value === "2") return "#d1fae5"; // Green
      if (value === "X" || value === "0") return "#fee2e2"; // Red
      if (value === "1") return "#fef3c7"; // Yellow
    } else if (type === "감소 목표행동") {
      if (value === "X" || value === "0") return "#d1fae5"; // Green (opposite)
      if (value === "O") return "#fee2e2"; // Red
      if (value === "1") return "#fef3c7"; // Yellow
    }
    return "#f3f4f6";
  };

  // Rate color
  const getRateColor = (rate: string, achieved: string): string => {
    if (achieved === "O") return "#059669";
    if (achieved === "X") return "#dc2626";
    return "#666";
  };

  // Format rate
  const formatRate = (rate: string): string => {
    if (!rate || rate === "-") return "-";
    const num = parseFloat(rate);
    if (isNaN(num)) return rate;
    if (num <= 1) return `${Math.round(num * 100)}%`;
    return `${Math.round(num)}%`;
  };

  // Meeting Notes State
  const [showMeetNotes, setShowMeetNotes] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [savedNotes, setSavedNotes] = useState<any[]>([]);
  const [noteLoading, setNoteLoading] = useState(false);

  // Fetch notes on load
  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?meeting_type=tier2`);
      setSavedNotes(res.data.notes || []);
    } catch (e) {
      console.error("Failed to fetch notes", e);
    }
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim()) return;
    setNoteLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
        meeting_type: "tier2",
        date: new Date().toISOString().split('T')[0],
        content: noteContent,
        author: "Teacher" // Should come from auth context in real app
      });
      setNoteContent("");
      fetchNotes();
      alert("회의록이 저장되었습니다.");
    } catch (e) {
      console.error("Failed to save note", e);
      alert("저장 실패");
    } finally {
      setNoteLoading(false);
    }
  };

  return (
    <AuthCheck>
      <div className={styles.container}>
        <GlobalNav currentPage="cico" />

        <main className={styles.main} style={{ marginTop: "10px", maxWidth: "100%", padding: "0 10px" }}>
          {/* Header */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
            flexWrap: "wrap",
            gap: "10px",
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>📋 CICO 월별 리포트</h2>
              <p style={{ color: "#666", margin: "3px 0 0", fontSize: "0.85rem" }}>
                Tier2 학생 목표행동 일일 기록 및 회의록
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Meeting Notes Toggle */}
              <button
                onClick={() => setShowMeetNotes(!showMeetNotes)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  backgroundColor: showMeetNotes ? "#e0e7ff" : "white",
                  color: showMeetNotes ? "#4338ca" : "#374151",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                📝 회의록 {showMeetNotes ? "접기" : "열기"}
              </button>

              {/* Month Selector */}
              <label style={{ fontWeight: "bold", fontSize: "0.9rem" }}>월 선택:</label>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "2px solid #6366f1",
                  fontWeight: "bold",
                  fontSize: "0.95rem",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                }}
              >
                {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <option key={m} value={m}>{String(new Date().getFullYear()).slice(-2)}-{String(m).padStart(2, '0')}월</option>
                ))}
              </select>

              {/* Save Status */}
              {saveStatus && (
                <span style={{
                  padding: "5px 12px",
                  borderRadius: "15px",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                  backgroundColor: saveStatus.includes("완료") ? "#d1fae5" : saveStatus.includes("실패") ? "#fee2e2" : "#fef3c7",
                  color: saveStatus.includes("완료") ? "#059669" : saveStatus.includes("실패") ? "#dc2626" : "#b45309",
                }}>
                  {saveStatus}
                </span>
              )}

              <button
                onClick={fetchData}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#6366f1",
                  color: "white",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
              >
                🔄 새로고침
              </button>
            </div>
          </div>

          {/* Meeting Notes Section */}
          {showMeetNotes && (
            <div style={{
              marginBottom: "20px",
              padding: "20px",
              backgroundColor: "#f9fafb",
              borderRadius: "12px",
              border: "1px solid #e5e7eb"
            }}>
              <h3 style={{ marginTop: 0, fontSize: "1.1rem", marginBottom: "15px" }}>📝 Tier 2 협의회 회의록</h3>

              <div style={{ display: "flex", gap: "20px", flexDirection: "column" }}>
                <div>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="회의 내용을 입력하세요... (예: 1011번 학생 CICO 목표 달성으로 졸업 논의)"
                    style={{
                      width: "100%",
                      minHeight: "100px",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #d1d5db",
                      marginBottom: "10px",
                      fontSize: "0.95rem"
                    }}
                  />
                  <button
                    onClick={handleSaveNote}
                    disabled={noteLoading || !noteContent.trim()}
                    style={{
                      padding: "8px 20px",
                      backgroundColor: "#4f46e5",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      opacity: noteLoading ? 0.7 : 1
                    }}
                  >
                    {noteLoading ? "저장 중..." : "회의록 저장"}
                  </button>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "15px" }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: "1rem", color: "#4b5563" }}>📋 최근 회의록</h4>
                  {savedNotes.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontStyle: "italic" }}>저장된 회의록이 없습니다.</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "200px", overflowY: "auto" }}>
                      {savedNotes.map((note) => (
                        <li key={note.id} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px dashed #e5e7eb" }}>
                          <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "4px" }}>
                            {note.date} | {note.author || "Teacher"}
                          </div>
                          <div style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem", color: "#1f2937" }}>
                            {note.content}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Loading / Error */}
          {loading && (
            <div style={{ textAlign: "center", padding: "50px", color: "#666" }}>
              📊 {month}월 데이터 로딩 중...
            </div>
          )}

          {error && (
            <div style={{ textAlign: "center", padding: "50px", color: "#dc2626" }}>
              <p style={{ fontSize: '1.2rem', marginBottom: '15px' }}>⚠ {error}</p>
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
                    fontSize: '1rem'
                  }}
                >
                  📅 {month}월 CICO 시트 생성하기
                </button>
              )}
              {is404 && !isAdmin() && (
                <p>관리자에게 시트 생성을 요청해주세요.</p>
              )}
            </div>
          )}


          {/* Grid Table */}
          {!loading && !error && filteredData && (
            <>
              {filteredData.students.length === 0 ? (
                <div style={{
                  textAlign: "center",
                  padding: "50px",
                  backgroundColor: "white",
                  borderRadius: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}>
                  <p style={{ fontSize: "1.1rem", color: "#666" }}>
                    {month}월에 해당 학급의 Tier2(CICO) 대상 학생이 없습니다.
                  </p>
                  <p style={{ color: "#999", marginTop: "8px", fontSize: "0.9rem" }}>
                    월별 시트에서 Tier2 열을 &quot;O&quot;로 변경하거나,<br />
                    대시보드에서 학생코드를 등록해주세요.
                  </p>
                </div>
              ) : (
                <div style={{
                  overflowX: "auto",
                  borderRadius: "12px",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
                  backgroundColor: "white",
                }}>
                  <table style={{
                    borderCollapse: "collapse",
                    width: "max-content",
                    minWidth: "100%",
                    fontSize: "0.8rem",
                  }}>
                    <thead>
                      <tr>
                        {/* Fixed columns */}
                        <th style={thStyle}>번호</th>
                        <th style={{ ...thStyle, minWidth: "100px" }}>학급</th>
                        <th style={thStyle}>코드</th>
                        <th style={{ ...thStyle, minWidth: "120px" }}>목표행동</th>
                        <th style={{ ...thStyle, minWidth: "90px" }}>유형</th>
                        <th style={{ ...thStyle, minWidth: "80px" }}>척도</th>
                        <th style={{ ...thStyle, minWidth: "70px" }}>달성기준</th>

                        {/* Day columns — MM-DD weekday headers */}
                        {filteredData.day_columns.map(day => (
                          <th key={day.label} style={{
                            ...thStyle,
                            minWidth: "42px",
                            maxWidth: "42px",
                            fontSize: "0.65rem",
                            padding: "4px 1px",
                            letterSpacing: "-0.5px",
                          }}>
                            {day.display || day.label}
                          </th>
                        ))}

                        {/* Summary columns */}
                        <th style={{ ...thStyle, minWidth: "60px", backgroundColor: "#e0e7ff" }}>수행률</th>
                        <th style={{ ...thStyle, minWidth: "50px", backgroundColor: "#e0e7ff" }}>달성</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.students.map(student => (
                        <tr key={student.학생코드} style={{ borderBottom: "1px solid #e5e7eb" }}>
                          {/* Fixed info cells */}
                          <td style={tdStyle}>{student.번호}</td>
                          <td style={{ ...tdStyle, fontSize: "0.75rem", textAlign: "left" }}>{student.학급}</td>
                          <td style={{ ...tdStyle, fontWeight: "bold", color: "#6366f1" }}>{student.학생코드}</td>

                          {/* Editable: 목표행동 */}
                          <td
                            style={{ ...tdStyle, cursor: "pointer", textAlign: "left" }}
                            onClick={() => setEditingSettings({ row: student.row, field: "목표행동" })}
                          >
                            {editingSettings?.row === student.row && editingSettings?.field === "목표행동" ? (
                              <input
                                autoFocus
                                defaultValue={student.목표행동}
                                onBlur={e => handleSettingsChange(student.학생코드, "목표행동", e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                style={{ width: "100%", padding: "2px 4px", border: "1px solid #6366f1", borderRadius: "4px", fontSize: "0.8rem" }}
                              />
                            ) : (
                              student.목표행동 || <span style={{ color: "#ccc" }}>클릭하여 입력</span>
                            )}
                          </td>

                          {/* Editable: 유형 */}
                          <td style={{ ...tdStyle, cursor: "pointer" }}>
                            <select
                              value={student["목표행동 유형"]}
                              onChange={e => handleSettingsChange(student.학생코드, "목표행동 유형", e.target.value)}
                              style={{ border: "none", background: "transparent", fontSize: "0.75rem", cursor: "pointer", width: "100%" }}
                            >
                              {TYPE_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt.replace("목표행동", "")}</option>
                              ))}
                            </select>
                          </td>

                          {/* Editable: 척도 */}
                          <td style={{ ...tdStyle, cursor: "pointer" }}>
                            <select
                              value={student.척도}
                              onChange={e => handleSettingsChange(student.학생코드, "척도", e.target.value)}
                              style={{ border: "none", background: "transparent", fontSize: "0.7rem", cursor: "pointer", width: "100%" }}
                            >
                              {SCALE_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>

                          {/* Editable: 달성기준 */}
                          <td style={{ ...tdStyle, cursor: "pointer" }}>
                            <select
                              value={student["목표 달성 기준"]}
                              onChange={e => handleSettingsChange(student.학생코드, "목표 달성 기준", e.target.value)}
                              style={{ border: "none", background: "transparent", fontSize: "0.7rem", cursor: "pointer", width: "100%" }}
                            >
                              {(student["목표행동 유형"] === "감소 목표행동" ? CRITERIA_DECREASE : CRITERIA_INCREASE).map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>

                          {/* Day cells */}
                          {filteredData.day_columns.map(day => {
                            const val = student.days[day.label] || "";
                            const isEditing = editingCell?.row === student.row && editingCell?.day === day.label;
                            const options = getInputOptions(student.척도);
                            const bg = getCellColor(val, student["목표행동 유형"]);

                            return (
                              <td
                                key={day.label}
                                style={{
                                  ...tdStyle,
                                  padding: "0",
                                  minWidth: "42px",
                                  maxWidth: "42px",
                                  backgroundColor: bg,
                                  cursor: "pointer",
                                  position: "relative",
                                }}
                                onClick={() => {
                                  if (options.length > 0 && !isEditing) {
                                    // For fixed options, cycle through values
                                    if (options.length <= 3) {
                                      const currentIdx = options.indexOf(val);
                                      const nextVal = currentIdx === -1 ? options[0]
                                        : currentIdx === options.length - 1 ? "" : options[currentIdx + 1];
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
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        border: "2px solid #6366f1",
                                        fontSize: "0.75rem",
                                        textAlign: "center",
                                      }}
                                    >
                                      <option value="">-</option>
                                      {options.map(o => (
                                        <option key={o} value={o}>{o}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      autoFocus
                                      type="number"
                                      defaultValue={val}
                                      onBlur={e => handleCellChange(student, day.label, e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                      style={{
                                        width: "100%",
                                        border: "2px solid #6366f1",
                                        fontSize: "0.75rem",
                                        textAlign: "center",
                                        padding: "2px",
                                      }}
                                    />
                                  )
                                ) : (
                                  <div style={{
                                    padding: "4px 2px",
                                    textAlign: "center",
                                    fontWeight: val ? "bold" : "normal",
                                    color: val ? "#333" : "#ccc",
                                    fontSize: "0.75rem",
                                    minHeight: "24px",
                                    lineHeight: "24px",
                                  }}>
                                    {val || "·"}
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          {/* Summary: 수행/발생률 */}
                          <td style={{
                            ...tdStyle,
                            fontWeight: "bold",
                            backgroundColor: "#f0f4ff",
                            color: getRateColor(student.수행_발생률, student.목표_달성_여부),
                          }}>
                            {formatRate(student.수행_발생률)}
                          </td>

                          {/* Summary: 달성여부 */}
                          <td style={{
                            ...tdStyle,
                            fontWeight: "bold",
                            backgroundColor: student.목표_달성_여부 === "O" ? "#d1fae5" : student.목표_달성_여부 === "X" ? "#fee2e2" : "#f9fafb",
                            color: student.목표_달성_여부 === "O" ? "#059669" : student.목표_달성_여부 === "X" ? "#dc2626" : "#999",
                            fontSize: "1rem",
                          }}>
                            {student.목표_달성_여부 === "O" ? "✅" : student.목표_달성_여부 === "X" ? "❌" : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Legend */}
              <div style={{
                marginTop: "15px",
                display: "flex",
                gap: "15px",
                fontSize: "0.8rem",
                color: "#666",
                flexWrap: "wrap",
              }}>
                <span>
                  <span style={{ display: "inline-block", width: "14px", height: "14px", backgroundColor: "#d1fae5", borderRadius: "3px", marginRight: "4px", verticalAlign: "middle" }}></span>
                  성공
                </span>
                <span>
                  <span style={{ display: "inline-block", width: "14px", height: "14px", backgroundColor: "#fee2e2", borderRadius: "3px", marginRight: "4px", verticalAlign: "middle" }}></span>
                  미달성
                </span>
                <span>
                  <span style={{ display: "inline-block", width: "14px", height: "14px", backgroundColor: "#fef3c7", borderRadius: "3px", marginRight: "4px", verticalAlign: "middle" }}></span>
                  부분달성
                </span>
                <span style={{ marginLeft: "auto", color: "#999" }}>
                  💡 날짜 셀을 클릭하면 입력/수정됩니다 | O/X 셀은 클릭으로 순환 전환
                </span>
              </div>
            </>
          )}
        </main>
      </div>
    </AuthCheck>
  );
}

// Shared styles
const thStyle: React.CSSProperties = {
  padding: "8px 6px",
  textAlign: "center",
  backgroundColor: "#4338ca",
  color: "white",
  fontWeight: "bold",
  fontSize: "0.75rem",
  position: "sticky",
  top: 0,
  whiteSpace: "nowrap",
  borderRight: "1px solid rgba(255,255,255,0.2)",
};

const tdStyle: React.CSSProperties = {
  padding: "4px 6px",
  textAlign: "center",
  borderRight: "1px solid #f0f0f0",
  whiteSpace: "nowrap",
  fontSize: "0.8rem",
};
