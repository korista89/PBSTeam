"use client";

import React, { useState } from "react";
import { AuthCheck } from "../components/AuthProvider";
import AppShell, { CONSENT_ACCOUNT } from "../components/AppShell";
import { useAuth } from "../components/AuthProvider";

// 동의서: 어떤 지원에 동의서가 꼭 필요한지 한눈에 보고, 필요한 3종만 빈 양식으로 인쇄한다.
// 빈 양식(개인정보 없음)을 보호자에게 나눠 주는 용도라 '대외비' 워터마크를 넣는 PrintGuard 대신 window.print()를 쓴다.
// 법 조항은 화면 안내용이다. 시행 전 개인정보 보호책임자·교육청 확인을 받는다.

type FormKey = "site" | "tier3" | "external";

const NEED: { what: string; who: string; need: string; form?: FormKey; why: string }[] = [
    { what: "위기행동 지원 프로토콜(방어 및 보호를 위한 제지, 개별학생교육지원)", who: "전 교직원", need: "동의서 없음", why: "학생·교직원 안전을 위한 생활지도로 법령(교원의 학생생활지도에 관한 고시)에 근거함. 동의 여부로 실행을 바꿀 수 없음. 학기 초 가정통신문으로 안내하고, 실행한 날 보호자에게 알림" },
    { what: "Tier1 보편적 지원", who: "전 교직원 → 전교생", need: "동의서 없음", why: "학교 교육과정·학교규칙에 따른 교육활동" },
    { what: "Tier2 CICO", who: "담임 → 대상 학생", need: "동의서 없음", why: "학급 안 교육활동이고 정보가 학교 밖으로 나가지 않음. 사이트 기록은 ① 동의서로 함께 받음. 시작할 때 보호자에게 안내(가정 연계 카드)" },
    { what: "Tier2 SST(외부전문가 연계)", who: "외부전문가", need: "③ 실행 전", form: "external", why: "학생 정보를 학교 밖 전문가에게 제공함(개인정보 제3자 제공)" },
    { what: "Tier3 개별 행동지원(위기관리계획 포함)", who: "개별화교육지원팀", need: "② 실행 전", form: "tier3", why: "개별 기능평가와 행동중재계획을 보호자와 합의하고, 위기관리계획(제지 절차 포함)을 미리 확인받음" },
    { what: "Tier3+ 외부전문가·의료 연계", who: "외부전문가·의료기관", need: "③ 실행 전", form: "external", why: "제3자 제공에 더해 진단·건강 같은 민감정보가 나감(별도 동의)" },
    { what: "이 사이트(경은PBS 통합관리플랫폼) 활용", who: "학교", need: "① 학기 초", form: "site", why: "장애·건강 같은 민감정보 처리, 국외 AI 분석, 국외 보관 위탁이 있음" },
];

const FORMS: { key: FormKey; label: string; when: string }[] = [
    { key: "site", label: "① 사이트 활용 동의서", when: "학기 초, 행동 기록을 입력하는 학생" },
    { key: "tier3", label: "② Tier3 개별 행동지원 동의서", when: "Tier3 지원 시작 전" },
    { key: "external", label: "③ 외부전문가 연계 정보 제공 동의서", when: "SST·Tier3+ 연계 전, 연계 기관마다" },
];

const schoolYear = () => { const d = new Date(); return d.getMonth() + 1 >= 3 ? d.getFullYear() : d.getFullYear() - 1; };

// ── 양식 공통 조각 ──────────────────────────────────────────
const S = {
    sheet: { background: "#fff", color: "#000", fontFamily: "'Malgun Gothic', sans-serif", fontSize: "10pt", lineHeight: 1.55, padding: "14mm 15mm", maxWidth: "210mm", margin: "0 auto", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" } as React.CSSProperties,
    title: { textAlign: "center", fontSize: "17pt", fontWeight: 800, margin: "0 0 4px" } as React.CSSProperties,
    sub: { textAlign: "center", fontSize: "10pt", margin: "0 0 12px" } as React.CSSProperties,
    h: { fontSize: "11pt", fontWeight: 800, margin: "12px 0 4px" } as React.CSSProperties,
    table: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed", margin: "4px 0" } as React.CSSProperties,
    th: { border: "1px solid #000", background: "#eef2f7", padding: "4px 6px", fontWeight: 700, textAlign: "center", verticalAlign: "middle" } as React.CSSProperties,
    td: { border: "1px solid #000", padding: "4px 6px", verticalAlign: "top" } as React.CSSProperties,
    note: { fontSize: "9pt", margin: "4px 0" } as React.CSSProperties,
};
const CK = "□ 동의함   □ 동의하지 않음";

function Who({ extra }: { extra?: [string, string][] }) {
    const rows: [string, string][] = [["학생 학급", ""], ["학생 성명", ""], ["보호자 성명", ""], ["학생과의 관계", ""], ...(extra || [])];
    const pairs: [string, string][][] = [];
    for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2));
    return (
        <table style={S.table}>
            <colgroup><col style={{ width: "18%" }} /><col style={{ width: "32%" }} /><col style={{ width: "18%" }} /><col style={{ width: "32%" }} /></colgroup>
            <tbody>{pairs.map((p, i) => <tr key={i}>{p.map(([k, v]) => <React.Fragment key={k}><th style={S.th}>{k}</th><td style={{ ...S.td, height: 26 }}>{v}</td></React.Fragment>)}</tr>)}</tbody>
        </table>
    );
}

function Rows({ head, rows, widths }: { head: string[]; rows: string[][]; widths: number[] }) {
    return (
        <table style={S.table}>
            <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
            <thead><tr>{head.map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ ...S.td, ...(j === r.length - 1 && c.includes("□") ? { textAlign: "center", verticalAlign: "middle" } : {}), whiteSpace: "pre-line" }}>{c}</td>)}</tr>)}</tbody>
        </table>
    );
}

function Sign({ y, who = "보호자(법정대리인)" }: { y: number; who?: string }) {
    return (
        <>
            <p style={{ margin: "10px 0 4px" }}>위 내용을 읽고 이해하였으며, 표시한 바와 같이 동의합니다.</p>
            <table style={S.table}>
                <colgroup><col style={{ width: "18%" }} /><col style={{ width: "32%" }} /><col style={{ width: "18%" }} /><col style={{ width: "32%" }} /></colgroup>
                <tbody>
                    <tr><th style={S.th}>작성일</th><td style={S.td}>{y}.      .      .</td><th style={S.th}>학생 본인 의견</th><td style={S.td}>□ 쉬운 말로 설명함</td></tr>
                    <tr><th style={S.th}>{who}</th><td style={{ ...S.td, height: 34 }} colSpan={3}><span style={{ float: "right" }}>(서명 또는 인)</span></td></tr>
                </tbody>
            </table>
            <p style={{ textAlign: "right", fontWeight: 800, fontSize: "12pt", margin: "12px 0 0" }}>경은학교장 귀하</p>
        </>
    );
}

function Rights() {
    return (
        <>
            <p style={S.note}>· 보호자는 언제든 열람·정정·삭제·처리정지를 요구하거나 동의를 철회할 수 있습니다(담당 교사 또는 개인정보 보호책임자).</p>
            <p style={S.note}>· 동의하지 않아도 학생의 교육활동에는 불이익이 없습니다. 다만 동의하지 않은 항목의 지원은 할 수 없습니다.</p>
        </>
    );
}

// ── ① 사이트 활용 동의서 ────────────────────────────────────
function SiteForm({ y }: { y: number }) {
    const term = `${y}. 3. 1. ~ ${y + 1}. 2. 말일(${y}학년도)`;
    return (
        <div style={S.sheet}>
            <h1 style={S.title}>개인정보 수집·이용 및 국외 이전 동의서</h1>
            <p style={S.sub}>{y}학년도 경은학교 긍정적 행동지원(경은PBS) 통합관리플랫폼</p>
            <p style={{ margin: "0 0 6px" }}>경은학교는 학생의 긍정적 행동지원을 위해 학교 행동지원 기록 사이트(경은PBS 통합관리플랫폼)에 아래와 같이 개인정보를 처리하고자 합니다. 항목별 내용을 읽고 동의 여부를 표시해 주십시오.</p>
            <div style={S.h}>1. 학생·보호자</div>
            <Who />
            <div style={S.h}>2. 동의 항목</div>
            <Rows widths={[17, 30, 20, 15, 18]} head={["구분", "처리 항목", "목적", "보유 기간", "동의 여부"]} rows={[
                ["[필수] 행동지원 기록", "학생 별칭(예: 김O준)·학급, 위기행동 기록(일시·장소·행동·강도·기능·선행사건·후속결과), CICO·토큰·표적행동 기록, 협의 기록", "행동 기능 분석, 중재계획 수립·점검, 보고서 작성", `${term}\n학년도 끝나면 파기`, CK],
                ["[필수] 민감정보", "장애 유형, 건강 상태, 약물 복용 정보(중재계획에 필요한 범위)", "개별 중재계획 수립, 의료 협력 검토", "위와 같음", CK],
                ["[선택] 국외 AI 분석", "실명을 학생코드로 바꾼 행동 기록과 교사가 입력한 문장을 Google Gemini(Google LLC, 미국)에 암호화 전송", "기록 분석, 계획·보고서 초안 작성 지원(교사 확인 뒤 반영)", "Google 유료 API 약관에 따름(학습에 쓰지 않음)", CK],
                ["[선택] 다음 학년도 인수인계", "가명 처리한 올해 행동 기록 요약을 다음 학년도 같은 학교 담당 교사에게 인계", "학년이 바뀌어도 지원 이어 가기", "재학 중(매년 다시 확인)", CK],
            ]} />
            <div style={S.h}>3. 처리 위탁과 국외 보관 안내</div>
            <Rows widths={[22, 38, 40]} head={["맡기는 곳(국가)", "맡기는 일", "보관 위치"]} rows={[
                ["Google LLC(미국)", "Google Sheets — 기록 저장(학생 이름은 별칭으로만 저장)", "Google 데이터센터(국외 포함)"],
                ["Vercel Inc.(미국)", "웹사이트·서버 운영(저장하지 않음)", "서버 실행: 서울"],
            ]} />
            <p style={S.note}>· 필수 항목에 동의하지 않으면 사이트에 이 학생의 행동 기록을 입력하지 않고, 종이 기록으로 지원합니다.</p>
            <p style={S.note}>· 선택 항목에 동의하지 않아도 필수 항목 이용에는 영향이 없습니다. 국외 AI 분석에 동의하지 않으면 그 학생에게는 AI 초안 기능을 쓰지 않습니다.</p>
            <p style={S.note}>· 학교 밖 제3자에게는 제공하지 않습니다. 외부 기관 연계가 필요하면 그때 따로 동의를 받습니다.</p>
            <Rights />
            <Sign y={y} />
        </div>
    );
}

// ── ② Tier3 개별 행동지원 동의서 ─────────────────────────────
function Tier3Form({ y }: { y: number }) {
    return (
        <div style={S.sheet}>
            <h1 style={S.title}>개별 행동지원(Tier3) 실시 동의서</h1>
            <p style={S.sub}>기능평가 · 행동중재계획 · 위기관리계획</p>
            <p style={{ margin: "0 0 6px" }}>학생의 어려운 행동을 줄이고 바람직한 행동을 늘리기 위해 개별화교육지원팀이 아래 지원을 하고자 합니다. 계획 내용은 보호자와 함께 정하고, 보호자도 개별화교육지원팀의 한 사람으로 참여합니다.</p>
            <div style={S.h}>1. 학생·보호자</div>
            <Who extra={[["지원 기간", `${y}.    .    . ~ ${y}.    .    .`], ["담당(팀장)", ""]]} />
            <div style={S.h}>2. 지원 내용과 동의</div>
            <Rows widths={[20, 58, 22]} head={["항목", "내용", "동의 여부"]} rows={[
                ["기능평가(FBA)", "행동이 언제·어디서·왜 일어나는지 알아보기 위해 관찰, 기록 검토, 담임·보호자 면담을 합니다.", CK],
                ["행동중재계획(BIP) 실행", "예방 전략, 대체행동 교수, 강화 방법을 담은 계획을 함께 정해 학교에서 실행하고, 정기적으로 결과를 보호자와 나눕니다.", CK],
                ["위기관리계획 확인", "행동이 심해질 때 단계별(전조·고조·대응·회복) 대응 방법과, 생명·신체에 위험이 있을 때 쓰는 방어 및 보호를 위한 제지·분리 절차를 미리 함께 확인합니다.", "□ 확인함"],
            ]} />
            <p style={S.note}>· 학생이나 다른 사람의 생명·신체에 급박한 위험이 있을 때의 제지는 법령에 따라 학교가 해야 하는 안전 조치로, 이 동의와 관계없이 할 수 있습니다. 제지를 한 날에는 반드시 보호자에게 알립니다.</p>
            <p style={S.note}>· 계획은 학교 행동지원 기록 사이트에 저장합니다(① 사이트 활용 동의서 범위). 계획을 바꾸면 다시 안내합니다.</p>
            <div style={S.h}>3. 보호자 의견</div>
            <table style={S.table}><tbody><tr><td style={{ ...S.td, height: 60 }}>가정에서 효과가 있었던 방법, 피해야 할 상황, 좋아하는 것 등을 적어 주십시오.</td></tr></tbody></table>
            <Rights />
            <Sign y={y} />
        </div>
    );
}

// ── ③ 외부전문가 연계 정보 제공 동의서(SST·Tier3+) ─────────────
function ExternalForm({ y }: { y: number }) {
    return (
        <div style={S.sheet}>
            <h1 style={S.title}>외부전문가 연계를 위한 개인정보 제공 동의서</h1>
            <p style={S.sub}>□ Tier2 사회성 기술 훈련(SST)   □ Tier3+ 외부전문가·의료 연계</p>
            <p style={{ margin: "0 0 6px" }}>학생에게 학교 밖 전문가의 지원을 연결하기 위해 아래 정보를 제공하고자 합니다. 연계 기관마다 따로 작성합니다.</p>
            <div style={S.h}>1. 학생·보호자</div>
            <Who />
            <div style={S.h}>2. 제공받는 곳</div>
            <table style={S.table}>
                <colgroup><col style={{ width: "18%" }} /><col style={{ width: "32%" }} /><col style={{ width: "18%" }} /><col style={{ width: "32%" }} /></colgroup>
                <tbody>
                    <tr><th style={S.th}>기관명</th><td style={{ ...S.td, height: 26 }}></td><th style={S.th}>담당자</th><td style={S.td}></td></tr>
                    <tr><th style={S.th}>연계 내용</th><td style={{ ...S.td, height: 26 }} colSpan={3}></td></tr>
                    <tr><th style={S.th}>연계 기간</th><td style={S.td} colSpan={3}>{y}.    .    . ~ {y}.    .    .</td></tr>
                </tbody>
            </table>
            <div style={S.h}>3. 제공 항목과 동의</div>
            <Rows widths={[18, 40, 24, 18]} head={["구분", "제공 항목", "목적·보유 기간", "동의 여부"]} rows={[
                ["[필수] 기본 정보", "학생 성명, 학년·반, 행동 기록 요약(빈도·강도·상황), 학교의 지원 내용", "전문가 지원 계획 수립\n연계가 끝나면 지체 없이 파기", CK],
                ["[해당 시] 민감정보", "장애 유형, 진단명, 건강 상태, 약물 복용 정보", "진료·상담 등 전문 지원\n위와 같음", CK],
                ["[선택] 결과 회신", "제공받은 곳이 학교에 지원 결과·권고 사항을 알려 줌", "학교 지원에 반영\n학년도 끝나면 파기", CK],
            ]} />
            <p style={S.note}>· 민감정보는 다른 정보와 따로 동의를 받습니다. 동의하지 않으면 해당 정보 없이 연계하거나 연계가 어려울 수 있습니다.</p>
            <p style={S.note}>· 제공받는 곳은 위 목적 밖으로 쓰거나 다른 곳에 다시 제공하지 않습니다.</p>
            <Rights />
            <Sign y={y} />
        </div>
    );
}

export default function ConsentPage() {
    const [form, setForm] = useState<FormKey>("site");
    const [y, setY] = useState(schoolYear());
    const { user } = useAuth();
    if (user && user.id !== CONSENT_ACCOUNT) return (
        <AuthCheck><AppShell currentPage="consent" title="✍️ 동의서">
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>행동중재전문교사 계정에서만 볼 수 있습니다.</div>
        </AppShell></AuthCheck>
    );
    return (
        <AuthCheck>
            <AppShell currentPage="consent" title="✍️ 동의서" subtitle="꼭 필요한 동의서만 골라 빈 양식으로 인쇄합니다"
                headerActions={<button onClick={() => window.print()} className="btn btn-primary no-print">🖨️ 이 양식 인쇄</button>}>
                <style>{`@media print { @page { size: A4; margin: 0; } .consent-sheet > div { box-shadow: none !important; } }`}</style>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div className="card no-print" style={{ padding: 16 }}>
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>언제 동의서를 받나</div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                                <thead><tr>{["지원", "실행", "동의서", "이유"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                                <tbody>{NEED.map(n => (
                                    <tr key={n.what}>
                                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 700 }}>{n.what}</td>
                                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>{n.who}</td>
                                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                                            {n.form ? <button onClick={() => setForm(n.form!)} style={{ border: "none", background: "#eef2ff", color: "#3730a3", fontWeight: 800, borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>{n.need}</button>
                                                : <span style={{ color: "#64748b" }}>{n.need}</span>}
                                        </td>
                                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9", color: "#475569" }}>{n.why}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                        <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "8px 0 0" }}>
                            근거: 개인정보 보호법(제3자 제공·민감정보·만 14세 미만 아동·국외 이전), 교원의 학생생활지도에 관한 고시, 장애인 등에 대한 특수교육법(개별화교육). 조항 번호와 서식은 시행 전 개인정보 보호책임자·교육청 확인이 필요합니다.
                        </p>
                    </div>

                    <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {FORMS.map(f => (
                            <button key={f.key} onClick={() => setForm(f.key)} className={form === f.key ? "btn btn-primary" : "btn btn-secondary"} title={f.when}>{f.label}</button>
                        ))}
                        <label style={{ marginLeft: "auto", fontSize: "0.85rem" }}>학년도 <input type="number" value={y} onChange={e => setY(+e.target.value || schoolYear())} style={{ width: 80, padding: "4px 6px" }} /></label>
                    </div>
                    <div className="no-print" style={{ fontSize: "0.82rem", color: "#475569" }}>받는 때: {FORMS.find(f => f.key === form)?.when}</div>

                    <div className="consent-sheet">
                        {form === "site" && <SiteForm y={y} />}
                        {form === "tier3" && <Tier3Form y={y} />}
                        {form === "external" && <ExternalForm y={y} />}
                    </div>
                </div>
            </AppShell>
        </AuthCheck>
    );
}
