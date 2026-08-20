"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { maskName } from "../utils";
import {
  ComposedChart, Area, Line, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ====== 일일 입력용(그리드) 데이터 ======
interface DayValue { [day: string]: string; }
interface GridStudent {
  row: number;
  번호: string;
  학급: string;
  학생코드: string;
  학생명: string;
  목표행동: string;
  "목표행동 유형": string;
  척도: string;
  "입력 기준": string;
  "목표 달성 기준": string;
  수행_발생률: string;
  목표_달성_여부: string;
  days: DayValue;
}
interface DayColumn { index: number; label: string; display?: string; }
interface GridData {
  month: number;
  day_columns: DayColumn[];
  students: GridStudent[];
}

// ====== 분석/차트용(리포트) 데이터 ======
interface TrendItem { month: string; rate: string; }
interface DailyEntry { date: string; value: string; is_prev: boolean; }
interface ReportStudent {
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
  decision: string;
  decision_color: string;
  team_talk: string;
}
interface ReportData {
  month: string;
  students: ReportStudent[];
}

const SCALE_OPTIONS = ["O/X(발생)", "0점/1점/2점", "0~5", "0~7교시", "1~100회", "1~100분"];
const TYPE_OPTIONS = ["증가 목표행동", "감소 목표행동"];
const CRITERIA_INCREASE = ["90% 이상", "80% 이상", "70% 이상", "60% 이상", "50% 이상"];
const CRITERIA_DECREASE = ["10% 이하", "20% 이하", "30% 이하", "40% 이하", "50% 이하"];

const BEHAVIOR_PRESETS = [
  { label: "직접 입력", value: "manual" },
  { label: "[공통/증가] 수업 참여율", behavior: "수업 참여율", type: "증가 목표행동", scale: "O/X(발생)", criteria: "80% 이상" },
  { label: "[공통/증가] 규칙 준수율", behavior: "규칙 준수율", type: "증가 목표행동", scale: "0점/1점/2점", criteria: "80% 이상" },
  { label: "[증가] 과제 완수", behavior: "과제 완수", type: "증가 목표행동", scale: "O/X(발생)", criteria: "80% 이상" },
  { label: "[증가] 제자리 앉아있기", behavior: "제자리 앉아있기", type: "증가 목표행동", scale: "O/X(발생)", criteria: "80% 이상" },
  { label: "[증가] 긍정적 상호작용", behavior: "긍정적 상호작용", type: "증가 목표행동", scale: "O/X(발생)", criteria: "80% 이상" },
  { label: "[감소] 위기행동(빈도)", behavior: "위기행동", type: "감소 목표행동", scale: "1~100회", criteria: "20% 이하" },
  { label: "[감소] 수업 이탈(시간)", behavior: "수업 이탈", type: "감소 목표행동", scale: "1~100분", criteria: "20% 이하" },
  { label: "[감소] 공격행동", behavior: "공격행동", type: "감소 목표행동", scale: "O/X(발생)", criteria: "10% 이하" },
  { label: "[감소] 부적절한 언어", behavior: "부적절한 언어", type: "감소 목표행동", scale: "O/X(발생)", criteria: "10% 이하" },
  { label: "[감소] 방해행동", behavior: "방해행동", type: "감소 목표행동", scale: "O/X(발생)", criteria: "10% 이하" },
];

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

function getInputOptions(scale: string): string[] {
  const s = scale?.trim() || "";
  if (s.includes("O/X")) return ["O", "X"];
  if (s.includes("0점/1점/2점")) return ["0점", "1점", "2점"];
  if (s.includes("0~5")) return ["0", "1", "2", "3", "4", "5"];
  if (s.includes("0~7")) return ["0", "1", "2", "3", "4", "5", "6", "7"];
  return [];
}

function getCellColor(value: string, type: string, scale: string): string {
  if (!value || value === "." || value === "-") return "transparent";
  const isIncrease = type.includes("증가");
  const num = parseFloat(value);
  const hasNum = !isNaN(num);

  if (scale.includes("O/X")) {
    if (value === "O") return isIncrease ? "#d1fae5" : "#fee2e2";
    if (value === "X") return isIncrease ? "#fee2e2" : "#d1fae5";
  }
  if (scale.includes("0점/1점/2점") || value.includes("점")) {
    const score = value.replace("점", "");
    if (score === "2") return isIncrease ? "#d1fae5" : "#fee2e2";
    if (score === "1") return "#fef3c7";
    if (score === "0") return isIncrease ? "#fee2e2" : "#d1fae5";
  }
  if (hasNum) {
    if (num >= 4) return isIncrease ? "#d1fae5" : "#fee2e2";
    if (num >= 2) return "#fef3c7";
    return isIncrease ? "#fee2e2" : "#d1fae5";
  }
  return "#f3f4f6";
}

function formatRate(rate: string): string {
  if (!rate || rate === "-") return "-";
  const num = parseFloat(rate);
  if (isNaN(num)) return rate;
  return num <= 1 ? `${Math.round(num * 100)}%` : `${Math.round(num)}%`;
}

function getRateColor(rate: number | null): string {
  if (rate === null) return "#94a3b8";
  if (rate >= 80) return "#10b981";
  if (rate >= 50) return "#f59e0b";
  return "#ef4444";
}

// CICO 전문가 의사결정 메시지 생성
function getCICODecisionDetail(s: ReportStudent): { msg: string; color: string; bg: string; icon: string } {
  const rate = s.rate_num ?? 0;
  const goal = s.goal_num || parseInt(s.goal_criteria) || 80;
  const trendVals = s.trend.map(t => { let r = parseFloat(t.rate.replace("%", "")); return r <= 1 ? r * 100 : r; }).filter(r => !isNaN(r));
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

export default function CICOPage() {
  const [month, setMonth] = useState(() => {
    const m = new Date().getMonth() + 1;
    return m >= 3 && m <= 12 ? m : 3;
  });
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [is404, setIs404] = useState(false);
  const [error, setError] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<{ row: number; col: number; value: string }[]>([]);
  const [saveStatus, setSaveStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiState, setAiState] = useState<{ loading: boolean; text: string }>({ loading: false, text: "" });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isAdmin } = useAuth();
  const apiUrl = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_API_URL || "" : "";
  const studentParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("student") : null;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    setIs404(false);
    setAiState({ loading: false, text: "" });
    try {
      const [monthlyRes, bizDaysRes, reportRes] = await Promise.all([
        axios.get(`${apiUrl}/api/v1/cico/monthly?month=${month}`),
        axios.get(`${apiUrl}/api/v1/cico/business-days?month=${month}&year=${new Date().getFullYear()}`),
        axios.get(`${apiUrl}/api/v1/cico/report?month=${month}`).catch(() => ({ data: { month: String(month), students: [] } })),
      ]);

      const monthlyData: GridData = monthlyRes.data;
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

      setGridData(monthlyData);
      setReportData(reportRes.data);
      setSelectedCode(prev => {
        const wanted = prev || studentParam;
        if (wanted && monthlyData.students.some(s => s.학생코드 === wanted)) return wanted;
        return monthlyData.students[0]?.학생코드 || null;
      });
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
  }, [month, apiUrl, studentParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGenerateSheet = async () => {
    setGenerating(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/cico/generate`, { year: new Date().getFullYear(), month });
      alert(res.data?.exists ? `${month}월 CICO 시트가 이미 존재합니다.` : `${month}월 CICO 시트를 생성했습니다.`);
      setIs404(false);
      await fetchData();
    } catch (err: any) {
      alert("시트 생성 실패: " + (err.response?.data?.detail || err.message));
    } finally {
      setGenerating(false);
    }
  };

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
      } catch {
        setSaveStatus("⚠ 저장 실패");
      }
    }, 1500);
  }, [pendingUpdates, month, apiUrl]);

  const handleCellChange = (student: GridStudent, dayLabel: string, value: string) => {
    if (!gridData) return;
    const dayCol = gridData.day_columns.find(d => d.label === dayLabel);
    if (!dayCol) return;
    const colIdx = dayCol.index + 1;
    setGridData(prev => prev ? { ...prev, students: prev.students.map(s => s.row === student.row ? { ...s, days: { ...s.days, [dayLabel]: value } } : s) } : prev);
    setPendingUpdates(prev => [...prev.filter(u => !(u.row === student.row && u.col === colIdx)), { row: student.row, col: colIdx, value }]);
  };

  const handleSettingsChange = async (student: GridStudent, updates: { [field: string]: string }) => {
    try {
      await axios.post(`${apiUrl}/api/v1/cico/settings`, { month, student_code: student.학생코드, settings: updates, row_index: student.row });
      setGridData(prev => prev ? { ...prev, students: prev.students.map(s => s.row === student.row ? { ...s, ...updates } : s) } : prev);
      setSaveStatus("✓ 설정 저장 완료");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch {
      setSaveStatus("⚠ 설정 저장 실패");
    }
  };

  const requestAIAnalysis = async (student: ReportStudent) => {
    setAiState({ loading: true, text: "" });
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-cico-analysis`, {
        month,
        students_data: [{
          code: student.code, target_behavior: student.target_behavior, behavior_type: student.behavior_type,
          scale: student.scale, goal_criteria: student.goal_criteria, rate: student.rate, achieved: student.achieved,
        }]
      }, { timeout: 180000 });
      setAiState({ loading: false, text: res.data.analysis || "분석 결과가 없습니다." });
    } catch (e: any) {
      setAiState({ loading: false, text: "⚠️ AI 분석 요청 실패. (" + (e?.response?.data?.detail || e?.message || "타임아웃") + ")" });
    }
  };

  const gridStudent = gridData?.students.find(s => s.학생코드 === selectedCode) || null;
  const reportStudent = reportData?.students.find(s => s.code === selectedCode) || null;

  return (
    <AuthCheck>
      <AppShell
        currentPage="cico"
        title="📝 CICO 관리"
        subtitle="학생을 선택해 목표 설정 · 일일 기록 · 성과 분석을 한 화면에서 확인합니다"
        headerActions={
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {saveStatus && (
              <span className={`badge ${saveStatus.includes("실패") ? "badge-tier3" : "badge-tier1"}`} style={{ fontSize: "0.78rem" }}>
                {saveStatus}
              </span>
            )}
            {isAdmin() && (
              <button onClick={handleGenerateSheet} disabled={generating} className="btn btn-secondary" title="TierStatus에서 Tier2(CICO) 대상 학생 명단을 파악해 선택된 월의 CICO 입력 시트를 새로 생성합니다">
                {generating ? "생성 중..." : "🗓️ 월 시트 생성"}
              </button>
            )}
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: "6px 10px", borderRadius: "8px", border: "1.5px solid var(--primary-blue)", fontWeight: 700, fontSize: "0.82rem", outline: "none", background: "white" }}>
              {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>{String(new Date().getFullYear()).slice(-2)}-{String(m).padStart(2, '0')}월</option>
              ))}
            </select>
            <button onClick={fetchData} className="btn btn-primary">🔄 새로고침</button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {loading && (
            <div className="card" style={{ padding: "50px", textAlign: "center", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "12px", animation: "spin 2s linear infinite" }}>📝</div>
              <p style={{ fontWeight: 700 }}>CICO 데이터를 불러오고 있습니다...</p>
            </div>
          )}
          {error && (
            <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--tier3)" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>⚠️</div>
              <p style={{ fontWeight: 800 }}>{error}</p>
              {is404 && isAdmin() && (
                <button onClick={handleGenerateSheet} disabled={generating} className="btn btn-primary" style={{ marginTop: "16px" }}>
                  {generating ? "생성 중..." : `🗓️ ${month}월 CICO 시트 지금 생성하기`}
                </button>
              )}
              {is404 && !isAdmin() && <p style={{ color: "#64748b", marginTop: 8 }}>관리자에게 시트 생성을 요청해주세요.</p>}
            </div>
          )}

          {!loading && !error && gridData && (
            gridData.students.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px", backgroundColor: "white", borderRadius: "12px" }}>해당 학급의 CICO 학생이 없습니다.</div>
            ) : (
              <div className="cico-unified-layout" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
                {/* 학생 목록 */}
                <div className="card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, maxHeight: 720, overflowY: "auto" }}>
                  {reportData?.students.map(rs => {
                    const active = rs.code === selectedCode;
                    return (
                      <button
                        key={rs.code}
                        onClick={() => setSelectedCode(rs.code)}
                        style={{
                          textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                          border: active ? "2px solid #3b82f6" : "1px solid #e2e8f0",
                          background: active ? "#eff6ff" : "#fff",
                          display: "flex", flexDirection: "column", gap: 4,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a" }}>{maskName(rs.name) || rs.code}</span>
                          <span style={{ fontWeight: 800, fontSize: "0.82rem", color: getRateColor(rs.rate_num) }}>{rs.rate || "-"}</span>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{rs.class}</div>
                        <span style={{ alignSelf: "flex-start", padding: "2px 8px", borderRadius: 6, fontSize: "0.65rem", fontWeight: 700, color: rs.decision_color, background: `${rs.decision_color}15` }}>
                          {rs.decision}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 선택된 학생 상세 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {!gridStudent ? (
                    <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>왼쪽에서 학생을 선택하세요.</div>
                  ) : (
                    <StudentCICOPanel
                      gridStudent={gridStudent}
                      reportStudent={reportStudent}
                      dayColumns={gridData.day_columns}
                      onCellChange={handleCellChange}
                      onSettingsChange={handleSettingsChange}
                      aiState={aiState}
                      onRequestAI={() => reportStudent && requestAIAnalysis(reportStudent)}
                    />
                  )}
                </div>
              </div>
            )
          )}

          {/* 의사결정 기준 + 가이드 (통합) */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "12px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
            <span style={{ color: "#64748b", fontSize: "0.75rem", alignSelf: "center", fontWeight: 600 }}>의사결정 기준:</span>
            {DECISION_OPTIONS.map(opt => (
              <span key={opt.label} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: opt.color, background: `${opt.color}15`, padding: "3px 8px", borderRadius: "4px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: opt.color }} />
                {opt.label}
              </span>
            ))}
          </div>

          <div style={{ marginTop: 8, padding: "22px 26px", background: "linear-gradient(135deg,#f0f9ff,#dbeafe)", borderRadius: 20, border: "1px solid #93c5fd" }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "1rem", fontWeight: 800, color: "#1e3a8a" }}>📖 CICO 가이드</h3>
            <div className="responsive-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: "0.75rem", color: "#0f172a", lineHeight: 1.8 }}>
              {[
                { t: "📌 CICO란?", b: "Check-In/Check-Out — Tier2 학생이 매일 담당 교사와 짧게 체크인·체크아웃하며 목표 행동을 점검하는 중재 프로그램입니다." },
                { t: "✍️ 데이터 입력", b: "학생을 선택한 뒤 일별 셀을 클릭하세요. O/X는 클릭마다 O→X→공백, 점수/숫자 척도는 드롭다운·입력창이 뜹니다. 저장은 자동입니다." },
                { t: "🎯 목표 설정", b: "목표행동·유형·척도·달성기준은 선택된 학생 패널에서 언제든 수정할 수 있습니다. 예시 목록에서 고르거나 직접 입력하세요." },
                { t: "📊 차트 해석", b: "전월/이번달 일별 추이, 월별 수행률(목표선 포함), 달성 게이지를 통해 학생의 변화를 확인하세요." },
                { t: "🔔 의사결정 제안", b: "Tier1 하향: 목표달성 2개월 연속 / CICO수정: 수행률 50~목표% / Tier3 상향: 수행률 50% 미만 / SST·T3 병행 학생은 달성해도 CICO 유지." },
                { t: "🤖 AI 분석", b: "선택된 학생의 이번 달 데이터를 바탕으로 BCBA 관점의 해석과 다음 조치를 제안받을 수 있습니다." },
              ].map((item, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid #bfdbfe" }}>
                  <div style={{ fontWeight: 800, color: "#1d4ed8", marginBottom: 4 }}>{item.t}</div>
                  <div style={{ color: "#334155", whiteSpace: "pre-line" }}>{item.b}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    </AuthCheck>
  );
}

// ====== 선택된 학생 상세 패널: 설정 + 일별입력 + 차트 + AI ======
function StudentCICOPanel({ gridStudent, reportStudent, dayColumns, onCellChange, onSettingsChange, aiState, onRequestAI }: {
  gridStudent: GridStudent;
  reportStudent: ReportStudent | null;
  dayColumns: DayColumn[];
  onCellChange: (student: GridStudent, dayLabel: string, value: string) => void;
  onSettingsChange: (student: GridStudent, updates: { [field: string]: string }) => void;
  aiState: { loading: boolean; text: string };
  onRequestAI: () => void;
}) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingBehavior, setEditingBehavior] = useState(false);

  const dec = reportStudent ? getCICODecisionDetail(reportStudent) : null;
  const goal = reportStudent?.goal_num || 80;
  const rate = reportStudent?.rate_num ?? 0;
  const gaugeColor = rate >= goal ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 44;

  const toChartDays = (entries?: DailyEntry[]) => (entries || []).map(d => {
    const v = d.value;
    if (v === "" || v === "-") return { label: d.date, value: null };
    if (v === "O") return { label: d.date, value: 1 };
    if (v === "X") return { label: d.date, value: 0 };
    const n = parseFloat(v);
    return { label: d.date, value: isNaN(n) ? null : n };
  }).filter(d => d.value !== null);

  const curDays = toChartDays(reportStudent?.daily_data);
  const trendData = (reportStudent?.trend || []).map(t => {
    let r = parseFloat(t.rate.replace("%", ""));
    if (r <= 1) r *= 100;
    return { month: t.month, rate: isNaN(r) ? 0 : Math.round(r), goal };
  });

  return (
    <>
      {/* 헤더 + 설정 */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a" }}>{maskName(gridStudent.학생명)} <span style={{ fontWeight: 500, fontSize: "0.78rem", color: "#94a3b8" }}>{gridStudent.학생코드} · {gridStudent.학급}</span></div>
          </div>
          {reportStudent && <div style={{ fontWeight: 900, fontSize: "1.3rem", color: getRateColor(reportStudent.rate_num) }}>{reportStudent.rate || "-"}</div>}
        </div>

        {dec && (
          <div style={{ marginBottom: 14, padding: "11px 16px", background: dec.bg, borderRadius: 12, border: `1.5px solid ${dec.color}40`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.3rem" }}>{dec.icon}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.84rem", color: dec.color }}>
                CICO 의사결정 제안
                {reportStudent && !reportStudent.cico_only && <span style={{ marginLeft: 8, fontSize: "0.7rem", background: "#e0f2fe", color: "#0369a1", padding: "2px 7px", borderRadius: 6, fontWeight: 700 }}>SST/T3 병행 — 하향 보류</span>}
              </div>
              <div style={{ fontSize: "0.77rem", color: dec.color, marginTop: 2 }}>{dec.msg}</div>
              {reportStudent?.team_talk && <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: 4 }}>💬 {reportStudent.team_talk}</div>}
            </div>
          </div>
        )}

        {/* 목표 설정 */}
        <div className="responsive-grid-4" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>목표행동</label>
            {editingBehavior ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <select
                  style={{ padding: "6px", borderRadius: "6px", fontSize: "0.78rem", border: "1px solid #e2e8f0" }}
                  onChange={e => {
                    const preset = BEHAVIOR_PRESETS.find(p => p.label === e.target.value);
                    if (preset && preset.value !== "manual") {
                      onSettingsChange(gridStudent, { "목표행동": preset.behavior!, "목표행동 유형": preset.type!, "척도": preset.scale!, "목표 달성 기준": preset.criteria! });
                      setEditingBehavior(false);
                    }
                  }}
                >
                  <option value="manual">-- 예시 목록 --</option>
                  {BEHAVIOR_PRESETS.filter(p => p.value !== "manual").map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    autoFocus defaultValue={gridStudent.목표행동} placeholder="행동명 직접 입력..."
                    onKeyDown={e => { if (e.key === "Enter") { onSettingsChange(gridStudent, { "목표행동": e.currentTarget.value }); setEditingBehavior(false); } }}
                    style={{ flex: 1, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "0.78rem" }}
                  />
                  <button onClick={() => setEditingBehavior(false)} style={{ padding: "4px 8px", background: "#f1f5f9", border: "none", borderRadius: "6px", cursor: "pointer" }}>✕</button>
                </div>
              </div>
            ) : (
              <div onClick={() => setEditingBehavior(true)} style={{ cursor: "pointer", padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.82rem" }}>
                {gridStudent.목표행동 || <span style={{ color: "#cbd5e1" }}>클릭해서 설정</span>}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>유형</label>
            <select value={gridStudent["목표행동 유형"]} onChange={e => onSettingsChange(gridStudent, { "목표행동 유형": e.target.value })} style={selectStyle}>
              {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>척도</label>
            <select value={gridStudent.척도} onChange={e => onSettingsChange(gridStudent, { "척도": e.target.value })} style={selectStyle}>
              {SCALE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>달성기준</label>
            <select value={gridStudent["목표 달성 기준"]} onChange={e => onSettingsChange(gridStudent, { "목표 달성 기준": e.target.value })} style={selectStyle}>
              {(gridStudent["목표행동 유형"] === "감소 목표행동" ? CRITERIA_DECREASE : CRITERIA_INCREASE).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 일별 입력 */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a", marginBottom: 10 }}>✍️ 이달 일별 기록 <span style={{ fontWeight: 500, fontSize: "0.72rem", color: "#94a3b8" }}>(셀 클릭해서 입력, 자동저장)</span></div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 4, width: "max-content" }}>
            {dayColumns.map(day => {
              const val = gridStudent.days[day.label] || "";
              const isEditing = editingCell === day.label;
              const options = getInputOptions(gridStudent.척도);
              return (
                <div key={day.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: "0.62rem", color: "#94a3b8" }}>{day.display || day.label}</span>
                  <div
                    onClick={() => {
                      if (options.length > 0 && !isEditing) {
                        if (gridStudent.척도.includes("O/X")) {
                          onCellChange(gridStudent, day.label, val === "O" ? "X" : val === "X" ? "" : "O");
                        } else if (options.length <= 3) {
                          const idx = options.indexOf(val);
                          onCellChange(gridStudent, day.label, idx === -1 ? options[0] : idx === options.length - 1 ? "" : options[idx + 1]);
                        } else {
                          setEditingCell(day.label);
                        }
                      } else if (options.length === 0) {
                        setEditingCell(day.label);
                      }
                    }}
                    style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: getCellColor(val, gridStudent["목표행동 유형"], gridStudent.척도), border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontSize: "0.72rem" }}
                  >
                    {isEditing ? (
                      options.length > 0 ? (
                        <select autoFocus value={val} onChange={e => { onCellChange(gridStudent, day.label, e.target.value); setEditingCell(null); }} onBlur={() => setEditingCell(null)} style={{ width: "100%", fontSize: "0.65rem" }}>
                          <option value="">-</option>
                          {options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input autoFocus type="number" defaultValue={val} onBlur={e => { onCellChange(gridStudent, day.label, e.target.value); setEditingCell(null); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} style={{ width: "100%", textAlign: "center", fontSize: "0.65rem" }} />
                      )
                    ) : (val || "·")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: "0.75rem", color: "#64748b" }}>
          이번 달 수행률: <strong style={{ color: getRateColor(reportStudent?.rate_num ?? null) }}>{formatRate(gridStudent.수행_발생률)}</strong> · 달성: <strong>{gridStudent.목표_달성_여부 || "-"}</strong>
        </div>
      </div>

      {/* 차트: 이번 달 시점 2개 + 월별 비교 2개 */}
      <div>
        <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#94a3b8", marginBottom: 6, letterSpacing: 0.3 }}>📅 이번 달 시점</div>
        <div className="responsive-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ padding: 14 }}>
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
            ) : <p style={{ color: "#94a3b8", fontSize: "0.75rem", textAlign: "center", paddingTop: 30 }}>이번 달 데이터 입력 없음</p>}
          </div>

          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: 8, color: "#0f172a", alignSelf: "flex-start" }}>🎯 현재 달성 현황</div>
            <div style={{ position: "relative", width: 100, height: 100 }}>
              <svg viewBox="0 0 110 110" style={{ transform: "rotate(-90deg)" }}>
                <circle cx={55} cy={55} r={44} fill="none" stroke="#f1f5f9" strokeWidth={12} />
                <circle cx={55} cy={55} r={44} fill="none" stroke={gaugeColor} strokeWidth={12} strokeDasharray={`${circumference * Math.min(rate, 100) / 100} ${circumference}`} strokeLinecap="round" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: "1.2rem", fontWeight: 900, color: gaugeColor }}>{rate}%</div>
                <div style={{ fontSize: "0.6rem", color: "#94a3b8" }}>목표 {goal}%</div>
              </div>
            </div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#475569", marginTop: 6 }}>
              {reportStudent?.achieved === "O" ? "✅ 달성" : reportStudent?.achieved === "X" ? "❌ 미달" : "-"}
            </div>
          </div>
        </div>

        <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#94a3b8", marginBottom: 6, letterSpacing: 0.3 }}>📊 다른 달과 비교</div>
        <div className="responsive-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: 8, color: "#0f172a" }}>📈 월별 수행률 추이</div>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <ComposedChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                  <XAxis dataKey="month" style={{ fontSize: "8px" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} style={{ fontSize: "8px" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [`${v}%`, ""]} />
                  <Area type="monotone" dataKey="rate" fill="#f59e0b10" stroke="none" />
                  <Line type="monotone" dataKey="rate" name="수행률" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="goal" name="목표" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <p style={{ color: "#94a3b8", fontSize: "0.75rem", textAlign: "center", paddingTop: 30 }}>데이터 없음</p>}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: 8, color: "#0f172a" }}>🗓️ 월별 달성 비교</div>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <ComposedChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                  <XAxis dataKey="month" style={{ fontSize: "8px" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} style={{ fontSize: "8px" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [`${v}%`, "수행률"]} />
                  <Bar dataKey="rate" name="수행률" radius={[4, 4, 0, 0]}>
                    {trendData.map((d, i) => <Cell key={i} fill={d.rate >= d.goal ? "#10b981" : d.rate >= 50 ? "#f59e0b" : "#ef4444"} />)}
                  </Bar>
                  <Line type="monotone" dataKey="goal" name="목표" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 2" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <p style={{ color: "#94a3b8", fontSize: "0.75rem", textAlign: "center", paddingTop: 30 }}>데이터 없음</p>}
          </div>
        </div>
      </div>

      {/* AI 분석 */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "#6d28d9" }}>🤖 이 학생 CICO AI 분석</div>
          <button onClick={onRequestAI} disabled={aiState.loading || !reportStudent} style={{ padding: "8px 18px", background: aiState.loading ? "#a78bfa" : "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "white", border: "2px solid #2563eb", borderRadius: 10, cursor: aiState.loading ? "wait" : "pointer", fontWeight: 700, fontSize: "0.82rem" }}>
            {aiState.loading ? "⏳ 분석 중..." : "🤖 AI 분석 받기"}
          </button>
        </div>
        {aiState.text && (
          <div style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.7, color: "#334155", background: "#faf9ff", padding: 14, borderRadius: 8, border: "1px solid #ede9fe" }}>
            {aiState.text}
          </div>
        )}
      </div>
    </>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.68rem", color: "#94a3b8", fontWeight: 700, marginBottom: 4 };
const selectStyle: React.CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: "0.78rem", background: "#fff" };
