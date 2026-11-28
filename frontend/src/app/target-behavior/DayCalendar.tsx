"use client";

// 평일 달력: 날짜를 눌러 표시를 바꾸고(예: '' → ✓, 또는 '' → O → X), '반영'을 눌러야 저장한다.
// ⑤ 모니터링의 '위기행동이 없었던 날'과 '행동중재계획 실행충실도'가 같이 쓴다.
import React, { useEffect, useMemo, useState } from "react";
import { addDays, today } from "./shared";

const COLORS: Record<string, [string, string]> = { "✓": ["#dcfce7", "#15803d"], O: ["#dbeafe", "#1d4ed8"], X: ["#fee2e2", "#b91c1c"], 결석: ["#e2e8f0", "#475569"] };
const monthOf = (iso: string) => iso.slice(0, 7);

export default function DayCalendar({ marks, cycle, blocked = {}, range, onApply, legend }: {
    marks: Record<string, string>; cycle: string[]; blocked?: Record<string, string>; range?: [string, string];
    onApply: (next: Record<string, string>, changed: string[]) => Promise<void>; legend?: React.ReactNode;
}) {
    const t = today();
    const [month, setMonth] = useState(monthOf(t));
    const [draft, setDraft] = useState<Record<string, string>>(marks);
    const [busy, setBusy] = useState(false);
    useEffect(() => setDraft(marks), [marks]);
    const changed = useMemo(() => [...new Set([...Object.keys(marks), ...Object.keys(draft)])].filter(d => (marks[d] || "") !== (draft[d] || "")).sort(), [marks, draft]);

    // 이 달의 평일을 주(월~금) 단위로
    const weeks = useMemo(() => {
        const first = `${month}-01`;
        let d = addDays(first, -((new Date(first + "T00:00:00Z").getUTCDay() + 6) % 7));  // 그 주 월요일
        const out: string[][] = [];
        while (monthOf(d) <= month) {
            out.push([0, 1, 2, 3, 4].map(i => addDays(d, i)));
            d = addDays(d, 7);
        }
        return out;
    }, [month]);
    const shift = (n: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
    const click = (d: string) => {
        if (d > t || blocked[d]) return;
        const i = cycle.indexOf(draft[d] || "");
        const v = cycle[(i + 1) % cycle.length];
        setDraft(p => { const n = { ...p }; if (v) n[d] = v; else delete n[d]; return n; });
    };
    const apply = async () => { setBusy(true); try { await onApply(draft, changed); } finally { setBusy(false); } };
    const cell: React.CSSProperties = { height: 42, borderRadius: 8, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", userSelect: "none" };

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <button className="btn btn-secondary" style={{ padding: "3px 10px" }} onClick={() => shift(-1)}>◀</button>
                <b style={{ minWidth: 90, textAlign: "center" }}>{+month.slice(0, 4)}년 {+month.slice(5)}월</b>
                <button className="btn btn-secondary" style={{ padding: "3px 10px" }} onClick={() => shift(1)} disabled={month >= monthOf(t)}>▶</button>
                <span style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={apply} disabled={busy || !changed.length}>{busy ? "반영 중…" : `✅ 반영${changed.length ? ` (${changed.length}일)` : ""}`}</button>
                {changed.length > 0 && <button className="btn btn-secondary" onClick={() => setDraft(marks)} disabled={busy}>되돌리기</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, maxWidth: 520 }}>
                {["월", "화", "수", "목", "금"].map(w => <div key={w} style={{ textAlign: "center", fontSize: "0.72rem", fontWeight: 700, color: "#64748b" }}>{w}</div>)}
                {weeks.flat().map(d => {
                    const out = monthOf(d) !== month, future = d > t, v = draft[d] || "", block = blocked[d];
                    const inRange = range && range[0] && d >= range[0] && (!range[1] || d <= range[1]);
                    const [bg, fg] = COLORS[v] || ["#fff", "#0f172a"];
                    return (
                        <div key={d} onClick={() => !out && click(d)} title={block || ""} style={{
                            ...cell, visibility: out ? "hidden" : "visible", cursor: future || block ? "default" : "pointer",
                            background: block ? "#fff7ed" : bg, color: future ? "#cbd5e1" : fg,
                            outline: (marks[d] || "") !== v ? "2px dashed #f59e0b" : inRange ? "2px solid #c7d2fe" : "none", outlineOffset: -2,
                        }}>
                            <span>{+d.slice(8)}</span>
                            <b style={{ fontSize: v.length > 1 ? "0.72rem" : "0.85rem", lineHeight: 1 }}>{block ? "⚠" : v}</b>
                        </div>
                    );
                })}
            </div>
            <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 6 }}>
                날짜를 누를 때마다 {cycle.map(c => c || "빈칸").join(" → ")} 순서로 바뀝니다. 노란 점선은 아직 반영하지 않은 날입니다. {legend}
            </div>
        </div>
    );
}
