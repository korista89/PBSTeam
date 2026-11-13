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
                            <li><b>전송 항목</b>: 학생코드(별칭), 행동 유형·강도·발생 장소/시간대, 추정 기능, 물리적 제지 여부 등 구조화된 행동 기록과, 문서 AI 초안 기능에 교사가 입력한 문장(FBA·BIP·의료협력의뢰서·추가지원신청서·결과 보고서 초안에 쓰이는 약물·건강 관련 서술 포함)</li>
                            <li><b>실명 처리</b>: 학생 실명은 시스템이 자동으로 학생코드로 치환한 뒤 전송하며, AI 서비스에는 실명이 전달되지 않습니다.</li>
                            <li><b>보유기간</b>: 각 서비스 자체 정책에 따름(Groq은 Zero Data Retention으로 보관을 최소화)</li>
                        </ul>
                    </div>

                    <div style={{ background: '#fffbeb', borderRadius: '14px', padding: '18px 22px', border: '1px solid #fde68a' }}>
                        <div style={{ fontWeight: 800, color: '#92400e', marginBottom: '6px' }}>⚠️ 예외(한계)</div>
                        <p style={{ margin: 0, color: '#78350f' }}>
                            교사가 직접 입력하는 자유서술은 전송 전에 별칭 형태(김O준)에 맞는 실명 표기, 전화번호, 주민등록번호 형태를 자동으로 가립니다. 다만 2글자 이름과 별칭 형태에 맞지 않는 표기는 걸러지지 않을 수 있으니, 메모에는 실명 대신 별칭이나 학생코드를 쓰세요. 약물·건강 정보는 보호자가 국외 AI 분석에 동의한 학생에 한해 입력하세요.
                        </p>
                    </div>
                </section>

                <section style={{ marginTop: 24, fontSize: '0.88rem', color: '#334155', lineHeight: 1.7 }}>
                    <h2 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>보유·파기와 이월</h2>
                    <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <li>사이트에는 현재 학년도 원자료만 보관하고, 이전 학년도 원자료는 삭제합니다. 연도 비교에는 학교 전체 합계 요약만 씁니다.</li>
                        <li>동의 기간은 학년도(3월 2일~다음 해 2월 말)이며 매년 새로 동의를 받습니다.</li>
                        <li>이월·인수인계는 가명 ID 파일을 같은 학교 담당자에게만 전달하며, 별도 선택 동의를 받은 학생만 연결합니다.</li>
                        <li>열람·정정·삭제·처리정지·동의 철회는 담당 교사나 개인정보 보호책임자에게 요청할 수 있습니다.</li>
                    </ul>
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
