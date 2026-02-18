"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import styles from "../../../page.module.css";
import { AuthCheck } from "../../../components/AuthProvider";
import GlobalNav, { useDateRange } from "../../../components/GlobalNav";
import * as XLSX from "xlsx";

interface BIPData {
    StudentCode: string;
    TargetBehavior: string;
    Hypothesis: string;
    Goals: string;
    PreventionStrategies: string;
    TeachingStrategies: string;
    ReinforcementStrategies: string;
    CrisisPlan: string;
    EvaluationPlan: string;
    MedicationStatus: string;
    ReinforcerInfo: string;
    OtherConsiderations: string;
    UpdatedAt: string;
    Author: string;
}

// Field definitions with placeholders
const BIP_FIELDS: { key: keyof BIPData; num: number; title: string; color: string; placeholder: string }[] = [
    {
        key: "TargetBehavior", num: 1, title: "표적행동", color: "#ef4444",
        placeholder: "예: 교실에서 수업 중 자리를 이탈하여 교실 밖으로 나가는 행동\n\n• 측정가능하고 관찰가능한 행동으로 조작적 정의\n• 발생빈도, 지속시간, 강도를 포함\n• 예: \"수업 시간 중 교사의 지시 없이 자리에서 일어나 교실 밖으로 나가는 행동 (주 평균 5회, 회당 평균 15분)\""
    },
    {
        key: "Hypothesis", num: 2, title: "가설(기능)", color: "#f59e0b",
        placeholder: "예: (배경) 2교시 이후 피로감이 누적된 상태에서, (선행) 어려운 과제가 제시되면, (행동) OO은 자리를 이탈하여 교실 밖으로 나가고, (결과) 과제 수행을 회피할 수 있다.\n\n• 행동의 기능: 회피/관심끌기/물건얻기/감각자극\n• A-B-C 패턴 기반 가설 수립"
    },
    {
        key: "Goals", num: 3, title: "목표", color: "#6366f1",
        placeholder: "예:\n• 단기목표: 자리이탈 행동을 주 5회에서 주 2회 이하로 감소 (4주 내)\n• 장기목표: 도움 요청 카드를 사용하여 적절하게 휴식을 요청하는 행동이 주 3회 이상 증가 (12주 내)\n\n• 구체적, 측정가능, 달성가능, 관련성, 시간제한(SMART) 원칙"
    },
    {
        key: "PreventionStrategies", num: 4, title: "예방 전략", color: "#3b82f6",
        placeholder: "예:\n• [NCR(비수반강화)] — 10분 FT 선호자극 제공\n• [고확률지시순서(HPC)] — 쉬운 지시 3회 후 목표 지시\n• [선행사건 조절] — 2교시 후 5분 스트레칭 배정\n• [선택제공(Choice Making)] — 과제 순서 선택 기회"
    },
    {
        key: "TeachingStrategies", num: 5, title: "교수 전략", color: "#10b981",
        placeholder: "예:\n• [BST(행동기술훈련)] — 지시→모델링→리허설→피드백 4단계 대체행동 교수\n• [사회기술훈련(SST)] — 또래 상호작용 연습\n• [자기관리(Self-Management)] — 스트레스 시 심호흡→감정카드→교사보고\n• [촉구/용암(Prompting/Fading)] — 시각적 촉구에서 자연적 단서로 전환"
    },
    {
        key: "ReinforcementStrategies", num: 6, title: "강화 전략", color: "#8b5cf6",
        placeholder: "예:\n• [DRA(대체행동 차별강화)] — 도움 요청 시 즉시 강화, 자리이탈 시 강화 차단\n• [토큰경제(Token Economy)] — 토큰 5개 = 선호활동 5분\n• [소거(Extinction)] — 자리이탈 행동 시 과제 면제 없이 복귀 유도\n• [행동계약(Behavioral Contracting)] — 주간 목표 달성 시 합의된 강화 제공"
    },
    {
        key: "CrisisPlan", num: 7, title: "위기행동지원 전략", color: "#be123c",
        placeholder: "학교 차원 위기행동 지원 프로토콜을 기반으로 작성합니다:\n\n1단계(전조): 전조 징후 관찰 → 시각 도구로 자기조절 유도\n2단계(고조): 언어 자극 최소화 → 시각자료 활용하여 자극 차단\n3단계(대응): 위기대응팀 호출 → 제한적 물리적 제지\n4단계(분리): 안전한 분리 이동 → 10분 간격 관찰\n5단계(보고): 관리자 보고 → 행동데이터 입력 → 보고서 제출"
    },
    {
        key: "EvaluationPlan", num: 8, title: "평가 계획(Tier3 졸업 기준 포함)", color: "#64748b",
        placeholder: "예:\n• 데이터 수집: 매일 행동 발생 빈도/지속시간 기록 (PBIS 행동관찰 시스템 활용)\n• 평가 주기: 격주 1회 데이터 검토, 월 1회 행동중재지원팀 회의\n• 졸업 기준: 4주 연속 표적행동 주 1회 이하 + 대체행동 주 4회 이상\n• 중재 수정 기준: 2주간 개선 없으면 전략 수정"
    },
    {
        key: "MedicationStatus", num: 9, title: "약물 복용 현황", color: "#0891b2",
        placeholder: "예:\n• 리스페리돈(Risperidone) 0.5mg - 저녁 1회\n• 메틸페니데이트(Methylphenidate) 18mg - 등교 전 1회\n• 부작용 관찰: 오전 졸림 현상 (약물 조절 예정)\n\n※ 약물 정보가 없는 경우 '해당 없음' 기재"
    },
    {
        key: "ReinforcerInfo", num: 10, title: "강화제 정보", color: "#ca8a04",
        placeholder: "예:\n• 1순위: 태블릿 자유시간 (5분)\n• 2순위: 좋아하는 스티커 수집\n• 3순위: 또래와 보드게임\n• 사회적 강화: 교사의 칭찬 (\"잘 참았어요!\")\n• 강화제 조사일: 2025.03.15 (학생 면담 + 학부모 설문)"
    },
    {
        key: "OtherConsiderations", num: 11, title: "기타 고려사항", color: "#475569",
        placeholder: "예:\n• 가정환경: 한부모 가정, 조부모와 동거\n• 감각 민감성: 큰 소리에 과도한 반응\n• 의사소통: 2~3어절 수준, AAC 기기 사용 중\n• 선호 활동: 블록 놀이, 음악 감상\n• 유의사항: 왼쪽 귀 청력 저하, 시각 자료 활용 필수"
    },
];

// Parse AI result into 8 fields
function parseAIResult(text: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const patterns = [
        { key: "TargetBehavior", pattern: /\*?\*?\[?1\.\s*표적행동\]?\*?\*?\s*\n([\s\S]*?)(?=\*?\*?\[?2\.|$)/i },
        { key: "Hypothesis", pattern: /\*?\*?\[?2\.\s*가설[\s\S]*?\]?\*?\*?\s*\n([\s\S]*?)(?=\*?\*?\[?3\.|$)/i },
        { key: "Goals", pattern: /\*?\*?\[?3\.\s*목표\]?\*?\*?\s*\n([\s\S]*?)(?=\*?\*?\[?4\.|$)/i },
        { key: "PreventionStrategies", pattern: /\*?\*?\[?4\.\s*예방[\s\S]*?\]?\*?\*?\s*\n([\s\S]*?)(?=\*?\*?\[?5\.|$)/i },
        { key: "TeachingStrategies", pattern: /\*?\*?\[?5\.\s*교수[\s\S]*?\]?\*?\*?\s*\n([\s\S]*?)(?=\*?\*?\[?6\.|$)/i },
        { key: "ReinforcementStrategies", pattern: /\*?\*?\[?6\.\s*강화[\s\S]*?\]?\*?\*?\s*\n([\s\S]*?)(?=\*?\*?\[?7\.|$)/i },
        { key: "CrisisPlan", pattern: /\*?\*?\[?7\.\s*위기[\s\S]*?\]?\*?\*?\s*\n([\s\S]*?)(?=\*?\*?\[?8\.|$)/i },
        { key: "EvaluationPlan", pattern: /\*?\*?\[?8\.\s*평가[\s\S]*?\]?\*?\*?\s*\n([\s\S]*?)$/i },
    ];
    for (const { key, pattern } of patterns) {
        const match = text.match(pattern);
        if (match) {
            sections[key] = match[1].trim();
        }
    }
    return sections;
}

// Auto-growing textarea component
function AutoTextarea({ value, onChange, placeholder }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const adjust = useCallback(() => {
        const el = ref.current;
        if (el) {
            el.style.height = "auto";
            el.style.height = Math.max(el.scrollHeight, 100) + "px";
        }
    }, []);
    useEffect(() => { adjust(); }, [value, adjust]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={4}
            style={{
                width: "100%", minHeight: "100px", padding: "12px", borderRadius: "8px",
                border: "1px solid #cbd5e1", fontSize: "0.9rem", lineHeight: "1.6",
                resize: "vertical", fontFamily: "inherit", transition: "border-color 0.2s",
                outline: "none", boxSizing: "border-box"
            }}
            onFocus={(e) => e.target.style.borderColor = "#6366f1"}
            onBlur={(e) => e.target.style.borderColor = "#cbd5e1"}
        />
    );
}

export default function BIPEditor() {
    const params = useParams();
    const router = useRouter();
    const studentName = decodeURIComponent(params.id as string);
    const { startDate, endDate } = useDateRange();
    const [studentCode, setStudentCode] = useState("");
    const [loading, setLoading] = useState(true);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState("");
    const [bip, setBip] = useState<BIPData>({
        StudentCode: "", TargetBehavior: "", Hypothesis: "", Goals: "",
        PreventionStrategies: "", TeachingStrategies: "", ReinforcementStrategies: "",
        CrisisPlan: "", EvaluationPlan: "",
        MedicationStatus: "", ReinforcerInfo: "", OtherConsiderations: "",
        UpdatedAt: "", Author: ""
    });
    const [saving, setSaving] = useState(false);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

    useEffect(() => {
        if (!studentName) return;
        const fetchData = async () => {
            try {
                const studentRes = await axios.get(`${apiUrl}/api/v1/students/${encodeURIComponent(studentName)}`);
                const code = studentRes.data.profile.student_code;
                setStudentCode(code);
                try {
                    const bipRes = await axios.get(`${apiUrl}/api/v1/bip/students/${code}/bip`);
                    if (bipRes.data && bipRes.data.StudentCode) {
                        if (bipRes.data.ConsequenceStrategies && !bipRes.data.ReinforcementStrategies) {
                            bipRes.data.ReinforcementStrategies = bipRes.data.ConsequenceStrategies;
                        }
                        setBip(prev => ({ ...prev, ...bipRes.data }));
                    } else {
                        setBip(prev => ({ ...prev, StudentCode: code }));
                    }
                } catch {
                    setBip(prev => ({ ...prev, StudentCode: code }));
                }
            } catch (err) {
                console.error(err);
                alert("학생 정보를 불러오는데 실패했습니다.");
                router.push(`/student/${params.id}`);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [studentName]);

    const handleChange = (field: keyof BIPData, value: string) => {
        setBip(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!studentCode) return;
        setSaving(true);
        try {
            await axios.post(`${apiUrl}/api/v1/bip/students/${studentCode}/bip`, {
                ...bip,
                StudentCode: studentCode,
                UpdatedAt: new Date().toISOString().split('T')[0],
                Author: "Teacher"
            });
            alert("행동중재계획(BIP)이 저장되었습니다.");
        } catch {
            alert("저장 실패");
        } finally {
            setSaving(false);
        }
    };

    // AI BIP Full — comprehensive analysis
    const handleAIBIPFull = async () => {
        if (!studentCode) return;
        setAiLoading(true);
        setAiResult("");
        try {
            const res = await axios.post(`${apiUrl}/api/v1/bip/students/${studentCode}/ai-bip-full`, {
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                medication_status: bip.MedicationStatus,
                reinforcer_info: bip.ReinforcerInfo,
                other_considerations: bip.OtherConsiderations,
            });
            setAiResult(res.data.analysis || "분석 결과가 없습니다.");
        } catch {
            setAiResult("⚠️ AI BIP 제안 요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setAiLoading(false);
        }
    };

    // Append AI result to existing fields
    const handleAppendAIContent = () => {
        if (!aiResult) return;
        const parsed = parseAIResult(aiResult);
        if (Object.keys(parsed).length === 0) {
            alert("AI 결과를 파싱할 수 없습니다. 수동으로 복사해 주세요.");
            return;
        }
        setBip(prev => {
            const updated = { ...prev };
            for (const [key, value] of Object.entries(parsed)) {
                const k = key as keyof BIPData;
                if (value && k in updated) {
                    const existing = (updated[k] || "").trim();
                    updated[k] = existing ? `${existing}\n\n${value}` : value;
                }
            }
            return updated;
        });
        alert("AI 생성 내용이 각 필드에 추가되었습니다.");
    };

    // Excel download
    const handleExcelDownload = () => {
        const wb = XLSX.utils.book_new();

        // Title row data
        const data: (string | undefined)[][] = [
            ["행동중재계획 (BIP)"],
            [`학생: ${studentName} (${studentCode})`, "", `작성일: ${bip.UpdatedAt || new Date().toISOString().split('T')[0]}`, "", `작성자: ${bip.Author || "Teacher"}`],
            [],
        ];

        // Add each BIP field
        const fieldOrder: { key: keyof BIPData; title: string }[] = [
            { key: "TargetBehavior", title: "1. 표적행동" },
            { key: "Hypothesis", title: "2. 가설(기능)" },
            { key: "Goals", title: "3. 목표" },
            { key: "PreventionStrategies", title: "4. 예방 전략" },
            { key: "TeachingStrategies", title: "5. 교수 전략" },
            { key: "ReinforcementStrategies", title: "6. 강화 전략" },
            { key: "CrisisPlan", title: "7. 위기행동지원 전략" },
            { key: "EvaluationPlan", title: "8. 평가 계획" },
            { key: "MedicationStatus", title: "9. 약물 복용 현황" },
            { key: "ReinforcerInfo", title: "10. 강화제 정보" },
            { key: "OtherConsiderations", title: "11. 기타 고려사항" },
        ];

        for (const field of fieldOrder) {
            data.push([field.title]);
            const content = bip[field.key] || "(미입력)";
            // Split multi-line content into separate rows
            const lines = content.split("\n");
            for (const line of lines) {
                data.push(["", line]);
            }
            data.push([]);
        }

        const ws = XLSX.utils.aoa_to_sheet(data);

        // Column widths
        ws["!cols"] = [
            { wch: 20 }, // Field title
            { wch: 80 }, // Content
            { wch: 20 },
            { wch: 15 },
            { wch: 20 },
        ];

        // Merge title cell
        ws["!merges"] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, // Title
        ];

        XLSX.utils.book_append_sheet(wb, ws, "BIP");
        XLSX.writeFile(wb, `BIP_${studentCode}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (loading) return (
        <AuthCheck>
            <div className={styles.container}>
                <GlobalNav currentPage="student" />
                <div style={{ padding: '50px', textAlign: 'center' }}>BIP 데이터 로딩 중...</div>
            </div>
        </AuthCheck>
    );

    return (
        <AuthCheck>
            <div className={styles.container}>
                <GlobalNav currentPage="student" />

                <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: '24px', flexWrap: 'wrap', gap: '10px'
                    }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>📋 행동중재계획 (BIP)</h2>
                            <p style={{ color: '#666', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
                                {studentName} ({studentCode})
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button onClick={handleExcelDownload} style={{
                                padding: '10px 20px', backgroundColor: '#047857', color: 'white',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
                                fontSize: '0.9rem'
                            }}>
                                📥 엑셀 다운로드
                            </button>
                            <button onClick={handleSave} disabled={saving} style={{
                                padding: '10px 20px', backgroundColor: '#10b981', color: 'white',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
                                fontSize: '0.9rem'
                            }}>
                                {saving ? "저장 중..." : "💾 저장하기"}
                            </button>
                            <button onClick={() => router.push(`/student/${encodeURIComponent(studentName)}`)} style={{
                                padding: '10px 20px', backgroundColor: '#64748b', color: 'white',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem'
                            }}>
                                ← 학생 상세
                            </button>
                        </div>
                    </div>

                    {/* BIP Fields 1-11 */}
                    {BIP_FIELDS.map((field) => (
                        <div key={field.key} style={{
                            marginBottom: '20px', backgroundColor: 'white', borderRadius: '12px',
                            border: '1px solid #e2e8f0', overflow: 'hidden',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                        }}>
                            <div style={{
                                padding: '10px 16px', backgroundColor: field.color + '10',
                                borderBottom: `2px solid ${field.color}`,
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: '24px', height: '24px', backgroundColor: field.color,
                                    color: 'white', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold'
                                }}>
                                    {field.num}
                                </span>
                                <h3 style={{ margin: 0, color: field.color, fontSize: '1rem', fontWeight: '600' }}>
                                    {field.title}
                                </h3>
                            </div>
                            <div style={{ padding: '12px 16px' }}>
                                <AutoTextarea
                                    value={bip[field.key]}
                                    onChange={(v) => handleChange(field.key, v)}
                                    placeholder={field.placeholder}
                                />
                            </div>
                        </div>
                    ))}

                    {/* Field 12: AI BIP 제안 */}
                    <div style={{
                        marginBottom: '20px', backgroundColor: 'white', borderRadius: '12px',
                        border: '1px solid #ddd5f5', overflow: 'hidden',
                        boxShadow: '0 2px 8px rgba(124,58,237,0.1)'
                    }}>
                        <div style={{
                            padding: '10px 16px',
                            background: 'linear-gradient(135deg, #7c3aed15, #6d28d915)',
                            borderBottom: '2px solid #7c3aed',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            flexWrap: 'wrap', gap: '8px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: '24px', height: '24px',
                                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                                    color: 'white', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold'
                                }}>
                                    12
                                </span>
                                <h3 style={{ margin: 0, color: '#7c3aed', fontSize: '1rem', fontWeight: '600' }}>
                                    🤖 AI BIP 제안
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={handleAIBIPFull}
                                    disabled={aiLoading}
                                    style={{
                                        padding: '8px 20px',
                                        background: aiLoading ? '#a78bfa' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                                        color: 'white', border: 'none', borderRadius: '8px',
                                        cursor: aiLoading ? 'wait' : 'pointer',
                                        fontSize: '0.85rem', fontWeight: 600,
                                        boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {aiLoading ? "⏳ AI 분석 중... (약 15~30초)" : "🤖 AI BIP 제안 받기"}
                                </button>
                                <button
                                    onClick={handleAppendAIContent}
                                    disabled={!aiResult || aiLoading}
                                    style={{
                                        padding: '8px 20px',
                                        background: (!aiResult || aiLoading) ? '#d1d5db' : 'linear-gradient(135deg, #059669, #047857)',
                                        color: 'white', border: 'none', borderRadius: '8px',
                                        cursor: (!aiResult || aiLoading) ? 'not-allowed' : 'pointer',
                                        fontSize: '0.85rem', fontWeight: 600,
                                        boxShadow: aiResult ? '0 2px 8px rgba(5,150,105,0.3)' : 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    📝 생성 내용 추가
                                </button>
                            </div>
                        </div>
                        <div style={{ padding: '16px' }}>
                            {!aiResult && !aiLoading && (
                                <div style={{ color: '#9ca3af', fontSize: '0.85rem', lineHeight: '1.6' }}>
                                    💡 AI BIP 제안 버튼을 누르면 아래 데이터를 종합 분석하여 1~8번 필드에 들어갈 BIP 내용을 제안합니다:
                                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                                        <li>BehaviorLogs (설정 기간의 행동 데이터)</li>
                                        <li>MeetingNotes (상담/관찰 기록)</li>
                                        <li>TierStatus (현재 지원 현황)</li>
                                        <li>CICO 월별 기록 데이터</li>
                                        <li>9~11번 입력 내용 (약물/강화제/기타)</li>
                                    </ul>
                                    <p style={{ margin: '8px 0 0 0', fontStyle: 'italic' }}>
                                        ※ &quot;생성 내용 추가&quot; 버튼을 누르면 기존 내용을 삭제하지 않고 AI 결과가 1~8번 칸에 자동 추가됩니다.
                                    </p>
                                </div>
                            )}
                            {aiLoading && (
                                <div style={{
                                    textAlign: 'center', padding: '40px', color: '#7c3aed'
                                }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>
                                        AI가 학생의 모든 데이터를 종합 분석하고 있습니다...
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#a78bfa', marginTop: '4px' }}>
                                        행동기록 · 상담일지 · Tier현황 · CICO · 약물/강화제 정보
                                    </div>
                                </div>
                            )}
                            {aiResult && !aiLoading && (
                                <div style={{
                                    whiteSpace: 'pre-wrap', fontSize: '0.88rem',
                                    lineHeight: '1.7', color: '#334155',
                                    backgroundColor: '#faf9ff', padding: '16px', borderRadius: '8px',
                                    border: '1px solid #ede9fe', maxHeight: '600px', overflowY: 'auto'
                                }}>
                                    {aiResult}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer info */}
                    <div style={{
                        marginTop: '10px', marginBottom: '30px', padding: '12px 16px',
                        backgroundColor: '#f1f5f9', borderRadius: '8px',
                        fontSize: '0.85rem', color: '#64748b',
                        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap'
                    }}>
                        <span>마지막 수정: {bip.UpdatedAt || "없음"} (작성자: {bip.Author || "-"})</span>
                        <button onClick={handleSave} disabled={saving} style={{
                            padding: '6px 16px', backgroundColor: '#10b981', color: 'white',
                            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem'
                        }}>
                            {saving ? "저장 중..." : "💾 저장"}
                        </button>
                    </div>
                </div>
            </div>
        </AuthCheck>
    );
}
