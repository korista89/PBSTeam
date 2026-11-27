"use client";

// 관리 탭 공통: '대시보드'(연간 성과, 먼저 보임)와 '이 달'(명단·현황) 전환
export default function ViewToggle({ value, onChange, monthLabel, yearLabel = "📊 대시보드" }: {
  value: "month" | "year"; onChange: (v: "month" | "year") => void; monthLabel: string; yearLabel?: string;
}) {
  const btn = (v: "month" | "year", label: string) => (
    <button onClick={() => onChange(v)} style={{
      padding: "8px 16px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
      background: value === v ? "#2563eb" : "transparent", color: value === v ? "#fff" : "#475569", borderRadius: 8,
    }}>{label}</button>
  );
  return (
    <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#f1f5f9", borderRadius: 10, alignSelf: "flex-start" }}>
      {btn("year", yearLabel)}
      {btn("month", `🗓️ ${monthLabel}`)}
    </div>
  );
}
