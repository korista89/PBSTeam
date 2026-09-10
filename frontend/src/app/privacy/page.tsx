"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function PrivacyPage() {
    const router = useRouter();

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f8fafc',
            padding: '40px 20px',
            display: 'flex',
            justifyContent: 'center',
        }}>
            <div style={{
                background: 'white',
                borderRadius: '20px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
                width: '100%',
                maxWidth: '760px',
                padding: '48px 44px',
            }}>
                <div style={{ marginBottom: '32px' }}>
                    <h1 style={{ margin: '0 0 8px', color: '#1e3a8a', fontSize: '1.6rem', fontWeight: 800 }}>
                        개인정보처리방침 — AI 분석 기능 안내
                    </h1>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
                        경은PBST 통합관리플랫폼의 AI 분석 기능이 처리하는 개인정보 범위를 안내합니다.
                    </p>
                </div>

                <section style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '0.95rem', lineHeight: 1.75, color: '#1e293b' }}>
                    <div>
                        <h2 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
                            AI 분석 기능의 개인정보 국외 이전
                        </h2>
                        <p style={{ margin: 0 }}>
                            본 시스템은 행동중재계획(BIP) 작성 지원 및 행동 데이터 분석을 위해 아래 국외 AI 서비스에 데이터를 전송합니다.
                        </p>
                    </div>

                    <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '20px 22px', border: '1px solid #e2e8f0' }}>
                        <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <li><b>전송 대상</b>: Google Gemini(유료 API, 학습 미사용 정책 적용), Groq(Zero Data Retention 적용)</li>
                            <li><b>전송 항목</b>: 학생코드, 행동 유형·강도·발생 장소/시간대, 추정 기능, 물리적 제지 여부 등 구조화된 행동 기록</li>
                            <li><b>실명 처리</b>: 학생 실명은 시스템이 자동으로 학생코드로 치환한 뒤 전송하며, AI 서비스에는 실명이 전달되지 않습니다.</li>
                            <li><b>보유기간</b>: 각 서비스 자체 정책에 따름(Groq은 Zero Data Retention으로 보관을 최소화)</li>
                        </ul>
                    </div>

                    <div style={{ background: '#fffbeb', borderRadius: '14px', padding: '18px 22px', border: '1px solid #fde68a' }}>
                        <div style={{ fontWeight: 800, color: '#92400e', marginBottom: '6px' }}>⚠️ 예외(한계)</div>
                        <p style={{ margin: 0, color: '#78350f' }}>
                            교사가 직접 입력하는 자유서술 메모(특기사항 등)는 원문 그대로 전송됩니다. 이 메모에 교사가 학생 실명을 직접 기재한 경우 해당 실명은 함께 전송될 수 있습니다. 메모 작성 시 실명 대신 학생코드 사용을 권장합니다.
                        </p>
                    </div>
                </section>

                <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                        경은PBST Team
                    </p>
                    <button
                        onClick={() => router.back()}
                        style={{
                            padding: '10px 20px', background: '#1e3a8a', color: 'white',
                            border: 'none', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer'
                        }}
                    >
                        ← 돌아가기
                    </button>
                </div>
            </div>
        </div>
    );
}
