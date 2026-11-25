"use client";

// ⑤ 데이터 기반 의사결정, ⑥ 의료협력의뢰서·추가지원신청서, ⑧ 다음 학년도 인수인계 자료.
// 따로 시트 칸을 만들지 않고 BIP 행의 ProgressReport JSON 안(decision·medical·support·handover)에 함께 저장한다.
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import MeetingNotesSection from "./MeetingNotes";
import { Bip, StudentHead, parseJson, splitNumbered, today, kDate, Inp, Area, Sel, SectionSheet, sheetBox, HandoverCharts, HandoverChartData, HandoverPage2, HandoverPage2Data, TierMonth } from "./shared";
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
// 새 담임이 3월 전에 이것만 읽고 학생을 이해하고(1쪽) 첫 등교일부터 지원을 실행하도록(2쪽) A4 2쪽으로 묶는다.
// ProgressReport JSON의 handover 키에 저장한다.
type Row = [string, string, string]; // 칸 이름, 저장 키, 안내 문구
export const HANDOVER_P1: Row[] = [
    ["한눈에 보는 학생", "summary", "강점·주요 특성·교육활동 참여 특성·가장 먼저 알아야 할 지원 요구"],
    ["선호활동 및 강화제", "reinforcer", "좋아하는 활동·물건·감각 자극, 효과적인 사회적 강화, 강화제 유의점"],
    ["의사소통 및 지도 방법", "comm", "주된 의사소통 수단, 이해하는 지시 수준, 효과적인 촉구, 도움·거절·휴식 표현"],
    ["건강·감각·안전 특성", "health", "건강 유의사항, 감각 민감성, 신체 접촉·안전 특이사항"],
    ["주요 표적행동", "behavior", "표적행동명, 관찰 가능한 정의, 발생 빈도, 강도·위험성"],
    ["행동 발생 패턴", "pattern", "주로 일어나는 시간·장소·활동, 선행사건과 후속결과"],
    ["행동 기능 및 근거", "function", "기능 가설, 관련 집계, 판단 근거, 분석의 한계"],
    ["최근 행동 변화 및 현재 상태", "recent", "최근 빈도·강도 변화, 안정 유지 기간, 대체행동 습득 수준, 지금 필요한 지원"],
];
export const HANDOVER_SUPPORT: Row[] = [
    ["꼭 해주세요", "must", "안정과 참여를 위해 가장 먼저 할 지원 최대 3가지"],
    ["피해주세요", "avoid", "행동 고조·불편 증가와 관련된 대응 최대 3가지"],
    ["예방적 지원 방법", "prevent", "행동중재계획의 예방 전략 요약(환경·과제·전환 예고·시각 지원·선택권)"],
    ["대체행동 교수 방법", "teach", "행동중재계획의 교수 전략 요약(대체행동·상황·촉구·반응 방법)"],
    ["강화 및 후속 반응", "conseq", "행동중재계획의 강화 전략 요약(대체행동 강화·표적행동 시 대응)"],
    ["기존 중재 및 효과", "history", "적용한 중재, 학생 반응, 효과 확인 여부, 유지·변경 권고"],
];
// 단계, 행동 신호 안내, 교사 대응 안내 — 저장 키는 stg{번호}s(신호)·stg{번호}a(대응)
export const HANDOVER_STAGES: [string, string, string][] = [
    ["예방·안정", "평상시 모습과 안정 신호", "예방 지원, 대체행동 교수, 적절한 행동 강화"],
    ["전조", "실제 관찰된 초기 행동 변화", "불편 원인 확인, 환경·과제 조정, 도움·휴식 지원"],
    ["고조", "빈도·강도가 늘어나는 모습", "자극 줄이기, 안전거리 확보, 필요하면 지원 요청"],
    ["위기", "학생·타인의 안전을 위협하는 행동", "안전 확보, 학교 위기대응 프로토콜 적용"],
    ["회복", "행동 감소·안정 회복 신호", "안정 지원, 준비도 확인, 점진적 활동 복귀"],
    ["사후지원", "참여·의사소통이 가능한 모습", "건강·안전 확인, 대체행동 연습, 기록·중재 검토"],
];
const STAGE_KEYS = HANDOVER_STAGES.flatMap((_, i) => [`stg${i}s`, `stg${i}a`]);
export const HANDOVER_PLAN: Row[] = [
    ["개학 전 준비사항", "prep", "시각자료·의사소통 자료·강화제·환경 구성·교직원 협의"],
    ["첫 등교일", "day1", "관계 형성 방법, 우선 적용할 지원, 유의할 상황"],
    ["첫 1~2주", "weeks", "유지할 중재, 우선 가르칠 대체행동, 관찰·기록 항목, 중재 검토 시점"],
    ["추가 확인 및 협의 사항", "todo", "미확인 정보, 보호자 협의, 행동중재지원팀 요청 사항"],
];
const STAGE_TITLE = "행동 단계별 대응";
// AI 절 순서(백엔드 DOCUMENT_SPECS["handover"]와 같아야 한다)
const AI_TITLES = [...HANDOVER_P1, ...HANDOVER_SUPPORT].map(r => r[0]).concat(STAGE_TITLE, HANDOVER_PLAN.map(r => r[0]));
const ROWS = [...HANDOVER_P1, ...HANDOVER_SUPPORT, ...HANDOVER_PLAN];

// 예전 9칸 양식으로 저장된 내용을 지금 칸으로 옮긴다(빈 칸에만, 옮긴 옛 칸은 비운다).
export function upgradeHandover(c: Record<string, string>): Record<string, string> {
    const n = { ...c };
    const move = (from: string, to: string) => { const v = (n[from] || "").trim(); if (v && !(n[to] || "").trim()) { n[to] = v; n[from] = ""; } };
    move("works", "history"); move("march", "weeks");
    const crisis = (n.crisis || "").trim();
    if (crisis && !STAGE_KEYS.some(k => (n[k] || "").trim())) {
        // 옛 양식: 초록(전조)·노랑(행동 시작)·빨강(위험)
        crisis.split("\n").map(l => l.trim()).filter(Boolean).forEach(l => {
            const i = /초록/.test(l) ? 1 : /노랑/.test(l) ? 2 : 3;
            const v = l.replace(/^-\s*/, "").replace(/^(초록|노랑|빨강)[^:：]*[:：]\s*/, "");
            n[`stg${i}a`] = n[`stg${i}a`] ? `${n[`stg${i}a`]}\n${v}` : v;
        });
        n.crisis = "";
    }
    return n;
}

export const schoolYearStart = () => { const t = today(); const y = +t.slice(0, 4), m = +t.slice(5, 7); return `${m >= 3 ? y : y - 1}-03-01`; };
const BIP_LABELS: [string, string][] = [
    ["TargetBehavior", "표적행동"], ["OperationalDefinition", "조작적 정의"], ["MedicationStatus", "약물"], ["Hypothesis", "기능평가 결과"],
    ["ReinforcerInfo", "강화제"], ["Goals", "중재목표"], ["PreventionStrategies", "예방"], ["TeachingStrategies", "교수"], ["ReinforcementStrategies", "강화"],
    ["CrisisPlan", "위기(예방·완화)"], ["CrisisNotify", "위기(알림·대처)"], ["CrisisReturn", "위기(복귀)"], ["CrisisHome", "위기(가정학습)"],
    ["HomeSupport", "가정 연계"], ["SupportTeam", "지원팀"], ["OtherConsiderations", "기타"],
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
// AI 결과를 handover 칸으로 나눈다. '행동 단계별 대응'은 '- 단계 | 신호 | 대응' 줄을 단계별 칸으로. 못 나누면 null.
export function parseHandover(text: string): Record<string, string> | null {
    const parsed = splitNumbered(text, AI_TITLES);
    const patch: Record<string, string> = {};
    ROWS.forEach(([t, f]) => { if (parsed[t]) patch[f] = parsed[t]; });
    const norm = (s: string) => s.replace(/[\s·*]/g, "");
    (parsed[STAGE_TITLE] || "").split("\n").forEach(line => {
        const cells = line.replace(/^\s*[-•]\s*/, "").split("|").map(c => c.trim());
        if (cells.length < 3) return;
        const i = HANDOVER_STAGES.findIndex(([st]) => norm(cells[0]).startsWith(norm(st)));
        if (i < 0) return;
        patch[`stg${i}s`] = cells[1]; patch[`stg${i}a`] = cells.slice(2).join(" | ");
    });
    return Object.keys(patch).length ? patch : null;
}

const P1_LIMIT = 1000, P2_LIMIT = 1700; // 인쇄 실측(A4, 여백 12mm) 기준 한계에 맞춘 권장치

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
    const [dist, setDist] = useState<Pick<HandoverChartData, "times" | "places" | "functions" | "types"> & { unknown?: number }>({ times: [] });
    useEffect(() => {
        let alive = true;
        setDist({ times: [] });
        axios.get(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(head.code)}/fba-evidence`, { params: { start_date: start, end_date: today() } })
            .then(r => {
                if (!alive) return;
                const m = r.data?.deterministic_metrics || {};
                const top = (k: string, n: number) => (m[k] || []).filter((x: any) => x.item && x.item !== "미상").slice(0, n);
                setDist({ times: top("time_slot_distribution", 5), places: top("location_hotspot_distribution", 4), functions: top("teacher_inferred_function_distribution", 4), types: top("behavior_type_distribution", 4), unknown: m.function_unknown_count });
            }).catch(() => {});
        return () => { alive = false; };
    }, [head.code, start]);
    const charts: HandoverChartData = useMemo(() => {
        const inYear = logs.filter(l => { const d = dOf(l); return d && d >= start && d <= today(); });
        const ds = inYear.map(dOf);
        const levels = [1, 2, 3, 4, 5].map(n => ({ item: `강도 ${n}`, count: inYear.filter(l => lvl(l) === n).length }));
        const monthly: { label: string; count: number }[] = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(Date.UTC(+start.slice(0, 4), 2 + i, 1)), key = d.toISOString().slice(0, 7);
            if (key > today().slice(0, 7)) break;
            monthly.push({ label: `${d.getUTCMonth() + 1}월`, count: ds.filter(x => x.startsWith(key)).length });
        }
        const { unknown, ...rest } = dist;
        const note = `집계 ${kDate(start)} ~ ${kDate(today())}, 행동기록 1건을 1번으로 셈. ②~⑤는 많은 순 일부만 표시(미상 제외).`
            + (unknown != null ? ` ④ 기능 미기록 ${unknown}번, 한 기록에 기능이 둘 이상일 수 있음.` : "");
        return { monthly, ...rest, levels: levels.some(x => x.count) ? levels : [], tiers, total: ds.length, note: note + " ⑦은 월별 Tier 표 기준." };
    }, [logs, start, dist, tiers]);
    const len = (keys: string[]) => keys.reduce((n, f) => n + (cur[f] || "").length, 0);
    const p1 = len(HANDOVER_P1.map(r => r[1])), p2 = len([...HANDOVER_SUPPORT, ...HANDOVER_PLAN].map(r => r[1]).concat(STAGE_KEYS));
    const y = +start.slice(0, 4);
    // AI 없이 지금까지 작성한 계획에서 옮겨 채운다(AI가 실패해도 쓸 수 있는 바탕)
    const fill = () => {
        const j = (...ks: string[]) => ks.map(k => (bip[k] || "").trim()).filter(Boolean).join("\n");
        set(mergeInto(cur, {
            behavior: [j("OperationalDefinition") || j("TargetBehavior"), dataSummary(logs, behaviors, bip.PlanStart || "")].filter(Boolean).join("\n"),
            function: j("Hypothesis"), reinforcer: j("ReinforcerInfo"), health: j("MedicationStatus"),
            prevent: j("PreventionStrategies"), teach: j("TeachingStrategies"), conseq: j("ReinforcementStrategies"),
            stg2a: j("CrisisPlan"), stg3a: j("CrisisNotify"), stg4a: j("CrisisReturn"),
        }, "empty"));
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
    const printMeta: [string, string][] = metaDef.map(([k, f, v]) => [k, f === "date" ? kDate(v) : v]);
    const meta: [string, React.ReactNode][] = metaDef.map(([k, f, v]) => [k, <Inp key={f} type={f === "date" ? "date" : "text"} value={v} onChange={x => set({ [f]: x })} />]);
    const area = ([, f, ph]: Row, rows = 2) => <Area key={f} value={cur[f] || ""} onChange={v => set({ [f]: v })} placeholder={ph} rows={rows} />;
    const sections: [string, React.ReactNode][] = HANDOVER_P1.map(r => [r[0], area(r)]);
    const page2: HandoverPage2Data = {
        support: HANDOVER_SUPPORT.map(r => [r[0], area(r)]),
        stages: HANDOVER_STAGES.map(([st, ps, pa], i) => [st, area([st, `stg${i}s`, ps], 1), area([st, `stg${i}a`, pa], 1)]),
        plan: HANDOVER_PLAN.map(r => [r[0], area(r)]),
    };
    const printPage2: HandoverPage2Data<string> = {
        support: HANDOVER_SUPPORT.map(([t, f]) => [t, cur[f] || ""]),
        stages: HANDOVER_STAGES.map(([st], i) => [st, cur[`stg${i}s`] || "", cur[`stg${i}a`] || ""]),
        plan: HANDOVER_PLAN.map(([t, f]) => [t, cur[f] || ""]),
    };
    const warn = (n: number, max: number, label: string) => <span style={{ color: n > max ? "#dc2626" : "#475569" }}>{label} {n.toLocaleString()}자 / 권장 {max.toLocaleString()}자 이하</span>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 인수인계 자료 초안 받기(올해 자료 전체)</button>
                    <button className="btn btn-secondary" onClick={fill}>📋 행동중재계획에서 옮겨 채우기</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "sections", heading: "다음 학년도 행동지원 인수인계 자료", s: head, meta: printMeta, sections: HANDOVER_P1.map(([t, f]) => [t, cur[f] || ""]), charts, page2: printPage2 })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, ProgressReport: JSON.stringify({ ...parseJson<any>(bip.ProgressReport, {}), handover: { ...cur, year: yearVal, date: dateVal, author } }) })}>💾 저장</button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>
                    AI는 {kDate(start)}부터 오늘까지의 행동기록 집계와 ②FBA·③행동중재계획·⑤의사결정·⑥의뢰서·⑦결과 보고서를 함께 읽습니다. 먼저 ③·⑦을 저장해 두면 더 정확합니다. &lsquo;확인 필요&rsquo;는 직접 채워 주세요.
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
                {warn(p1, P1_LIMIT, "1쪽 본문")}{warn(p2, P2_LIMIT, "2쪽 본문")}
                {(p1 > P1_LIMIT || p2 > P2_LIMIT) && <span style={{ color: "#dc2626" }}>— 인쇄하면 2쪽을 넘을 수 있습니다. 중복부터 줄여 주세요.</span>}
            </div>
            <div style={sheetBox}><SectionSheet heading="다음 학년도 행동지원 인수인계 자료" s={head} meta={meta} sections={sections} extra={<HandoverCharts d={charts} />} after={<HandoverPage2 d={page2} />} dense /></div>
        </div>
    );
}
