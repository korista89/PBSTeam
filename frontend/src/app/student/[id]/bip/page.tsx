"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import styles from "../../../page.module.css";
import { AuthCheck } from "../../../components/AuthProvider";
import GlobalNav from "../../../components/GlobalNav";
import { BIP_STRATEGIES } from "../../../constants";

interface BIPData {
    StudentCode: string;
    TargetBehavior: string;
    Hypothesis: string;
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
    const [bip, setBip] = useState<BIPData>({
        StudentCode: "",
        TargetBehavior: "",
        Hypothesis: "",
        PreventionStrategies: "",
        TeachingStrategies: "",
        ConsequenceStrategies: "",
        CrisisPlan: "",
        EvaluationPlan: "",
        UpdatedAt: "",
        Author: ""
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!studentName) return;

        const fetchData = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

                // 1. Get Student Info to get Code
                const studentRes = await axios.get(`${apiUrl}/api/v1/students/${encodeURIComponent(studentName)}`);
                const code = studentRes.data.profile.student_code;
                setStudentCode(code);

                // 2. Get BIP Data
                try {
                    const bipRes = await axios.get(`${apiUrl}/api/v1/bip/students/${code}/bip`);
                    if (bipRes.data && bipRes.data.StudentCode) {
                        setBip(bipRes.data);
                    } else {
                        // Initialize with code
                        setBip(prev => ({ ...prev, StudentCode: code }));
                    }
                } catch (e) {
                    console.log("No existing BIP found, starting fresh.");
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

    const handleAutoFill = () => {
        const hypothesis = bip.Hypothesis;
        if (!hypothesis) {
            alert("먼저 '가설(Hypothesis)'에 행동의 기능을 입력해주세요. (예: 관심 끌기, 회피, 물건/활동 얻기, 감각/자기자극)");
            return;
        }

        let matchedStrategy = null;
        for (const key in BIP_STRATEGIES) {
            if (hypothesis.includes(key) || key.includes(hypothesis) || (hypothesis.includes("관심") && key.includes("관심")) || (hypothesis.includes("회피") && key.includes("회피"))) {
                matchedStrategy = BIP_STRATEGIES[key];
                break;
            }
        }

        if (matchedStrategy) {
            if (confirm("입력된 가설을 바탕으로 추천 전략을 자동 입력하시겠습니까?\\n(기존 내용은 유지되며 뒤에 추가됩니다.)")) {
                setBip(prev => ({
                    ...prev,
                    PreventionStrategies: prev.PreventionStrategies ? prev.PreventionStrategies + "\\n\\n" + matchedStrategy!.prevention : matchedStrategy!.prevention,
                    TeachingStrategies: prev.TeachingStrategies ? prev.TeachingStrategies + "\\n\\n" + matchedStrategy!.teaching : matchedStrategy!.teaching,
                    ConsequenceStrategies: prev.ConsequenceStrategies ? prev.ConsequenceStrategies + "\\n\\n" + matchedStrategy!.consequence : matchedStrategy!.consequence
                }));
            }
        } else {
            alert("일치하는 추천 전략을 찾을 수 없습니다.\\n가설에 '관심', '회피', '물건', '감각' 등의 키워드를 포함시켜주세요.");
        }
    };

    const handleSave = async () => {
        if (!studentCode) return;
        setSaving(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            await axios.post(`${apiUrl}/api/v1/bip/students/${studentCode}/bip`, {
                ...bip,
                StudentCode: studentCode,
                UpdatedAt: new Date().toISOString().split('T')[0],
                Author: "Teacher" // Should be from auth context
            });
            alert("행동중재계획(BIP)이 저장되었습니다.");
        } catch (e) {
            console.error(e);
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
                    <div>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                padding: '10px 20px', backgroundColor: '#10b981', color: 'white',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginRight: '10px'
                            }}
                        >
                            {saving ? "저장 중..." : "💾 저장하기"}
                        </button>
                        <button
                            onClick={() => router.back()}
                            style={{
                                padding: '10px 20px', backgroundColor: '#64748b', color: 'white',
                                border: 'none', borderRadius: '8px', cursor: 'pointer'
                            }}
                        >
                            취소 / 뒤로
                        </button>
                    </div>
                </header>

                <main className={styles.main}>
                    <div className={styles.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #3b82f6', paddingBottom: '10px' }}>
                            <h2 style={{ margin: 0 }}>행동 지원 계획 수립</h2>
                            <button
                                onClick={handleAutoFill}
                                style={{
                                    padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white',
                                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem'
                                }}
                            >
                                🤖 AI 전략 추천 (가설 기반)
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            {/* Left Column */}
                            <div>
                                <Section title="1. 표적 행동 (Target Behavior)" color="#ef4444">
                                    <textarea
                                        className={styles.textarea}
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
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '5px' }}>
                                        * 'AI 전략 추천'을 위해 '관심', '회피', '물건', '감각' 등의 단어를 포함해주세요.
                                    </p>
                                </Section>

                                <Section title="3. 예방 전략 (Prevention)" color="#3b82f6">
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
                                <Section title="4. 대체 행동 교육 (Teaching)" color="#10b981">
                                    <textarea
                                        value={bip.TeachingStrategies}
                                        onChange={e => handleChange("TeachingStrategies", e.target.value)}
                                        placeholder="대체 행동이나 적응 기술을 가르치는 방법"
                                        style={{ height: '120px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>

                                <Section title="5. 반응 전략 (Consequence)" color="#8b5cf6">
                                    <textarea
                                        value={bip.ConsequenceStrategies}
                                        onChange={e => handleChange("ConsequenceStrategies", e.target.value)}
                                        placeholder="적절한 행동에 대한 강화 및 문제 행동에 대한 반응"
                                        style={{ height: '120px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>

                                <Section title="6. 위기 관리 (Crisis Plan)" color="#be123c">
                                    <textarea
                                        value={bip.CrisisPlan}
                                        onChange={e => handleChange("CrisisPlan", e.target.value)}
                                        placeholder="안전 위협 시 대처 절차 (해당 시)"
                                        style={{ height: '80px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </Section>
                            </div>
                        </div>

                        <Section title="7. 평가 계획 (Evaluation)" color="#64748b">
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
