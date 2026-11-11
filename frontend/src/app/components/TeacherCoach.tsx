"use client";

import React from "react";
import type { CoachState } from "../lib/progress";

const TONES: Record<Exclude<CoachState, "none">, { bg: string; border: string; ink: string; icon: string; title: string }> = {
  good: { bg: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", border: "#86efac", ink: "#166534", icon: "🌟", title: "잘하고 계십니다" },
  building: { bg: "#f8fafc", border: "#cbd5e1", ink: "#334155", icon: "🌱", title: "기록이 쌓이는 중입니다" },
  effort: { bg: "linear-gradient(135deg,#eff6ff,#f5f3ff)", border: "#bfdbfe", ink: "#1e40af", icon: "💙", title: "충분히 최선을 다하고 계십니다" },
  nudge: { bg: "linear-gradient(135deg,#fffbeb,#fff7ed)", border: "#fcd34d", ink: "#92400e", icon: "🤝", title: "위기행동 기록을 함께 해 주세요" },
  stable: { bg: "#f0fdf4", border: "#bbf7d0", ink: "#166534", icon: "😊", title: "최근에는 안정적으로 보입니다" },
};

export type CoachFacts = {
  change?: string;        // 예: "주당 평균 4건 → 1건 (75% 감소)"
  histBefore8: number;    // 올해 3월~최근 8주 이전 기록 건수
  tier3: boolean;
  linked: boolean;        // 위기행동 기록을 표적행동으로 모니터링 중인지
  confirmed?: number;     // 최근 28일 '무발생' 직접 확인 일수
};

export default function TeacherCoach({ state, facts, onRecord, onTarget, onBip }: {
  state: CoachState; facts: CoachFacts; onRecord: () => void; onTarget: () => void; onBip: () => void;
}) {
  if (state === "none") return null;
  const t = TONES[state];
  const btn = (label: string, fn: () => void, primary = false) => (
    <button onClick={fn} className={primary ? "btn btn-primary" : "btn btn-secondary"} style={{ fontSize: "0.82rem" }}>{label}</button>
  );
  const li = (children: React.ReactNode, k: number) => <li key={k}>{children}</li>;
  const lines: React.ReactNode[] = [];
  if (state === "good") {
    lines.push(<>꾸준히 기록해 주신 덕분에 <b>변화가 눈에 보입니다.</b></>);
    if (facts.change) lines.push(<>{facts.change}</>);
    if (facts.confirmed) lines.push(<>최근 4주 동안 <b>{facts.confirmed}일</b>을 ‘위기행동 없음’으로 직접 확인해 주셨습니다.</>);
    lines.push(<>지금 하고 계신 지도 방법을 그대로 이어가셔도 좋습니다. 선생님의 노력이 학생의 변화로 나타나고 있습니다.</>);
  } else if (state === "building") {
    lines.push(<>기록이 4주 이상 쌓이면 처음과 지금을 비교해 보여드립니다.</>);
    lines.push(<>꾸준한 기록 자체가 가장 큰 힘입니다. 계속 이어가 주세요.</>);
  } else if (state === "effort") {
    lines.push(<>아직 눈에 띄게 줄지는 않았지만, <b>기록해 주신 덕분에 지금 상황을 정확히 볼 수 있습니다.</b></>);
    lines.push(<>행동은 한 번에 줄지 않는 경우가 많고, 같은 지도에도 학생마다 걸리는 시간이 다릅니다.</>);
    lines.push(<>도움이 필요하시면 <b>학교행동중재전문교사와 상의</b>해 주세요. 지도 방법과 기록 방식을 함께 점검해 드립니다.</>);
  } else if (state === "nudge") {
    lines.push(<>올해 이 학생의 위기행동 기록이 <b>{facts.histBefore8}건</b> 있었고, 최근 8주는 기록이 없습니다.{facts.tier3 ? " 현재 Tier 3로 지원 중입니다." : ""}</>);
    lines.push(<>행동이 줄었다면 정말 좋은 일입니다. 다만 아직 이어지고 있다면 기록되지 않은 것일 수 있습니다.</>);
    lines.push(<>바쁘고 힘드시겠지만 <b>모두를 위해 위기행동을 한 번만 기록</b>해 주세요. 기록이 있어야 학생에게 필요한 지원과 인력을 요청할 수 있고, 선생님의 노력도 함께 드러납니다.</>);
    lines.push(<>기록이 어렵다면 학교행동중재전문교사가 방법을 도와드립니다.</>);
  } else {
    lines.push(<>{facts.confirmed ? <>최근 4주 중 <b>{facts.confirmed}일</b>을 ‘위기행동 없음’으로 확인해 주셨습니다.</> : <>최근 8주 동안 기록된 위기행동이 없습니다.</>} 행동이 줄었다면 선생님의 노력의 결과입니다.</>);
    lines.push(<>다시 나타나면 바로 기록해 주세요. 기록이 학생을 지키는 근거가 됩니다.</>);
  }
  return (
    <section style={{ background: t.bg, border: `1.5px solid ${t.border}`, borderRadius: 16, padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "1.6rem" }}>{t.icon}</span>
        <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 900, color: t.ink }}>{t.title}</h3>
        {facts.linked && <span style={{ fontSize: "0.72rem", fontWeight: 700, background: "#fff", color: t.ink, border: `1px solid ${t.border}`, borderRadius: 99, padding: "2px 10px" }}>위기행동 기록을 표적행동으로 모니터링 중</span>}
      </div>
      <ul style={{ margin: "10px 0 0", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6, color: "#0f172a", fontSize: "0.95rem", lineHeight: 1.65 }}>
        {lines.map((l, k) => li(l, k))}
      </ul>
      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(state === "nudge" || state === "stable") && btn("🚨 위기행동 기록하기", onRecord, state === "nudge")}
        {state === "effort" && btn("🧩 행동중재계획(BIP) 보기", onBip, true)}
        {state !== "stable" && btn("🎯 개별 행동중재(표적행동)", onTarget)}
      </div>
    </section>
  );
}
