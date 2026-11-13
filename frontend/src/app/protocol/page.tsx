"use client";

import React from "react";
import Link from "next/link";
import { AuthCheck } from "../components/AuthProvider";
import AppShell from "../components/AppShell";

// 이 화면의 기준은 코드(analysis.py 의사결정 알고리즘, CICO 의사결정 제안, target-behavior 7단계)와 같다.
// 기준을 바꾸면 코드와 이 화면을 함께 고친다.

const box = (c: string, bg: string): React.CSSProperties => ({ borderLeft: `4px solid ${c}`, background: bg, padding: 14 });
const small: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6 };

const TIERS = [
    { k: "Tier 1", n: "보편적 지원", c: "var(--tier1)", bg: "var(--tier1-bg)", who: "전교생", what: "기대행동 교수, 긍정 강화, 학급 규칙·토큰", site: "학급규칙/토큰 · 대시보드" },
    { k: "Tier 2", n: "표적 집단", c: "var(--tier2)", bg: "var(--tier2-bg)", who: "2주 연속 주 2회 이상 발생 + 담임 추천", what: "CICO(기본) · 소집단 SST(유사 결핍 2인 이상)", site: "CICO관리 · Tier현황" },
    { k: "Tier 3", n: "개별 집중", c: "var(--tier3)", bg: "var(--tier3-bg)", who: "Tier 2 반응 미흡 또는 긴급 기준 해당", what: "FBA → BIP → 모니터링 → 데이터 기반 의사결정", site: "개별학생 행동중재" },
    { k: "Tier 3+", n: "지역사회 연계", c: "var(--tier3-plus)", bg: "var(--tier3-plus-bg)", who: "교내 자원으로 한계, 의료적 판단 필요", what: "의료협력 의뢰, 교육청 지원단, 추가지원 신청", site: "개별학생 행동중재 6단계" },
];

const FLOW = [
    ["① 기록", "행동 발생 → 위기행동 기록(일시·장소·ABC·강도)", "위기행동기록"],
    ["② 당일 의무", "제지·상해 시 관리자 보고·학부모 알림을 당일 이행, 결재", "결재함"],
    ["③ 판정", "긴급이면 Tier 3, 아니면 주 단위 데이터로 Tier 2 판정", "Today결정 · 대시보드"],
    ["④ 중재", "Tier 2: CICO/SST · Tier 3: FBA·BIP", "CICO관리 · 개별학생 행동중재"],
    ["⑤ 점검", "월별 수행률, 위기행동 추이, 협의회에서 의사결정", "브리핑 · 월별 회의록"],
    ["⑥ 환류", "성공 시 하향(Step-Down), 실패 시 상향·연계", "Tier현황"],
];

const STEPS = ["자료 분석", "FBA", "BIP 수립", "모니터링(위기행동만으로도 가능, 지표 추가는 선택)", "데이터 기반 의사결정", "의료협력의뢰서·추가지원신청서", "결과 보고서"];

const RULES: [string, string, string][] = [
    ["긴급(Red)", "위기행동 강도 5 이상, 또는 물리적 제지·신체 상해 기록 1회 이상", "중간 절차 없이 즉시 Tier 3 가동, 위기관리계획 최우선"],
    ["Tier 2 진입", "2주 연속, 주 2회 이상 발생 + 담임교사 추천(데이터 첨부)", "CICO 기본, 유사 결핍 2인 이상이면 SST 병행"],
    ["Tier 2 → Tier 1 하향", "CICO만 받는 학생이 목표(기본 80%) 이상을 2개월 연속 달성", "하향 후 4주 모니터링. SST·Tier 3 병행 학생은 달성해도 CICO 유지"],
    ["CICO 수정", "수행률 50% 이상~목표 미만", "충실도 점검, 피드백 주기 단축, 강화제 재평가"],
    ["Tier 3 상향", "수행률 50% 미만 또는 위기행동 강도 5", "정식 FBA·BIP 의뢰 검토"],
    ["Tier 3 → 완화", "BIP 목표 달성이 유지됨(협의회 판단, 권고 4주 유지)", "Tier 2 지원으로 단계적 하향. 실패 시 Tier 3+ 연계"],
];

const DATA: [string, string][] = [
    ["입력", "시트에는 실명 대신 별칭(김O준)만 저장한다. 새 실명은 예약 작업이 가린다."],
    ["보관", "사이트에는 현재 학년도 원자료만 둔다. 지난 학년도는 삭제하고 학교 합계 요약만 남긴다."],
    ["연도 비교", "차트·브리핑·AI 비교는 이 요약(학교 전체 합계)으로 그린다. 학급 범위 화면에는 섞지 않는다."],
    ["인수인계", "가명 ID 파일을 브라우저에서만 읽는다. 서버에는 학생코드↔가명 ID 연결표만 저장한다(관리자)."],
    ["AI", "별칭으로 치환한 기록만 국외 AI에 보낸다. 동의서 선택 항목이다."],
    ["마감", "2월 말에 비식별 파일 생성 → 원자료 삭제 → 검증. 동의는 매 학년도 3월에 새로 받는다."],
];

const CAL: [string, string][] = [
    ["3월", "동의서 수합, 학급·Tier 명단 확정, 인수인계 연결, 기대행동 교육"],
    ["4~6월", "위기행동·CICO 기록, 매월 협의회, Tier 이동 판정"],
    ["7~8월", "1학기 결과 점검, 개인정보 중간 점검, BIP 재검토"],
    ["9~12월", "2학기 중재 점검, 의료·교육청 연계 사례 정리"],
    ["1~2월", "연간 보고서, 학년도 마감(비식별·삭제), 다음 담당자 인수인계"],
];

function Card({ title, icon, children, badge }: { title: string; icon: string; children: React.ReactNode; badge?: string }) {
    return (
        <div className="card" style={{ padding: 18 }}>
            <div className="card-header">
                <div className="card-title"><span>{icon}</span> {title}</div>
                {badge && <span className="badge badge-neutral">{badge}</span>}
            </div>
            {children}
        </div>
    );
}

export default function ProtocolPage() {
    return (
        <AuthCheck>
            <AppShell
                currentPage="protocol"
                title="📜 프로토콜 안내"
                subtitle="학교 PBS 운영 기준과 이 사이트의 사용 흐름을 한 화면에서 봅니다"
                headerActions={<button onClick={() => window.print()} className="btn btn-secondary no-print">🖨️ 인쇄 / PDF 저장</button>}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <div style={{ ...small, background: "#f8fafc", border: "1px solid var(--border, #e2e8f0)", borderRadius: 8, padding: "10px 14px" }}>
                        <strong>한 줄 요약:</strong> 위기행동을 기록하면 사이트가 주 단위로 Tier를 판정하고, 교사는 CICO(Tier 2) 또는 FBA·BIP(Tier 3)로 중재하며, 월별 협의회에서 상향·하향을 결정합니다.
                    </div>

                    <Card icon="🏫" title="1. 지원 단계(Tier)">
                        <div className="kpi-grid">
                            {TIERS.map(t => (
                                <div key={t.k} className="card" style={box(t.c, t.bg)}>
                                    <div style={{ fontWeight: 800 }}>{t.k} · {t.n}</div>
                                    <div style={{ ...small, marginTop: 6 }}><b>대상</b> {t.who}</div>
                                    <div style={small}><b>지원</b> {t.what}</div>
                                    <div style={small}><b>사이트</b> {t.site}</div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card icon="🧭" title="2. 한 건이 흘러가는 순서" badge="사이트 메뉴 연결">
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                            {FLOW.map(([a, b, c]) => (
                                <div key={a} className="card" style={{ padding: 12 }}>
                                    <div style={{ fontWeight: 800 }}>{a}</div>
                                    <div style={small}>{b}</div>
                                    <div style={{ fontSize: "0.72rem", marginTop: 6, color: "var(--tier2-text)" }}>메뉴: {c}</div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card icon="📋" title="3. 단계 이동 기준" badge="사이트 판정 로직과 동일">
                        <div className="table-container">
                            <table className="dense-table">
                                <thead><tr><th>상황</th><th>기준</th><th>조치</th></tr></thead>
                                <tbody>
                                    {RULES.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td><td>{c}</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ ...small, marginTop: 8 }}>※ 기준은 의사결정 보조입니다. 최종 결정은 학교행동중재지원팀 협의회가 합니다.</div>
                    </Card>

                    <Card icon="🧩" title="4. Tier 3 개별 중재 7단계" badge="개별학생 행동중재 메뉴">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {STEPS.map((s, i) => (
                                <div key={s} className="card" style={{ padding: "8px 12px", fontSize: "0.82rem" }}><b>{["①", "②", "③", "④", "⑤", "⑥", "⑦"][i]}</b> {s}</div>
                            ))}
                        </div>
                        <div style={{ ...small, marginTop: 8 }}>각 단계의 문서는 인쇄 양식과 같은 칸에 입력하고 AI 초안을 받을 수 있습니다.</div>
                    </Card>

                    <div className="responsive-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
                        <Card icon="🔒" title="5. 자료와 개인정보">
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {DATA.map(([a, b]) => <div key={a} style={small}><b>{a}</b> {b}</div>)}
                            </div>
                            <div style={{ ...small, marginTop: 8 }}>자세한 내용: <Link href="/privacy">개인정보 처리방침</Link></div>
                        </Card>
                        <Card icon="📅" title="6. 연간 운영 달력">
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {CAL.map(([a, b]) => <div key={a} style={small}><b>{a}</b> {b}</div>)}
                            </div>
                        </Card>
                    </div>

                    <Card icon="💡" title="7. 운영 원칙">
                        <div style={{ ...small, display: "flex", flexDirection: "column", gap: 6 }}>
                            <div><b>데이터 기반</b> 단발 행동이 아니라 최소 2주의 기록으로 단계를 정합니다.</div>
                            <div><b>안전 최우선</b> 제지·상해·강도 5는 절차를 줄이고 바로 Tier 3와 위기관리계획을 가동합니다.</div>
                            <div><b>점진적 환류</b> 성공해도 바로 끊지 않고 유지 기간을 거쳐 내립니다.</div>
                            <div><b>당일 의무</b> 관리자 보고·학부모 알림은 당일 이행해야 하는 법적 의무입니다.</div>
                        </div>
                    </Card>
                </div>
            </AppShell>
        </AuthCheck>
    );
}
