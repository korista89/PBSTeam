"use client";

// 협의회 초안: 관리자는 학교행동중재지원팀(전교 자료·연간 12차 일정), 담임은 학급 협의회(학급 자료).
// 차수·안건·기간을 고르면 서버가 수치를 계산하고 안건별 초안을 만든다. 고쳐서 저장·인쇄·워드로 내보낸다.
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { API_BASE_URL } from "@/app/lib/api";

type Session = { no: number; when: string; focus: string; agenda: string[]; period_start: string; period_end: string };
type Plan = { scope: "school" | "class"; title: string; attendees: string; agenda?: string[]; period_start?: string; period_end?: string; selected?: number; sessions?: Session[] };
type Note = { id: string; date: string; content: string; author: string; period_start?: string; period_end?: string };

const inp: React.CSSProperties = { padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.9rem", fontFamily: "inherit", boxSizing: "border-box" };
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export default function MeetingPage() {
    const { user, isAdmin } = useAuth();
    const meetingType = isAdmin() ? "tier1" : `tier1_class_${user?.class_id || user?.id || "unknown"}`;
    const [plan, setPlan] = useState<Plan | null>(null);
    const [no, setNo] = useState(0);
    const [title, setTitle] = useState("");
    const [agenda, setAgenda] = useState<string[]>([]);
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState("");
    const [msg, setMsg] = useState("");
    const [notes, setNotes] = useState<Note[]>([]);

    const applySession = useCallback((p: Plan, n: number) => {
        const s = p.sessions?.find(x => x.no === n);
        if (!s) return;
        setNo(n); setTitle(`${p.title} ${n}차(${s.when}) — ${s.focus}`); setAgenda(s.agenda); setStart(s.period_start); setEnd(s.period_end);
    }, []);

    const loadNotes = useCallback(async () => {
        try { setNotes((await axios.get(`${API_BASE_URL}/api/v1/meeting-notes`, { params: { meeting_type: meetingType } })).data.notes || []); } catch { setNotes([]); }
    }, [meetingType]);

    useEffect(() => {
        if (!user) return;
        axios.get(`${API_BASE_URL}/api/v1/analytics/meeting-draft/plan`).then(r => {
            const p: Plan = r.data;
            setPlan(p);
            if (p.scope === "school") applySession(p, p.selected || 1);
            else { setTitle(p.title); setAgenda(p.agenda || []); setStart(p.period_start || ""); setEnd(p.period_end || today()); }
        }).catch(e => setMsg("⚠ 협의회 정보를 불러오지 못했습니다: " + (e.response?.data?.detail || e.message)));
        void loadNotes();
    }, [user, applySession, loadNotes]);

    const make = async () => {
        setBusy("draft"); setMsg("");
        try {
            const r = await axios.post(`${API_BASE_URL}/api/v1/analytics/meeting-draft`, { title, agenda, start_date: start, end_date: end }, { timeout: 240000 });
            setDraft(r.data.draft || "");
        } catch (e: any) {
            setMsg("⚠ 초안을 만들지 못했습니다: " + (e.response?.data?.detail || e.message));
        } finally { setBusy(""); }
    };

    const save = async () => {
        setBusy("save");
        try {
            await axios.post(`${API_BASE_URL}/api/v1/meeting-notes`, { meeting_type: meetingType, date: today(), content: draft, author: user?.name || user?.id || "", period_start: start, period_end: end });
            setMsg("✓ 저장했습니다.");
            void loadNotes();
        } catch (e: any) {
            setMsg("⚠ 저장 실패: " + (e.response?.data?.detail || e.message));
        } finally { setBusy(""); }
    };

    const html = () => `<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:20mm}body{font-family:'Malgun Gothic',sans-serif;font-size:11pt;line-height:1.7}h1{font-size:16pt;text-align:center;border-bottom:2px solid #000;padding-bottom:8px}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><h1>${esc(title)}</h1><pre>${esc(draft)}</pre></body></html>`;
    const print = () => { const w = window.open("", "_blank"); if (!w) return; w.document.write(html()); w.document.close(); w.focus(); w.print(); };
    const word = () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿", html()], { type: "application/msword" }));
        a.download = `${title.replace(/[\\/:*?"<>|]/g, "")}_${today()}.doc`;
        a.click(); URL.revokeObjectURL(a.href);
    };

    return (
        <AuthCheck>
            <AppShell currentPage="meeting" hideDateFilter={true}
                title={isAdmin() ? "🤝 학교행동중재지원팀 협의회" : "🤝 학급 협의회"}
                subtitle={isAdmin() ? "전교 자료로 차수별 협의록 초안을 만듭니다 · 고쳐서 저장·인쇄합니다" : "담임·부담임·교과·지원인력이 함께 볼 학급 자료 기반 협의록 초안을 만듭니다"}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {msg && <div className="card" style={{ padding: 12, color: msg.startsWith("✓") ? "#15803d" : "#b91c1c" }}>{msg}</div>}

                    {/* 1. 협의회 준비 */}
                    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontWeight: 800 }}>① 협의회 준비</div>
                        {plan?.scope === "school" && (
                            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem", fontWeight: 700 }}>차수
                                <select value={no} onChange={e => applySession(plan, Number(e.target.value))} style={inp}>
                                    {plan.sessions?.map(s => <option key={s.no} value={s.no}>{s.no}차 · {s.when} · {s.focus}{s.no === plan.selected ? " (이번 차수)" : ""}</option>)}
                                </select>
                            </label>
                        )}
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem", fontWeight: 700 }}>제목
                            <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
                        </label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "0.85rem", fontWeight: 700 }}>
                            자료 기간 <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inp} /> ~ <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inp} />
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#475569" }}>참석: {plan?.attendees || "-"}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>안건</div>
                            {agenda.map((a, i) => (
                                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <b style={{ width: 20 }}>{i + 1}.</b>
                                    <input value={a} onChange={e => setAgenda(agenda.map((x, j) => j === i ? e.target.value : x))} style={{ ...inp, flex: 1 }} />
                                    <button className="btn btn-secondary" onClick={() => setAgenda(agenda.filter((_, j) => j !== i))} title="안건 빼기">✕</button>
                                </div>
                            ))}
                            <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setAgenda([...agenda, ""])}>+ 안건 추가</button>
                        </div>
                        <button className="btn btn-ai" onClick={() => void make()} disabled={!!busy || !agenda.some(a => a.trim()) || !start || !end} style={{ alignSelf: "flex-start" }}>
                            {busy === "draft" ? "자료 분석·초안 작성 중..." : "✨ 협의록 초안 만들기"}
                        </button>
                    </div>

                    {/* 2. 초안 고치기·저장·인쇄 */}
                    {draft && (
                        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <div style={{ fontWeight: 800, flex: 1 }}>② 초안 고치기 <span style={{ fontWeight: 500, fontSize: "0.8rem", color: "#64748b" }}>[협의 필요]는 회의에서 정한 뒤 지우세요</span></div>
                                <button className="btn btn-primary" onClick={() => void save()} disabled={!!busy}>{busy === "save" ? "저장 중..." : "💾 저장"}</button>
                                <button className="btn btn-secondary" onClick={print}>🖨️ 인쇄</button>
                                <button className="btn btn-secondary" onClick={word}>📄 워드</button>
                            </div>
                            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={Math.min(40, draft.split("\n").length + 2)} style={{ ...inp, width: "100%", lineHeight: 1.7 }} />
                        </div>
                    )}

                    {/* 3. 지난 협의록 */}
                    <details className="card" style={{ padding: 18 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 800 }}>📚 지난 협의록 ({notes.length}건)</summary>
                        {notes.length === 0 ? <p style={{ color: "#94a3b8" }}>저장된 협의록이 없습니다.</p> : notes.map(n => (
                            <div key={n.id} style={{ borderTop: "1px solid #e2e8f0", padding: "10px 0", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <b>{n.date}</b>
                                <span style={{ flex: 1, color: "#475569", fontSize: "0.85rem", minWidth: 160 }}>{n.content.split("\n").find(l => l.trim())?.slice(0, 60)}</span>
                                <button className="btn btn-secondary" onClick={() => { setDraft(n.content); window.scrollTo({ top: 0, behavior: "smooth" }); }}>열기</button>
                            </div>
                        ))}
                    </details>
                </div>
            </AppShell>
        </AuthCheck>
    );
}
