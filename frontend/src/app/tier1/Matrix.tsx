"use client";

import React, { useState } from "react";
import { ACCENT, type Plan } from "./shared";

// 운영계획 다-1) 기대행동·장소별 규칙, 다-3)-나) 교육과정·IEP 반영 세부 목표 예시
const CAT_COLOR: Record<string, string> = { 스스로: "#2563eb", 바르게: "#16a34a", 안전하게: "#dc2626" };

export default function Tier1Matrix({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState<string | null>(null);
  const find = (place: string, cat: string) => plan.behaviors.find(b => b.place === place && b.category === cat);
  const goals = open ? plan.iep_goals[open] || [] : [];
  const [oPlace, oCat] = open ? open.split("|") : ["", ""];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "1rem" }}>경은 기대행동</strong>
        {plan.categories.map(c => <span key={c} style={{ padding: "6px 18px", borderRadius: 999, background: CAT_COLOR[c], color: "#fff", fontWeight: 900, fontSize: "1rem" }}>{c}</span>)}
        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>칸을 누르면 교육과정·IEP에 넣을 세부 목표 예시가 나옵니다. 학급 기대행동 선택·토큰판은 <a href="/class-rules">학급규칙/토큰</a>에서 합니다.</span>
      </div>
      <div className="card" style={{ padding: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 6, minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ width: 120 }} />
              {plan.categories.map(c => <th key={c} style={{ color: CAT_COLOR[c], fontSize: "1rem", padding: 6 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {plan.places.map(place => (
              <tr key={place}>
                <th style={{ background: "#f1f5f9", borderRadius: 10, padding: 10, fontSize: "0.9rem" }}>{place}</th>
                {plan.categories.map(cat => {
                  const b = find(place, cat);
                  const key = `${place}|${cat}`;
                  const on = open === key;
                  return (
                    <td key={cat} onClick={() => setOpen(on ? null : key)}
                      style={{ cursor: "pointer", borderRadius: 12, padding: 8, textAlign: "center", verticalAlign: "top",
                        border: on ? `2.5px solid ${CAT_COLOR[cat]}` : "1px solid #e2e8f0", background: on ? `${CAT_COLOR[cat]}0d` : "#fff" }}>
                      {b?.image && <img src={b.image} alt="" style={{ width: 72, height: 72, objectFit: "contain", display: "block", margin: "0 auto 4px" }} />}
                      <div style={{ fontWeight: 800, fontSize: "0.88rem" }}>{b ? `${b.label} ${b.text}` : "-"}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="card" style={{ padding: 16, border: `2px solid ${CAT_COLOR[oCat] || ACCENT}` }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>📝 {oPlace} · <span style={{ color: CAT_COLOR[oCat] }}>{oCat}</span> {find(oPlace, oCat)?.text} — 세부 목표 예시(쉬운 것 → 어려운 것)</div>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: "0.88rem" }}>
            {goals.map(g => <li key={g}>{g}</li>)}
          </ol>
          <p style={{ fontSize: "0.72rem", color: "#64748b", margin: "8px 0 0" }}>※ {plan.goal_note}. 학생별로 중점 지도할 규칙을 골라 IEP에 넣고 행동관찰기록지·체크리스트·루브릭으로 평가합니다.</p>
        </div>
      )}
    </div>
  );
}
