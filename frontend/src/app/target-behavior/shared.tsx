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
        // AI가 절 하나를 빼먹어도 다음 절이 앞 절에 붙지 않게, 뒤에 오는 어느 절 번호에서든 끊는다
        const later = titles.map((_, k) => k + 1).filter(n => n > i + 1).reverse().join("|") || "\\d+";
        const cur = new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?\\**\\[?${i + 1}\\s*[.)][^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*(?:#{1,6}\\s*)?\\**\\[?(?:${later})\\s*[.)]|$)`);
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
const thBase: React.CSSProperties = { border: "1px solid #000", background: "#f2f2f2", fontWeight: 700, padding: "5px 6px", textAlign: "center", verticalAlign: "middle", fontSize: "9.5pt", whiteSpace: "pre-line" };
const tdBase: React.CSSProperties = { border: "1px solid #000", padding: "5px 7px", verticalAlign: "top", fontSize: "9.5pt", whiteSpace: "pre-wrap", wordBreak: "break-word" };
const title: React.CSSProperties = { textAlign: "center", fontSize: "16pt", margin: "0 0 12px", letterSpacing: 2 };
// 인수인계 자료(A4 2쪽 제한)만 칸 여백·줄 간격을 줄인다. 글자 크기는 그대로.
const tight: React.CSSProperties = { padding: "3px 6px", lineHeight: 1.4 };
const thD: React.CSSProperties = { ...thBase, ...tight }, tdD: React.CSSProperties = { ...tdBase, ...tight };
const th = thBase, td = tdBase;

export type StudentHead = { name: string; className: string; code: string };

// ── 입력 칸: 인쇄 양식 칸 안에 바로 쓰는 입력 요소(위기행동 보고서 입력 방식과 같다) ──
const cellBox: React.CSSProperties = { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: "9.5pt", padding: "3px 5px", border: "1px dashed #93c5fd", background: "#f8fbff", borderRadius: 3 };
export function Inp({ value, onChange, type = "text", placeholder, width }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; width?: number | string }) {
    return <input type={type} value={value || ""} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={{ ...cellBox, ...(width ? { width } : {}) }} />;
}
export function Area({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
    return <textarea value={value || ""} placeholder={placeholder} onChange={e => onChange(e.target.value)} rows={Math.max(rows, (value || "").split("\n").length + 1)} style={{ ...cellBox, resize: "vertical", lineHeight: 1.6 }} />;
}
export function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
    return <select value={value || ""} onChange={e => onChange(e.target.value)} style={cellBox}><option value="">선택</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
}
export function DateRange({ a, b, onA, onB }: { a: string; b: string; onA: (v: string) => void; onB: (v: string) => void }) {
    return <span style={{ display: "flex", gap: 4, alignItems: "center" }}><Inp type="date" value={a} onChange={onA} /> ~ <Inp type="date" value={b} onChange={onB} /></span>;
}
// 작성 화면에서 인쇄 양식과 같은 칸 모양으로 보여 주는 바깥 틀
export const sheetBox: React.CSSProperties = { background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, padding: "22px 24px", color: "#000", fontFamily: "'Malgun Gothic', sans-serif", overflowX: "auto" };

export type BipEdit = { set: (k: string, v: string) => void; extra?: (key: string) => React.ReactNode };

export function BipSheet({ s, b, behaviors, edit }: { s: StudentHead; b: Bip; behaviors: any[]; edit?: BipEdit }) {
    const F = (k: string, ph?: string) => (edit ? <Inp value={b[k]} onChange={v => edit.set(k, v)} placeholder={ph} /> : b[k]);
    const period = b.PlanStart ? `${kDate(b.PlanStart)} ~ ${b.PlanEnd ? kDate(b.PlanEnd) : "진행 중"}` : "";
    const tb = behaviors.filter(x => x.Status !== "삭제");
    return (
        <>
            <h1 style={title}>행동중재계획</h1>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "19%" }} /><col style={{ width: "31%" }} /><col style={{ width: "19%" }} /><col style={{ width: "31%" }} /></colgroup>
                <tbody>
                    <tr><th style={th}>학생명</th><td style={td}>{s.name}</td><th style={th}>소속 학교</th><td style={td}>경은학교</td></tr>
                    <tr><th style={th}>학년</th><td style={td}>{s.className}</td><th style={th}>성별</th><td style={td}>{F("Gender")}</td></tr>
                    <tr><th style={th}>장애 유형</th><td style={td}>{F("DisabilityType")}</td><th style={th}>담당교사</th><td style={td}>{F("Teacher")}</td></tr>
                    <tr><th style={th}>중재계획명</th><td style={td}>{F("PlanName")}</td><th style={th}>중재기간</th><td style={td}>{edit ? <DateRange a={b.PlanStart} b={b.PlanEnd} onA={v => edit.set("PlanStart", v)} onB={v => edit.set("PlanEnd", v)} /> : period}</td></tr>
                    <tr><th style={th}>표적행동</th><td style={td}>{F("TargetBehavior", "예: 공격 행동, 자해 행동")}</td><th style={th}>약물복용 여부</th><td style={td}>{edit ? <Sel value={b.MedicationYN} onChange={v => edit.set("MedicationYN", v)} options={["복용", "미복용"]} /> : b.MedicationYN}</td></tr>
                    {BIP_ROWS.map(r => (
                        <tr key={r.key}>
                            <th style={th}>{r.label}</th>
                            <td style={td} colSpan={3}>
                                {edit ? <Area value={b[r.key]} onChange={v => edit.set(r.key, v)} placeholder={r.hint} /> : b[r.key]}
                                {edit?.extra?.(r.key)}
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

export function SectionSheet({ heading, s, meta, sections, extra, after, dense }: {
    heading: string; s: StudentHead; meta: [string, React.ReactNode][]; sections: [string, React.ReactNode][]; extra?: React.ReactNode; after?: React.ReactNode; dense?: boolean;
}) {
    const th = dense ? thD : thBase, td = dense ? tdD : tdBase;
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
                        <tr key={k} style={noSplit}><th style={th}>{k}</th><td style={{ ...td, minHeight: 60 }} colSpan={3}>{v}</td></tr>
                    ))}
                </tbody>
            </table>
            {after}
        </>
    );
}

const noSplit: React.CSSProperties = { breakInside: "avoid", pageBreakInside: "avoid" };
const groupHead: React.CSSProperties = { fontSize: "11pt", fontWeight: 700, margin: "10px 0 4px" };

// 인수인계 자료 2쪽: 가. 핵심 행동지원 방법 / 나. 행동 단계별 대응(3열) / 다. 새 학년도 초기 실행계획. 인쇄하면 새 쪽에서 시작한다.
export type HandoverPage2Data<T = React.ReactNode> = { support: [string, T][]; stages: [string, T, T][]; plan: [string, T][] };
export function HandoverPage2({ d, split = true }: { d: HandoverPage2Data; split?: boolean }) {
    const rows = (list: [string, React.ReactNode][]) => (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup><col style={{ width: "19%" }} /><col style={{ width: "81%" }} /></colgroup>
            <tbody>{list.map(([k, v]) => <tr key={k} style={noSplit}><th style={thD}>{k}</th><td style={tdD}>{v}</td></tr>)}</tbody>
        </table>
    );
    return (
        <div data-page2 style={split ? { breakBefore: "page", pageBreakBefore: "always", paddingTop: 6 } : { paddingTop: 6 }}>
            <div style={{ ...groupHead, marginTop: 0 }}>가. 핵심 행동지원 방법</div>
            {rows(d.support)}
            <div style={groupHead}>나. 행동 단계별 대응</div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "13%" }} /><col style={{ width: "37%" }} /><col style={{ width: "50%" }} /></colgroup>
                <thead><tr><th style={thD}>단계</th><th style={thD}>학생의 행동 신호</th><th style={thD}>교사의 구체적인 대응</th></tr></thead>
                <tbody>{d.stages.map(([k, a, b]) => <tr key={k} style={noSplit}><th style={thD}>{k}</th><td style={tdD}>{a}</td><td style={tdD}>{b}</td></tr>)}</tbody>
            </table>
            <div style={groupHead}>다. 새 학년도 초기 실행계획</div>
            {rows(d.plan)}
        </div>
    );
}

function chunk(a: [string, React.ReactNode][]) {
    const out: [string, React.ReactNode][][] = [];
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
                    {rows.length === 0 && <tr><td style={c} colSpan={6}>추가 지표 없음 — 위기행동 기록만으로 평가합니다.</td></tr>}
                </tbody>
            </table>
            <div style={{ fontSize: "8.5pt", marginTop: 4 }}>
                위기행동 기록(행동기록 탭): 중재 전 {crisis.pre}건({rate(crisis.pre, crisis.preWeeks)}) → 중재 중 {crisis.post}건({rate(crisis.post, crisis.postWeeks)})
            </div>
        </div>
    );
}

// 인수인계 자료용 차트 2개(월별 행동 건수·많이 일어난 시간). 인쇄에도 그대로 나오도록 라이브러리 없이 그린다.
type Ranked = { item: string; count: number };
export type HandoverChartData = { monthly: { label: string; count: number }[]; times: Ranked[]; places?: Ranked[]; functions?: Ranked[]; types?: Ranked[]; levels?: Ranked[]; tiers?: TierMonth[]; total: number; note?: string };
// 월별 지원 단계: level은 '', Tier1, Tier2, Tier3, Tier3+ ('' = 그 달 표 없음), detail은 CICO·SST 등
export type TierMonth = { month: number; level: string; detail: string };

// 인수인계 차트 6개: 추세(나아지고 있나)·언제·어디서·왜(기능)·어떤 행동·얼마나 심했나(위기 대응 준비). CSS 막대라 인쇄에도 그대로 나온다.
const printExact: React.CSSProperties = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" };
const chartBox: React.CSSProperties = { flex: 1, minWidth: 0, border: "1px solid #000", padding: "4px 8px" };
const chartHead: React.CSSProperties = { fontWeight: 700, fontSize: "9pt", marginBottom: 2 };
const cleanLabel = (s: string) => s.replace(/^\s*\d+\s*구간\s*:\s*/, "").replace(/\(.*?\)/g, "").trim();

function BarList({ title, rows, color, empty }: { title: string; rows: Ranked[]; color: string; empty: string }) {
    const max = Math.max(1, ...rows.map(r => r.count));
    return (
        <div style={chartBox}>
            <div style={chartHead}>{title}</div>
            {rows.length === 0 && <div style={{ fontSize: "8.5pt" }}>{empty}</div>}
            {rows.map(r => (
                <div key={r.item} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "8pt", marginBottom: 1, lineHeight: 1.25 }}>
                    <span style={{ width: 72, flexShrink: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{cleanLabel(r.item)}</span>
                    <div style={{ flex: 1, height: 8 }}><div style={{ width: `${(r.count / max) * 100}%`, height: "100%", background: color, ...printExact }} /></div>
                    <span style={{ width: 30, textAlign: "right" }}>{r.count}번</span>
                </div>
            ))}
        </div>
    );
}

const TIER_COLOR: Record<string, [string, string]> = { Tier1: ["#e2e8f0", "#000"], Tier2: ["#fde68a", "#000"], Tier3: ["#fca5a5", "#000"], "Tier3+": ["#b91c1c", "#fff"] };
// ⑦ 달마다 지원 단계: 달마다 칸 하나, 단계가 바뀐 달은 굵은 테두리와 아래 '바뀐 점' 줄로 알린다.
function TierStrip({ tiers }: { tiers: TierMonth[] }) {
    const changes = tiers.slice(1).map((t, i) => ({ t, prev: tiers[i] })).filter(({ t, prev }) => t.level && prev.level && t.level !== prev.level);
    return (
        <div style={chartBox}>
            <div style={chartHead}>⑦ 달마다 지원 단계(Tier)는 어떻게 바뀌었나</div>
            <div style={{ display: "flex", gap: 2 }}>
                {tiers.map((t, i) => {
                    const [bg, fg] = TIER_COLOR[t.level] || ["#fff", "#64748b"];
                    const changed = i > 0 && t.level && tiers[i - 1].level && t.level !== tiers[i - 1].level;
                    return (
                        <div key={t.month} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: "7.5pt", lineHeight: 1.25 }}>
                            <div>{t.month}월</div>
                            <div style={{ background: bg, color: fg, border: changed ? "2px solid #000" : "1px solid #94a3b8", padding: "2px 0", fontWeight: 700, ...printExact }}>
                                {t.level || "표 없음"}
                                {t.detail && <div style={{ fontWeight: 400, fontSize: "6.5pt" }}>{t.detail}</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{ fontSize: "8pt", marginTop: 2 }}>
                {changes.length ? <>바뀐 점: {changes.map(({ t, prev }) => `${t.month}월 ${prev.level} → ${t.level}`).join(", ")}</> : "올해 단계 변화 없음"}
            </div>
        </div>
    );
}

export function HandoverCharts({ d }: { d: HandoverChartData }) {
    const mMax = Math.max(1, ...d.monthly.map(m => m.count));
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 8 }}>
                <div style={chartBox}>
                    <div style={chartHead}>① 달마다 행동이 몇 번 있었나 (전체 {d.total}번)</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 66 }}>
                        {d.monthly.map(m => (
                            <div key={m.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                                <div style={{ fontSize: "7.5pt" }}>{m.count || ""}</div>
                                <div style={{ width: "70%", height: `${(m.count / mMax) * 44}px`, background: "#4f46e5", ...printExact }} />
                                <div style={{ fontSize: "7.5pt", borderTop: "1px solid #000", width: "100%", textAlign: "center" }}>{m.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <BarList title="② 언제 많이 일어났나" rows={d.times} color="#f59e0b" empty="시간 기록 없음" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <BarList title="③ 어디서 많이 일어났나" rows={d.places || []} color="#0ea5e9" empty="장소 기록 없음" />
                <BarList title="④ 왜 했을까 (교사가 기록한 기능)" rows={d.functions || []} color="#16a34a" empty="기능 기록 없음" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <BarList title="⑤ 어떤 행동이 많았나" rows={d.types || []} color="#9333ea" empty="행동 기록 없음" />
                <BarList title="⑥ 얼마나 심했나 (강도 1 약함 ~ 5 매우 심함)" rows={d.levels || []} color="#dc2626" empty="강도 기록 없음" />
            </div>
            {d.tiers && d.tiers.length > 0 && <TierStrip tiers={d.tiers} />}
            {d.note && <div style={{ fontSize: "7.5pt", color: "#333" }}>{d.note}</div>}
        </div>
    );
}
