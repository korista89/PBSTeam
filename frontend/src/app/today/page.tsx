"use client";

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import type { DecisionSignal } from "../../types/domain";
import { maskName } from "../utils";

interface TodayData {
  date: string;
  total_enrolled: number;
  tier_counts: Record<string, number>;
  recent_14d_events_count: number;
  urgent_safety_signals: DecisionSignal[];
  review_signals: DecisionSignal[];
  active_signals_count: number;
}

interface CicoCheckinItem { code: string; name: string; checkedIn: boolean; }

const SIGNAL_ROUTE: Record<string, string> = {
  SAFETY: "student",
  CHANGE_UP: "student",
  GOAL_STALLED: "cico",
  MORE_DATA: "student",
  MEETING_ACTION: "student",
  DATA_MISSING: "student",
  FIDELITY_LOW: "report-tier3",
  REVIEW_DUE: "student",
};

export default function TodayPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cicoItems, setCicoItems] = useState<CicoCheckinItem[] | null>(null);
  const [classRulesSet, setClassRulesSet] = useState<boolean | null>(null);

  const apiUrl = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_API_URL || "" : "";

  const fetchToday = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${apiUrl}/api/v1/workspace/today`);
      setData(res.data);
    } catch {
      setError("오늘 확인할 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  // 오늘 CICO 체크인 여부 (담임 본인 학급만) — 관리자는 특정 학급이 없어 생략
  useEffect(() => {
    if (isAdmin() || !user?.class_id) { setCicoItems(null); return; }
    const now = new Date();
    const month = now.getMonth() + 1;
    if (month < 3 || month > 12) { setCicoItems([]); return; }
    const todayStr = `${String(month).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    Promise.all([
      axios.get(`${apiUrl}/api/v1/cico/monthly?month=${month}`),
      axios.get(`${apiUrl}/api/v1/cico/business-days?month=${month}&year=${now.getFullYear()}`),
    ]).then(([monthlyRes, bizDaysRes]) => {
      const dayCols: { index: number; label: string }[] = monthlyRes.data.day_columns || [];
      const businessDays: string[] = bizDaysRes.data.business_days || [];
      // 영업일(오름차순)과 회차 컬럼을 순서대로 1:1 매핑 — cico 페이지가 하는 것과 동일한 방식.
      const dateByIndex: Record<number, string> = {};
      dayCols.filter(c => c.label.includes("회차")).sort((a, b) => a.index - b.index).forEach((c, i) => {
        if (businessDays[i]) dateByIndex[c.index] = businessDays[i];
      });
      const todayCol = dayCols.find(c => dateByIndex[c.index] === todayStr || c.label === todayStr);
      if (!todayCol) { setCicoItems([]); return; }
      const items: CicoCheckinItem[] = (monthlyRes.data.students || []).map((s: any) => ({
        code: s.학생코드,
        name: s.학생명,
        checkedIn: !!(s.days?.[todayCol.label] && s.days[todayCol.label] !== ""),
      }));
      setCicoItems(items);
    }).catch(() => setCicoItems([]));
  }, [apiUrl, user?.class_id, isAdmin]);

  // 학급 규칙 설정 여부 (담임 본인 학급만)
  useEffect(() => {
    if (isAdmin() || !user?.class_id) { setClassRulesSet(null); return; }
    axios.get(`${apiUrl}/api/v1/class-rules/${encodeURIComponent(user.class_id)}`).then(res => {
      setClassRulesSet((res.data.rules || []).length >= 3);
    }).catch(() => setClassRulesSet(null));
  }, [apiUrl, user?.class_id, isAdmin]);

  const goTo = (kind: string, code?: string | null) => {
    if (kind === "student" && code) router.push(`/student/${encodeURIComponent(code)}`);
    else if (kind === "cico") router.push(code ? `/cico?student=${encodeURIComponent(code)}` : "/cico");
    else if (kind === "report-tier3") router.push("/report/tier3");
    else if (code) router.push(`/student/${encodeURIComponent(code)}`);
  };

  const notCheckedIn = (cicoItems || []).filter(i => !i.checkedIn);
  const totalTodo = (data?.urgent_safety_signals.length || 0) + notCheckedIn.length + (data?.review_signals.length || 0) + (classRulesSet === false ? 1 : 0);

  return (
    <AuthCheck>
      <AppShell
        currentPage="today"
        title="🧭 오늘 확인할 것"
        subtitle="담임교사가 지금 무엇을 챙겨야 하는지 우선순위대로 정리했습니다"
        headerActions={<button onClick={fetchToday} className="btn btn-secondary">🔄 새로고침</button>}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "100px", color: "#64748b" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>🧭</div>
            <p style={{ fontWeight: 600 }}>오늘의 할 일을 정리하고 있습니다...</p>
          </div>
        ) : error ? (
          <div style={{ padding: "20px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "12px", color: "#991b1b", fontWeight: 600 }}>{error}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* 오늘의 요약 */}
            <div className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>오늘 확인할 항목</div>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: totalTodo > 0 ? "#ef4444" : "#10b981" }}>
                  {totalTodo}<span style={{ fontSize: "1rem", color: "#94a3b8", fontWeight: 600 }}>건</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200, fontSize: "0.8rem", color: "#64748b" }}>
                {totalTodo === 0
                  ? "🎉 지금 특별히 확인할 항목이 없습니다. 평소처럼 학급을 운영하세요."
                  : "아래 항목을 위에서부터 순서대로 확인하세요. 각 카드의 버튼을 누르면 바로 처리할 수 있는 화면으로 이동합니다."}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                {isAdmin() ? "학교 전체" : "우리 학급"} 재학 {data?.total_enrolled || 0}명 · 최근 14일 기록 {data?.recent_14d_events_count || 0}건
              </div>
            </div>

            {/* 1. 지금 바로 확인 — 안전/위기 후속조치 */}
            {data && data.urgent_safety_signals.length > 0 && (
              <TodoSection title="🚨 지금 바로 확인" subtitle="물리적 제지·상해·위기 발생에 대한 후속 조치가 필요합니다" tone="urgent">
                {data.urgent_safety_signals.map(sig => (
                  <SignalCard key={sig.signal_id} sig={sig} tone="urgent" onAct={() => goTo(SIGNAL_ROUTE[sig.signal_type] || "student", sig.student_code)} />
                ))}
              </TodoSection>
            )}

            {/* 2. 오늘 CICO 체크인 */}
            {cicoItems && cicoItems.length > 0 && (
              <TodoSection
                title="📋 오늘 CICO 체크인"
                subtitle={notCheckedIn.length > 0 ? `아직 오늘 기록이 없는 학생 ${notCheckedIn.length}명이 있습니다` : "오늘 CICO 대상 학생 전원 체크인 완료"}
                tone={notCheckedIn.length > 0 ? "warn" : "done"}
              >
                {notCheckedIn.length === 0 ? (
                  <div style={{ padding: "14px 18px", color: "#059669", fontWeight: 700, fontSize: "0.85rem" }}>✅ 모두 완료했습니다.</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 4px 14px" }}>
                    {notCheckedIn.map(i => (
                      <button key={i.code} onClick={() => goTo("cico", i.code)} style={{ padding: "6px 12px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, color: "#9a3412", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>
                        {maskName(i.name) || i.code} 체크인하기 →
                      </button>
                    ))}
                  </div>
                )}
              </TodoSection>
            )}

            {/* 3. 이번 주 살펴볼 것 */}
            {data && data.review_signals.length > 0 && (
              <TodoSection title="🔍 이번 주 살펴볼 것" subtitle="당장 급하진 않지만 검토가 필요한 항목입니다" tone="review">
                {data.review_signals.map(sig => (
                  <SignalCard key={sig.signal_id} sig={sig} tone="review" onAct={() => goTo(SIGNAL_ROUTE[sig.signal_type] || "student", sig.student_code)} />
                ))}
              </TodoSection>
            )}

            {/* 4. 학급 규칙 & 토큰 */}
            {classRulesSet !== null && (
              <TodoSection title="🪙 학급 규칙 & 토큰 강화" subtitle={classRulesSet ? "학급 규칙이 설정되어 있습니다" : "아직 학급 규칙이 설정되지 않았습니다"} tone={classRulesSet ? "done" : "warn"}>
                <div style={{ padding: "4px 4px 14px" }}>
                  <button onClick={() => router.push("/class-rules")} style={{ padding: "8px 16px", background: classRulesSet ? "#f1f5f9" : "#fff7ed", border: `1px solid ${classRulesSet ? "#e2e8f0" : "#fed7aa"}`, borderRadius: 8, color: classRulesSet ? "#475569" : "#9a3412", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" }}>
                    {classRulesSet ? "🪙 오늘 토큰 지급하러 가기 →" : "📐 학급 규칙 설정하러 가기 →"}
                  </button>
                </div>
              </TodoSection>
            )}

            {totalTodo === 0 && !data?.urgent_safety_signals.length && !data?.review_signals.length && (
              <div className="card" style={{ padding: 50, textAlign: "center", color: "#64748b" }}>
                <div style={{ fontSize: "2.2rem", marginBottom: 10 }}>🎉</div>
                오늘은 특별히 확인할 항목이 없습니다.
              </div>
            )}
          </div>
        )}
      </AppShell>
    </AuthCheck>
  );
}

function TodoSection({ title, subtitle, tone, children }: { title: string; subtitle: string; tone: "urgent" | "warn" | "review" | "done"; children: React.ReactNode }) {
  const colors: Record<string, { border: string; text: string }> = {
    urgent: { border: "#fca5a5", text: "#991b1b" },
    warn: { border: "#fed7aa", text: "#9a3412" },
    review: { border: "#bfdbfe", text: "#1d4ed8" },
    done: { border: "#bbf7d0", text: "#166534" },
  };
  const c = colors[tone];
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", border: `1px solid ${c.border}` }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${c.border}`, background: `${c.text}08` }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: c.text }}>{title}</div>
        <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ padding: "10px 16px" }}>{children}</div>
    </div>
  );
}

function SignalCard({ sig, tone, onAct }: { sig: DecisionSignal; tone: "urgent" | "review"; onAct: () => void }) {
  const accent = tone === "urgent" ? "#ef4444" : "#3b82f6";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "12px 6px", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          {sig.student_code && <span style={{ padding: "2px 8px", background: `${accent}15`, color: accent, borderRadius: 6, fontSize: "0.72rem", fontWeight: 800 }}>{sig.student_code}</span>}
          <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{sig.title}</span>
        </div>
        <p style={{ fontSize: "0.8rem", color: "#475569", margin: "0 0 4px 0" }}>{sig.reason}</p>
        <p style={{ fontSize: "0.76rem", color: accent, margin: 0, fontWeight: 600 }}>👉 {sig.recommended_next_action}</p>
      </div>
      <button onClick={onAct} disabled={!sig.student_code} style={{ padding: "8px 14px", background: sig.student_code ? accent : "#e2e8f0", color: "white", border: "none", borderRadius: 8, fontSize: "0.8rem", fontWeight: 700, cursor: sig.student_code ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
        확인하러 가기 →
      </button>
    </div>
  );
}
