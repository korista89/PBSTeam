"use client";

// 인수인계 연결: 인수인계 파일(비식별 JSON)을 브라우저에서 읽어 현재 학생과 짝짓는다.
// 파일 내용은 서버로 보내지 않고, 서버에는 (학생코드 ↔ 인수인계ID) 연결표만 저장한다.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/app/lib/api";
import { maskName } from "../utils";
import { Handover, labelOf, parseHandover, summariesById } from "../lib/handover";

export default function HandoverMatch({ students }: { students: any[] }) {
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<Handover | null>(null);
    const [links, setLinks] = useState<Record<string, string>>({});
    const [msg, setMsg] = useState("");
    const load = useCallback(() => {
        axios.get(`${API_BASE_URL}/api/v1/tier/handover-links`).then(r => setLinks(r.data.links || {})).catch(() => setLinks({}));
    }, []);
    useEffect(() => { if (open) load(); }, [open, load]);

    const sums = useMemo(() => (file ? summariesById(file) : []), [file]);
    const used = new Set(Object.values(links));
    const enrolled = students.filter(s => String(s.재학여부 || "").toUpperCase() !== "X" && s.학생코드);

    const pickFile = async (f?: File) => {
        if (!f) return;
        try { setFile(parseHandover(await f.text())); setMsg(""); } catch (e: any) { setFile(null); setMsg("⚠️ " + (e?.message || "파일을 읽지 못했습니다.")); }
    };
    const setLink = async (code: string, id: string) => {
        try {
            await axios.put(`${API_BASE_URL}/api/v1/tier/handover-links`, { code, handover_id: id });
            setLinks(l => { const n = { ...l }; if (id) n[code] = id; else delete n[code]; return n; });
        } catch (e: any) { setMsg("⚠️ 저장 실패: " + (e?.response?.data?.detail || e?.message)); }
    };

    return (
        <div className="card" style={{ padding: 16 }}>
            <button onClick={() => setOpen(o => !o)} style={{ all: "unset", cursor: "pointer", fontWeight: 800 }}>📎 인수인계 연결 {open ? "▲" : "▼"} <span style={{ fontWeight: 500, color: "#64748b", fontSize: "0.8rem" }}>(이전 학년도 기록과 현재 학생 짝짓기 · 연결됨 {Object.keys(links).length}명)</span></button>
            {open && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.6 }}>
                        전임자가 만든 <b>경은PBS 인수인계 자료(.json)</b>를 고르세요. 파일은 이 브라우저에서만 읽고 서버로 보내지 않습니다.
                        학생마다 아래 목록에서 그 학생으로 보이는 ID를 고르면 <b>학생 개별 대시보드에서 과거 학년도와 비교</b>할 수 있습니다. 행동 유형·건수로 짐작되는 값이므로 담임 확인 후 연결하세요.
                    </div>
                    <input type="file" accept=".json,application/json" onChange={e => pickFile(e.target.files?.[0])} style={{ margin: "10px 0" }} />
                    {msg && <div style={{ color: "#dc2626", fontSize: "0.82rem" }}>{msg}</div>}
                    {file && (
                        <>
                            <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 6 }}>학년도 {file.학년도.join(", ")} · 학생 {sums.length}명 · 기록 {file.기록.length}건</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" }}>
                                {enrolled.map(s => {
                                    const code = String(s.학생코드);
                                    return (
                                        <div key={code} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 8, alignItems: "center", fontSize: "0.82rem" }}>
                                            <span><b>{maskName(s.학생이름)}</b> <span style={{ color: "#64748b" }}>{s.학급} · {code}</span></span>
                                            <select value={links[code] || ""} onChange={e => setLink(code, e.target.value)} style={{ padding: "5px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
                                                <option value="">— 연결 안 함 —</option>
                                                {sums.filter(x => x.id === links[code] || !used.has(x.id)).map(x => <option key={x.id} value={x.id}>{labelOf(x)}</option>)}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
