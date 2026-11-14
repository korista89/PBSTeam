"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { AuthCheck } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { API_BASE_URL } from "@/app/lib/api";
import Tier1Dashboard from "./Dashboard";
import Tier1Matrix from "./Matrix";
import Tier1Teaching from "./Teaching";
import Tier1Tokens from "./Tokens";
import Tier1Fidelity from "./Fidelity";
import Tier1Programs from "./Programs";
import { ACCENT, type Plan } from "./shared";

// Tier1 관리: 학교행동중재 운영계획 Ⅰ.(1단계 지원) 보편적 행동지원 운영을 그대로 따른다.
const TABS = [
  { key: "dash", label: "📊 대시보드", desc: "Tier1 비율·교수 실행률·토큰·실행충실도를 한눈에 (라·마항)" },
  { key: "matrix", label: "🎯 기대행동·장소별 규칙", desc: "스스로·바르게·안전하게 × 장소 5곳, IEP 세부 목표 예시 (다-1·3항)" },
  { key: "teach", label: "🍎 기대행동 교수", desc: "학급별 주 1회 이상 직접 교수 누가기록 (다-3항)" },
  { key: "tokens", label: "🪙 강화체계·토큰", desc: "단계별 토큰 경제·경은마트, 매월 1000원 토큰 집계 (다-4·5, 라항)" },
  { key: "fidelity", label: "✅ 실행충실도", desc: "학기별 학급 체크리스트, 80% 미만 학급 지원 (마항)" },
  { key: "programs", label: "📦 세부 프로그램", desc: "기간·범위·표적 행동을 정한 보편적 지원 프로그램과 성과" },
] as const;
type TabKey = typeof TABS[number]["key"];

export default function Tier1Page() {
  const [tab, setTab] = useState<TabKey>("dash");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/tier1/plan`).then(r => setPlan(r.data)).catch(e => setStatus(`⚠ 운영계획 자료 실패 — ${e?.response?.data?.detail || e.message}`));
  }, []);
  const current = TABS.find(t => t.key === tab)!;

  return (
    <AuthCheck>
      <AppShell
        currentPage="tier1"
        title="🌱 Tier1 관리 · 보편적 행동지원"
        subtitle="모든 학생이 스스로·바르게·안전하게 행동하도록 기대행동 교수, 시각적·구조화 환경, 강화체계를 운영하고 데이터로 점검합니다"
        headerActions={status ? <span className={`badge ${status.startsWith("⚠") ? "badge-tier3" : "badge-tier1"}`} style={{ fontSize: "0.78rem" }}>{status}</span> : undefined}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 4, padding: 4, background: "#f1f5f9", borderRadius: 12, flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: "9px 14px", border: "none", borderRadius: 9, cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                background: tab === t.key ? ACCENT : "transparent", color: tab === t.key ? "#fff" : "#475569",
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: -8 }}>{current.desc}</div>

          {tab === "dash" && <Tier1Dashboard />}
          {tab === "programs" && <Tier1Programs onStatus={setStatus} />}
          {tab !== "dash" && tab !== "programs" && !plan && <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>불러오는 중...</div>}
          {plan && tab === "matrix" && <Tier1Matrix plan={plan} />}
          {plan && tab === "teach" && <Tier1Teaching plan={plan} onStatus={setStatus} />}
          {plan && tab === "tokens" && <Tier1Tokens plan={plan} onStatus={setStatus} />}
          {plan && tab === "fidelity" && <Tier1Fidelity plan={plan} onStatus={setStatus} />}
        </div>
      </AppShell>
    </AuthCheck>
  );
}
