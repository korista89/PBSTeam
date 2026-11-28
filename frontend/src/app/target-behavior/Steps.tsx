"use client";

// 개별학생 행동중재 단계 화면: ② FBA 자료 분석 ③ FBA 결과 보고서 ④ 행동중재계획 ⑤ 모니터링 ⑦ 중재 결과 보고서
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { WeeklyTrendChart, ChangeBanner } from "../components/ProgressCharts";
import { isVacationWeek, schoolYearStart } from "../lib/progress";
import { API_BASE_URL } from "../constants";
import ReadableAIResult from "../components/ReadableAIResult";
import { parseBIPAIResult } from "../utils";
import {
    Bip, FBA_SECTIONS, PROGRESS_SECTIONS, BehaviorSummary, StudentHead, PLAN_KEYS,
    parseJson, splitNumbered, today, kDate, Inp, BankArea, DateRange, BipSheet, SectionSheet, SummaryTable, sheetBox, planInfo, outcomeOf, planFidelity,
} from "./shared";
import DayCalendar from "./DayCalendar";

export const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 };
export const lab: React.CSSProperties = { fontSize: "0.78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 };
export const inp: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem", boxSizing: "border-box", fontFamily: "inherit" };
export const err = (e: any) => e?.response?.data?.detail || e?.message || "요청 실패";

type Log = Record<string, any>;
export const dOf = (l: Log) => String(l["행동발생날짜"] || "").slice(0, 10);
const mondayOf = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const PLAN_WEEKS = 8;  // 새 행동중재계획 기본 기간

// ── 행동중재계획 번호 관리 ─────────────────────────────
// 종결한 계획 목록(숨김 탭 BIP_종결계획)
export function useClosedPlans(code: string, key = 0) {
    const [plans, setPlans] = useState<any[]>([]);
    useEffect(() => {
        let alive = true;
        setPlans([]);
        if (code) axios.get(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(code)}/plans`).then(r => { if (alive) setPlans(r.data?.plans || []); }).catch(() => {});
        return () => { alive = false; };
    }, [code, key]);
    return plans;
}
// 지금 계획을 종결 보관한다(계획 칸·의사결정·결과 보고서·요약표).
export async function archivePlan(code: string, bip: Bip, extra: Record<string, any> = {}) {
    const pr = parseJson<any>(bip.ProgressReport, {});
    const { ProgressReport, FBAReport, StudentCode, _loadError, ...fields } = bip;
    void ProgressReport; void FBAReport; void StudentCode; void _loadError;
    const info = planInfo(bip);
    await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(code)}/plans`, {
        planNo: info.no, planKind: info.kind, label: info.label, outcome: outcomeOf(pr.decision?.choice), PlanName: bip.PlanName || "", PlanStart: bip.PlanStart || "", PlanEnd: bip.PlanEnd || "",
        bip: fields, decision: pr.decision || {}, report: { start: pr.start, end: pr.end, date: pr.date, author: pr.author, sections: pr.sections || {} },
        fidelity: planFidelity(bip, bip.PlanStart, bip.PlanEnd).text, ...extra,
    });
}
// 다음 계획: 지금 계획 칸을 그대로 옮겨 시작점으로 쓰고, 의사결정·결과 보고서는 비운다.
export function nextPlan(bip: Bip, kind: "" | "일반화"): Bip {
    const pr = parseJson<any>(bip.ProgressReport, {});
    const keep = Object.fromEntries(Object.entries(pr).filter(([k]) => !PLAN_KEYS.includes(k)));
    const start = today();
    return {
        ...bip, Source: "", AuthoredDate: start, PlanStart: start, PlanEnd: addDays(start, PLAN_WEEKS * 7 - 1),
        PlanName: kind === "일반화" && !/일반화/.test(bip.PlanName || "") ? `${bip.PlanName || ""} 일반화`.trim() : bip.PlanName || "",
        ProgressReport: JSON.stringify({ ...keep, planNo: planInfo(bip).no + 1, planKind: kind }),
    };
}

// ⑤ 행동중재계획 실행충실도: 날마다 O(계획대로 함)·X(못 함). ProgressReport.fidelity.days에 저장한다.
export function PlanFidelity({ bip, save }: { bip: Bip; save: (b: Bip) => Promise<void> }) {
    const pr = parseJson<any>(bip.ProgressReport, {});
    const marks: Record<string, string> = useMemo(() => pr.fidelity?.days || {}, [bip.ProgressReport]);  // eslint-disable-line react-hooks/exhaustive-deps
    const info = planInfo(bip), f = planFidelity(bip, bip.PlanStart, bip.PlanEnd);
    const apply = async (next: Record<string, string>) => save({ ...bip, ProgressReport: JSON.stringify({ ...pr, fidelity: { days: next } }) });
    return (
        <div style={card}>
            <div style={{ fontWeight: 800, fontSize: "0.92rem" }}>📝 행동중재계획 실행충실도 <span style={{ fontWeight: 500, color: "#64748b", fontSize: "0.78rem" }}>{info.label}{bip.PlanStart ? ` · ${kDate(bip.PlanStart)} ~ ${kDate(bip.PlanEnd)}` : ""}</span></div>
            <div style={{ fontSize: "0.8rem", color: "#475569", margin: "4px 0 10px" }}>
                그날 계획(예방·교수·강화·위기대응)을 계획대로 했으면 <b style={{ color: "#1d4ed8" }}>O</b>, 못 했으면 <b style={{ color: "#b91c1c" }}>X</b>.
                {f.n ? <> 이 계획 기간 <b>{f.n}일 중 {f.o}일 실행({f.pct}%)</b>{f.pct !== null && f.pct < 80 ? " — 80% 미만이면 효과 판단 전에 실행부터 점검합니다." : ""}</> : " 아직 기록이 없습니다."}
            </div>
            <DayCalendar marks={marks} cycle={["", "O", "X"]} range={[bip.PlanStart || "", bip.PlanEnd || ""]} onApply={apply} legend={<>파란 테두리는 지금 계획 기간입니다. 반영하면 화면의 다른 바뀐 내용도 함께 저장됩니다.</>} />
        </div>
    );
}

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
export type ApplyMode = "empty" | "append" | "replace";
export function mergeInto(base: Record<string, string>, add: Record<string, string>, mode: ApplyMode) {
    const next = { ...base };
    for (const [k, v] of Object.entries(add)) {
        if (!v) continue;
        const cur = (next[k] || "").trim();
        if (!cur || mode === "replace") next[k] = v;
        else if (mode === "append") next[k] = `${cur}\n\n${v}`;
    }
    return next;
}

export function AIBox({ text, loading, onApply, canReplace }: { text: string; loading: boolean; onApply?: (mode: ApplyMode) => void; canReplace?: boolean }) {
    if (loading) return <div style={{ padding: 16, color: "#7c3aed", fontWeight: 700, fontSize: "0.85rem" }}>⏳ AI가 자료를 분석하고 있습니다… (1~2분)</div>;
    if (!text) return null;
    return (
        <div style={{ marginTop: 10, background: "#faf9ff", border: "1px solid #ede9fe", borderRadius: 10, padding: 14 }}>
            {onApply && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <button className="btn btn-primary" onClick={() => onApply("empty")}>✅ 빈 칸에만 반영</button>
                    <button className="btn btn-secondary" onClick={() => onApply("append")}>➕ 모든 칸 뒤에 덧붙이기</button>
                    {canReplace && <button className="btn btn-secondary" onClick={() => confirm("지금 칸 내용을 모두 지우고 AI 결과로 바꿉니다. 저장하기 전에는 페이지를 새로 고치면 원래대로 돌아갑니다. 바꿀까요?") && onApply("replace")}>🔄 AI 결과로 모두 바꾸기</button>}
                    <span style={{ fontSize: "0.75rem", color: "#64748b", alignSelf: "center" }}>반영 뒤 고치고 &lsquo;저장&rsquo;을 눌러야 남습니다.</span>
                </div>
            )}
            <div style={{ maxHeight: 420, overflowY: "auto", fontSize: "0.85rem" }}><ReadableAIResult text={text} /></div>
        </div>
    );
}

// 위기행동 기록을 주별 건수로(최근 80주, 방학 주 제외)
function weeklyCounts(logs: Log[]) {
    const m = new Map<string, number>();
    logs.forEach(l => { const d = dOf(l); if (d) { const w = mondayOf(d); m.set(w, (m.get(w) || 0) + 1); } });
    const keys = [...m.keys()].sort();
    if (!keys.length) return [];
    const last = mondayOf(today());
    const from = keys[0] > addDays(last, -7 * 79) ? keys[0] : addDays(last, -7 * 79);
    const out: { week: string; count: number }[] = [];
    for (let w = from; w <= last; w = addDays(w, 7)) if (!isVacationWeek(w)) out.push({ week: w, count: m.get(w) || 0 });
    return out;
}

// ④ 모니터링 기본: 위기행동 기록(자동). 표적행동·지표 추가 없이도 Tier3 운영·보고가 가능하다.
export function CrisisMonitor({ logs, planStart }: { logs: Log[]; planStart: string }) {
    const weekly = useMemo(() => weeklyCounts(logs), [logs]);
    const t = today(), recent = logs.filter(l => dOf(l) > addDays(t, -56)).length;
    return (
        <div style={card}>
            <div style={{ fontWeight: 800, fontSize: "0.92rem" }}>🚨 위기행동 모니터링 <span style={{ fontWeight: 500, color: "#64748b", fontSize: "0.78rem" }}>(기본·자동 — 행동기록 탭에 입력한 위기행동이 그대로 쌓입니다)</span></div>
            <div style={{ fontSize: "0.8rem", color: "#475569", margin: "4px 0 8px" }}>누적 {logs.length}건 · 최근 8주 {recent}건{planStart ? ` · 중재 시작 ${kDate(planStart)}` : ""}. 이 자료만으로도 ⑥ 의사결정과 ⑦ 결과 보고서를 쓸 수 있습니다. 대체행동·과제 수행 같은 <b>추가 지표는 필요할 때만</b> 아래에서 더하세요.</div>
            {weekly.length === 0 ? <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>아직 위기행동 기록이 없습니다.</div> : (
                <>
                    <ChangeBanner weekly={weekly} />
                    <div style={{ marginTop: 8 }}><WeeklyTrendChart weekly={weekly} planStart={planStart || undefined} height={220} /></div>
                </>
            )}
        </div>
    );
}

// ② FBA 자료 분석 ───────────────────────────────────────
export function DataStep({ studentCode, logs, planStart }: { studentCode: string; logs: Log[]; planStart: string }) {
    const [ev, setEv] = useState<any>(null);
    useEffect(() => {
        let alive = true;
        setEv(null);
        if (!studentCode) return;
        axios.get(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(studentCode)}/fba-evidence`).then(r => { if (alive) setEv(r.data); }).catch(() => { if (alive) setEv(null); });
        return () => { alive = false; };
    }, [studentCode]);
    const weekly = useMemo(() => weeklyCounts(logs), [logs]);
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
            <YearLogs logs={logs} />
        </div>
    );
}

// 올해(3월~) 이 학생 행동 기록 원자료: 눌러서 펼친다(최근 순). 화면에 이미 불러온 기록만 쓰므로 시트를 더 읽지 않는다.
function YearLogs({ logs }: { logs: Log[] }) {
    const start = schoolYearStart(today());
    const rows = useMemo(() => logs.filter(l => dOf(l) >= start).sort((a, b) => (dOf(b) + String(b["시간대"] || "")).localeCompare(dOf(a) + String(a["시간대"] || ""))), [logs, start]);
    const v = (l: Log, k: string) => String(l[k] ?? "").trim();
    const th: React.CSSProperties = { padding: "6px 8px", background: "#f1f5f9", fontWeight: 700, textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" };
    const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };
    return (
        <details style={card}>
            <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: "0.88rem" }}>📋 올해 행동 기록 보기 <span style={{ fontWeight: 500, color: "#64748b" }}>({kDate(start)}부터 {rows.length}건, 최근 순)</span></summary>
            {rows.length === 0 ? <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: 10 }}>올해 입력된 행동 기록이 없습니다.</div> : (
                <div style={{ overflowX: "auto", marginTop: 10 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                        <thead><tr>{["날짜", "시간대·장소", "행동", "강도", "횟수", "기능", "배경·선행 → 후속", "조치", "특기사항", "입력"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>{rows.map((l, i) => (
                            <tr key={v(l, "Log_ID") || i}>
                                <td style={{ ...td, whiteSpace: "nowrap" }}>{kDate(dOf(l))}</td>
                                <td style={td}>{[v(l, "시간대"), v(l, "장소")].filter(Boolean).join(" · ")}</td>
                                <td style={td}>{v(l, "행동유형")}</td>
                                <td style={{ ...td, textAlign: "center" }}>{v(l, "강도").charAt(0)}</td>
                                <td style={{ ...td, textAlign: "center" }}>{v(l, "발생횟수")}</td>
                                <td style={td}>{v(l, "기능")}</td>
                                <td style={td}>{[[v(l, "배경사건"), v(l, "선행사건")].filter(Boolean).join(" / "), v(l, "후속결과")].filter(Boolean).join(" → ")}</td>
                                <td style={td}>{[v(l, "결과"), v(l, "물리적제지여부") && v(l, "물리적제지여부") !== "X" ? `제지: ${v(l, "제지유형_원문") || v(l, "물리적제지여부")}` : ""].filter(Boolean).join(" · ")}</td>
                                <td style={{ ...td, minWidth: 220, whiteSpace: "pre-wrap" }}>{v(l, "특기사항")}</td>
                                <td style={{ ...td, whiteSpace: "nowrap", color: "#64748b" }}>{v(l, "입력교사명")}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
        </details>
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
    const apply = (mode: ApplyMode) => {
        const parsed = splitNumbered(ai.text, FBA_SECTIONS);
        if (!Object.keys(parsed).length) { alert("AI 결과를 절별로 나누지 못했습니다. 필요한 부분을 복사해 넣어 주세요."); return; }
        setF({ sections: mergeInto(secs, parsed, mode) });
    };
    const toBip = () => {
        const h = (secs["기능 가설"] || "").trim();
        if (!h) { alert("'기능 가설' 칸이 비어 있습니다."); return; }
        const cur = (bip.Hypothesis || "").trim();
        setBip({ ...bip, Hypothesis: cur ? `${cur}\n\n[FBA 결과] ${h}` : h });
        alert("행동중재계획의 '기능평가 결과' 칸에 넣었습니다. ④ 행동중재계획에서 확인 후 저장하세요.");
    };
    const printMeta: [string, string][] = [["평가 기간", fba.start ? `${kDate(fba.start)} ~ ${kDate(fba.end)}` : ""], ["작성일", kDate(fba.date)], ["작성자", fba.author || ""]];
    const meta: [string, React.ReactNode][] = [
        ["평가 기간", <DateRange key="p" a={fba.start || ""} b={fba.end || ""} onA={v => setF({ start: v })} onB={v => setF({ end: v })} />],
        ["작성일", <Inp key="d" type="date" value={fba.date || today()} onChange={v => setF({ date: v })} />],
        ["작성자", <Inp key="a" value={fba.author || ""} onChange={v => setF({ author: v })} />],
    ];
    const sections: [string, React.ReactNode][] = FBA_SECTIONS.map((t, i) => [`${i + 1}. ${t}`, <BankArea key={t} bank={`fba:${t}`} value={secs[t] || ""} onChange={v => setSec(t, v)} rows={4} />]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 지금까지 자료로 FBA 초안 받기</button>
                    <button className="btn btn-secondary" onClick={toBip}>➡️ 기능 가설을 BIP에 반영</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "fba", s: head, meta: printMeta, sections: FBA_SECTIONS.map(t => [t, secs[t] || ""]), limit: 1 })}>🖨️ 미리보기·인쇄</button>
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
    const info = planInfo(bip);
    const plans = useClosedPlans(head.code, info.no + (info.closed ? 0.5 : 0));
    const newPlan = () => confirm(`${info.label}의 내용을 옮겨 행동중재계획${info.no + 1}을 만듭니다(기간 오늘부터 ${PLAN_WEEKS}주). 만들까요?`) && save(nextPlan(bip, ""));
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
    const apply = (mode: ApplyMode) => {
        const parsed = parseBIPAIResult(ai.text);
        delete parsed.MedicationStatus; // 약물 정보는 교사 입력만 쓴다
        if (parsed.TargetBehavior) { parsed.OperationalDefinition = parsed.TargetBehavior; delete parsed.TargetBehavior; }
        // 학교 양식에는 평가 계획·기타 칸이 없어 '추가 지원 사항'으로 모은다
        const extraTxt = [parsed.EvaluationPlan && `기록·평가: ${parsed.EvaluationPlan}`, parsed.OtherConsiderations].filter(Boolean).join("\n");
        delete parsed.EvaluationPlan; delete parsed.OtherConsiderations;
        if (extraTxt) parsed.AdditionalSupport = extraTxt;
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
            <div style={{ ...card, background: info.closed ? "#f8fafc" : "#eef2ff", border: "1px solid #c7d2fe" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: "0.85rem" }}>
                    <span>📌 지금 계획: <b>{info.label}</b>{info.closed && <b style={{ color: "#b91c1c" }}> — 종결됨</b>}</span>
                    <span>· 기간 {bip.PlanStart ? `${kDate(bip.PlanStart)} ~ ${kDate(bip.PlanEnd) || "미정"}` : "미정"}</span>
                    {!info.closed && <button className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.76rem" }} onClick={() => setBip({ ...bip, PlanStart: bip.PlanStart || today(), PlanEnd: addDays(bip.PlanStart || today(), PLAN_WEEKS * 7 - 1) })}>시작일부터 {PLAN_WEEKS}주로</button>}
                    {info.closed && <button className="btn btn-primary" style={{ padding: "3px 10px", fontSize: "0.76rem" }} onClick={newPlan}>➕ 행동중재계획{info.no + 1} 만들기</button>}
                </div>
                <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 4 }}>⑥ 의사결정에서 유지는 기간 연장, 수정·일반화는 ⑦ 결과 보고서 뒤 다음 계획 만들기로 이어집니다.</div>
                {plans.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {plans.map(p => (
                            <div key={p.planNo} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "0.8rem", background: "#fff", borderRadius: 8, padding: "5px 10px" }}>
                                <b>{p.label || `행동중재계획${p.planNo}`}</b>
                                <span>{kDate(p.PlanStart)} ~ {kDate(p.PlanEnd)}</span>
                                <span style={{ color: "#64748b" }}>결정: {p.outcome || "-"} · 종결 {String(p.closedAt || "").slice(0, 10)}</span>
                                <button className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.72rem" }} onClick={() => openPrint({ doc: "bip", s: head, b: p.bip || {}, behaviors })}>🖨️ 계획</button>
                                {Object.values(p.report?.sections || {}).some(Boolean) && <button className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.72rem" }} onClick={() => openPrint({ doc: "progress", s: head, meta: [["중재계획명", `${p.label || ""} ${p.PlanName || ""}`.trim()], ["보고 기간", `${kDate(p.report?.start)} ~ ${kDate(p.report?.end)}`], ["작성일", kDate(p.report?.date)], ["작성자", p.report?.author || ""]], sections: PROGRESS_SECTIONS.map(t => [t, p.report?.sections?.[t] || ""]), rows: p.rows || [], crisis: p.crisis || { pre: 0, post: 0 }, limit: 1 })}>🖨️ 결과 보고서</button>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div style={sheetBox}><BipSheet s={head} b={bip} behaviors={behaviors} edit={{ set, extra }} /></div>
        </div>
    );
}

// ⑦ 중재 결과 보고서 ────────────────────────────────
// 표적행동별 중재 전·중 평균과 실행충실도(⑦ 결과 보고서·⑧ 인수인계가 함께 쓴다)
export async function fetchBehaviorSummaries(code: string, behaviors: any[], start: string, end: string): Promise<BehaviorSummary[]> {
    const list = behaviors.filter(b => b.Status !== "삭제");
    const charts = await Promise.all(list.map(b => axios.get(`${API_BASE_URL}/api/v1/target-behaviors/${b.BehaviorID}/chart`, { params: { student_code: code } })
        .then(r => r.data).catch(() => null)));
    return list.map((b, i) => {
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
            recentMean: mean(post.slice(-4)),
        };
    });
}

export function ProgressStep({ head, bip, setBip, save, behaviors, logs, goStep }: {
    head: StudentHead; bip: Bip; setBip: (b: Bip) => void; save: (b: Bip) => Promise<void>; behaviors: any[]; logs: Log[]; goStep: (k: string) => void;
}) {
    const pr = parseJson<any>(bip.ProgressReport, {});
    const info = planInfo(bip);
    const outcome = outcomeOf(pr.decision?.choice);
    // 보고 기간 기본값 = 이 계획 기간(끝 날짜가 아직 안 왔으면 오늘까지)
    const start = pr.start || bip.PlanStart || "";
    const end = pr.end || (bip.PlanEnd && bip.PlanEnd < today() ? bip.PlanEnd : today());
    const secs: Record<string, string> = pr.sections || {};
    const setP = (patch: any) => setBip({ ...bip, ProgressReport: JSON.stringify({ ...pr, ...patch }) });
    const [rows, setRows] = useState<BehaviorSummary[]>([]);
    const [ai, setAi] = useState({ loading: false, text: "" });

    useEffect(() => {
        let alive = true;
        fetchBehaviorSummaries(head.code, behaviors, start, end).then(r => { if (alive) setRows(r); });
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

    // 수치 줄(AI 없이 계산). '초안 받기'를 누르면 '중재 실행 현황'이 비어 있을 때 먼저 이것으로 채운다.
    const fid = planFidelity(bip, start, end);
    const numberLines = () => [
        ...rows.map(r => `- [${r.type}] ${r.label}: 중재 전 ${r.preN ? Math.round((r.preMean || 0) * 10) / 10 : (r.baseline || "기록 없음")} → 중재 중 ${r.postN ? Math.round((r.postMean || 0) * 10) / 10 : "기록 없음"}(${r.unit}), 실행충실도 ${r.fidelity === null ? "기록 없음" : r.fidelity + "%"}`),
        `- 위기행동 기록: 중재 전 같은 기간 ${crisis.pre}건 → 중재 중 ${crisis.post}건`,
        ...(fid.text ? [`- ${fid.text}`] : []),
    ];
    const runAI = async () => {
        setP({ sections: mergeInto(secs, { "중재 실행 현황": numberLines().join("\n") }, "empty") });
        setAi({ loading: true, text: "" });
        try {
            const ctx = [`[보고 대상] ${info.label} ${bip.PlanName || ""} (${kDate(start)} ~ ${kDate(end)})`, pr.decision?.choice ? `[의사결정] ${pr.decision.choice} — ${pr.decision.rationale || ""}` : "",
                "[중재 전·후 수치]", ...numberLines(),
                ...["Antecedents", "Consequences", "Hypothesis", "Goals", "PreventionStrategies", "TeachingStrategies", "ReinforcementStrategies", "AdditionalSupport", "EvaluationPlan"].map(k => bip[k] ? `${k}: ${bip[k]}` : "")].filter(Boolean).join("\n");
            const r = await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/ai-document-draft`,
                { kind: "progress", context: ctx, start_date: start || undefined, end_date: end }, { timeout: 240000 });
            setAi({ loading: false, text: r.data.analysis || "" });
        } catch (e) { setAi({ loading: false, text: "⚠️ " + err(e) }); }
    };
    const apply = (mode: ApplyMode) => {
        const parsed = splitNumbered(ai.text, PROGRESS_SECTIONS);
        if (!Object.keys(parsed).length) { alert("AI 결과를 절별로 나누지 못했습니다."); return; }
        setP({ sections: mergeInto(secs, parsed, mode) });
    };
    const planName = `${info.label} ${bip.PlanName || ""}`.trim();
    // 계획 마무리: 종결은 보관만, 수정·일반화는 보관 뒤 다음 계획을 만들어 ④로 간다.
    const [closing, setClosing] = useState(false);
    const finish = async () => {
        const next = outcome === "수정" || outcome === "일반화";
        if (!confirm(next ? `${info.label}을 종결 보관하고, 내용을 옮겨 행동중재계획${info.no + 1}${outcome === "일반화" ? "(일반화)" : ""}을 만듭니다. 결과 보고서를 먼저 저장했는지 확인해 주세요. 진행할까요?`
            : `${info.label}을 종결 보관합니다. 결과 보고서를 먼저 저장했는지 확인해 주세요. 진행할까요?`)) return;
        setClosing(true);
        try {
            const cur = { ...bip, ProgressReport: JSON.stringify({ ...pr, start, end, date: pr.date || today() }) };
            await archivePlan(head.code, cur, { rows, crisis });
            if (next) { await save(nextPlan(cur, outcome === "일반화" ? "일반화" : "")); goStep("bip"); }
            else await save({ ...cur, ProgressReport: JSON.stringify({ ...parseJson<any>(cur.ProgressReport, {}), planStatus: "종결" }) });
        } catch (e) { alert("종결하지 못했습니다: " + err(e)); }
        finally { setClosing(false); }
    };
    const printMeta: [string, string][] = [["중재계획명", planName], ["보고 기간", `${kDate(start)} ~ ${kDate(end)}`], ["작성일", kDate(pr.date || today())], ["작성자", pr.author || bip.Teacher || ""]];
    const meta: [string, React.ReactNode][] = [
        ["중재계획명", planName],
        ["보고 기간", <DateRange key="p" a={start} b={end} onA={v => setP({ start: v })} onB={v => setP({ end: v })} />],
        ["작성일", <Inp key="d" type="date" value={pr.date || today()} onChange={v => setP({ date: v })} />],
        ["작성자", <Inp key="a" value={pr.author ?? bip.Teacher ?? ""} onChange={v => setP({ author: v })} />],
    ];
    const sections: [string, React.ReactNode][] = PROGRESS_SECTIONS.map(t => [t, <BankArea key={t} bank={`progress:${t}`} value={secs[t] || ""} onChange={v => setP({ sections: { ...secs, [t]: v } })} rows={4} />]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 보고서 초안 받기(실행 현황·종합 의견·향후 계획)</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "progress", s: head, meta: printMeta, sections: PROGRESS_SECTIONS.map(t => [t, secs[t] || ""]), rows, crisis, limit: 1 })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, ProgressReport: JSON.stringify({ ...pr, start, end, date: pr.date || today() }) })}>💾 저장</button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>{planName} 보고서입니다. 표의 수치는 ⑤ 모니터링 자료로 계산하고, &lsquo;중재 실행 현황&rsquo;이 비어 있으면 초안을 받을 때 수치로 먼저 채웁니다.</div>
                <AIBox text={ai.text} loading={ai.loading} onApply={apply} />
            </div>
            {!info.closed && (outcome === "종결" || outcome === "수정" || outcome === "일반화") && (
                <div style={{ ...card, border: "1px solid #fca5a5", background: "#fff7f7", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ flex: 1, minWidth: 220, fontSize: "0.84rem" }}>⑥ 의사결정: <b>{outcome}</b>. 보고서를 저장한 뒤 계획을 마무리하세요.</span>
                    <button className="btn btn-primary" onClick={finish} disabled={closing}>{closing ? "처리 중…" : outcome === "종결" ? `🏁 ${info.label} 종결` : `🏁 ${info.label} 종결하고 행동중재계획${info.no + 1}${outcome === "일반화" ? "(일반화)" : ""} 만들기`}</button>
                </div>
            )}
            <div style={sheetBox}><SectionSheet heading="개별학생 행동중재 결과 보고서" s={head} meta={meta} sections={sections} extra={<SummaryTable rows={rows} crisis={crisis} />} /></div>
        </div>
    );
}
