"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import {
    ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { AuthCheck } from "../../../components/AuthProvider";
import AppShell from "../../../components/AppShell";
import { useDateRange } from "../../../components/GlobalNav";
import { parseBIPAIResult } from "../../../utils";
import ReadableAIResult from "../../../components/ReadableAIResult";
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
    PreventionEBP?: string;
    TeachingEBP?: string;
    ConsequenceEBP?: string;
    CrisisEBP?: string;
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
        key: "CrisisPlan", num: 7, title: "위기행동지원 전략 (요약 서술)", color: "#be123c",
        placeholder: "🚨 위기행동지원절차 요약\n• 아래 '위기행동지원절차' 구조화 편집기의 10단계를 참고해 핵심만 요약 서술하세요.\n• 전조·고조 신호, 안전거리 확보, 이동 장소, 회복 후 복귀 기준 등"
    },
    {
        key: "EvaluationPlan", num: 8, title: "평가 계획(Tier3 졸업 기준 포함)", color: "#64748b",
        placeholder: "예:\n• 데이터 수집: 매일 행동 발생 빈도/지속시간 기록 (경은PBST 행동관찰 시스템 활용)\n• 평가 주기: 격주 1회 데이터 검토, 월 1회 행동중재지원팀 회의\n• 졸업 기준: 4주 연속 표적행동 주 1회 이하 + 대체행동 주 4회 이상\n• 중재 수정 기준: 2주간 개선 없으면 전략 수정"
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

// 39 Be-Able EBP catalog categories mapped to the 3 selectable EBP columns.
// 위기행동지원절차(CrisisEBP)는 EBP 카탈로그가 아니라 학교 표준 위기대응 프로토콜이다.
const EBP_CATEGORY_MAP: Record<string, string[]> = {
    PreventionEBP: ["ANTECEDENT", "SETTING_EVENT"],
    TeachingEBP: ["TEACHING"],
    ConsequenceEBP: ["REINFORCEMENT", "CONSEQUENCE"],
};
const EBP_COLUMN_LABELS: Record<string, string> = {
    PreventionEBP: "🛡️ 예방 전략",
    TeachingEBP: "📚 교수 전략",
    ConsequenceEBP: "🎁 후속결과 전략",
};

// 경은학교 위기행동지원절차 표준 프로토콜 기본값 — 학생별로 자유롭게 수정 가능.
const CRISIS_PROTOCOL_FIELDS: { key: string; label: string; default: string }[] = [
    { key: "precursor", label: "전조", default: "표정이 굳거나 목소리가 커짐, 자리 이탈 시도, 물건을 만지작거리는 등 평소와 다른 신호를 관찰한다. 이 단계에서 즉시 개입하여 고조를 예방한다." },
    { key: "escalation", label: "고조", default: "언어적 자극과 지시·요구를 즉시 중단하고 안전거리를 확보한다. 시각적 지원 도구(감정카드, 진정카드 등)를 제시하여 자기조절을 유도한다." },
    { key: "notification", label: "알림", default: "위기대응팀(또는 관리자·보건교사)에게 즉시 알린다. 학급 내 다른 학생의 안전 확보를 위해 보조인력을 요청한다." },
    { key: "location", label: "장소/이동방법", default: "사전 지정된 안전공간(심리안정실 등)으로 이동한다. 최소 인원으로 측면에서 유도하며 신체 접촉은 최소화한다." },
    { key: "observation", label: "관찰 방법", default: "10분 간격으로 행동강도와 안전상태를 관찰·기록한다. 자해·타해 위험이 지속되는지 우선 확인한다." },
    { key: "response_check", label: "호명반응 확인 방법", default: "이름을 부드럽게 호명하여 반응 여부를 확인한다(눈맞춤, 고개 돌림 등). 반응이 없으면 관찰을 지속하고, 반응이 있으면 회복 단계 전환을 시도한다." },
    { key: "instructions", label: "지시 목록", default: "짧고 단순한 1단계 지시만 사용한다(예: \"앉자\", \"숨 쉬자\"). 여러 지시를 한 번에 주거나 장황하게 설명하지 않으며, 선택형 지시는 지양한다." },
    { key: "recovery_talk", label: "회복대화 방법", default: "행동이 진정된 후 감정을 먼저 인정한다(\"많이 힘들었구나\"). 상황 설명은 짧게 하고 비난·훈계는 하지 않는다." },
    { key: "return_intent", label: "복귀의사 방법", default: "학생에게 교실 복귀 의사를 직접 묻고 스스로 결정할 시간을 준다(예: \"준비되면 알려줘\")." },
    { key: "post_return", label: "복귀 후 반응", default: "복귀 후 15~20분간 참여도와 정서 상태를 관찰한다. 필요 시 과제량을 조정하고 성공 경험을 제공하여 안정을 강화한다." },
];

function withCrisisDefaults(value: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const f of CRISIS_PROTOCOL_FIELDS) result[f.key] = value?.[f.key] ?? f.default;
    return result;
}

function safeParseCrisisProtocol(v: any): Record<string, string> {
    if (!v) return withCrisisDefaults({});
    try {
        const parsed = JSON.parse(v);
        return withCrisisDefaults(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
    } catch { return withCrisisDefaults({}); }
}

interface EBPItem { code?: string; name: string; fidelity: string; }

function safeParseEBP(v: any): EBPItem[] {
    if (!v) return [];
    try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}

// ====== EBP 선택/직접입력 + 충실도 체크포인트 1개 컬럼 ======
function EBPColumnEditor({ fieldKey, items, onChange, catalog }: {
    fieldKey: string; items: EBPItem[]; onChange: (items: EBPItem[]) => void; catalog: any[];
}) {
    const [pickCode, setPickCode] = useState("");
    const [customName, setCustomName] = useState("");
    const categories = EBP_CATEGORY_MAP[fieldKey] || [];
    const options = (categories.length > 0 ? catalog.filter(c => categories.includes(c.category)) : [])
        .slice()
        .sort((a, b) => (a.official_no || 999) - (b.official_no || 999));

    const addFromCatalog = () => {
        const strat = options.find(o => o.code === pickCode);
        if (!strat) return;
        if (items.some(i => i.code === strat.code)) { setPickCode(""); return; }
        onChange([...items, { code: strat.code, name: strat.name, fidelity: "" }]);
        setPickCode("");
    };

    const addCustom = () => {
        if (!customName.trim()) return;
        onChange([...items, { name: customName.trim(), fidelity: "" }]);
        setCustomName("");
    };

    const removeItem = (idx: number) => onChange(items.filter((_, i) => i !== idx));
    const updateFidelity = (idx: number, val: string) => onChange(items.map((it, i) => i === idx ? { ...it, fidelity: val } : it));

    return (
        <div style={{ background: '#fafafa', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a' }}>{EBP_COLUMN_LABELS[fieldKey]}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((it, idx) => (
                    <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0f172a' }}>
                                {it.code && <span style={{ padding: '1px 5px', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontSize: '0.65rem', marginRight: 5 }}>{it.code}</span>}
                                {it.name}
                            </span>
                            <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                        </div>
                        <input
                            type="text"
                            value={it.fidelity}
                            onChange={e => updateFidelity(idx, e.target.value)}
                            placeholder="충실도 체크포인트 (예: 매 수업 시작 5분 내 실시 여부)"
                            style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.72rem', boxSizing: 'border-box' }}
                        />
                    </div>
                ))}
                {items.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.74rem', margin: 0 }}>선택된 전략이 없습니다.</p>}
            </div>

            {options.length > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                    <select value={pickCode} onChange={e => setPickCode(e.target.value)} style={{ flex: 1, padding: '5px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.72rem' }}>
                        <option value="">EBP 카탈로그에서 선택...</option>
                        {options.map(o => (
                            <option key={o.code} value={o.code}>
                                {o.official_no ? `${String(o.official_no).padStart(2, '0')}/39 · ` : ''}{o.code} — {o.name}
                            </option>
                        ))}
                    </select>
                    <button onClick={addFromCatalog} disabled={!pickCode} style={{ padding: '5px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}>추가</button>
                </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
                <input
                    type="text"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="직접 입력..."
                    style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.72rem' }}
                    onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
                />
                <button onClick={addCustom} disabled={!customName.trim()} style={{ padding: '5px 10px', background: '#64748b', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}>추가</button>
            </div>
        </div>
    );
}

// ====== 위기행동지원절차 편집기 (학교 표준 프로토콜 기본값, 학생별 수정 가능) ======
function CrisisProtocolEditor({ value, onChange }: {
    value: Record<string, string>; onChange: (v: Record<string, string>) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const update = (key: string, text: string) => onChange({ ...value, [key]: text });
    const resetOne = (key: string, def: string) => onChange({ ...value, [key]: def });

    return (
        <div style={{ background: '#fff5f5', borderRadius: '12px', padding: '14px', border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a' }}>🚨 위기행동지원절차 (구조화)</div>
                <span style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: 700 }}>{expanded ? '▲ 접기' : `▼ ${CRISIS_PROTOCOL_FIELDS.length}단계 펼치기`}</span>
            </div>
            {!expanded && (
                <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>학교 표준 프로토콜 기본값이 적용되어 있습니다. 펼쳐서 학생별로 수정할 수 있습니다.</p>
            )}
            {expanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {CRISIS_PROTOCOL_FIELDS.map(f => (
                        <div key={f.key}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#b91c1c' }}>{f.label}</span>
                                {value[f.key] !== f.default && (
                                    <button onClick={() => resetOne(f.key, f.default)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'underline' }}>
                                        기본값으로
                                    </button>
                                )}
                            </div>
                            <textarea
                                value={value[f.key] ?? f.default}
                                onChange={e => update(f.key, e.target.value)}
                                rows={2}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #fecaca', fontSize: '0.72rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ====== 회의록/협의기록 섹션 (학생별, 누적기록) ======
function MeetingNotesSection({ apiUrl, meetingType, title, studentCode }: { apiUrl: string, meetingType: string, title: string, studentCode?: string }) {
    const [expanded, setExpanded] = useState(false);
    const [content, setContent] = useState("");
    const [notes, setNotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchNotes = async () => {
        try {
            const params = new URLSearchParams({ meeting_type: meetingType });
            if (studentCode) params.append("student_code", studentCode);
            const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?${params.toString()}`);
            setNotes(res.data.notes || []);
        } catch (e) { }
    };

    useEffect(() => { if (expanded) fetchNotes(); }, [expanded]);

    const saveNote = async () => {
        if (!content.trim()) return;
        setLoading(true);
        try {
            await axios.post(`${apiUrl}/api/v1/meeting-notes`, { meeting_type: meetingType, date: new Date().toISOString().split('T')[0], content, author: "Teacher", student_code: studentCode || "" });
            setContent(""); fetchNotes(); alert("저장되었습니다.");
        } catch { alert("저장 실패"); } finally { setLoading(false); }
    };

    return (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
            <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: expanded ? "#0f172a" : "#f8fafc" }}>
                <h3 style={{ margin: 0, fontSize: "0.95rem", color: expanded ? "#e2e8f0" : "#1e293b" }}>📝 {title}</h3>
                <span style={{ color: expanded ? "#94a3b8" : "#64748b", fontSize: '0.85rem' }}>{expanded ? "▲ 접기" : "▼ 펼치기"}</span>
            </div>
            {expanded && (
                <div style={{ padding: "20px", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ marginBottom: "16px" }}>
                        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="협의 내용을 비식별화하여 입력하세요..."
                            style={{ width: "100%", minHeight: "80px", padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#1e293b", marginBottom: "8px", fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        <button onClick={saveNote} disabled={loading || !content.trim()}
                            style={{ padding: "8px 16px", background: "#6366f1", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem", opacity: loading ? 0.7 : 1 }}>
                            {loading ? "저장 중..." : "협의 기록 저장 (누적)"}
                        </button>
                    </div>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#64748b" }}>📋 누적 기록</h4>
                    {notes.length === 0 ? <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>기록이 없습니다.</p> : (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "200px", overflowY: "auto" }}>
                            {notes.map(n => (
                                <li key={n.id} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px dashed #e2e8f0" }}>
                                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>{n.date} | {n.author}</div>
                                    <div style={{ fontSize: "0.9rem", color: "#1e293b", whiteSpace: "pre-wrap" }}>{n.content}</div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
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

// 표적행동(문제행동/목표행동) 데이터 관리 — 담임교사가 자유롭게 정의한 행동을 BIP 적용기간
// 동안 추적한다. CICO 일일 카드와는 별개로, 학생 개별 표적행동 + 실행충실도(O/X) +
// 같은 기간 위기행동 발생을 한 차트에 겹쳐 보여줘 데이터기반 의사결정의 근거로 쓴다.
const MEASUREMENT_TYPES = ["빈도", "지속시간", "강도", "퍼센트"];

function TargetBehaviorSection({ studentCode, apiUrl }: { studentCode: string; apiUrl: string }) {
    const [behaviors, setBehaviors] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");
    const [chart, setChart] = useState<any>(null);
    const [showNewForm, setShowNewForm] = useState(false);
    const [newForm, setNewForm] = useState({ type: "문제행동", definition: "", measurement_type: "빈도", baseline: "", bip_start_date: "", bip_end_date: "" });
    const [dataForm, setDataForm] = useState({ date: new Date().toISOString().split("T")[0], value: "", memo: "" });
    const [fidelityForm, setFidelityForm] = useState({ date: new Date().toISOString().split("T")[0], implemented: "O", memo: "" });
    const [decision, setDecision] = useState<{ loading: boolean; text: string }>({ loading: false, text: "" });

    const fetchBehaviors = useCallback(async () => {
        if (!studentCode) return;
        try {
            const res = await axios.get(`${apiUrl}/api/v1/target-behaviors/students/${encodeURIComponent(studentCode)}`);
            const list = res.data.behaviors || [];
            setBehaviors(list);
            if (!selectedId && list.length > 0) setSelectedId(list[0].BehaviorID);
        } catch (err) {
            console.error(err);
        }
    }, [apiUrl, studentCode]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { void fetchBehaviors(); }, [fetchBehaviors]);

    const fetchChart = useCallback(async () => {
        if (!selectedId || !studentCode) { setChart(null); return; }
        try {
            const res = await axios.get(`${apiUrl}/api/v1/target-behaviors/${selectedId}/chart`, { params: { student_code: studentCode } });
            setChart(res.data);
        } catch (err) {
            console.error(err);
            setChart(null);
        }
    }, [apiUrl, selectedId, studentCode]);

    useEffect(() => { void fetchChart(); }, [fetchChart]);

    const selected = behaviors.find(b => b.BehaviorID === selectedId);

    const handleCreate = async () => {
        if (!newForm.definition.trim()) { alert("표적행동 정의를 입력하세요."); return; }
        try {
            await axios.post(`${apiUrl}/api/v1/target-behaviors/students/${encodeURIComponent(studentCode)}`, newForm);
            setNewForm({ type: "문제행동", definition: "", measurement_type: "빈도", baseline: "", bip_start_date: "", bip_end_date: "" });
            setShowNewForm(false);
            fetchBehaviors();
        } catch (err: any) {
            alert("등록 실패: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleEnd = async (id: string) => {
        if (!confirm("이 표적행동 추적을 종료 처리하시겠습니까?")) return;
        try {
            await axios.patch(`${apiUrl}/api/v1/target-behaviors/${id}`, { status: "종료", student_code: studentCode });
            fetchBehaviors();
        } catch (err: any) {
            alert("처리 실패: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleSubmitData = async () => {
        if (!selectedId || !dataForm.value.trim()) return;
        try {
            await axios.post(`${apiUrl}/api/v1/target-behaviors/${selectedId}/data`, { student_code: studentCode, ...dataForm });
            setDataForm(prev => ({ ...prev, value: "", memo: "" }));
            fetchChart();
        } catch (err: any) {
            alert("데이터 기록 실패: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleSubmitFidelity = async () => {
        if (!selectedId) return;
        try {
            await axios.post(`${apiUrl}/api/v1/target-behaviors/${selectedId}/fidelity`, { student_code: studentCode, ...fidelityForm });
            setFidelityForm(prev => ({ ...prev, memo: "" }));
            fetchChart();
        } catch (err: any) {
            alert("실행기록 실패: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleDecisionAnalysis = async () => {
        if (!selectedId) return;
        setDecision({ loading: true, text: "" });
        try {
            const res = await axios.post(`${apiUrl}/api/v1/target-behaviors/${selectedId}/decision-analysis`, {
                student_code: studentCode,
                behavior_definition: selected?.Definition || "",
            });
            setDecision({ loading: false, text: res.data.analysis || "" });
        } catch (err: any) {
            setDecision({ loading: false, text: "분석 실패: " + (err.response?.data?.detail || err.message) });
        }
    };

    // 표적행동 값·실행충실도(O/X→100/0)·위기행동 발생건수를 날짜 기준으로 한 배열로 합친다 —
    // 한 화면에서 다각도로 겹쳐 볼 수 있어야 하기 때문.
    const mergedChartData = (() => {
        if (!chart) return [];
        const byDate: Record<string, any> = {};
        for (const d of chart.data_points || []) {
            byDate[d.Date] = { ...(byDate[d.Date] || { date: d.Date }), value: Number(d.Value) || 0 };
        }
        for (const f of chart.fidelity_points || []) {
            byDate[f.Date] = { ...(byDate[f.Date] || { date: f.Date }), fidelity: String(f.Implemented).toUpperCase() === "O" ? 100 : 0 };
        }
        for (const c of chart.crisis_by_date || []) {
            byDate[c.date] = { ...(byDate[c.date] || { date: c.date }), crisis: c.count };
        }
        return Object.values(byDate).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
    })();

    return (
        <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                📊 표적행동 데이터 관리
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: '#64748b' }}>
                담임교사가 직접 정의한 문제행동/목표행동을 BIP 적용기간 동안 추적합니다. 위 필드1(표적행동)·필드8(평가계획)의 서술을 실제 데이터로 뒷받침하는 곳입니다.
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
                {behaviors.map(b => (
                    <button
                        key={b.BehaviorID}
                        onClick={() => setSelectedId(b.BehaviorID)}
                        style={{
                            padding: '6px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                            border: selectedId === b.BehaviorID ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                            background: b.Type === '문제행동' ? '#fef2f2' : '#f0fdf4',
                            color: b.Type === '문제행동' ? '#b91c1c' : '#166534',
                            opacity: b.Status === '종료' ? 0.5 : 1,
                        }}
                    >
                        {b.Type === '문제행동' ? '🚩' : '🎯'} {b.Definition.slice(0, 16)}{b.Definition.length > 16 ? '…' : ''} {b.Status === '종료' && '(종료)'}
                    </button>
                ))}
                <button onClick={() => setShowNewForm(v => !v)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                    ＋ 새 표적행동
                </button>
            </div>

            {showNewForm && (
                <div style={{ background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <select value={newForm.type} onChange={e => setNewForm({ ...newForm, type: e.target.value })} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}>
                            <option value="문제행동">🚩 문제행동</option>
                            <option value="목표행동">🎯 목표행동</option>
                        </select>
                        <select value={newForm.measurement_type} onChange={e => setNewForm({ ...newForm, measurement_type: e.target.value })} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}>
                            {MEASUREMENT_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <input type="text" placeholder="기저선(예: 주 5회)" value={newForm.baseline} onChange={e => setNewForm({ ...newForm, baseline: e.target.value })} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', flex: 1, minWidth: 120 }} />
                    </div>
                    <input type="text" placeholder="표적행동 조작적 정의 (관찰·측정 가능하게)" value={newForm.definition} onChange={e => setNewForm({ ...newForm, definition: e.target.value })} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: '0.76rem', color: '#64748b' }}>BIP 적용기간</label>
                        <input type="date" value={newForm.bip_start_date} onChange={e => setNewForm({ ...newForm, bip_start_date: e.target.value })} style={{ padding: '5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }} />
                        <span>~</span>
                        <input type="date" value={newForm.bip_end_date} onChange={e => setNewForm({ ...newForm, bip_end_date: e.target.value })} style={{ padding: '5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }} />
                        <button onClick={handleCreate} className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.78rem', marginLeft: 'auto' }}>등록</button>
                    </div>
                </div>
            )}

            {selected && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{selected.Definition}</div>
                            <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                                측정: {selected.MeasurementType} · 기저선: {selected.Baseline || '-'} · 기간: {selected.BIPStartDate || '?'} ~ {selected.BIPEndDate || '?'} · {selected.Status}
                            </div>
                        </div>
                        {selected.Status !== '종료' && (
                            <button onClick={() => handleEnd(selected.BehaviorID)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>종료 처리</button>
                        )}
                    </div>

                    {/* 다각도 차트: 표적행동 값(line) + 실행충실도(bar) + 같은 기간 위기행동 발생(bar) */}
                    <div style={{ height: 260 }}>
                        <ResponsiveContainer>
                            <ComposedChart data={mergedChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} />
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                                <Line yAxisId="left" type="monotone" dataKey="value" name={`표적행동(${selected.MeasurementType})`} stroke="#6366f1" strokeWidth={2} connectNulls />
                                <Bar yAxisId="right" dataKey="fidelity" name="중재 실행(O=100)" fill="#10b981" barSize={10} />
                                <Bar yAxisId="left" dataKey="crisis" name="위기행동 발생(건)" fill="#ef4444" barSize={10} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="responsive-grid-2">
                        <div style={{ background: '#fafafa', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>오늘 데이터 입력</div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input type="date" value={dataForm.date} onChange={e => setDataForm({ ...dataForm, date: e.target.value })} style={{ padding: '5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.76rem' }} />
                                <input type="text" placeholder="측정값" value={dataForm.value} onChange={e => setDataForm({ ...dataForm, value: e.target.value })} style={{ padding: '5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.76rem', flex: 1 }} />
                                <button onClick={handleSubmitData} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.72rem' }}>기록</button>
                            </div>
                        </div>
                        <div style={{ background: '#fafafa', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>오늘 중재 실행기록 (O/X)</div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input type="date" value={fidelityForm.date} onChange={e => setFidelityForm({ ...fidelityForm, date: e.target.value })} style={{ padding: '5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.76rem' }} />
                                <select value={fidelityForm.implemented} onChange={e => setFidelityForm({ ...fidelityForm, implemented: e.target.value })} style={{ padding: '5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.76rem' }}>
                                    <option value="O">O (실행함)</option>
                                    <option value="X">X (실행 못함)</option>
                                </select>
                                <button onClick={handleSubmitFidelity} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.72rem' }}>기록</button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <button onClick={handleDecisionAnalysis} disabled={decision.loading} className="btn btn-ai" style={{ fontSize: '0.8rem' }}>
                            {decision.loading ? "⏳ 분석 중..." : "🤖 이 표적행동 데이터로 의사결정 제안 받기"}
                        </button>
                        {decision.text && (
                            <div style={{ marginTop: 10 }}>
                                <ReadableAIResult text={decision.text} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {behaviors.length === 0 && !showNewForm && (
                <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>등록된 표적행동이 없습니다. &ldquo;＋ 새 표적행동&rdquo;으로 추가하세요.</p>
            )}
        </div>
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
    const [aiMode, setAiMode] = useState<"compact" | "detailed">("detailed");
    const [aiResult, setAiResult] = useState("");
    const [bip, setBip] = useState<BIPData>({
        StudentCode: "", TargetBehavior: "", Hypothesis: "", Goals: "",
        PreventionStrategies: "", TeachingStrategies: "", ReinforcementStrategies: "",
        CrisisPlan: "", EvaluationPlan: "",
        MedicationStatus: "", ReinforcerInfo: "", OtherConsiderations: "",
        UpdatedAt: "", Author: ""
    });
    const [ebp, setEbp] = useState<Record<string, EBPItem[]>>({ PreventionEBP: [], TeachingEBP: [], ConsequenceEBP: [] });
    const [crisisProtocol, setCrisisProtocol] = useState<Record<string, string>>(withCrisisDefaults({}));
    const [ebpCatalog, setEbpCatalog] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [aiDecision, setAiDecision] = useState<{ loading: boolean; text: string }>({ loading: false, text: "" });

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
                    const d = bipRes.data;
                    if (d && d.StudentCode) {
                        if (d.ConsequenceStrategies && !d.ReinforcementStrategies) {
                            d.ReinforcementStrategies = d.ConsequenceStrategies;
                        }
                        setBip(prev => ({ ...prev, ...d }));
                        setEbp({
                            PreventionEBP: safeParseEBP(d.PreventionEBP),
                            TeachingEBP: safeParseEBP(d.TeachingEBP),
                            ConsequenceEBP: safeParseEBP(d.ConsequenceEBP),
                        });
                        setCrisisProtocol(safeParseCrisisProtocol(d.CrisisEBP));
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

    useEffect(() => {
        axios.get(`${apiUrl}/api/v1/ebp/catalog`).then(res => setEbpCatalog(res.data.strategies || [])).catch(() => {});
    }, [apiUrl]);

    const handleChange = (field: keyof BIPData, value: string) => {
        setBip(prev => ({ ...prev, [field]: value }));
    };

    // 11개 필드 + 구조화 EBP/위기절차를 한 번에 저장 — 두 편집기가 각자 저장 버튼을 갖던
    // 이전 구조(중복 화면의 흔적)를 없애고 저장 지점을 하나로 통일한다.
    const handleSave = async () => {
        if (!studentCode) return;
        setSaving(true);
        try {
            await axios.post(`${apiUrl}/api/v1/bip/students/${studentCode}/bip`, {
                ...bip,
                StudentCode: studentCode,
                UpdatedAt: new Date().toISOString().split('T')[0],
                Author: "Teacher",
                PreventionEBP: JSON.stringify(ebp.PreventionEBP),
                TeachingEBP: JSON.stringify(ebp.TeachingEBP),
                ConsequenceEBP: JSON.stringify(ebp.ConsequenceEBP),
                CrisisEBP: JSON.stringify(crisisProtocol),
            });
            alert("행동중재계획(BIP)이 저장되었습니다.");
        } catch {
            alert("저장 실패");
        } finally {
            setSaving(false);
        }
    };

    // AI BIP Full — comprehensive analysis. mode 토글로 간단(compact)/상세(detailed)를 선택한다.
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
                mode: aiMode,
            }, { timeout: 240000 });
            setAiResult(res.data.analysis || "분석 결과가 없습니다.");
        } catch (e: any) {
            setAiResult("⚠️ AI BIP 제안 요청에 실패했습니다. (" + (e?.response?.data?.detail || e?.message || "타임아웃") + ")");
        } finally {
            setAiLoading(false);
        }
    };

    // Append AI result to existing fields
    const handleAppendAIContent = () => {
        if (!aiResult) return;
        const parsed = parseBIPAIResult(aiResult);
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

    // 데이터기반 의사결정(DBDM) 제안 — 기간 데이터 + 현재 BIP + EBP 실행충실도 + 협의 기록을 종합
    const handleDecisionAI = async () => {
        if (!studentCode) return;
        setAiDecision({ loading: true, text: "" });
        try {
            const res = await axios.post(`${apiUrl}/api/v1/bip/students/${studentCode}/ai-decision-recommendation`, {
                start_date: startDate || undefined,
                end_date: endDate || undefined,
            }, { timeout: 240000 });
            setAiDecision({ loading: false, text: res.data.analysis || "분석 결과가 없습니다." });
        } catch (e: any) {
            setAiDecision({ loading: false, text: "⚠️ 요청 실패: " + (e?.response?.data?.detail || e?.message || "타임아웃") });
        }
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
            <AppShell currentPage="roster" title="📋 행동중재계획 (BIP)">
                <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: '2rem', animation: 'spin 2s linear infinite', marginBottom: '12px' }}>⏳</div>
                    <p style={{ fontWeight: 700 }}>BIP 데이터를 불러오고 있습니다...</p>
                </div>
            </AppShell>
        </AuthCheck>
    );

    return (
        <AuthCheck>
            <AppShell
                currentPage="roster"
                title={`📋 행동중재계획 (BIP) — ${studentName}`}
                subtitle={`학번/코드: ${studentCode} · 작성일: ${bip.UpdatedAt || new Date().toISOString().split('T')[0]}`}
                headerActions={
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={handleExcelDownload} className="btn btn-secondary">
                            📥 엑셀 다운로드
                        </button>
                        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                            {saving ? "저장 중..." : "💾 저장하기"}
                        </button>
                        <button onClick={() => router.push(`/student/${encodeURIComponent(studentName)}`)} className="btn btn-secondary">
                            ← 학생 상세
                        </button>
                    </div>
                }
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {/* EBP 구조화 선택 & 위기행동지원절차 */}
                    <div>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                            📚 EBP 구조화 선택 &amp; 위기행동지원절차
                        </h3>
                        <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: '#64748b' }}>
                            39 경기 Be-Able EBP 카탈로그에서 선택하거나 직접 입력할 수 있습니다. 각 전략 옆 충실도 체크포인트에 실제 실행 여부를 기록하면 아래 AI 제안의 근거가 됩니다. 여기서의 변경사항은 상단 &ldquo;💾 저장하기&rdquo;를 눌러야 저장됩니다.
                        </p>
                        <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignItems: 'start' }}>
                            {(["PreventionEBP", "TeachingEBP", "ConsequenceEBP"] as const).map(fieldKey => (
                                <EBPColumnEditor
                                    key={fieldKey}
                                    fieldKey={fieldKey}
                                    items={ebp[fieldKey]}
                                    onChange={(items) => setEbp(prev => ({ ...prev, [fieldKey]: items }))}
                                    catalog={ebpCatalog}
                                />
                            ))}
                            <CrisisProtocolEditor value={crisisProtocol} onChange={setCrisisProtocol} />
                        </div>
                    </div>

                    {/* 표적행동(문제행동/목표행동) 데이터 관리 */}
                    {studentCode && <TargetBehaviorSection studentCode={studentCode} apiUrl={apiUrl} />}

                    {/* 개별화교육지원팀 협의 (누적, 학생별) */}
                    <MeetingNotesSection apiUrl={apiUrl} meetingType="fba_bip_team" studentCode={studentCode} title="개별화교육지원팀 협의 기록" />

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
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <div style={{ display: 'flex', border: '1px solid #ddd5f5', borderRadius: '8px', overflow: 'hidden' }}>
                                    {(["compact", "detailed"] as const).map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setAiMode(m)}
                                            style={{
                                                padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                                                background: aiMode === m ? '#7c3aed' : '#fff',
                                                color: aiMode === m ? '#fff' : '#7c3aed',
                                            }}
                                        >
                                            {m === "compact" ? "짧게" : "상세"}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={handleAIBIPFull}
                                    disabled={aiLoading}
                                    style={{
                                        padding: '8px 20px',
                                        background: aiLoading ? '#a78bfa' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                                        color: 'white',
                                        border: '2.5px solid #2563eb',
                                        borderRadius: '8px',
                                        cursor: aiLoading ? 'wait' : 'pointer',
                                        fontSize: '0.85rem', fontWeight: 700,
                                        boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {aiLoading ? "⏳ AI 분석 중..." : "🤖 AI BIP 제안 받기"}
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
                                     💡 3건 이상의 위기행동 자료가 있으면 아래 데이터를 교차분석하여 &ldquo;짧게&rdquo;는 핵심만, &ldquo;상세&rdquo;는 1~11번 전체 양식의 자세한 BIP 제안을 만듭니다:
                                     <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                                         <li>추정기능·행동유형·강도·횟수·시간대·장소·안전사건</li>
                                         <li>특기사항(기타)의 서술식 기록에서 확인되는 맥락 단서</li>
                                         <li>9~11번 입력 내용(약물·강화제·기타 고려사항)</li>
                                     </ul>
                                     <p style={{ margin: '8px 0 0 0', fontStyle: 'italic' }}>
                                         ※ 없는 선행사건·후속결과는 만들지 않으며, &quot;생성 내용 추가&quot;를 누르면 기존 내용을 지우지 않고 1~11번 칸에 추가합니다.
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
                                     fontSize: '0.88rem',
                                     lineHeight: '1.7', color: '#334155',
                                     backgroundColor: '#faf9ff', padding: '16px', borderRadius: '8px',
                                     border: '1px solid #ede9fe', maxHeight: '600px', overflowY: 'auto'
                                 }}>
                                     <ReadableAIResult text={aiResult} />
                                 </div>
                            )}
                        </div>
                    </div>

                    {/* 종합 데이터기반 의사결정 제안 (DBDM) */}
                    <div style={{ background: 'linear-gradient(135deg, #eff6ff, #fff)', borderRadius: '14px', border: '1px solid #bfdbfe', padding: '16px 18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e3a8a' }}>📊 데이터기반 의사결정을 위한 제안 (DBDM)</div>
                            <button
                                onClick={handleDecisionAI}
                                disabled={aiDecision.loading}
                                style={{
                                    padding: '8px 18px', background: aiDecision.loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                    color: 'white', border: '2px solid #1e3a8a', borderRadius: '8px',
                                    cursor: aiDecision.loading ? 'wait' : 'pointer', fontSize: '0.82rem', fontWeight: 700
                                }}
                            >
                                {aiDecision.loading ? "⏳ 종합 분석 중..." : "🤖 데이터기반 의사결정 제안 받기"}
                            </button>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: aiDecision.text ? 10 : 0 }}>
                            현재 설정 기간 데이터 + 현재 BIP + 위 EBP 실행충실도 + 개별화교육지원팀 협의 기록을 종합 분석합니다. (실행 전 상단 &ldquo;💾 저장하기&rdquo;로 EBP·협의 내용을 먼저 저장하세요)
                        </div>
                        {aiDecision.loading && <div style={{ textAlign: 'center', padding: '20px', color: '#2563eb', fontWeight: 700, fontSize: '0.82rem' }}>⏳ 종합 분석 중입니다...</div>}
                        {aiDecision.text && !aiDecision.loading && (
                            <div style={{ fontSize: '0.85rem', lineHeight: 1.75, color: '#1e293b', background: '#fff', padding: '14px', borderRadius: '8px', border: '1px solid #dbeafe' }}>
                                <ReadableAIResult text={aiDecision.text} />
                            </div>
                        )}
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
                                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'
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
                                    value={bip[field.key] as string}
                                    onChange={(v) => handleChange(field.key, v)}
                                    placeholder={field.placeholder}
                                />
                            </div>
                        </div>
                    ))}

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
            </AppShell>
        </AuthCheck>
    );
}
