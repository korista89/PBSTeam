"use client";

// 관리자: 보호자 동의 상태와 2027학년도 원스톱 초기화 마법사.
// 마법사의 쓰기 단계는 서버가 2027 모드·계정 관리자·확인 문구를 모두 확인한 뒤에만 실행한다. 먼저 '점검'으로 바뀔 양을 본다.
import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/app/lib/api";
import { useAuth } from "../components/AuthProvider";

type Row = { code: string; class: string; label: string; state: string; date: string; until: string };
const STATES = ["", "동의", "미동의", "철회"];

function download(name: string, text: string, type = "text/csv;charset=utf-8") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export default function PrivacyAdmin() {
    const { user } = useAuth();
    const on = user?.privacy_mode === "2027_FULL_ZERO_PII";
    const [rows, setRows] = useState<Row[]>([]);
    const [filter, setFilter] = useState("");
    const [log, setLog] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const say = (t: string) => setLog(l => [`${new Date().toLocaleTimeString()} ${t}`, ...l].slice(0, 20));

    useEffect(() => { axios.get(`${API_BASE_URL}/api/v1/privacy/consent`).then(r => setRows(r.data.rows || [])).catch(() => { }); }, []);

    const saveConsent = async (r: Row, patch: Partial<Row>) => {
        const next = { ...r, ...patch };
        if (!next.state) return;
        try {
            await axios.put(`${API_BASE_URL}/api/v1/privacy/consent/${encodeURIComponent(r.code)}`, { state: next.state, date: next.date, until: next.until });
            setRows(rs => rs.map(x => x.code === r.code ? next : x));
        } catch (e: any) { say(`⚠️ 동의 저장 실패: ${e.response?.data?.detail || e.message}`); }
    };

    const step = async (path: string, word: string, label: string, onDone?: (d: any) => void) => {
        setBusy(true);
        try {
            const pre = (await axios.post(`${API_BASE_URL}/api/v1/privacy/wizard/${path}`, { confirm: "" }, { timeout: 280000 })).data;
            const typed = window.prompt(`[${label}] 점검 결과: ${JSON.stringify(pre.cells || pre.accounts || pre, null, 0).slice(0, 400)}\n\n실행하려면 '${word}'를 입력하세요.`);
            if (typed !== word) { say(`${label}: 취소`); return; }
            const done = (await axios.post(`${API_BASE_URL}/api/v1/privacy/wizard/${path}`, { confirm: word }, { timeout: 280000 })).data;
            say(`✅ ${label} 완료 ${done.written != null ? `(${done.written}칸)` : ""}`);
            onDone?.(done);
        } catch (e: any) { say(`⚠️ ${label} 실패: ${e.response?.data?.detail || e.message}`); }
        finally { setBusy(false); }
    };

    const shown = rows.filter(r => !filter || r.class.includes(filter) || r.label.includes(filter));
    return (
        <div className="card" style={{ padding: 20, marginTop: 20 }}>
            <h2 style={{ margin: "0 0 6px" }}>🛡️ 개인정보 보호 (현재: {on ? "2027 완전 비식별" : "2026 직책 권한"} 모드)</h2>
            <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "#64748b" }}>
                보호자 동의가 &lsquo;미동의·철회&rsquo;인 학생은 2027 모드에서 개별 분석과 통계에서 빠집니다. 동의 상태는 지금부터 미리 적어 둘 수 있습니다.
            </p>

            <h3 style={{ fontSize: "1rem" }}>1. 보호자 동의 상태</h3>
            <input placeholder="학급·표기로 찾기" value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: 6, marginBottom: 8 }} />
            <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "#f8fafc" }}><th>학급</th><th>표기</th><th>동의상태</th><th>동의일</th><th>보관기한</th></tr></thead>
                    <tbody>{shown.map(r => (
                        <tr key={r.code} style={{ borderTop: "1px solid #f1f5f9" }}>
                            <td>{r.class}</td><td>{r.label}</td>
                            <td><select value={r.state} onChange={e => saveConsent(r, { state: e.target.value })}>{STATES.map(s => <option key={s} value={s}>{s || "(미입력)"}</option>)}</select></td>
                            <td><input type="date" value={r.date} onChange={e => saveConsent(r, { date: e.target.value })} /></td>
                            <td><input type="date" value={r.until} onChange={e => saveConsent(r, { until: e.target.value })} /></td>
                        </tr>))}
                    </tbody>
                </table>
            </div>

            <h3 style={{ fontSize: "1rem", marginTop: 18 }}>2. 2027학년도 원스톱 초기화 마법사 {on ? "" : "(2027 모드에서만 실행)"}</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-secondary" disabled={!on || busy} onClick={() => step("reset-passwords", "초기화", "① 전 계정 비밀번호 초기화",
                    d => d.table && download(`임시비밀번호_${new Date().toISOString().slice(0, 10)}.csv`, "아이디,임시 비밀번호\n" + d.table.map((t: any) => `${t.id},${t.temp_password}`).join("\n")))}>① 비밀번호 일괄 초기화·배부표</button>
                <button className="btn btn-secondary" disabled={!on || busy} onClick={() => step("purge-graduates", "파기", "② 졸업·전출생 서술 기록 파기")}>② 졸업·전출생 서술 기록 파기</button>
                <button className="btn btn-secondary" disabled={!on || busy} onClick={() => step("anon-codes", "이관", "② 재학생 익명코드 이관",
                    d => d.code_map && download(`익명코드_대응표_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d.code_map), "application/json"))}>② 재학생 익명코드 이관</button>
                <a className="btn btn-secondary" href={`${API_BASE_URL}/api/v1/privacy/class-map.csv`} style={{ textDecoration: "none" }}>③ 학급별 매핑 CSV(전체)</a>
            </div>
            <p style={{ fontSize: "0.78rem", color: "#92400e", margin: "8px 0 0" }}>
                내려받은 임시 비밀번호 표와 익명코드 대응표는 출력·USB 보관 뒤 PC에서 지우세요. 대응표가 있어야 익명코드 이관을 되돌릴 수 있습니다.
            </p>
            {log.length > 0 && <pre style={{ fontSize: "0.75rem", background: "#f8fafc", padding: 8, borderRadius: 6, whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>}
        </div>
    );
}
