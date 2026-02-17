"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import styles from "../../../page.module.css";
import { AuthCheck } from "../../../components/AuthProvider";
import GlobalNav from "../../../components/GlobalNav";

interface BIPData {
    StudentCode: string;
    TargetBehavior: string;
    Hypothesis: string;
    Goals: string;
    PreventionStrategies: string;
    TeachingStrategies: string;
    ConsequenceStrategies: string;
    CrisisPlan: string;
    EvaluationPlan: string;
    UpdatedAt: string;
    Author: string;
}

export default function BIPEditor() {
    const params = useParams();
    const router = useRouter();
    const studentName = decodeURIComponent(params.id as string);
    const [studentCode, setStudentCode] = useState("");
    const [loading, setLoading] = useState(true);
    const [aiLoading, setAiLoading] = useState<string | null>(null); // Track which AI action is loading
    const [bip, setBip] = useState<BIPData>({
        StudentCode: "",
        TargetBehavior: "",
        Hypothesis: "",
        Goals: "",
        PreventionStrategies: "",
        TeachingStrategies: "",
        ConsequenceStrategies: "",
        CrisisPlan: "",
        EvaluationPlan: "",
        UpdatedAt: "",
        Author: ""
    });
    const [saving, setSaving] = useState(false);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
                        setBip(bipRes.data);
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

    // NEW: AI Hypothesis Generation
    const handleAIHypothesis = async () => {
        if (!studentCode) return;
        setAiLoading("hypothesis");
        try {
            const res = await axios.post(`${apiUrl}/api/v1/bip/students/${studentCode}/ai-hypothesis`);
            const aiResult = res.data.hypothesis || "";
            if (aiResult) {
                setBip(prev => ({
                    ...prev,
                    TargetBehavior: prev.TargetBehavior ? prev.TargetBehavior + "\n\n---\n🤖 AI 분석 결과:\n" + extractSection(aiResult, "표적행동") : extractSection(aiResult, "표적행동") || prev.TargetBehavior,
                    Hypothesis: prev.Hypothesis ? prev.Hypothesis + "\n\n---\n🤖 AI 분석 결과:\n" + extractSection(aiResult, "가설") : extractSection(aiResult, "가설") || prev.Hypothesis,
                    Goals: prev.Goals ? prev.Goals + "\n\n---\n🤖 AI 분석 결과:\n" + extractSection(aiResult, "목표") : extractSection(aiResult, "목표") || prev.Goals,
                }));
            }
        } catch {
            alert("AI 가설수립 요청 실패. 잠시 후 다시 시도해주세요.");
        } finally {
            setAiLoading(null);
        }
    };

    // NEW: AI Strategy Recommendation
    const handleAIStrategies = async () => {
        if (!studentCode) return;
        if (!bip.TargetBehavior && !bip.Hypothesis) {
            alert("먼저 '표적행동'과 '가설'을 입력하거나 AI 가설수립을 실행해주세요.");
            return;
        }
        setAiLoading("strategies");
        try {
            const res = await axios.post(`${apiUrl}/api/v1/bip/students/${studentCode}/ai-strategies`, {
                target_behavior: bip.TargetBehavior,
                hypothesis: bip.Hypothesis,
                goals: bip.Goals,
            });
            const aiResult = res.data.strategies || "";
            if (aiResult) {
                setBip(prev => ({
                    ...prev,
                    PreventionStrategies: appendAI(prev.PreventionStrategies, extractSection(aiResult, "예방")),
                    TeachingStrategies: appendAI(prev.TeachingStrategies, extractSection(aiResult, "교수")),
                    ConsequenceStrategies: appendAI(prev.ConsequenceStrategies, extractSection(aiResult, "강화")),
                    CrisisPlan: appendAI(prev.CrisisPlan, extractSection(aiResult, "위기")),
                }));
            }
        } catch {
            alert("AI 추천전략 요청 실패. 잠시 후 다시 시도해주세요.");
        } finally {
            setAiLoading(null);
        }
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

    if (loading) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <AuthCheck>
            <div className={styles.container}>
                <GlobalNav currentPage="student" />

                <header className={styles.header}>
                    <div>
                        <h1 className={styles.title}>📋 행동중재계획 (BIP) 작성</h1>
                        <p className={styles.subtitle}>{studentName} ({studentCode})</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={handleSave} disabled={saving}
                            style={{ padding: '10px 20px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {saving ? "저장 중..." : "💾 저장하기"}
                        </button>
                        <button onClick={() => router.back()}
                            style={{ padding: '10px 20px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                            취소 / 뒤로
                        </button>
                    </div>
                </header>

                <main className={styles.main}>
                    <div className={styles.card}>
                        {/* AI Buttons Row */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: '20px', borderBottom: '2px solid #3b82f6', paddingBottom: '10px',
                            flexWrap: 'wrap', gap: '10px'
                        }}>
                            <h2 style={{ margin: 0 }}>행동 지원 계획 수립</h2>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button onClick={handleAIHypothesis} disabled={aiLoading !== null}
                                    style={{
                                        padding: '8px 16px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                                        color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
                                        fontSize: '0.85rem', fontWeight: 600, opacity: aiLoading ? 0.6 : 1,
                                        boxShadow: '0 2px 8px rgba(124,58,237,0.3)'
                                    }}>
                                    {aiLoading === "hypothesis" ? "⏳ 분석 중..." : "🤖 AI 가설수립"}
                                </button>
                                <button onClick={handleAIStrategies} disabled={aiLoading !== null}
                                    style={{
                                        padding: '8px 16px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                        color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
                                        fontSize: '0.85rem', fontWeight: 600, opacity: aiLoading ? 0.6 : 1,
                                        boxShadow: '0 2px 8px rgba(59,130,246,0.3)'
                                    }}>
                                    {aiLoading === "strategies" ? "⏳ 분석 중..." : "🤖 AI 추천전략"}
                                </button>
                            </div>
                        </div>

                        {aiLoading && (
                            <div style={{
                                background: '#f5f3ff', padding: '12px 16px', borderRadius: '8px',
                                marginBottom: '16px', textAlign: 'center', color: '#7c3aed', fontSize: '0.9rem'
                            }}>
                                ⏳ AI가 학생 데이터를 분석하고 있습니다... (약 10~15초 소요)
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            {/* Left Column */}
                            <div>
                                <Section title="1. 표적 행동 (Target Behavior)" color="#ef4444">
                                    <textarea
                                        value={bip.TargetBehavior}
                                        onChange={e => handleChange("TargetBehavior", e.target.value)}
                                        placeholder="구체적이고 관찰 가능한 행동으로 기술하세요."
                                        style={{ height: '100px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>

                                <Section title="2. 가설 (Hypothesis)" color="#f59e0b">
                                    <textarea
                                        value={bip.Hypothesis}
                                        onChange={e => handleChange("Hypothesis", e.target.value)}
                                        placeholder="행동의 기능과 배경 사건에 대한 가설을 기술하세요."
                                        style={{ height: '100px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>

                                <Section title="3. 목표 (Goals)" color="#6366f1">
                                    <textarea
                                        value={bip.Goals}
                                        onChange={e => handleChange("Goals", e.target.value)}
                                        placeholder="구체적이고 측정 가능한 목표 (예: 주 5회 → 주 2회 이하로 감소)"
                                        style={{ height: '80px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>

                                <Section title="4. 예방 전략 (Prevention)" color="#3b82f6">
                                    <textarea
                                        value={bip.PreventionStrategies}
                                        onChange={e => handleChange("PreventionStrategies", e.target.value)}
                                        placeholder="배경 사건을 수정하거나 선행 사건을 조절하는 전략"
                                        style={{ height: '150px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>
                            </div>

                            {/* Right Column */}
                            <div>
                                <Section title="5. 대체 행동 교육 (Teaching)" color="#10b981">
                                    <textarea
                                        value={bip.TeachingStrategies}
                                        onChange={e => handleChange("TeachingStrategies", e.target.value)}
                                        placeholder="대체 행동이나 적응 기술을 가르치는 방법"
                                        style={{ height: '120px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>

                                <Section title="6. 강화 전략 (Reinforcement)" color="#8b5cf6">
                                    <textarea
                                        value={bip.ConsequenceStrategies}
                                        onChange={e => handleChange("ConsequenceStrategies", e.target.value)}
                                        placeholder="적절한 행동에 대한 강화 및 문제 행동에 대한 반응"
                                        style={{ height: '120px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>

                                <Section title="7. 위기 관리 (Crisis Plan)" color="#be123c">
                                    <textarea
                                        value={bip.CrisisPlan}
                                        onChange={e => handleChange("CrisisPlan", e.target.value)}
                                        placeholder="안전 위협 시 대처 절차 (해당 시)"
                                        style={{ height: '80px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>
                            </div>
                        </div>

                        <Section title="8. 평가 계획 (Evaluation)" color="#64748b">
                            <textarea
                                value={bip.EvaluationPlan}
                                onChange={e => handleChange("EvaluationPlan", e.target.value)}
                                placeholder="중재 효과를 어떻게 모니터링하고 평가할 것인가?"
                                style={{ height: '80px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            />
                        </Section>

                        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f1f5f9', borderRadius: '8px', fontSize: '0.9rem', color: '#64748b', textAlign: 'right' }}>
                            마지막 수정: {bip.UpdatedAt || "없음"} (작성자: {bip.Author || "-"})
                        </div>
                    </div>
                </main>
            </div>
        </AuthCheck>
    );
}

function Section({ title, color, children }: { title: string, color: string, children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: color, marginBottom: '8px', fontSize: '1.1rem' }}>{title}</h3>
            {children}
        </div>
    );
}

// Helper: Extract a section from AI multi-section text
function extractSection(text: string, keyword: string): string {
    if (!text) return "";
    const lines = text.split("\n");
    let capturing = false;
    let result: string[] = [];
    for (const line of lines) {
        if (line.includes(`[${keyword}`) || line.includes(`**[${keyword}`)) {
            capturing = true;
            continue;
        }
        if (capturing && (line.startsWith("**[") || line.startsWith("[")) && !line.includes(keyword)) {
            break;
        }
        if (capturing) {
            result.push(line);
        }
    }
    return result.join("\n").trim() || text;
}

// Helper: Append AI result to existing text
function appendAI(existing: string, aiText: string): string {
    if (!aiText) return existing;
    if (!existing) return aiText;
    return existing + "\n\n---\n🤖 AI 추천:\n" + aiText;
}
