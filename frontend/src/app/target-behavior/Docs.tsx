"use client";

// ⑤ 데이터 기반 의사결정, ⑥ 의료협력의뢰서·추가지원신청서.
// 따로 시트 칸을 만들지 않고 BIP 행의 ProgressReport JSON 안(decision·medical·support)에 함께 저장한다.
import React, { useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import MeetingNotesSection from "./MeetingNotes";
import { Bip, StudentHead, parseJson, today, kDate } from "./shared";
import { AIBox, AutoArea, card, dOf, err, inp, lab, mergeInto, openPrint } from "./Steps";

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
    const sections: [string, string][] = [["자료 요약", summary], ["결정", cur.choice || ""], ["판단 근거", cur.rationale || ""], ["다음 점검일·후속 조치", `${cur.nextReview ? kDate(cur.nextReview) + " · " : ""}${cur.actions || ""}`]];
    const meta: [string, string][] = [["결정일", kDate(cur.date || today())], ["작성자", cur.author || bip.Teacher || ""]];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
                <div style={{ fontWeight: 800, fontSize: "0.88rem", marginBottom: 6 }}>지금까지의 자료 (자동)</div>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.83rem", lineHeight: 1.7 }}>{summary}</pre>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>④에서 입력한 표적행동 차트도 함께 보고 판단하세요. 2주 이상 개선이 없으면 전략 수정, 4주 연속 목표 달성이면 하향·종료를 검토합니다.</div>
                <div style={{ marginTop: 10 }}><button className="btn btn-ai" onClick={runAI} disabled={ai.loading}>🤖 의사결정 의견 초안 받기</button></div>
                <AIBox text={ai.text} loading={ai.loading} onApply={apply} />
            </div>
            <div style={card}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }} className="grid-responsive">
                    <div><label style={lab}>결정</label>
                        <select style={inp} value={cur.choice || ""} onChange={e => set({ choice: e.target.value })}>
                            <option value="">선택</option>{CHOICES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select></div>
                    <div><label style={lab}>결정일</label><input type="date" style={inp} value={cur.date || today()} onChange={e => set({ date: e.target.value })} /></div>
                    <div><label style={lab}>다음 점검일</label><input type="date" style={inp} value={cur.nextReview || ""} onChange={e => set({ nextReview: e.target.value })} /></div>
                </div>
                <label style={{ ...lab, marginTop: 10 }}>판단 근거 (자료의 어느 수치를 보고 결정했는지)</label>
                <AutoArea value={cur.rationale || ""} onChange={v => set({ rationale: v })} rows={4} />
                <label style={{ ...lab, marginTop: 10 }}>후속 조치 (누가·언제·무엇을)</label>
                <AutoArea value={cur.actions || ""} onChange={v => set({ actions: v })} rows={3} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "sections", heading: "데이터 기반 의사결정 기록", s: head, meta, sections })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, ProgressReport: JSON.stringify({ ...parseJson<any>(bip.ProgressReport, {}), decision: { ...cur, date: cur.date || today(), author: cur.author || bip.Teacher || "" } }) })}>💾 저장</button>
                </div>
            </div>
            <MeetingNotesSection apiUrl={API_BASE_URL} meetingType="tier3" title="이 학생 사례 협의 기록 (누적)" studentCode={head.code} />
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
    const d = DOCS[kind];
    const { cur, set } = useStore(bip, setBip, d.key);
    const fill = () => {
        const patch: Record<string, string> = { behavior: dataSummary(logs, behaviors, bip.PlanStart || "") };
        if (kind === "medical" && bip.MedicationStatus) patch.health = bip.MedicationStatus;
        set(mergeInto(cur, patch, "empty"));
    };
    const meta: [string, string][] = d.meta.map(([k, f]) => [k, f === "date" ? kDate(cur.date || today()) : cur[f] || (f === "author" ? bip.Teacher || "" : "")]);
    const printSections: [string, string][] = d.sections.map(([k, f]) => [k, cur[f] || ""]);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 6 }}>
                {(Object.keys(DOCS) as ("medical" | "support")[]).map(k => (
                    <button key={k} onClick={() => setKind(k)} style={{ padding: "7px 14px", borderRadius: 8, fontWeight: 800, fontSize: "0.83rem", cursor: "pointer", border: kind === k ? "2px solid #7c3aed" : "1px solid #cbd5e1", background: kind === k ? "#f5f3ff" : "#fff" }}>{DOCS[k].label}</button>
                ))}
            </div>
            <div style={card}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }} className="grid-responsive">
                    {d.meta.map(([k, f]) => (
                        <div key={f}><label style={lab}>{k}</label>
                            <input style={inp} type={f === "date" ? "date" : "text"} value={f === "date" ? cur.date || today() : cur[f] ?? (f === "author" ? bip.Teacher || "" : "")} onChange={e => set({ [f]: e.target.value })} /></div>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    <button className="btn btn-secondary" onClick={fill}>📊 자료로 &lsquo;행동 요약&rsquo; 채우기</button>
                    <button className="btn btn-secondary" onClick={() => openPrint({ doc: "sections", heading: d.heading, s: head, meta, sections: printSections })}>🖨️ 미리보기·인쇄</button>
                    <button className="btn btn-primary" onClick={() => save({ ...bip, ProgressReport: JSON.stringify({ ...parseJson<any>(bip.ProgressReport, {}), [d.key]: { ...cur, date: cur.date || today(), author: cur.author ?? bip.Teacher ?? "" } }) })}>💾 저장</button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6 }}>학생 실명·진단 정보는 보호자 동의 범위 안에서만 적고, 외부로 보내기 전에 담당 부장·관리자 확인을 받으세요.</div>
            </div>
            {d.sections.map(([t, f, ph]) => (
                <div key={f} style={card}>
                    <label style={{ ...lab, fontSize: "0.88rem", color: "#0f172a" }}>{t}</label>
                    <AutoArea value={cur[f] || ""} onChange={v => set({ [f]: v })} placeholder={ph} rows={4} />
                </div>
            ))}
        </div>
    );
}
