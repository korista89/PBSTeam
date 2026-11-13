"use client";

// 개별학생 행동중재 화면과 인쇄 화면이 함께 쓰는 양식 정의·인쇄 표.
// 학교 'bip 양식.xlsx'(행동중재계획) 칸 순서를 따르고, 표적행동 기록 방법·가정 연계·평가 계획 칸을 더했다.
import React from "react";

export type Bip = Record<string, string>;

export const BIP_ROWS: { key: string; label: string; hint?: string }[] = [
    { key: "MedicationStatus", label: "약물 복용 정보", hint: "복용 시간, 약물 종류, 용량" },
    { key: "OperationalDefinition", label: "행동 조작적 정의", hint: "관찰·측정 가능하게(빈도·지속시간·강도 기준)" },
    { key: "MeasurementMethod", label: "기록 방법", hint: "예: 빈도 기록 — 매일 하교 전 담임이 표적행동 횟수를 기록" },
    { key: "SupportTeam", label: "행동지원팀 구성", hint: "담임, 부담임, 행동중재 담당, 보호자 등" },
    { key: "Hypothesis", label: "기능평가 결과", hint: "기능(가설), 주요 선행사건, 주요 후속결과" },
    { key: "ReinforcerInfo", label: "강화제 정보" },
    { key: "Goals", label: "중재목표", hint: "감소 목표·증가 목표(기간·기준 포함)" },
    { key: "PreventionStrategies", label: "행동지원 방법\n(예방)" },
    { key: "TeachingStrategies", label: "행동지원 방법\n(교수)" },
    { key: "ReinforcementStrategies", label: "행동지원 방법\n(강화)" },
    { key: "CrisisPlan", label: "위기관리 계획\n(예방 및 완화)" },
    { key: "CrisisNotify", label: "위기관리 계획\n(알림 및 대처)" },
    { key: "CrisisReturn", label: "위기관리 계획\n(개별학생교육지원을\n통한 복귀)" },
    { key: "CrisisHome", label: "위기관리 계획\n(가정학습 절차)" },
    { key: "HomeSupport", label: "가정 연계 지원" },
    { key: "EvaluationPlan", label: "평가 계획", hint: "자료 검토 주기, 중재 수정·종료 기준" },
    { key: "OtherConsiderations", label: "기타" },
];

export const FBA_SECTIONS = [
    "의뢰 사유 및 배경 정보",
    "표적행동 정의",
    "자료 수집 방법 및 기간",
    "자료 분석 결과",
    "기능 가설",
    "결론 및 중재 방향",
];

export const PROGRESS_SECTIONS = ["중재 실행 현황", "종합 의견", "향후 계획"];

export function parseJson<T>(v: string | undefined, fallback: T): T {
    if (!v) return fallback;
    try { const p = JSON.parse(v); return p && typeof p === "object" ? p : fallback; } catch { return fallback; }
}

// "1. 제목\n내용\n2. 제목..." 형태의 AI 결과를 절 제목 순서대로 나눈다.
export function splitNumbered(text: string, titles: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    titles.forEach((t, i) => {
        const cur = new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?\\**\\[?${i + 1}\\s*[.)][^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*(?:#{1,6}\\s*)?\\**\\[?${i + 2}\\s*[.)]|$)`);
        const m = text.match(cur);
        if (m) out[t] = m[1].replace(/\*\*/g, "").trim();
    });
    return out;
}

export const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
export const kDate = (iso?: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.slice(0, 10).split("-");
    return y && m && d ? `${+y}. ${+m}. ${+d}.` : iso;
};

// ── 인쇄 표 ─────────────────────────────────────────────
const th: React.CSSProperties = { border: "1px solid #000", background: "#f2f2f2", fontWeight: 700, padding: "5px 6px", textAlign: "center", verticalAlign: "middle", fontSize: "9.5pt", whiteSpace: "pre-line" };
const td: React.CSSProperties = { border: "1px solid #000", padding: "5px 7px", verticalAlign: "top", fontSize: "9.5pt", whiteSpace: "pre-wrap", wordBreak: "break-word" };
const title: React.CSSProperties = { textAlign: "center", fontSize: "16pt", margin: "0 0 12px", letterSpacing: 2 };

export type StudentHead = { name: string; className: string; code: string };

export function BipSheet({ s, b, behaviors }: { s: StudentHead; b: Bip; behaviors: any[] }) {
    const period = b.PlanStart ? `${kDate(b.PlanStart)} ~ ${b.PlanEnd ? kDate(b.PlanEnd) : "진행 중"}` : "";
    const tb = behaviors.filter(x => x.Status !== "삭제");
    return (
        <>
            <h1 style={title}>행동중재계획</h1>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "19%" }} /><col style={{ width: "31%" }} /><col style={{ width: "19%" }} /><col style={{ width: "31%" }} /></colgroup>
                <tbody>
                    <tr><th style={th}>학생명</th><td style={td}>{s.name}</td><th style={th}>소속 학교</th><td style={td}>경은학교</td></tr>
                    <tr><th style={th}>학년</th><td style={td}>{s.className}</td><th style={th}>성별</th><td style={td}>{b.Gender}</td></tr>
                    <tr><th style={th}>장애 유형</th><td style={td}>{b.DisabilityType}</td><th style={th}>담당교사</th><td style={td}>{b.Teacher}</td></tr>
                    <tr><th style={th}>중재계획명</th><td style={td}>{b.PlanName}</td><th style={th}>중재기간</th><td style={td}>{period}</td></tr>
                    <tr><th style={th}>표적행동</th><td style={td}>{b.TargetBehavior}</td><th style={th}>약물복용 여부</th><td style={td}>{b.MedicationYN}</td></tr>
                    {BIP_ROWS.map(r => (
                        <tr key={r.key}>
                            <th style={th}>{r.label}</th>
                            <td style={td} colSpan={3}>
                                {b[r.key]}
                                {r.key === "MeasurementMethod" && tb.length > 0 && (
                                    <div style={{ marginTop: b[r.key] ? 4 : 0 }}>
                                        {tb.map(x => <div key={x.BehaviorID}>· [{x.Type}] {x.Definition} — {x.MeasurementType} 기록{x.Baseline ? `, 기저선 ${x.Baseline}` : ""}</div>)}
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

export function SectionSheet({ heading, s, meta, sections, extra }: {
    heading: string; s: StudentHead; meta: [string, string][]; sections: [string, string][]; extra?: React.ReactNode;
}) {
    return (
        <>
            <h1 style={title}>{heading}</h1>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "19%" }} /><col style={{ width: "31%" }} /><col style={{ width: "19%" }} /><col style={{ width: "31%" }} /></colgroup>
                <tbody>
                    <tr><th style={th}>학생명</th><td style={td}>{s.name}</td><th style={th}>학년</th><td style={td}>{s.className}</td></tr>
                    {chunk(meta).map((pair, i) => (
                        <tr key={i}>{pair.map(([k, v]) => <React.Fragment key={k}><th style={th}>{k}</th><td style={td} colSpan={pair.length === 1 ? 3 : 1}>{v}</td></React.Fragment>)}</tr>
                    ))}
                    {extra && <tr><td style={{ ...td, padding: 8 }} colSpan={4}>{extra}</td></tr>}
                    {sections.map(([k, v]) => (
                        <tr key={k}><th style={th}>{k}</th><td style={{ ...td, minHeight: 60 }} colSpan={3}>{v}</td></tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

function chunk(a: [string, string][]) {
    const out: [string, string][][] = [];
    for (let i = 0; i < a.length; i += 2) out.push(a.slice(i, i + 2));
    return out;
}

// 표적행동별 중재 전·후 요약 표(결과 보고서용)
export type BehaviorSummary = {
    id: string; label: string; type: string; unit: string; baseline: string;
    preMean: number | null; preN: number; postMean: number | null; postN: number;
    fidelity: number | null; fidelityN: number;
};

export function SummaryTable({ rows, crisis }: { rows: BehaviorSummary[]; crisis: { pre: number; post: number; preWeeks: number; postWeeks: number } }) {
    const c: React.CSSProperties = { border: "1px solid #000", padding: "3px 5px", fontSize: "8.5pt", textAlign: "center" };
    const fmt = (v: number | null) => (v === null ? "-" : String(Math.round(v * 10) / 10));
    const rate = (n: number, w: number) => (w > 0 ? `${Math.round((n / w) * 10) / 10}건/주` : "-");
    return (
        <div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["표적행동", "측정", "중재 전 평균(n)", "중재 중 평균(n)", "변화", "실행충실도"].map(h => <th key={h} style={{ ...c, background: "#f2f2f2" }}>{h}</th>)}</tr></thead>
                <tbody>
                    {rows.map(r => {
                        const diff = r.preMean !== null && r.postMean !== null && r.preMean !== 0 ? Math.round(((r.postMean - r.preMean) / r.preMean) * 100) : null;
                        return (
                            <tr key={r.id}>
                                <td style={{ ...c, textAlign: "left" }}>[{r.type}] {r.label}</td>
                                <td style={c}>{r.unit}</td>
                                <td style={c}>{r.preN ? `${fmt(r.preMean)} (${r.preN})` : (r.baseline || "-")}</td>
                                <td style={c}>{r.postN ? `${fmt(r.postMean)} (${r.postN})` : "-"}</td>
                                <td style={c}>{diff === null ? "-" : `${diff > 0 ? "+" : ""}${diff}%`}</td>
                                <td style={c}>{r.fidelity === null ? "-" : `${r.fidelity}% (${r.fidelityN}회)`}</td>
                            </tr>
                        );
                    })}
                    {rows.length === 0 && <tr><td style={c} colSpan={6}>등록된 표적행동이 없습니다.</td></tr>}
                </tbody>
            </table>
            <div style={{ fontSize: "8.5pt", marginTop: 4 }}>
                위기행동 기록(행동기록 탭): 중재 전 {crisis.pre}건({rate(crisis.pre, crisis.preWeeks)}) → 중재 중 {crisis.post}건({rate(crisis.post, crisis.postWeeks)})
            </div>
        </div>
    );
}
