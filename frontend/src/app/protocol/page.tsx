"use client";

import React from "react";
import { AuthCheck } from "../components/AuthProvider";
import AppShell from "../components/AppShell";

export default function ProtocolPage() {
    return (
        <AuthCheck>
            <AppShell
                currentPage="protocol"
                title="📜 학교 행동중재 지원 체계도 (Standard PBS Protocol)"
                subtitle="전교생 보편적 예방부터 위기행동 즉시 대응, 지역사회 연계 및 환류까지의 표준 의사결정 체계"
                headerActions={
                    <button onClick={() => window.print()} className="btn btn-secondary no-print">
                        🖨️ 인쇄 / PDF 저장
                    </button>
                }
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {/* Tier Summary KPI Grid */}
                    <div className="kpi-grid">
                        <div className="card" style={{ padding: "14px", borderLeft: "4px solid var(--tier1)", background: "var(--tier1-bg)" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--tier1-text)" }}>Tier 1 (보편적 지원)</div>
                            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px" }}>전교생 예방 교육</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>긍정적 학교 문화 조성</div>
                        </div>
                        <div className="card" style={{ padding: "14px", borderLeft: "4px solid var(--tier2)", background: "var(--tier2-bg)" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--tier2-text)" }}>Tier 2 (표적 집단)</div>
                            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px" }}>CICO / 소집단 SST</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>2주 연속 주 2회 이상 발생 시</div>
                        </div>
                        <div className="card" style={{ padding: "14px", borderLeft: "4px solid var(--tier3)", background: "var(--tier3-bg)" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--tier3-text)" }}>Tier 3 (개별 집중)</div>
                            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px" }}>기능평가(FBA) & BIP</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>T2 실패 또는 고강도 행동</div>
                        </div>
                        <div className="card" style={{ padding: "14px", borderLeft: "4px solid var(--tier3-plus)", background: "var(--tier3-plus-bg)" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--tier3-plus-text)" }}>Tier 3+ (지역사회 연계)</div>
                            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px" }}>전문기관 / 병원 연계</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>의료적 진단 및 지원단 협력</div>
                        </div>
                        <div className="card" style={{ padding: "14px", borderLeft: "4px solid #b91c1c", background: "#fef2f2" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#b91c1c" }}>🚨 Red Line (긴급)</div>
                            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#991b1b", marginTop: "4px" }}>상해/제지 시 즉시가동</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>절차 생략 후 Tier 3 직행</div>
                        </div>
                    </div>

                    {/* Main Split: Left Decision Flow Chart + Right Detailed Protocol Table */}
                    <div className="responsive-grid-2" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "20px", alignItems: "start" }}>
                        {/* Left: Pure React/CSS Decision Tree Flow */}
                        <div className="card" style={{ padding: "20px" }}>
                            <div className="card-header">
                                <div className="card-title">
                                    <span>🧭</span> 의사결정 흐름도 (Decision Flow)
                                </div>
                                <span className="badge badge-neutral">결정론적 의사결정 규칙</span>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {/* Step 1: Tier 1 */}
                                <div style={{ background: "var(--tier1-bg)", border: "1.5px solid #a7f3d0", borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div>
                                        <span className="badge badge-tier1">출발점</span>
                                        <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--tier1-text)", marginTop: "4px" }}>
                                            Tier 1: 보편적 긍정적 행동지원
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                            전교생 대상 기대행동 교수 및 긍정적 강화
                                        </div>
                                    </div>
                                    <span style={{ fontSize: "1.2rem" }}>🏫</span>
                                </div>

                                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem", fontWeight: 700 }}>
                                    ↓ 행동 발생 시 심각도 판단
                                </div>

                                {/* Step 2: Severity Split */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                    {/* Emergency Track */}
                                    <div style={{ background: "#fef2f2", border: "2px dashed #f87171", borderRadius: "10px", padding: "12px" }}>
                                        <div style={{ color: "#b91c1c", fontWeight: 800, fontSize: "0.82rem" }}>🚨 [긴급 트랙]</div>
                                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                            물리적 제지 / 신체 상해
                                        </div>
                                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                            중간 절차 생략 후 즉시 Tier 3 가동
                                        </div>
                                        <div style={{ marginTop: "8px", textAlign: "right" }}>
                                            <span className="badge badge-tier3">Tier 3 직행 ➔</span>
                                        </div>
                                    </div>

                                    {/* Routine Track */}
                                    <div style={{ background: "var(--tier2-bg)", border: "1.5px solid #fde68a", borderRadius: "10px", padding: "12px" }}>
                                        <div style={{ color: "var(--tier2-text)", fontWeight: 800, fontSize: "0.82rem" }}>📊 [일반 데이터 트랙]</div>
                                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                            2주 연속 주 2회 이상 발생
                                        </div>
                                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                            담임교사 추천 및 행동 데이터 확인
                                        </div>
                                        <div style={{ marginTop: "8px", textAlign: "right" }}>
                                            <span className="badge badge-tier2">Tier 2 진입 ➔</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem", fontWeight: 700 }}>
                                    ↓ 표적 중재 적용
                                </div>

                                {/* Step 3: Tier 2 Intervention & Evaluation */}
                                <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "12px 16px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                                            Tier 2: CICO (기본) / 소집단 SST (유사결핍 2인 이상)
                                        </div>
                                        <span className="badge badge-tier2">4~6주 적용</span>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px" }}>
                                        <div style={{ background: "#ecfdf5", padding: "8px 10px", borderRadius: "6px", border: "1px solid #a7f3d0", fontSize: "0.75rem" }}>
                                            <strong style={{ color: "#047857" }}>✓ 목표 달성 (수행률 80%+)</strong>
                                            <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>2주 유지 후 Tier 1 복귀</div>
                                        </div>
                                        <div style={{ background: "#fef2f2", padding: "8px 10px", borderRadius: "6px", border: "1px solid #fecaca", fontSize: "0.75rem" }}>
                                            <strong style={{ color: "#b91c1c" }}>✕ 중재 반응 미흡</strong>
                                            <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>Tier 3 개별지원 상향</div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem", fontWeight: 700 }}>
                                    ↓ 개별 맞춤 중재 및 전문 연계
                                </div>

                                {/* Step 4: Tier 3 & Tier 3+ */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                    <div style={{ background: "var(--tier3-bg)", border: "1.5px solid #fecaca", borderRadius: "10px", padding: "12px" }}>
                                        <span className="badge badge-tier3">Tier 3 개별지원</span>
                                        <div style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--tier3-text)", marginTop: "4px" }}>
                                            FBA 기능평가 & BIP 12단계
                                        </div>
                                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                            · 성공: 4주 유지 후 Tier 2 완화<br />
                                            · 실패: Tier 3+ 외부 연계
                                        </div>
                                    </div>

                                    <div style={{ background: "var(--tier3-plus-bg)", border: "1.5px solid #ddd6fe", borderRadius: "10px", padding: "12px" }}>
                                        <span className="badge badge-tier3-plus">Tier 3+ 지역사회</span>
                                        <div style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--tier3-plus-text)", marginTop: "4px" }}>
                                            의료/병원 및 교육청 지원단
                                        </div>
                                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                            · 안정화 시: Tier 3 팀으로 인계(Step-Down)하여 학교 복귀 지원
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Detailed Table & Principles */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div className="card" style={{ padding: "20px" }}>
                                <div className="card-header">
                                    <div className="card-title">
                                        <span>📋</span> 단계별 운영 프로토콜 및 기준 상세
                                    </div>
                                </div>

                                <div className="table-container">
                                    <table className="dense-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: "22%" }}>단계 (Tier)</th>
                                                <th style={{ width: "38%" }}>진입 기준 (Entry)</th>
                                                <th style={{ width: "40%" }}>중재 및 환류 (Exit)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr style={{ backgroundColor: "#fff5f5" }}>
                                                <td><span className="badge badge-tier3">🚨 긴급 (Red)</span></td>
                                                <td>
                                                    <strong>· 물리적 제지 1회 이상</strong><br />
                                                    <strong>· 신체 상해 발생</strong>
                                                </td>
                                                <td>
                                                    · 즉시 <strong>Tier 3</strong> 직행 (절차 생략)<br />
                                                    · 위기관리계획(CMP) 최우선 수립
                                                </td>
                                            </tr>
                                            <tr>
                                                <td><span className="badge badge-tier2">Tier 2</span></td>
                                                <td>
                                                    <span style={{ color: "var(--primary-blue)", fontWeight: 700 }}>· 2주 연속 주 2회 이상</span><br />
                                                    · 담임교사 추천 (데이터 첨부)
                                                </td>
                                                <td>
                                                    · <strong>CICO</strong> (기본) / <strong>SST</strong> (2인 이상)<br />
                                                    · 성공 시: 2주 유지 후 하향<br />
                                                    · 실패 시: Tier 3 상향
                                                </td>
                                            </tr>
                                            <tr>
                                                <td><span className="badge badge-tier3">Tier 3</span></td>
                                                <td>
                                                    · Tier 2 중재 실패<br />
                                                    · 긴급 트랙 해당자
                                                </td>
                                                <td>
                                                    · <strong>기능평가(FBA) & 행동중재(BIP)</strong><br />
                                                    · 성공 시: 4주 유지 후 Tier 2 완화<br />
                                                    · 실패 시: 외부 전문가 연계
                                                </td>
                                            </tr>
                                            <tr style={{ backgroundColor: "#faf5ff" }}>
                                                <td><span className="badge badge-tier3-plus">Tier 3+ (연계)</span></td>
                                                <td>
                                                    · 교내 자원 해결 한계<br />
                                                    · 의료적/임상적 진단 필요
                                                </td>
                                                <td>
                                                    · 병원 치료, 교육청 지원단 연계<br />
                                                    · <span style={{ color: "var(--tier3-plus-text)", fontWeight: 700 }}>안정화 시 Tier 3팀으로 이관</span> (학교 복귀 지원)
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Core Operational Principles */}
                            <div className="card" style={{ padding: "16px", background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)", borderColor: "#86efac" }}>
                                <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#166534", marginBottom: "8px" }}>
                                    💡 학교 PBST 핵심 운영 원칙
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.78rem", color: "#334155", lineHeight: 1.6 }}>
                                    <div>
                                        <strong>1. 데이터 기반 진입:</strong> 일시적인 단발성 행동이 아닌, 최소 2주간의 객관적 기록을 바탕으로 지원 단계를 결정합니다.
                                    </div>
                                    <div>
                                        <strong>2. 안전 최우선 원칙:</strong> 신체 상해나 제지가 수반되는 위기 상황은 즉시 행정 절차를 간소화하고 Tier 3 CMP를 가동합니다.
                                    </div>
                                    <div>
                                        <strong>3. 점진적 환류 (Step-Down):</strong> 상위 단계 지원이 성공하면 즉시 중단하지 않고 2~4주의 유지 기간을 거쳐 하위 단계로 안전하게 복귀시킵니다.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </AppShell>
        </AuthCheck>
    );
}
