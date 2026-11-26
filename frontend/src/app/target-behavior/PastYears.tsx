"use client";

// 과거 학년도 비교: 인수인계 파일(브라우저에서만 읽음) + 서버의 연결표로 이 학생의 지난 학년도 기록을 보여 준다.
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/app/lib/api";
import { Handover, parseHandover, summarize } from "../lib/handover";
import { schoolYearStart } from "../lib/progress";

const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
const th: React.CSSProperties = { padding: "5px 8px", textAlign: "center", fontSize: "0.76rem", color: "#64748b", fontWeight: 700 };
const td: React.CSSProperties = { padding: "5px 8px", textAlign: "center", fontSize: "0.82rem", borderTop: "1px solid #f1f5f9" };

export default function PastYears({ studentCode, logs }: { studentCode: string; logs: Record<string, any>[] }) {
    const [id, setId] = useState<string | null | undefined>(undefined);
    const [file, setFile] = useState<Handover | null>(null);
    const [msg, setMsg] = useState("");
    useEffect(() => {
        let alive = true;
        axios.get(`${API_BASE_URL}/api/v1/tier/handover-links`).then(r => { if (alive) setId((r.data.links || {})[studentCode] || null); }).catch(() => { if (alive) setId(null); });
        return () => { alive = false; };
    }, [studentCode]);

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const cur = +schoolYearStart(today).slice(0, 4);
    const rows = useMemo(() => {
        const out: { year: number; count: number; avg: number | null; types: string[]; months: Record<number, number>; live: boolean }[] = [];
        if (file && id) {
            const mine = file.기록.filter(r => r.학생ID === id && +r.학년도 < cur);
            for (const y of [...new Set(mine.map(r => +r.학년도))].sort()) {
                const s = summarize(mine.filter(r => +r.학년도 === y));
                const months: Record<number, number> = {};
                Object.entries(s.byYearMonth).forEach(([ym, n]) => { months[+ym.slice(5, 7)] = n; });
                out.push({ year: y, count: s.total, avg: s.avgIntensity, types: s.topTypes, months, live: false });
            }
        }
        const months: Record<number, number> = {}; const ints: number[] = [];
        let n = 0;
        logs.forEach(l => {
            const d = String(l["행동발생날짜"] || "").slice(0, 10);
            if (d < schoolYearStart(today)) return;
            n++; months[+d.slice(5, 7)] = (months[+d.slice(5, 7)] || 0) + 1;
            const m = /^\s*(\d)/.exec(String(l["강도"] ?? "")); if (m) ints.push(+m[1]);
        });
        out.push({ year: cur, count: n, avg: ints.length ? Math.round((ints.reduce((a, b) => a + b, 0) / ints.length) * 10) / 10 : null, types: [], months, live: true });
        return out;
    }, [file, id, logs, cur, today]);

    const pick = async (f?: File) => {
        if (!f) return;
        try { setFile(parseHandover(await f.text())); setMsg(""); } catch (e: any) { setFile(null); setMsg("⚠️ " + (e?.message || "파일을 읽지 못했습니다.")); }
    };

    if (id === undefined) return null;
    return (
        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18, marginTop: 16 }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>🗂️ 과거 학년도 비교</h3>
            {!id ? (
                <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#64748b" }}>이 학생은 인수인계 자료와 연결되어 있지 않습니다. 관리자가 <b>Tier 현황 → 인수인계 연결</b>에서 짝지으면 지난 학년도와 비교할 수 있습니다.</p>
            ) : (
                <>
                    <p style={{ margin: "6px 0 8px", fontSize: "0.82rem", color: "#64748b" }}>인수인계 파일(.json)을 고르면 이 브라우저에서만 읽어 비교합니다(서버로 보내지 않음).</p>
                    <input type="file" accept=".json,application/json" onChange={e => pick(e.target.files?.[0])} />
                    {msg && <div style={{ color: "#dc2626", fontSize: "0.82rem", marginTop: 6 }}>{msg}</div>}
                    {file && (
                        <div style={{ overflowX: "auto", marginTop: 10 }}>
                            <table style={{ borderCollapse: "collapse", width: "100%" }}>
                                <thead><tr><th style={th}>학년도</th><th style={th}>건수</th><th style={th}>평균 강도</th><th style={th}>주요 유형</th>{MONTHS.map(m => <th key={m} style={th}>{m}월</th>)}</tr></thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.year} style={r.live ? { background: "#f5f3ff" } : undefined}>
                                            <td style={{ ...td, fontWeight: 800 }}>{r.year}{r.live ? " (올해)" : ""}</td><td style={td}>{r.count}</td><td style={td}>{r.avg ?? "-"}</td>
                                            <td style={{ ...td, textAlign: "left" }}>{r.types.join(" · ") || "-"}</td>
                                            {MONTHS.map(m => <td key={m} style={td}>{r.months[m] || ""}</td>)}
                                        </tr>
                                    ))}
                                    {rows.length === 1 && <tr><td colSpan={16} style={{ ...td, color: "#94a3b8" }}>이 ID의 지난 학년도 기록이 파일에 없습니다.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
