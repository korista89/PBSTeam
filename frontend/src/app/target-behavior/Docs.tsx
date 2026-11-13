"use client";

// ⑤ 데이터 기반 의사결정, ⑥ 의료협력의뢰서·추가지원신청서.
// 따로 시트 칸을 만들지 않고 BIP 행의 ProgressReport JSON 안(decision·medical·support)에 함께 저장한다.
import React, { useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import MeetingNotesSection from "./MeetingNotes";
import { Bip, StudentHead, parseJson, splitNumbered, today, kDate, Inp, Area, Sel, SectionSheet, sheetBox } from "./shared";
import { AIBox, AutoArea, card, dOf, err, mergeInto, openPrint } from "./Steps";

type Log = Record<string, any>;

function useStore(bip: Bip, setBip: (b: Bip) => void, key: string) {
    const pr = parseJson<any>(bip.ProgressReport, {});
    const cur: Record<string, string> = pr[key] || {};
    const set = (patch: Record<string, string>) => setBip({ ...bip, ProgressReport: JSON.stringify({ ...pr, [key]: { ...cur, ...patch } }) });
    return { cur, set };
}

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// 위기행동 기록·표적행동 요약을 글로 만든다(의사결정·의뢰서 공통 근거).
function dataSummary(logs: Log[], behaviors: any[], planStart: string) {
    const ds = logs.map(dOf).filter(Boolean);
    const t = today(), r8 = addDays(t, -56), r16 = addDays(t, -112);
    const recent = ds.filter(d => d > r8).length, before = ds.filter(d => d > r16 && d <= r8).length;
    const lines = [`- 위기행동 기록: 전체 ${ds.length}건, 최근 8주 ${recent}건(직전 8주 ${before}건)`];
    behaviors.filter(b => b.Status !== "삭제").forEach(b => lines.push(`- [${b.Type}] ${b.Definition} — ${b.MeasurementType} 기록${b.Baseline ? `, 기저선 ${b.Baseline}` : ""}`));
    if (planStart) lines.push(`- 중재 시작: ${kDate(planStart)}`);
    return lines.join("\n");
}

// ⑤ 데이터 기반 의사결정 ─────────────────────────────────
const CHOICES = [
    "현재 중재 유지(자료 더 모음)", "중재 전략 수정", "의료협력 의뢰 검토", "추가 지원 신청 검토",
    "Tier2로 하향 검토", "Tier3+ 상향 검토", "중재 종료(목표 달성)",
];

export function DecisionStep({ head, bip, setBip, save, logs, behaviors }: {
    head: StudentHead; bip: Bip; setBip: (b: Bip) => void; save: (b: Bip) => Promise<void>; logs: Log[]; behaviors: any[];
}) {
    const { cur, set } = useStore(bip, setBip, "decision");
    const [ai, setAi] = useState({ loading: false, text: "" });
    const summary = useMemo(() => dataSummary(logs, behaviors, bip.PlanStart || ""), [logs, behaviors, bip.PlanStart]);
    const runAI = async () => {
        setAi({ loading: true, text: "" });
        try {
            const r = await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/ai-decision-recommendation`,
                { start_date: bip.PlanStart || undefined, end_date: today() }, { timeout: 240000 });
            setAi({ loading: false, text: r.data.analysis || "" });
        } catch (e) { setAi({ loading: false, text: "⚠️ " + err(e) }); }
    };
    const apply = (mode: "empty" | "append") => set(mergeInto(cur, { rationale: ai.text.replace(/\*\*/g, "") }, mode));
    // 개별화교육지원팀 협의회 전 협의록 초안: 지금까지 자료 + 지난 협의 기록 + 고른 결정으로 미리 채운다
    const [minutes, setMinutes] = useState({ loading: false, text: "" });
    const [notesKey, setNotesKey] = useState(0);
    const runMinutes = async () => {
        setMinutes({ loading: true, text: "" });
        try {
            const r = await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/ai-team-minutes-draft`,
                { start_date: bip.PlanStart || undefined, end_date: today(), summary, choice: cur.choice || "" }, { timeout: 240000 });
            setMinutes({ loading: false, text: r.data.draft || "" });
        } catch (e) { setMinutes({ loading: false, text: "⚠️ " + err(e) }); }
    };
    const saveMinutes = async () => {
        try {
            await axios.post(`${API_BASE_URL}/api/v1/meeting-notes`, { meeting_type: "tier3", date: today(), content: minutes.text, author: cur.author ?? bip.Teacher ?? "", student_code: head.code });
            setMinutes({ loading: false, text: "" }); setNotesKey(k => k + 1);
            alert("이 학생 사례 협의 기록에 저장했습니다.");
        } catch (e) { alert("저장 실패: " + err(e)); }
    };
    const printMeta: [string, string][] = [["결정일", kDate(cur.date || today())], ["다음 점검일", kDate(cur.nextReview || "")], ["작성자", cur.author ?? bip.Teacher ?? ""]];
    const printSections: [string, string][] = [["자료 요약", summary], ["결정", cur.choice || ""], ["판단 근거", cur.rationale || ""], ["후속 조치", cur.actions || ""]];
    const meta: [string, React.ReactNode][] = [
        ["결정일", <Inp key="d" type="date" value={cur.date || today()} onChange={v => set({ date: v })} />],
        ["다음 점검일", <Inp key="n" type="date" value={cur.nextReview || ""} onChange={v => set({ nextReview: v })} />],
        ["작성자", <Inp key="a" value={cur.author ?? bip.Teacher ?? ""} onChange={v => set({ author: v })} />],
    ];
    const sections: [string, React.ReactNode][] = [
        ["자료 요약\n(자동)", <div key="s" style={{ whiteSpace: "pre-wrap" }}>{summary}</div>],
        ["결정", <Sel key="c" value={cur.choice || ""} onChange={v => set({ choice: v })} options={CHOICES} />],
        ["판단 근거", <Area key="r" value={cur.rationale || ""} onChange={v => set({ rationale: v })} placeholder="자료의 어느 수치를 보고 결정했는지" rows={4} />],
        ["후속 조치", <Area key="x" value={cur.actions || ""} onChange={v => set({ actions: v })} placeholder="누가·언제·무엇을" rows={3} />],
    ];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 의사결정 의견 초안 받기(판단 근거)</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "sections", heading: "데이터 기반 의사결정 기록", s: head, meta: printMeta, sections: printSections })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, ProgressReport: JSON.stringify({ ...parseJson<any>(bip.ProgressReport, {}), decision: { ...cur, date: cur.date || today(), author: cur.author ?? bip.Teacher ?? "" } }) })}>💾 저장</button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>④ 모니터링 차트와 함께 보고 판단하세요. 2주 이상 개선이 없으면 전략 수정, 4주 연속 목표 달성이면 하향·종료를 검토합니다.</div>
                <AIBox text={ai.text} loading={ai.loading} onApply={apply} />
            </div>
            <div style={sheetBox}><SectionSheet heading="데이터 기반 의사결정 기록" s={head} meta={meta} sections={sections} /></div>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <b style={{ flex: 1, minWidth: 200 }}>🤝 개별화교육지원팀 협의록 초안 <span style={{ fontWeight: 500, fontSize: "0.78rem", color: "#64748b" }}>협의회 전에 지금까지 자료로 안건·현황·결정(안)을 미리 채웁니다</span></b>
                    <button className="btn btn-ai" onClick={runMinutes} disabled={minutes.loading}>{minutes.loading ? "초안 작성 중..." : "✨ 협의록 초안 만들기"}</button>
                </div>
                {minutes.text && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        <AutoArea value={minutes.text} onChange={v => setMinutes({ loading: false, text: v })} rows={12} />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-primary" onClick={saveMinutes}>💾 사례 협의 기록에 저장</button>
                            <button className="btn btn-secondary" onClick={() => openPrint({ doc: "sections", heading: "개별화교육지원팀 협의록", s: head, meta: [["협의일", kDate(today())]], sections: [["협의 내용", minutes.text]] })}>🖨️ 미리보기·인쇄</button>
                        </div>
                    </div>
                )}
            </div>
            <MeetingNotesSection key={notesKey} apiUrl={API_BASE_URL} meetingType="tier3" title="이 학생 사례 협의 기록 (누적)" studentCode={head.code} />
        </div>
    );
}

// ⑥ 의료협력의뢰서 · 추가지원신청서 ───────────────────────
const DOCS = {
    medical: {
        label: "의료협력의뢰서", heading: "의료협력 의뢰서", key: "medical",
        meta: [["의뢰 기관·의사", "org"], ["의뢰일", "date"], ["작성자", "author"], ["보호자 동의", "consent"]] as [string, string][],
        sections: [
            ["의뢰 사유", "reason", "예: 중재 8주 후에도 자해 행동이 줄지 않아 약물·건강 요인 점검이 필요함"],
            ["행동 요약", "behavior", ""],
            ["지금까지의 중재와 반응", "interventions", "시행한 예방·교수·강화 전략과 효과, 실행충실도"],
            ["복용 약물·건강 상태", "health", "복용 약물, 수면·식사·통증·발작 등 관찰 내용"],
            ["의료진께 요청하는 사항", "request", "예: 약물 조정 필요성 검토, 통증·수면 문제 확인, 학교에서 주의할 점 안내"],
        ] as [string, string, string][],
    },
    support: {
        label: "추가지원신청서", heading: "추가 지원 신청서", key: "support",
        meta: [["신청 대상", "to"], ["신청일", "date"], ["작성자", "author"], ["지원 기간", "period"]] as [string, string][],
        sections: [
            ["신청 사유", "reason", "예: 학급 인력만으로는 위기 상황 안전 확보가 어려움"],
            ["행동 요약", "behavior", ""],
            ["지금까지의 중재와 결과", "interventions", "시행한 중재와 효과, 한계"],
            ["필요한 지원 내용", "need", "예: 지원 인력 배치, 안정실 이용, 외부 전문가 자문, 교구·예산"],
            ["기대 효과와 평가 방법", "effect", "어떤 수치가 어떻게 달라지면 지원을 줄이거나 끝낼지"],
        ] as [string, string, string][],
    },
};

export function ReferralStep({ head, bip, setBip, save, logs, behaviors }: {
    head: StudentHead; bip: Bip; setBip: (b: Bip) => void; save: (b: Bip) => Promise<void>; logs: Log[]; behaviors: any[];
}) {
    const [kind, setKind] = useState<"medical" | "support">("medical");
    const [ai, setAi] = useState({ loading: false, text: "" });
    const d = DOCS[kind];
    const { cur, set } = useStore(bip, setBip, d.key);
    const titles = d.sections.map(x => x[0]);
    const fill = () => {
        const patch: Record<string, string> = { behavior: dataSummary(logs, behaviors, bip.PlanStart || "") };
        if (kind === "medical" && bip.MedicationStatus) patch.health = bip.MedicationStatus;
        set(mergeInto(cur, patch, "empty"));
    };
    const runAI = async () => {
        setAi({ loading: true, text: "" });
        const decision = parseJson<any>(bip.ProgressReport, {}).decision || {};
        const ctx = [dataSummary(logs, behaviors, bip.PlanStart || ""),
            ...["Hypothesis", "Goals", "PreventionStrategies", "TeachingStrategies", "ReinforcementStrategies", "MedicationStatus", "EvaluationPlan"].map(k => bip[k] ? `${k}: ${bip[k]}` : ""),
            decision.choice ? `의사결정: ${decision.choice} — ${decision.rationale || ""}` : ""].filter(Boolean).join("\n");
        try {
            const r = await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/ai-document-draft`,
                { kind, context: ctx, start_date: bip.PlanStart || undefined, end_date: today() }, { timeout: 240000 });
            setAi({ loading: false, text: r.data.analysis || "" });
        } catch (e) { setAi({ loading: false, text: "⚠️ " + err(e) }); }
    };
    const apply = (mode: "empty" | "append") => {
        const parsed = splitNumbered(ai.text, titles);
        if (!Object.keys(parsed).length) { alert("AI 결과를 절별로 나누지 못했습니다."); return; }
        const patch: Record<string, string> = {};
        d.sections.forEach(([t, f]) => { if (parsed[t]) patch[f] = parsed[t]; });
        set(mergeInto(cur, patch, mode));
    };
    const dateVal = cur.date || today();
    const printMeta: [string, string][] = d.meta.map(([k, f]) => [k, f === "date" ? kDate(dateVal) : cur[f] ?? (f === "author" ? bip.Teacher || "" : "")]);
    const printSections: [string, string][] = d.sections.map(([k, f]) => [k, cur[f] || ""]);
    const meta: [string, React.ReactNode][] = d.meta.map(([k, f]) => [k,
        <Inp key={f} type={f === "date" ? "date" : "text"} value={f === "date" ? dateVal : cur[f] ?? (f === "author" ? bip.Teacher || "" : "")} onChange={v => set({ [f]: v })} />]);
    const sections: [string, React.ReactNode][] = d.sections.map(([t, f, ph]) => [t, <Area key={f} value={cur[f] || ""} onChange={v => set({ [f]: v })} placeholder={ph} rows={4} />]);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 6 }}>
                {(Object.keys(DOCS) as ("medical" | "support")[]).map(k => (
                    <button key={k} onClick={() => { setKind(k); setAi({ loading: false, text: "" }); }} style={{ padding: "7px 14px", borderRadius: 8, fontWeight: 800, fontSize: "0.83rem", cursor: "pointer", border: kind === k ? "2px solid #7c3aed" : "1px solid #cbd5e1", background: kind === k ? "#f5f3ff" : "#fff" }}>{DOCS[k].label}</button>
                ))}
            </div>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 {d.label} 초안 받기</button>
                    <button className="btn btn-secondary" onClick={fill}>📊 자료로 &lsquo;행동 요약&rsquo;만 채우기</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "sections", heading: d.heading, s: head, meta: printMeta, sections: printSections })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, ProgressReport: JSON.stringify({ ...parseJson<any>(bip.ProgressReport, {}), [d.key]: { ...cur, date: dateVal, author: cur.author ?? bip.Teacher ?? "" } }) })}>💾 저장</button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>학생 실명·진단 정보는 보호자 동의 범위 안에서만 적고, 외부로 보내기 전에 담당 부장·관리자 확인을 받으세요. AI 초안의 &lsquo;확인 필요&rsquo; 표시는 직접 채워 주세요.</div>
                <AIBox text={ai.text} loading={ai.loading} onApply={apply} />
            </div>
            <div style={sheetBox}><SectionSheet heading={d.heading} s={head} meta={meta} sections={sections} /></div>
        </div>
    );
}
