"use client";

// 인수인계 자료 일괄 생성(관리자): 올해 한 번이라도 CICO·Tier3였던 학생마다(SST만은 제외) ⑧ 탭의 AI 초안을 차례로 받아 빈 칸에만 넣고 저장한다.
// 저장 전 내용은 BIP_이력 탭에 남는다. 초안이므로 담임 검토가 필요하다는 표시(handover.ai)를 함께 남긴다.
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/app/lib/api";
import { maskName } from "../utils";
import { useAuth } from "../components/AuthProvider";
import { parseJson, today } from "../target-behavior/shared";
import { mergeInto } from "../target-behavior/Steps";
import { parseHandover, requestHandoverDraft, upgradeHandover } from "../target-behavior/Docs";

type Status = { state: "대기" | "진행 중" | "완료" | "건너뜀" | "실패"; note?: string };

export default function HandoverBatch({ students }: { students: any[] }) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [skipDone, setSkipDone] = useState(true);
    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState<Record<string, Status>>({});
    const stopRef = useRef(false);
    // 제출 대상: 올해(3월~이번 달) 한 번이라도 CICO·Tier3·Tier3+였던 재학생(SST만 받은 학생은 제출하지 않음)
    const [yearT, setYearT] = useState<Record<string, string[]>>({});
    useEffect(() => { axios.get(`${API_BASE_URL}/api/v1/tier-monthly/year-targets`).then(r => setYearT(r.data?.targets || {})).catch(() => {}); }, []);
    const targets = students.filter(s => s.학생코드 && String(s.재학여부 || "").toUpperCase() !== "X" && (yearT[String(s.학생코드)] || []).some(t => t !== "SST"));
    const mark = (code: string, st: Status) => setStatus(m => ({ ...m, [code]: st }));

    const runOne = async (code: string) => {
        const enc = encodeURIComponent(code);
        const [b, l, t] = await Promise.all([
            axios.get(`${API_BASE_URL}/api/v1/bip/students/${enc}/bip`).then(r => r.data || {}).catch(() => ({})),
            axios.get(`${API_BASE_URL}/api/v1/behavior-log/timeline/${enc}`).then(r => r.data?.logs || []).catch(() => []),
            axios.get(`${API_BASE_URL}/api/v1/target-behaviors/students/${enc}`).then(r => r.data?.behaviors || []).catch(() => []),
        ]);
        const bip: Record<string, string> = {};
        Object.entries(b).forEach(([k, v]) => { bip[k] = v == null ? "" : String(v); });
        const pr = parseJson<any>(bip.ProgressReport, {});
        const cur: Record<string, string> = upgradeHandover(pr.handover || {});
        if (skipDone && (cur.summary || "").trim()) return mark(code, { state: "건너뜀", note: "이미 작성됨" });
        const text = await requestHandoverDraft(code, bip, l, t);
        const patch = parseHandover(text);
        if (!patch) return mark(code, { state: "건너뜀", note: text.replace(/[*#]/g, "").slice(0, 80) || "AI 결과 없음" });
        const handover = { ...mergeInto(cur, patch, "empty"), date: cur.date || today(), ai: `AI 초안 ${today()} — 담임 검토 필요` };
        await axios.post(`${API_BASE_URL}/api/v1/bip/students/${enc}/bip`, {
            ...bip, StudentCode: code, ProgressReport: JSON.stringify({ ...pr, handover }),
            UpdatedAt: today(), Author: user?.name || user?.id || "관리자",
        });
        mark(code, { state: "완료", note: `${Object.keys(patch).length}개 칸` });
    };

    const run = async () => {
        if (!confirm(`올해 CICO·Tier3 학생 ${targets.length}명의 인수인계 자료 AI 초안을 차례로 만들어 저장합니다.\n빈 칸에만 넣고, 이전 내용은 BIP_이력 탭에 남습니다.\n한 명에 1~2분 걸립니다. 진행할까요?`)) return;
        stopRef.current = false; setRunning(true);
        setStatus(Object.fromEntries(targets.map(s => [s.학생코드, { state: "대기" } as Status])));
        for (const s of targets) {
            if (stopRef.current) break;
            mark(s.학생코드, { state: "진행 중" });
            try { await runOne(s.학생코드); }
            catch (e: any) { mark(s.학생코드, { state: "실패", note: e?.response?.data?.detail || e?.message || "요청 실패" }); }
        }
        setRunning(false);
    };

    const color: Record<Status["state"], string> = { 대기: "#94a3b8", "진행 중": "#7c3aed", 완료: "#15803d", 건너뜀: "#b45309", 실패: "#dc2626" };
    const done = Object.values(status).filter(s => s.state === "완료").length;
    return (
        <div className="card" style={{ padding: 16 }}>
            <button onClick={() => setOpen(o => !o)} style={{ all: "unset", cursor: "pointer", fontWeight: 800 }}>
                🤖 인수인계 자료 일괄 생성 {open ? "▲" : "▼"} <span style={{ fontWeight: 500, color: "#64748b", fontSize: "0.8rem" }}>(올해 CICO·Tier3 {targets.length}명, SST만은 제외 · 개별학생 행동중재 ⑨ 탭에 저장)</span>
            </button>
            {open && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button className="btn btn-ai" onClick={run} disabled={running || !targets.length}>{running ? "⏳ 만드는 중…" : "🤖 초안 만들고 저장"}</button>
                        {running && <button className="btn btn-secondary" onClick={() => { stopRef.current = true; }}>⏹ 지금 학생까지만</button>}
                        <label style={{ fontSize: "0.82rem", display: "flex", gap: 6, alignItems: "center" }}>
                            <input type="checkbox" checked={skipDone} onChange={e => setSkipDone(e.target.checked)} disabled={running} /> 이미 작성된 학생 건너뛰기
                        </label>
                        {Object.keys(status).length > 0 && <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>완료 {done} / {targets.length}</span>}
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                        빈 칸에만 채우고 기존 내용은 건드리지 않습니다. 근거는 행동 기록·CICO·SST·행동중재계획·협의 기록이며 학생정보 및 이해자료는 AI에 보내지 않습니다. 담임은 ⑨ 탭에서 확인·수정해 제출합니다.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>
                        {targets.map(s => {
                            const st = status[s.학생코드];
                            return (
                                <a key={s.학생코드} href={`/target-behavior?student=${encodeURIComponent(s.학생코드)}&step=handover`} target="_blank" rel="noreferrer"
                                    style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "7px 10px", textDecoration: "none", color: "inherit", fontSize: "0.8rem" }}>
                                    <b>{maskName(s.학생이름)}</b> <span style={{ color: "#64748b" }}>{s.학급} · {(yearT[String(s.학생코드)] || []).join("·")}</span>
                                    {st && <div style={{ color: color[st.state], fontWeight: 700, fontSize: "0.74rem" }}>{st.state}{st.note ? ` · ${st.note}` : ""}</div>}
                                </a>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
