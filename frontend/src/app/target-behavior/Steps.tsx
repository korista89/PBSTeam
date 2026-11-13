"use client";

// 개별학생 행동중재 단계 화면: ② 자료 차트 ③ FBA 결과 보고서 ④ 행동중재계획 ⑥ 중재 결과 보고서
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { WeeklyTrendChart, ChangeBanner } from "../components/ProgressCharts";
import { isVacationWeek } from "../lib/progress";
import { API_BASE_URL } from "../constants";
import ReadableAIResult from "../components/ReadableAIResult";
import { parseBIPAIResult } from "../utils";
import {
    Bip, BIP_ROWS, FBA_SECTIONS, PROGRESS_SECTIONS, BehaviorSummary, StudentHead,
    parseJson, splitNumbered, today, kDate, Inp, Area, DateRange, BipSheet, SectionSheet, SummaryTable, sheetBox,
} from "./shared";

export const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 };
export const lab: React.CSSProperties = { fontSize: "0.78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 };
export const inp: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem", boxSizing: "border-box", fontFamily: "inherit" };
export const err = (e: any) => e?.response?.data?.detail || e?.message || "요청 실패";

type Log = Record<string, any>;
export const dOf = (l: Log) => String(l["행동발생날짜"] || "").slice(0, 10);
const mondayOf = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function useStudentLogs(studentCode: string) {
    const [logs, setLogs] = useState<Log[]>([]);
    useEffect(() => {
        let alive = true;  // 늦게 온 이전 학생 응답은 버린다
        setLogs([]);
        if (!studentCode) return;
        axios.get(`${API_BASE_URL}/api/v1/behavior-log/timeline/${encodeURIComponent(studentCode)}`)
            .then(r => { if (alive) setLogs(r.data?.logs || []); }).catch(() => { if (alive) setLogs([]); });
        return () => { alive = false; };
    }, [studentCode]);
    return logs;
}

export function openPrint(payload: any) {
    try { localStorage.setItem("pbst_iv_print", JSON.stringify(payload)); } catch { alert("미리보기를 열지 못했습니다."); return; }
    window.open("/target-behavior/print", "_blank");
}

export function AutoArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
    return <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={Math.max(rows, (value || "").split("\n").length + 1)} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} />;
}

function Bars({ title, items }: { title: string; items: { item: string; count: number; pct: number }[] }) {
    const max = Math.max(1, ...items.map(i => i.count));
    return (
        <div style={card}>
            <div style={{ fontWeight: 800, fontSize: "0.88rem", marginBottom: 10 }}>{title}</div>
            {items.length === 0 && <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>기록 없음</div>}
            {items.map(i => (
                <div key={i.item} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}><span style={{ fontWeight: 700 }}>{i.item}</span><span>{i.count}건 · {i.pct}%</span></div>
                    <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99 }}><div style={{ width: `${(i.count / max) * 100}%`, height: "100%", background: "#6366f1", borderRadius: 99 }} /></div>
                </div>
            ))}
        </div>
    );
}

// AI 결과를 절별로 반영: 빈 칸만 채우거나 뒤에 덧붙인다.
export function mergeInto(base: Record<string, string>, add: Record<string, string>, mode: "empty" | "append") {
    const next = { ...base };
    for (const [k, v] of Object.entries(add)) {
        if (!v) continue;
        const cur = (next[k] || "").trim();
        if (!cur) next[k] = v;
        else if (mode === "append") next[k] = `${cur}\n\n${v}`;
    }
    return next;
}

export function AIBox({ text, loading, onApply }: { text: string; loading: boolean; onApply?: (mode: "empty" | "append") => void }) {
    if (loading) return <div style={{ padding: 16, color: "#7c3aed", fontWeight: 700, fontSize: "0.85rem" }}>⏳ AI가 자료를 분석하고 있습니다… (1~2분)</div>;
    if (!text) return null;
    return (
        <div style={{ marginTop: 10, background: "#faf9ff", border: "1px solid #ede9fe", borderRadius: 10, padding: 14 }}>
            {onApply && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <button className="btn btn-primary" onClick={() => onApply("empty")}>✅ 빈 칸에만 반영</button>
                    <button className="btn btn-secondary" onClick={() => onApply("append")}>➕ 모든 칸 뒤에 덧붙이기</button>
                    <span style={{ fontSize: "0.75rem", color: "#64748b", alignSelf: "center" }}>반영 뒤 고치고 &lsquo;저장&rsquo;을 눌러야 남습니다.</span>
                </div>
            )}
            <div style={{ maxHeight: 420, overflowY: "auto", fontSize: "0.85rem" }}><ReadableAIResult text={text} /></div>
        </div>
    );
}

// ① 자료 분석 ───────────────────────────────────────────
export function DataStep({ studentCode, logs, planStart }: { studentCode: string; logs: Log[]; planStart: string }) {
    const [ev, setEv] = useState<any>(null);
    useEffect(() => {
        let alive = true;
        setEv(null);
        if (!studentCode) return;
        axios.get(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(studentCode)}/fba-evidence`).then(r => { if (alive) setEv(r.data); }).catch(() => { if (alive) setEv(null); });
        return () => { alive = false; };
    }, [studentCode]);
    const weekly = useMemo(() => {
        const m = new Map<string, number>();
        logs.forEach(l => { const d = dOf(l); if (d) { const w = mondayOf(d); m.set(w, (m.get(w) || 0) + 1); } });
        const keys = [...m.keys()].sort();
        if (!keys.length) return [];
        const last = mondayOf(today());
        const from = keys[0] > addDays(last, -7 * 79) ? keys[0] : addDays(last, -7 * 79);  // 최근 80주까지만
        const out: { week: string; count: number }[] = [];
        for (let w = from; w <= last; w = addDays(w, 7)) if (!isVacationWeek(w)) out.push({ week: w, count: m.get(w) || 0 });
        return out;
    }, [logs]);
    const dm = ev?.deterministic_metrics || {};
    const kpis = [
        ["누적 행동기록", `${dm.total_episodes_n ?? logs.length}건`], ["관찰일수", `${dm.observation_days_count ?? "-"}일`],
        ["평균 강도", dm.average_intensity_1_to_5 ? `${dm.average_intensity_1_to_5} / 5` : "-"], ["물리적 제지·안전사건", `${dm.physical_restraint_or_safety_event_count ?? 0}건`],
    ];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }} className="grid-responsive">
                {kpis.map(([k, v]) => <div key={k} style={card}><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b" }}>{k}</div><div style={{ fontSize: "1.5rem", fontWeight: 900, marginTop: 4 }}>{v}</div></div>)}
            </div>
            <div style={card}>
                <div style={{ fontWeight: 800, fontSize: "0.88rem", marginBottom: 8 }}>주별 행동기록 건수(최근 80주) <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "0.76rem" }}>연한 막대 = 그 주 건수 · 굵은 선 = 4주 평균 · 점선 = 처음 4주 평균</span> {planStart && <span style={{ fontWeight: 400, color: "#7c3aed", fontSize: "0.78rem" }}>(보라 선: 중재 시작 {kDate(planStart)})</span>}</div>
                {weekly.length === 0 ? <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>행동기록이 없습니다. 행동기록 탭에서 입력한 자료가 여기에 쌓입니다.</div> : (
                    <>
                        <ChangeBanner weekly={weekly} />
                        <div style={{ marginTop: 10 }}><WeeklyTrendChart weekly={weekly} planStart={planStart || undefined} height={240} /></div>
                    </>
                )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="responsive-grid-2">
                <Bars title="행동 유형" items={dm.behavior_type_distribution || []} />
                <Bars title="교사 추정 기능" items={dm.teacher_inferred_function_distribution || []} />
                <Bars title="발생 장소" items={dm.location_hotspot_distribution || []} />
                <Bars title="발생 시간대" items={dm.time_slot_distribution || []} />
            </div>
        </div>
    );
}

// ③ FBA 결과 보고서 ──────────────────────────────────────
export function FbaStep({ head, bip, setBip, save }: { head: StudentHead; bip: Bip; setBip: (b: Bip) => void; save: (b: Bip) => Promise<void> }) {
    const fba = parseJson<any>(bip.FBAReport, {});
    const secs: Record<string, string> = fba.sections || {};
    const [ai, setAi] = useState({ loading: false, text: "" });
    const setF = (patch: any) => setBip({ ...bip, FBAReport: JSON.stringify({ ...fba, ...patch }) });
    const setSec = (k: string, v: string) => setF({ sections: { ...secs, [k]: v } });

    const runAI = async () => {
        setAi({ loading: true, text: "" });
        const ctx = ["TargetBehavior", "OperationalDefinition", "Hypothesis", "MedicationStatus", "ReinforcerInfo"]
            .map(k => bip[k] ? `${k}: ${bip[k]}` : "").filter(Boolean).join("\n");
        try {
            const r = await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/ai-fba-report`,
                { start_date: fba.start || undefined, end_date: fba.end || undefined, teacher_context: ctx }, { timeout: 240000 });
            setAi({ loading: false, text: r.data.analysis || "" });
        } catch (e) { setAi({ loading: false, text: "⚠️ " + err(e) }); }
    };
    const apply = (mode: "empty" | "append") => {
        const parsed = splitNumbered(ai.text, FBA_SECTIONS);
        if (!Object.keys(parsed).length) { alert("AI 결과를 절별로 나누지 못했습니다. 필요한 부분을 복사해 넣어 주세요."); return; }
        setF({ sections: mergeInto(secs, parsed, mode) });
    };
    const toBip = () => {
        const h = (secs["기능 가설"] || "").trim();
        if (!h) { alert("'기능 가설' 칸이 비어 있습니다."); return; }
        const cur = (bip.Hypothesis || "").trim();
        setBip({ ...bip, Hypothesis: cur ? `${cur}\n\n[FBA 결과] ${h}` : h });
        alert("행동중재계획의 '기능평가 결과' 칸에 넣었습니다. 4단계에서 확인 후 저장하세요.");
    };
    const printMeta: [string, string][] = [["평가 기간", fba.start ? `${kDate(fba.start)} ~ ${kDate(fba.end)}` : ""], ["작성일", kDate(fba.date)], ["작성자", fba.author || ""]];
    const meta: [string, React.ReactNode][] = [
        ["평가 기간", <DateRange key="p" a={fba.start || ""} b={fba.end || ""} onA={v => setF({ start: v })} onB={v => setF({ end: v })} />],
        ["작성일", <Inp key="d" type="date" value={fba.date || today()} onChange={v => setF({ date: v })} />],
        ["작성자", <Inp key="a" value={fba.author || ""} onChange={v => setF({ author: v })} />],
    ];
    const sections: [string, React.ReactNode][] = FBA_SECTIONS.map((t, i) => [`${i + 1}. ${t}`, <Area key={t} value={secs[t] || ""} onChange={v => setSec(t, v)} rows={4} />]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 지금까지 자료로 FBA 초안 받기</button>
                    <button className="btn btn-secondary" onClick={toBip}>➡️ 기능 가설을 BIP에 반영</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "fba", s: head, meta: printMeta, sections: FBA_SECTIONS.map(t => [t, secs[t] || ""]) })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, FBAReport: JSON.stringify({ ...fba, date: fba.date || today() }) })}>💾 저장</button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>아래 양식 칸에 바로 입력하면 인쇄본과 같은 모양으로 나옵니다. 평가 기간을 비우면 모든 행동기록을 씁니다(3건 미만이면 초안 없음).</div>
                <AIBox text={ai.text} loading={ai.loading} onApply={apply} />
            </div>
            <div style={sheetBox}><SectionSheet heading="기능적 행동평가(FBA) 결과 보고서" s={head} meta={meta} sections={sections} /></div>
        </div>
    );
}

// ④ 행동중재계획 ─────────────────────────────────────────
const EBP_COLS: [string, string, string[]][] = [
    ["PreventionStrategies", "예방", ["ANTECEDENT", "SETTING_EVENT"]],
    ["TeachingStrategies", "교수", ["TEACHING"]],
    ["ReinforcementStrategies", "강화", ["REINFORCEMENT", "CONSEQUENCE"]],
];

export function BipStep({ head, bip, setBip, save, behaviors, goTracker }: {
    head: StudentHead; bip: Bip; setBip: (b: Bip) => void; save: (b: Bip) => Promise<void>; behaviors: any[]; goTracker: () => void;
}) {
    const [ai, setAi] = useState({ loading: false, text: "" });
    const [catalog, setCatalog] = useState<any[]>([]);
    useEffect(() => { axios.get(`${API_BASE_URL}/api/v1/ebp/catalog`).then(r => setCatalog(r.data.strategies || [])).catch(() => {}); }, []);
    const set = (k: string, v: string) => setBip({ ...bip, [k]: v });

    const runAI = async () => {
        setAi({ loading: true, text: "" });
        try {
            const r = await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/ai-bip-full`, {
                medication_status: bip.MedicationStatus || "", reinforcer_info: bip.ReinforcerInfo || "", other_considerations: bip.OtherConsiderations || "", mode: "detailed",
            }, { timeout: 240000 });
            setAi({ loading: false, text: r.data.analysis || "" });
        } catch (e) { setAi({ loading: false, text: "⚠️ " + err(e) }); }
    };
    const apply = (mode: "empty" | "append") => {
        const parsed = parseBIPAIResult(ai.text);
        delete parsed.MedicationStatus; // 약물 정보는 교사 입력만 쓴다
        if (parsed.TargetBehavior) { parsed.OperationalDefinition = parsed.TargetBehavior; delete parsed.TargetBehavior; }
        if (!Object.keys(parsed).length) { alert("AI 결과를 칸별로 나누지 못했습니다. 필요한 부분을 복사해 넣어 주세요."); return; }
        setBip(mergeInto(bip, parsed, mode));
    };
    const addEbp = (key: string, code: string) => {
        const s = catalog.find(c => c.code === code);
        if (!s) return;
        const line = `- [${s.name}] `;
        set(key, (bip[key] || "").trim() ? `${bip[key].trim()}\n${line}` : line);
    };
    const extra = (key: string) => {
        const ebp = EBP_COLS.find(c => c[0] === key);
        if (ebp) return (
            <select style={{ marginTop: 4, fontSize: "8.5pt", padding: "2px 4px", maxWidth: 320 }} value="" onChange={e => addEbp(key, e.target.value)}>
                <option value="">＋ Be-Able EBP 넣기 ({ebp[1]})</option>
                {catalog.filter(c => ebp[2].includes(c.category)).sort((x, y) => (x.official_no || 99) - (y.official_no || 99))
                    .map(c => <option key={c.code} value={c.code}>{c.official_no ? `${c.official_no}. ` : ""}{c.name}</option>)}
            </select>
        );
        if (key === "MeasurementMethod") return <button className="btn btn-secondary no-print" style={{ marginTop: 6, fontSize: "0.76rem", padding: "4px 10px" }} onClick={goTracker}>＋ 표적행동·모니터링 지표 추가하러 가기</button>;
        return null;
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 Be-Able EBP 기반 BIP 초안 받기</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "bip", s: head, b: bip, behaviors })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save(bip)}>💾 저장</button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>아래 양식 칸에 바로 입력하면 인쇄본과 같은 모양으로 나옵니다.</div>
                {bip.Source && <div style={{ fontSize: "0.75rem", color: "#b45309", marginTop: 6 }}>ℹ️ {bip.Source}</div>}
                <AIBox text={ai.text} loading={ai.loading} onApply={apply} />
            </div>
            <div style={sheetBox}><BipSheet s={head} b={bip} behaviors={behaviors} edit={{ set, extra }} /></div>
        </div>
    );
}

// ⑥ 중재 현황·결과 보고서 ────────────────────────────────
export function ProgressStep({ head, bip, setBip, save, behaviors, logs }: {
    head: StudentHead; bip: Bip; setBip: (b: Bip) => void; save: (b: Bip) => Promise<void>; behaviors: any[]; logs: Log[];
}) {
    const pr = parseJson<any>(bip.ProgressReport, {});
    const start = pr.start || bip.PlanStart || "";
    const end = pr.end || today();
    const secs: Record<string, string> = pr.sections || {};
    const setP = (patch: any) => setBip({ ...bip, ProgressReport: JSON.stringify({ ...pr, ...patch }) });
    const [rows, setRows] = useState<BehaviorSummary[]>([]);
    const [ai, setAi] = useState({ loading: false, text: "" });

    useEffect(() => {
        let alive = true;
        const list = behaviors.filter(b => b.Status !== "삭제");
        Promise.all(list.map(b => axios.get(`${API_BASE_URL}/api/v1/target-behaviors/${b.BehaviorID}/chart`, { params: { student_code: head.code } })
            .then(r => r.data).catch(() => null))).then(charts => {
                if (!alive) return;
                setRows(list.map((b, i) => {
                    const c = charts[i] || {};
                    const s = b.BIPStartDate || start;
                    const pts = (c.data_points || []).map((d: any) => ({ d: String(d.Date), v: Number(d.Value) })).filter((p: any) => !isNaN(p.v));
                    const pre = pts.filter((p: any) => s && p.d < s), post = pts.filter((p: any) => (!s || p.d >= s) && p.d <= end);
                    const mean = (a: any[]) => (a.length ? a.reduce((x, p) => x + p.v, 0) / a.length : null);
                    const fid = (c.fidelity_points || []).filter((f: any) => String(f.Date) <= end && (!s || String(f.Date) >= s));
                    return {
                        id: b.BehaviorID, label: b.Definition, type: b.Type, unit: b.MeasurementType, baseline: b.Baseline || "",
                        preMean: mean(pre), preN: pre.length, postMean: mean(post), postN: post.length,
                        fidelity: fid.length ? Math.round(fid.filter((f: any) => String(f.Implemented).toUpperCase() === "O").length / fid.length * 100) : null, fidelityN: fid.length,
                    };
                }));
            });
        return () => { alive = false; };
    }, [behaviors, head.code, start, end]);

    const crisis = useMemo(() => {
        const ds = logs.map(dOf).filter(Boolean);
        const weeks = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (7 * 864e5)));
        if (!start) return { pre: 0, post: ds.length, preWeeks: 0, postWeeks: 0 };
        const span = weeks(start, end);
        const preStart = addDays(start, -span * 7);
        return {
            pre: ds.filter(d => d >= preStart && d < start).length, post: ds.filter(d => d >= start && d <= end).length,
            preWeeks: span, postWeeks: span,
        };
    }, [logs, start, end]);

    const autoText = () => {
        const lines = rows.map(r => `- [${r.type}] ${r.label}: 중재 전 ${r.preN ? Math.round((r.preMean || 0) * 10) / 10 : (r.baseline || "기록 없음")} → 중재 중 ${r.postN ? Math.round((r.postMean || 0) * 10) / 10 : "기록 없음"}(${r.unit}), 실행충실도 ${r.fidelity === null ? "기록 없음" : r.fidelity + "%"}`);
        lines.push(`- 위기행동 기록: 중재 전 같은 기간 ${crisis.pre}건 → 중재 중 ${crisis.post}건`);
        setP({ sections: { ...secs, "중재 실행 현황": lines.join("\n") } });
    };
    const runAI = async () => {
        setAi({ loading: true, text: "" });
        try {
            const ctx = ["[중재 전·후 수치]", ...rows.map(r => `- [${r.type}] ${r.label}: 중재 전 ${r.preN ? Math.round((r.preMean || 0) * 10) / 10 : (r.baseline || "기록 없음")} → 중재 중 ${r.postN ? Math.round((r.postMean || 0) * 10) / 10 : "기록 없음"}(${r.unit}), 실행충실도 ${r.fidelity === null ? "기록 없음" : r.fidelity + "%"}`),
                `- 위기행동 기록: 중재 전 같은 기간 ${crisis.pre}건 → 중재 중 ${crisis.post}건`,
                ...["Hypothesis", "Goals", "PreventionStrategies", "TeachingStrategies", "ReinforcementStrategies", "EvaluationPlan"].map(k => bip[k] ? `${k}: ${bip[k]}` : "")].filter(Boolean).join("\n");
            const r = await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/ai-document-draft`,
                { kind: "progress", context: ctx, start_date: start || undefined, end_date: end }, { timeout: 240000 });
            setAi({ loading: false, text: r.data.analysis || "" });
        } catch (e) { setAi({ loading: false, text: "⚠️ " + err(e) }); }
    };
    const apply = (mode: "empty" | "append") => {
        const parsed = splitNumbered(ai.text, PROGRESS_SECTIONS);
        if (!Object.keys(parsed).length) { alert("AI 결과를 절별로 나누지 못했습니다."); return; }
        setP({ sections: mergeInto(secs, parsed, mode) });
    };
    const printMeta: [string, string][] = [["중재계획명", bip.PlanName || ""], ["보고 기간", `${kDate(start)} ~ ${kDate(end)}`], ["작성일", kDate(pr.date || today())], ["작성자", pr.author || bip.Teacher || ""]];
    const meta: [string, React.ReactNode][] = [
        ["중재계획명", bip.PlanName || ""],
        ["보고 기간", <DateRange key="p" a={start} b={end} onA={v => setP({ start: v })} onB={v => setP({ end: v })} />],
        ["작성일", <Inp key="d" type="date" value={pr.date || today()} onChange={v => setP({ date: v })} />],
        ["작성자", <Inp key="a" value={pr.author ?? bip.Teacher ?? ""} onChange={v => setP({ author: v })} />],
    ];
    const sections: [string, React.ReactNode][] = PROGRESS_SECTIONS.map(t => [t, <Area key={t} value={secs[t] || ""} onChange={v => setP({ sections: { ...secs, [t]: v } })} rows={4} />]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-secondary" onClick={autoText}>📊 수치로 &lsquo;중재 실행 현황&rsquo; 채우기</button>
                    <button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 보고서 초안 받기(실행 현황·종합 의견·향후 계획)</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "progress", s: head, meta: printMeta, sections: PROGRESS_SECTIONS.map(t => [t, secs[t] || ""]), rows, crisis })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, ProgressReport: JSON.stringify({ ...pr, start, end, date: pr.date || today() }) })}>💾 저장</button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>표의 중재 전·후 수치는 ④ 자료에서 자동으로 계산됩니다.</div>
                <AIBox text={ai.text} loading={ai.loading} onApply={apply} />
            </div>
            <div style={sheetBox}><SectionSheet heading="개별학생 행동중재 결과 보고서" s={head} meta={meta} sections={sections} extra={<SummaryTable rows={rows} crisis={crisis} />} /></div>
        </div>
    );
}
