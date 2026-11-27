"use client";

// ⑤ 데이터 기반 의사결정, ⑥ 의료협력의뢰서·추가지원신청서, ⑧ 다음 학년도 인수인계 자료.
// 따로 시트 칸을 만들지 않고 BIP 행의 ProgressReport JSON 안(decision·medical·support·handover)에 함께 저장한다.
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import MeetingNotesSection from "./MeetingNotes";
import { Bip, StudentHead, parseJson, splitNumbered, today, kDate, Inp, Area, Sel, SectionSheet, sheetBox, HandoverCharts, HandoverChartData, TierMonth } from "./shared";
import { PROFILE_BANK, PROFILE_FLAGS, BankGroup } from "./profileBank";
import { AIBox, ApplyMode, AutoArea, card, dOf, err, fetchBehaviorSummaries, mergeInto, openPrint } from "./Steps";

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
    const apply = (mode: ApplyMode) => set(mergeInto(cur, { rationale: ai.text.replace(/\*\*/g, "") }, mode));
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
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>⑤ 모니터링 차트와 함께 보고 판단하세요. 2주 이상 개선이 없으면 전략 수정, 4주 연속 목표 달성이면 하향·종료를 검토합니다.</div>
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
            ...["Antecedents", "Consequences", "Hypothesis", "Goals", "PreventionStrategies", "TeachingStrategies", "ReinforcementStrategies", "MedicationStatus", "AdditionalSupport", "EvaluationPlan"].map(k => bip[k] ? `${k}: ${bip[k]}` : ""),
            decision.choice ? `의사결정: ${decision.choice} — ${decision.rationale || ""}` : ""].filter(Boolean).join("\n");
        try {
            const r = await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/ai-document-draft`,
                { kind, context: ctx, start_date: bip.PlanStart || undefined, end_date: today() }, { timeout: 240000 });
            setAi({ loading: false, text: r.data.analysis || "" });
        } catch (e) { setAi({ loading: false, text: "⚠️ " + err(e) }); }
    };
    const apply = (mode: ApplyMode) => {
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

// ⑧ 다음 학년도 인수인계 자료 ─────────────────────────────
// 새 담임이 3월 전에 이 1쪽만 읽고 첫날부터 학생을 맞을 수 있게 한다. 행동중재계획(BIP)에 있는 내용
// (표적행동 정의·기능 가설·예방·교수·강화·위기대응)은 옮겨 적지 않고 BIP를 함께 넘긴다. 칸은 10개.
// ProgressReport JSON의 handover 키에 저장한다.
type Row = [string, string, string]; // 칸 이름, 저장 키, 안내 문구
export const HANDOVER_ROWS: Row[] = [
    ["한눈에 보는 학생", "summary", "강점, 좋아하는 것, 관계를 맺기 좋은 방법 (2줄)"],
    ["의사소통", "comm", "표현 수단(구어·AAC·몸짓), 알아듣는 지시 수준, 도움·거절·쉬기 표현 (2줄)"],
    ["건강·감각·안전", "health", "건강·복약 유의점, 감각 민감성, 신체 접촉·이동 안전 (2줄)"],
    ["올해 변화와 지금 상태", "recent", "최근 빈도·강도 변화, 안정 유지 기간, 대체행동 습득 정도 (2줄)"],
    ["행동 전에 보이는 신호", "signs", "행동이 커지기 전에 실제로 보인 모습 (2줄)"],
    ["꼭 해주세요", "must", "효과가 있었던 지원 최대 3가지"],
    ["피해주세요", "avoid", "행동을 키웠던 대응 최대 3가지"],
    ["올해 해 본 중재와 권고", "history", "효과 있었던 것·없었던 것, 3월 유지·변경 권고와 시작 Tier (2줄)"],
    ["3월 첫 2주", "start", "개학 전 준비물, 첫날 관계 맺기, 먼저 관찰할 것 (2줄)"],
    ["확인·협의할 것", "todo", "보호자 협의, 아직 모르는 정보, 행동중재지원팀 요청 (2줄)"],
];
// 한 줄에 두 칸을 나란히 두는 짝(1쪽 안에 들어가게)
const HANDOVER_PAIRS: [string, string][] = [["must", "avoid"]];
// AI 절 순서(백엔드 DOCUMENT_SPECS["handover"]와 같아야 한다)
const AI_TITLES = HANDOVER_ROWS.map(r => r[0]);

// 예전 양식(30칸·9칸)으로 저장된 내용을 지금 칸으로 옮긴다(빈 칸에만).
export function upgradeHandover(c: Record<string, string>): Record<string, string> {
    const n = { ...c };
    const fill = (to: string, ...from: string[]) => {
        if ((n[to] || "").trim()) return;
        const v = from.map(f => (n[f] || "").trim()).filter(Boolean).join("\n");
        if (v) n[to] = v;
    };
    fill("history", "works");
    fill("start", "march", "prep", "day1", "weeks");
    fill("signs", "stg1s");
    return n;
}

// 칸 목록 → SectionSheet 줄. 짝이 있는 칸은 한 줄에 나란히.
function handoverLines<T>(cell: (r: Row) => T): [string, T, string?, T?][] {
    const out: [string, T, string?, T?][] = [];
    const skip = new Set(HANDOVER_PAIRS.map(p => p[1]));
    HANDOVER_ROWS.forEach(r => {
        if (skip.has(r[1])) return;
        const pair = HANDOVER_PAIRS.find(p => p[0] === r[1]);
        const r2 = pair && HANDOVER_ROWS.find(x => x[1] === pair[1]);
        out.push(r2 ? [r[0], cell(r), r2[0], cell(r2)] : [r[0], cell(r)]);
    });
    return out;
}

export const schoolYearStart = () => { const t = today(); const y = +t.slice(0, 4), m = +t.slice(5, 7); return `${m >= 3 ? y : y - 1}-03-01`; };
const BIP_LABELS: [string, string][] = [
    ["TargetBehavior", "표적행동"], ["OperationalDefinition", "조작적 정의"], ["MedicationStatus", "약물"], ["Hypothesis", "기능평가 결과"],
    ["ReinforcerInfo", "강화제"], ["Goals", "중재목표"], ["PreventionStrategies", "예방"], ["TeachingStrategies", "교수"], ["ReinforcementStrategies", "강화"],
    ["Antecedents", "주요 선행사건"], ["Consequences", "주요 후속결과"],
    ["CrisisS1", "위기(전조) 신호"], ["CrisisR1", "위기(전조) 대응"], ["CrisisS2", "위기(고조) 신호"], ["CrisisR2", "위기(고조) 대응"],
    ["CrisisS3", "위기(대응·알림) 신호"], ["CrisisR3", "위기(대응·알림) 대응"], ["CrisisS4", "위기(분리·회복) 신호"], ["CrisisR4", "위기(분리·회복) 대응"],
    ["CrisisPlan", "위기(기타)"], ["CrisisNotify", "위기(알림·대처)"], ["CrisisReturn", "위기(복귀)"], ["CrisisHome", "위기(가정학습)"],
    ["HomeSupport", "가정 연계"], ["SupportTeam", "지원팀"], ["AdditionalSupport", "추가 지원 사항"], ["OtherConsiderations", "기타"],
];
const lvl = (l: Log) => +String(l["강도"] ?? "").trim().charAt(0) || 0;

// 시스템이 센 수치(AI가 직접 계산하지 않게 그대로 넘긴다). 집계 기준을 함께 적는다.
export function handoverStats(logs: Log[], start: string) {
    const t = today();
    const inYear = logs.filter(l => { const d = dOf(l); return d && d >= start && d <= t; });
    const ds = inYear.map(dOf).sort();
    const months: string[] = [];
    for (let i = 0; i < 12; i++) {
        const d = new Date(Date.UTC(+start.slice(0, 4), 2 + i, 1)), key = d.toISOString().slice(0, 7);
        if (key > t.slice(0, 7)) break;
        months.push(`${d.getUTCMonth() + 1}월 ${ds.filter(x => x.startsWith(key)).length}번`);
    }
    const r4 = addDays(t, -28), r8 = addDays(t, -56);
    const high = inYear.filter(l => lvl(l) >= 4).map(dOf).sort();
    const lastHigh = high[high.length - 1];
    const days = (a: string) => Math.round((Date.parse(t) - Date.parse(a)) / 86400000);
    return [
        `- 집계 기간: ${start} ~ ${t} (행동기록 1건 = 1번, 같은 날 여러 건은 따로 셈)`,
        `- 올해 행동 기록: 모두 ${ds.length}번 / 달마다: ${months.join(", ")}`,
        `- 최근 4주 ${ds.filter(d => d > r4).length}번, 그 전 4주 ${ds.filter(d => d > r8 && d <= r4).length}번 (등교일수 자료 없음: 건수만으로 효과를 단정하지 말 것)`,
        `- 강도별: ${[1, 2, 3, 4, 5].map(n => `강도${n} ${inYear.filter(l => lvl(l) === n).length}번`).join(", ")}, 강도 기록 없음 ${inYear.filter(l => !lvl(l)).length}번`,
        `- 마지막 기록일: ${ds[ds.length - 1] || "없음"}${ds.length ? ` (오늘까지 ${days(ds[ds.length - 1])}일)` : ""}`,
        `- 마지막 강도 4 이상 행동: ${lastHigh ? `${lastHigh} (그 뒤 ${days(lastHigh)}일 동안 강도 4 이상 없음)` : "올해 없음"}`,
    ].join("\n");
}

// 올해 월별 Tier(월별 표 기준). 그 달 표가 하나도 없으면 level ''.
export async function fetchTierMonths(code: string): Promise<TierMonth[]> {
    try {
        const r = await axios.get(`${API_BASE_URL}/api/v1/tier-monthly/student/${encodeURIComponent(code)}`);
        return (r.data?.months || []).map((m: any) => {
            const any = m.ready?.cico || m.ready?.sst || m.ready?.t3;
            const two = [m.cico ? "CICO" : "", m.sst?.length ? "SST" : ""].filter(Boolean).join("·");
            const level = m.t3 === "Tier3+" ? "Tier3+" : m.t3 ? "Tier3" : two ? "Tier2" : any ? "Tier1" : "";
            return { month: m.month, level, detail: level === "Tier2" ? two : level.startsWith("Tier3") && two ? `+${two}` : "" };
        });
    } catch { return []; }
}
const tierText = (t: TierMonth[]) => t.length ? t.map(x => `${x.month}월 ${x.level || "표 없음"}${x.detail ? `(${x.detail})` : ""}`).join(", ") : "자료 없음";

// ⑧ 탭과 Tier 현황 '인수인계 자료 일괄 생성'이 함께 쓴다.
export async function requestHandoverDraft(code: string, bip: Bip, logs: Log[], behaviors: any[]): Promise<string> {
    const pr = parseJson<any>(bip.ProgressReport, {});
    const fba = parseJson<any>(bip.FBAReport, {}).sections || {};
    const obj = (label: string, o: any) => o && Object.values(o).some(Boolean) ? [label, ...Object.entries(o).map(([k, v]) => v ? `${k}: ${v}` : "")] : [];
    const [tiers, sums] = await Promise.all([fetchTierMonths(code), fetchBehaviorSummaries(code, behaviors, pr.start || bip.PlanStart || "", today()).catch(() => [])]);
    const r1 = (v: number | null | undefined) => (v == null ? "기록 없음" : String(Math.round(v * 10) / 10));
    const measured = sums.map(r => `- [${r.type}] ${r.label} (${r.unit}): 중재 전 ${r.preN ? `${r.preN}회 평균 ${r1(r.preMean)}` : (r.baseline || "기록 없음")} → 중재 중 ${r.postN}회 평균 ${r1(r.postMean)}, 최근 4회 평균 ${r1(r.recentMean)}, 실행충실도 ${r.fidelity == null ? "기록 없음" : `${r.fidelityN}회 중 ${r.fidelity}%`}`);
    const ctx = [
        "[시스템 집계 — 수치는 이 값만 쓴다]", handoverStats(logs, schoolYearStart()),
        `- 올해 월별 지원 단계(월별 Tier 표): ${tierText(tiers)}`,
        ...(measured.length ? ["[표적행동별 측정 결과 — 효과·습득 판단 근거]", ...measured] : []),
        "[자료 요약]", dataSummary(logs, behaviors, bip.PlanStart || ""),
        "[행동중재계획]", ...BIP_LABELS.map(([k, l]) => bip[k] ? `${l}: ${bip[k]}` : ""),
        "[FBA 결과 보고서]", ...Object.entries(fba).map(([k, v]) => v ? `${k}: ${v}` : ""),
        "[중재 결과 보고서]", ...Object.entries(pr.sections || {}).map(([k, v]) => v ? `${k}: ${v}` : ""),
        pr.decision?.choice ? `[최근 의사결정] ${pr.decision.choice} — ${pr.decision.rationale || ""}` : "",
        ...obj("[의료협력 의뢰서]", pr.medical), ...obj("[추가 지원 신청서]", pr.support),
    ].filter(Boolean).join("\n");
    const r = await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(code)}/ai-document-draft`,
        { kind: "handover", context: ctx, start_date: schoolYearStart(), end_date: today() }, { timeout: 240000 });
    return r.data.analysis || "";
}
// AI 결과를 handover 칸으로 나눈다. 못 나누면 null.
export function parseHandover(text: string): Record<string, string> | null {
    const parsed = splitNumbered(text, AI_TITLES);
    const patch: Record<string, string> = {};
    HANDOVER_ROWS.forEach(([t, f]) => { if (parsed[t]) patch[f] = parsed[t]; });
    return Object.keys(patch).length ? patch : null;
}

const PAGE_LIMIT = 1000; // 차트 4개와 함께 A4 1쪽(여백 12mm)에 들어가는 본문 권장치

export function HandoverStep({ head, bip, setBip, save, logs, behaviors }: {
    head: StudentHead; bip: Bip; setBip: (b: Bip) => void; save: (b: Bip) => Promise<void>; logs: Log[]; behaviors: any[];
}) {
    const store = useStore(bip, setBip, "handover");
    const cur = useMemo(() => upgradeHandover(store.cur), [store.cur]);
    const set = (patch: Record<string, string>) => store.set({ ...cur, ...patch });
    const [ai, setAi] = useState({ loading: false, text: "" });
    const start = schoolYearStart();
    const [tiers, setTiers] = useState<TierMonth[]>([]);
    useEffect(() => { let alive = true; setTiers([]); fetchTierMonths(head.code).then(t => { if (alive) setTiers(t); }); return () => { alive = false; }; }, [head.code]);
    const [dist, setDist] = useState<Pick<HandoverChartData, "times" | "functions" | "types"> & { unknown?: number }>({ times: [] });
    useEffect(() => {
        let alive = true;
        setDist({ times: [] });
        axios.get(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/fba-evidence`, { params: { start_date: start, end_date: today() } })
            .then(r => {
                if (!alive) return;
                const m = r.data?.deterministic_metrics || {};
                const top = (k: string, n: number) => (m[k] || []).filter((x: any) => x.item && x.item !== "미상").slice(0, n);
                setDist({ times: top("time_slot_distribution", 4), functions: top("teacher_inferred_function_distribution", 4), types: top("behavior_type_distribution", 4), unknown: m.function_unknown_count });
            }).catch(() => {});
        return () => { alive = false; };
    }, [head.code, start]);
    const charts: HandoverChartData = useMemo(() => {
        const inYear = logs.filter(l => { const d = dOf(l); return d && d >= start && d <= today(); });
        const ds = inYear.map(dOf);
        const monthly: { label: string; count: number }[] = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(Date.UTC(+start.slice(0, 4), 2 + i, 1)), key = d.toISOString().slice(0, 7);
            if (key > today().slice(0, 7)) break;
            monthly.push({ label: `${d.getUTCMonth() + 1}월`, count: ds.filter(x => x.startsWith(key)).length });
        }
        const { unknown, ...rest } = dist;
        const note = `집계 ${kDate(start)} ~ ${kDate(today())}, 행동기록 1건을 1번으로 셈. ②~④는 많은 순 일부만 표시(미상 제외).`
            + (unknown != null ? ` ③ 기능 미기록 ${unknown}번.` : "");
        return { monthly, ...rest, tiers, total: ds.length, note: note + " ⑤는 월별 Tier 표 기준." };
    }, [logs, start, dist, tiers]);
    const len = (keys: string[]) => keys.reduce((n, f) => n + (cur[f] || "").length, 0);
    const total = len(HANDOVER_ROWS.map(r => r[1]));
    const y = +start.slice(0, 4);
    // AI 없이 자동으로 채울 수 있는 칸: 올해 변화(집계), 건강·안전(⓪ 학생정보의 꼭 알아 둘 점·건강면 앞 2줄). 나머지는 BIP와 겹치지 않게 비워 둔다.
    const fill = () => {
        const pf = parseJson<any>(bip.ProgressReport, {}).profile || {};
        const health = [pf.flags && `꼭 알아 둘 점: ${pf.flags}`, ...String(pf.health || "").split("\n").filter(l => l.trim() && !l.includes("특이사항 없음")).slice(0, 2)].filter(Boolean).join("\n");
        set(mergeInto(cur, { recent: dataSummary(logs, behaviors, bip.PlanStart || ""), health }, "empty"));
    };
    const runAI = async () => {
        setAi({ loading: true, text: "" });
        try { setAi({ loading: false, text: await requestHandoverDraft(head.code, bip, logs, behaviors) }); }
        catch (e) { setAi({ loading: false, text: "⚠️ " + err(e) }); }
    };
    const apply = (mode: ApplyMode) => {
        const patch = parseHandover(ai.text);
        if (!patch) { alert("AI 결과를 칸별로 나누지 못했습니다."); return; }
        set(mergeInto(cur, patch, mode));
    };
    const dateVal = cur.date || today();
    const yearVal = cur.year || `${y}학년도 → ${y + 1}학년도`;
    const author = cur.author ?? bip.Teacher ?? "";
    const metaDef: [string, string, string][] = [["인계 학년도", "year", yearVal], ["작성일", "date", dateVal], ["인계 교사", "author", author], ["인수 교사", "receiver", cur.receiver || ""]];
    // 입력 없이 자동으로 들어가는 줄: 표적행동(BIP). 지원 단계는 차트 아래 달마다 띠로 보인다.
    const auto: [string, string][] = [["표적행동(BIP)", bip.TargetBehavior || "행동중재계획에 없음"]];
    const printMeta: [string, string][] = [...metaDef.map(([k, f, v]): [string, string] => [k, f === "date" ? kDate(v) : v]), ...auto];
    const meta: [string, React.ReactNode][] = [...metaDef.map(([k, f, v]): [string, React.ReactNode] => [k, <Inp key={f} type={f === "date" ? "date" : "text"} value={v} onChange={x => set({ [f]: x })} />]), ...auto];
    const area = ([, f, ph]: Row) => <Area key={f} value={cur[f] || ""} onChange={v => set({ [f]: v })} placeholder={ph} rows={2} />;
    const sections = handoverLines<React.ReactNode>(area);
    const printSections = handoverLines<string>(([, f]) => cur[f] || "");
    const footer = "※ 표적행동 정의·기능 가설·예방·교수·강화 전략과 위기대응 절차는 행동중재계획(BIP)을 함께 인계한다.";
    const warn = (n: number, max: number, label: string) => <span style={{ color: n > max ? "#dc2626" : "#475569" }}>{label} {n.toLocaleString()}자 / 권장 {max.toLocaleString()}자 이하</span>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 인수인계 자료 초안 받기(올해 자료 전체)</button>
                    <button className="btn btn-secondary" onClick={fill}>📋 올해 변화·건강 자동 채우기</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "sections", heading: "다음 학년도 행동지원 인수인계 자료", s: head, meta: printMeta, sections: printSections, charts, footer, limit: 1 })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, ProgressReport: JSON.stringify({ ...parseJson<any>(bip.ProgressReport, {}), handover: { ...cur, year: yearVal, date: dateVal, author } }) })}>💾 저장</button>
                </div>
                {tiers.length > 0 && !tiers.some(t => t.level.startsWith("Tier3") || /CICO/.test(t.detail)) && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: "0.8rem", color: "#166534", fontWeight: 700 }}>
                        ✅ 인수인계 자료 제출 대상(올해 CICO·Tier3)이 아닌 학생입니다. 제출하지 않아도 됩니다(필요할 때만 쓰세요).
                    </div>
                )}
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>
                    A4 1쪽, 칸 10개입니다. 표적행동·기능·예방·교수·강화·위기대응은 행동중재계획(BIP)을 함께 넘기므로 여기 다시 적지 않습니다. AI 초안을 받은 뒤 &lsquo;확인 필요&rsquo;만 고치면 됩니다.
                </div>
                {cur.ai && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", fontSize: "0.8rem", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <b style={{ color: "#b45309" }}>⚠️ {cur.ai}</b> 내용을 확인·수정한 뒤 표시를 지우고 저장하세요.
                        <button className="btn btn-secondary" onClick={() => set({ ai: "" })}>검토 완료</button>
                    </div>
                )}
                <AIBox text={ai.text} loading={ai.loading} onApply={apply} canReplace />
            </div>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, display: "flex", gap: 16, flexWrap: "wrap" }}>
                {warn(total, PAGE_LIMIT, "본문")}
                {total > PAGE_LIMIT && <span style={{ color: "#dc2626" }}>— 인쇄하면 1쪽을 넘을 수 있습니다. 칸마다 2줄 안으로 줄여 주세요.</span>}
            </div>
            <div style={sheetBox}><SectionSheet heading="다음 학년도 행동지원 인수인계 자료" s={head} meta={meta} sections={sections} extra={<HandoverCharts d={charts} />} after={<div style={{ fontSize: "8.5pt", marginTop: 3 }}>{footer}</div>} dense /></div>
        </div>
    );
}

// ⓪ 학생정보 및 이해자료 ─────────────────────────────────
// 학교 '학생정보 및 이해자료'(학습면·생활면·건강면)를 교육 기초자료로 다시 묶은 1쪽 양식.
// 칸: 경은PBS 지원 단계(자동) + 학습면·생활면·건강면·기타 유의사항(입력 4칸, 꼭 알아 둘 점 체크는 기타 칸 위).
// 주민등록번호·주소·연락처·보호자 이름은 받지 않는다(학교 업무관리시스템 자료를 따른다).
export const PROFILE_ROWS: Row[] = [
    ["학습면", "learning", "읽기·쓰기·셈 수준, 잘 배우는 방법, 의사소통(말·AAC·그림카드·몸짓, 지시 이해, 예/아니요·아픔 표현)"],
    ["생활면", "life", "식사(음식 형태)·용변·옷 입기, 이동·등하교 인계, 친구·교사와의 관계, 일과·수면"],
    ["건강면", "health", "약 복용·뇌전증·알레르기·의료적 지원·보장구, 감각 민감성, 응급 시 대처 순서"],
    ["기타 유의사항", "guide", "좋아하는 것·강점, 효과적인 지도 방법, 피해야 할 상황, 힘들 때 신호·진정 방법, 지원 인력·가정 소통"],
];
const PROFILE_GROUPS: Record<string, BankGroup[]> = {
    ...PROFILE_BANK,
    learning: [...PROFILE_BANK.learning, ...PROFILE_BANK.comm.map(g => ({ ...g, group: `의사소통: ${g.group}` }))],
};
const PROFILE_LIMIT = 1500; // 머리 표·지원 단계 줄과 함께 A4 1쪽에 들어가는 본문 권장치

// 경은PBS 지원 단계: TierStatus(이번 달)와 행동중재계획에서 자동으로 만든다.
const TIER_DESC: [string, string][] = [
    ["Tier3+", "외부 기관 연계 집중 지원"], ["Tier3", "개별 행동중재계획(BIP)"],
    ["Tier2(CICO)", "매일 행동 점검(CICO)"], ["Tier2(SST)", "사회성 기술 소집단(SST)"],
];
export function pbsSupportText(tier: string, bip: Bip) {
    const on = TIER_DESC.filter(([k]) => tier.split(" · ").includes(k));
    const stage = on.length ? `${tier} — ${on.map(([, d]) => d).join(", ")}` : "Tier1 — 보편적 행동지원(학급 기대행동·토큰)";
    const tb = (bip.TargetBehavior || "").trim();
    return tb ? `${stage}\n표적행동: ${tb} (자세한 내용은 행동중재계획 참고)` : stage;
}

export function ProfileStep({ head, bip, setBip, save, tier }: {
    head: StudentHead; bip: Bip; setBip: (b: Bip) => void; save: (b: Bip) => Promise<void>; tier: string;
}) {
    const store = useStore(bip, setBip, "profile");
    const cur = store.cur;
    const set = (patch: Record<string, string>) => store.set(patch);
    const hand = parseJson<any>(bip.ProgressReport, {}).handover || {};
    // 예전 '의사소통' 칸(comm)은 학습면에 합쳐 보여 주고, 고치면 학습면으로 옮긴다.
    const val = (f: string) => f === "learning" ? [cur.learning, cur.comm].map(x => (x || "").trim()).filter(Boolean).join("\n") : cur[f] || "";
    const setVal = (f: string, v: string) => set(f === "learning" ? { learning: v, comm: "" } : { [f]: v });
    const flags = (cur.flags || "").split(", ").filter(Boolean);
    const setFlags = (f: string[]) => set({ flags: PROFILE_FLAGS.filter(x => f.includes(x)).join(", ") });
    // 이미 있는 자료(인수인계·행동중재계획)로 빈 칸만 채운다
    const fill = () => {
        const j = (...v: string[]) => v.map(x => (x || "").trim()).filter(Boolean).join("\n");
        const auto = bip.MedicationStatus?.trim() ? ["학교에서 투약"] : [];
        const flagsNext = PROFILE_FLAGS.filter(x => flags.includes(x) || auto.includes(x)).join(", ");
        set({ ...mergeInto({ ...cur, learning: val("learning") }, {
            learning: j(hand.comm),
            health: j(hand.health, bip.MedicationStatus ? `복약: ${bip.MedicationStatus}` : ""),
            life: j(hand.summary),
            guide: j(hand.must && `꼭 해주세요: ${hand.must}`, hand.avoid && `피해주세요: ${hand.avoid}`, bip.ReinforcerInfo && `좋아하는 것: ${bip.ReinforcerInfo}`),
        }, "empty"), comm: "", flags: flagsNext });
    };
    const dateVal = cur.date || today();
    const author = cur.author ?? bip.Teacher ?? "";
    const disability = bip.DisabilityType || cur.disability || "";
    const gender = bip.Gender || cur.gender || "";
    const metaEdit: [string, React.ReactNode][] = [
        ["장애 유형", bip.DisabilityType ? disability : <Inp key="d" value={cur.disability || ""} onChange={v => set({ disability: v })} />],
        ["성별", bip.Gender ? gender : <Sel key="g" value={cur.gender || ""} onChange={v => set({ gender: v })} options={["남", "여"]} />],
        ["작성일", <Inp key="dt" type="date" value={dateVal} onChange={v => set({ date: v })} />],
        ["작성자", <Inp key="a" value={author} onChange={v => set({ author: v })} />],
    ];
    const printMeta: [string, string][] = [["장애 유형", disability], ["성별", gender], ["작성일", kDate(dateVal)], ["작성자", author]];
    const pbs = pbsSupportText(tier, bip);
    const flagBox = <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: "3px 6px", fontSize: "8.5pt", marginBottom: 4 }}>
        <b style={{ color: "#b91c1c" }}>꼭 알아 둘 점</b>
        {PROFILE_FLAGS.map(x => {
            const on = flags.includes(x);
            return <label key={x} style={{ display: "inline-flex", gap: 3, alignItems: "center", cursor: "pointer", padding: "1px 6px", borderRadius: 10, border: `1px solid ${on ? "#dc2626" : "#cbd5e1"}`, background: on ? "#fef2f2" : "#fff", color: on ? "#b91c1c" : "#475569", fontWeight: on ? 700 : 400 }}>
                <input type="checkbox" checked={on} onChange={() => setFlags(on ? flags.filter(f => f !== x) : [...flags, x])} style={{ margin: 0 }} />{x}
            </label>;
        })}
    </div>;
    const flagLine = flags.length ? `꼭 알아 둘 점: ${flags.map(x => `■ ${x}`).join("  ")}` : "";
    const sections: [string, React.ReactNode][] = [
        ["경은PBS 지원 단계", <div key="pbs" style={{ whiteSpace: "pre-wrap" }}>{pbs}<div className="no-print" style={{ fontSize: "8pt", color: "#94a3b8" }}>자동 기입(이번 달 Tier 현황·행동중재계획)</div></div>],
        ...PROFILE_ROWS.map(([t, f, ph]): [string, React.ReactNode] => [t, <div key={f}>
            {f === "guide" && flagBox}
            <Area value={val(f)} onChange={v => setVal(f, v)} placeholder={ph} rows={3} />
            <SentencePicker value={val(f)} onChange={v => setVal(f, v)} groups={PROFILE_GROUPS[f] || []} />
        </div>]),
    ];
    const printSections: [string, string][] = [
        ["경은PBS 지원 단계", pbs],
        ...PROFILE_ROWS.map(([t, f]): [string, string] => [t, f === "guide" ? [flagLine, val(f)].filter(Boolean).join("\n") : val(f)]),
    ];
    const footer = "※ 주민등록번호·주소·연락처 등 인적사항과 통학 차량 정보는 학교 업무관리시스템 자료를 따른다.";
    const total = PROFILE_ROWS.reduce((n, [, f]) => n + val(f).length, 0);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-secondary" onClick={fill}>📋 이미 있는 자료로 채우기</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "sections", heading: "학생정보 및 이해자료", s: head, meta: printMeta, sections: printSections, footer, limit: 1 })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, ProgressReport: JSON.stringify({ ...parseJson<any>(bip.ProgressReport, {}), profile: { ...cur, learning: val("learning"), comm: "", date: dateVal, author } }) })}>💾 저장</button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>
                    <b>제출 의무가 없는 작성 도우미</b>입니다. 학교 양식을 쓸 때 예시 문장을 골라 초안을 만들고, 미리보기에서 한글(HWPX)로 저장해 쓰면 됩니다. 이 내용은 AI 분석에 쓰이지 않습니다. <b>경은PBS 지원 단계</b>는 이번 달 Tier 현황과 행동중재계획에서 자동으로 들어갑니다. 학습면·생활면·건강면·기타 유의사항은 <b>예시 문장 고르기</b>를 눌러 맞는 문장을 체크하면 칸에 들어가고, 칸에서 학생에 맞게 고치면 됩니다(○○은 채울 자리). 기타 유의사항 위 <b>꼭 알아 둘 점</b>은 대체 교사·실무사가 첫날 봐야 할 항목이니 해당하는 것을 모두 체크하세요. 칸마다 2~4줄이면 A4 1쪽이 됩니다. 인적사항(주민번호·주소·연락처)은 적지 않습니다.
                </div>
            </div>
            {cur.source && <div style={{ fontSize: "0.78rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 10px" }}>
                📄 기본값은 <b>{cur.source}</b>에서 가져왔습니다. 지금 상황에 맞게 고쳐 쓰세요.
            </div>}
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: total > PROFILE_LIMIT ? "#dc2626" : "#475569" }}>
                본문 {total.toLocaleString()}자 / 권장 {PROFILE_LIMIT.toLocaleString()}자 이하{total > PROFILE_LIMIT ? " — 1쪽을 넘을 수 있습니다." : ""}
            </div>
            <div style={sheetBox}><SectionSheet heading="학생정보 및 이해자료" s={head} meta={metaEdit} sections={sections} after={<div style={{ fontSize: "8.5pt", marginTop: 3 }}>{footer}</div>} /></div>
        </div>
    );
}

// 예시 문장 고르기: 체크하면 칸 끝에 '- 문장' 줄로 넣고, 끄면 그 줄을 뺀다. 고쳐 쓴 줄은 체크가 풀린다.
function SentencePicker({ value, onChange, groups }: { value: string; onChange: (v: string) => void; groups: BankGroup[] }) {
    const lines = value.split("\n");
    const has = (t: string) => lines.some(l => l.replace(/^\s*-\s*/, "").trim() === t);
    const toggle = (t: string) => onChange(has(t)
        ? lines.filter(l => l.replace(/^\s*-\s*/, "").trim() !== t).join("\n")
        : [value.trimEnd(), `- ${t}`].filter(Boolean).join("\n"));
    const n = groups.reduce((k, g) => k + g.items.filter(has).length, 0);
    return (
        <details className="no-print" style={{ marginTop: 4, fontSize: "8.5pt" }}>
            <summary style={{ cursor: "pointer", color: "#4338ca", fontWeight: 700 }}>＋ 예시 문장 고르기{n ? ` (${n}개 넣음)` : ""}</summary>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "4px 14px", padding: "6px 2px" }}>
                {groups.map(g => (
                    <div key={g.group}>
                        <div style={{ fontWeight: 700, color: "#475569", margin: "4px 0 2px" }}>{g.group}</div>
                        {g.items.map(t => (
                            <label key={t} style={{ display: "flex", gap: 4, alignItems: "flex-start", cursor: "pointer", lineHeight: 1.45, padding: "1px 0" }}>
                                <input type="checkbox" checked={has(t)} onChange={() => toggle(t)} style={{ marginTop: 2 }} />
                                <span style={{ color: has(t) ? "#1e293b" : "#475569" }}>{t}</span>
                            </label>
                        ))}
                    </div>
                ))}
            </div>
        </details>
    );
}
