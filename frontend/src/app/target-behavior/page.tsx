"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
    ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea
} from "recharts";
import { API_BASE_URL } from "../constants";
import AppShell from "../components/AppShell";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import { useSheetLiveSync } from "../hooks/useSheetLiveSync";
import ReadableAIResult from "../components/ReadableAIResult";
import { maskName } from "../utils";

const MEASUREMENT_TYPES = ["빈도", "지속시간", "강도", "퍼센트"];

// 담임교사가 자유롭게 정의한 문제행동/목표행동을 BIP 적용기간 동안 추적하는 전용 탭.
// 예전에는 BIP 페이지 안에 섹션으로 끼어 있었으나, FBA/BIP와는 별개의 "일상 데이터 관리"
// 작업 흐름이라 독립된 탭으로 분리했다. 백엔드(target_behavior.py)는 그대로 재사용한다.
export default function TargetBehaviorPage() {
    const { user, isAdmin } = useAuth();
    const apiUrl = API_BASE_URL;

    const [students, setStudents] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [searchKeyword, setSearchKeyword] = useState("");
    const [requestedStudentCode, setRequestedStudentCode] = useState("");

    // BIP 페이지의 "문제행동기록 데이터 보기" 버튼 등에서 ?student=코드 로 들어오면
    // 해당 학생을 바로 선택한다. useSearchParams()는 Suspense 경계를 요구해 정적 빌드가
    // 실패하므로 /logs, /behavior와 동일하게 window.location.search를 직접 읽는다.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const student = params.get("student");
        if (student) setRequestedStudentCode(student);
    }, []);

    const fetchStudents = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/v1/tier/status`);
            let data = res.data.students || res.data || [];
            if (!Array.isArray(data)) data = [];
            const unique = data.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => t.학생코드 === v.학생코드) === i);
            setStudents(unique);
            setSelectedStudent((current: any) => unique.find((s: any) => s.학생코드 === (current?.학생코드 || requestedStudentCode)) || unique[0] || null);
        } catch (err) {
            console.error("Failed to load students", err);
        }
    }, [requestedStudentCode]);

    useEffect(() => { void fetchStudents(); }, [fetchStudents, user?.id]);
    useSheetLiveSync(fetchStudents);

    const filteredStudents = students.filter((s) => {
        const name = s.학생이름 || s.이름 || s.학생명 || "";
        const code = s.학생코드 || "";
        return name.includes(searchKeyword) || String(code).includes(searchKeyword);
    });

    const studentCode = selectedStudent?.학생코드 || "";

    const [behaviors, setBehaviors] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");
    const [chart, setChart] = useState<any>(null);
    const [showNewForm, setShowNewForm] = useState(false);
    const [newForm, setNewForm] = useState({ type: "문제행동", definition: "", measurement_type: "빈도", baseline: "", bip_start_date: "", bip_end_date: "" });
    const [dataForm, setDataForm] = useState({ date: new Date().toISOString().split("T")[0], value: "", memo: "" });
    const [fidelityForm, setFidelityForm] = useState({ date: new Date().toISOString().split("T")[0], implemented: "O", memo: "" });
    const [decision, setDecision] = useState<{ loading: boolean; text: string }>({ loading: false, text: "" });
    const [editingDataUuid, setEditingDataUuid] = useState<string>("");
    const [editDataDraft, setEditDataDraft] = useState({ date: "", value: "", memo: "" });
    const [editingFidelityUuid, setEditingFidelityUuid] = useState<string>("");
    const [editFidelityDraft, setEditFidelityDraft] = useState({ date: "", implemented: "O", memo: "" });

    const fetchBehaviors = useCallback(async () => {
        if (!studentCode) { setBehaviors([]); setSelectedId(""); return; }
        try {
            const res = await axios.get(`${apiUrl}/api/v1/target-behaviors/students/${encodeURIComponent(studentCode)}`);
            const list = res.data.behaviors || [];
            setBehaviors(list);
            setSelectedId((current) => list.find((b: any) => b.BehaviorID === current)?.BehaviorID || list[0]?.BehaviorID || "");
        } catch (err) {
            console.error(err);
        }
    }, [apiUrl, studentCode]);

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

    const startEditData = (d: any) => {
        setEditingDataUuid(d.UUID);
        setEditDataDraft({ date: d.Date || "", value: String(d.Value ?? ""), memo: d.Memo || "" });
    };

    const saveEditData = async () => {
        try {
            await axios.patch(`${apiUrl}/api/v1/target-behaviors/data/${encodeURIComponent(editingDataUuid)}`, { student_code: studentCode, ...editDataDraft });
            setEditingDataUuid("");
            fetchChart();
        } catch (err: any) {
            alert("수정 실패: " + (err.response?.data?.detail || err.message));
        }
    };

    const deleteDataPoint = async (uuid: string) => {
        if (!uuid || !confirm("이 데이터 기록을 삭제하시겠습니까?")) return;
        try {
            await axios.delete(`${apiUrl}/api/v1/target-behaviors/data/${encodeURIComponent(uuid)}`, { params: { student_code: studentCode } });
            fetchChart();
        } catch (err: any) {
            alert("삭제 실패: " + (err.response?.data?.detail || err.message));
        }
    };

    const startEditFidelity = (f: any) => {
        setEditingFidelityUuid(f.UUID);
        setEditFidelityDraft({ date: f.Date || "", implemented: String(f.Implemented || "O").toUpperCase() === "O" ? "O" : "X", memo: f.Memo || "" });
    };

    const saveEditFidelity = async () => {
        try {
            await axios.patch(`${apiUrl}/api/v1/target-behaviors/fidelity/${encodeURIComponent(editingFidelityUuid)}`, { student_code: studentCode, ...editFidelityDraft });
            setEditingFidelityUuid("");
            fetchChart();
        } catch (err: any) {
            alert("수정 실패: " + (err.response?.data?.detail || err.message));
        }
    };

    const deleteFidelityPoint = async (uuid: string) => {
        if (!uuid || !confirm("이 실행기록을 삭제하시겠습니까?")) return;
        try {
            await axios.delete(`${apiUrl}/api/v1/target-behaviors/fidelity/${encodeURIComponent(uuid)}`, { params: { student_code: studentCode } });
            fetchChart();
        } catch (err: any) {
            alert("삭제 실패: " + (err.response?.data?.detail || err.message));
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

    // 대시보드 요약 카드
    const activeCount = behaviors.filter(b => b.Status !== '종료').length;
    const problemCount = behaviors.filter(b => b.Type === '문제행동').length;
    const goalCount = behaviors.filter(b => b.Type === '목표행동').length;
    const fidelityRate = chart?.fidelity_points?.length
        ? Math.round((chart.fidelity_points.filter((f: any) => String(f.Implemented).toUpperCase() === 'O').length / chart.fidelity_points.length) * 100)
        : null;

    return (
        <AuthCheck>
            <AppShell
                currentPage="target-behavior"
                title="📉 문제행동기록"
                subtitle="담임교사가 정의한 문제행동·목표행동을 BIP 적용기간 동안 추적 · 위기행동과 겹쳐 보기"
            >
                <div className="behavior-outer-grid" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "20px", alignItems: "start" }}>
                    <div className="card" style={{ padding: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <div style={{ fontWeight: 800, fontSize: "0.92rem" }}>👥 학생 목록 ({filteredStudents.length}명)</div>
                            <span className="badge badge-neutral" style={{ fontSize: "0.7rem" }}>{isAdmin() ? "전교생" : (user?.class_id || "학급")}</span>
                        </div>
                        <input
                            type="text" placeholder="이름 또는 학번 검색..." value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-subtle)", fontSize: "0.82rem", marginBottom: "12px", background: "var(--bg-subtle)" }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
                            {filteredStudents.map((s) => {
                                const isSelected = selectedStudent?.학생코드 === s.학생코드;
                                const name = s.학생이름 || s.이름 || s.학생명;
                                return (
                                    <button
                                        key={s.학생코드}
                                        onClick={() => setSelectedStudent(s)}
                                        style={{
                                            display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px",
                                            borderRadius: "8px", border: isSelected ? "1.5px solid var(--primary-blue)" : "1px solid var(--border-subtle)",
                                            background: isSelected ? "var(--primary-light)" : "var(--bg-surface)", cursor: "pointer", textAlign: "left",
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: isSelected ? 800 : 600, fontSize: "0.85rem" }}>{maskName(name)}</div>
                                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>학번 {s.학생코드}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        {!selectedStudent ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">👈</div>
                                <div className="empty-state-title">학생을 선택해 주세요</div>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                                {/* 대시보드 카드 */}
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }} className="grid-responsive">
                                    {[
                                        { label: "진행중 표적행동", value: `${activeCount}건`, color: "#0f172a" },
                                        { label: "문제행동", value: `${problemCount}건`, color: "#b91c1c" },
                                        { label: "목표행동", value: `${goalCount}건`, color: "#166534" },
                                        { label: "최근 실행충실도", value: fidelityRate !== null ? `${fidelityRate}%` : "-", color: "#7c3aed" },
                                    ].map((c, i) => (
                                        <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
                                            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{c.label}</div>
                                            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: c.color, marginTop: 4 }}>{c.value}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "18px" }}>
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
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

                                            <div style={{ height: 280 }}>
                                                <ResponsiveContainer>
                                                    <ComposedChart data={mergedChartData}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                                                        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} />
                                                        <Tooltip />
                                                        <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                                                        {selected.BIPStartDate && selected.BIPEndDate && (
                                                            <ReferenceArea
                                                                yAxisId="left"
                                                                x1={selected.BIPStartDate} x2={selected.BIPEndDate}
                                                                fill="#7c3aed" fillOpacity={0.08}
                                                                label={{ value: "중재기간", position: "insideTopLeft", fontSize: 10, fill: "#7c3aed" }}
                                                            />
                                                        )}
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

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="responsive-grid-2">
                                                <div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 6 }}>📋 데이터 기록 ({(chart?.data_points || []).length}건)</div>
                                                    <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                            <thead>
                                                                <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>날짜</th>
                                                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>측정값</th>
                                                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>메모</th>
                                                                    <th style={{ padding: '6px 8px' }}></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {[...(chart?.data_points || [])].reverse().map((d: any, i: number) => (
                                                                    <tr key={d.UUID || i} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                                        {editingDataUuid === d.UUID ? (
                                                                            <>
                                                                                <td style={{ padding: '4px 6px' }}><input type="date" value={editDataDraft.date} onChange={e => setEditDataDraft({ ...editDataDraft, date: e.target.value })} style={{ width: '100%', fontSize: '0.74rem', padding: '3px' }} /></td>
                                                                                <td style={{ padding: '4px 6px' }}><input type="text" value={editDataDraft.value} onChange={e => setEditDataDraft({ ...editDataDraft, value: e.target.value })} style={{ width: '100%', fontSize: '0.74rem', padding: '3px' }} /></td>
                                                                                <td style={{ padding: '4px 6px' }}><input type="text" value={editDataDraft.memo} onChange={e => setEditDataDraft({ ...editDataDraft, memo: e.target.value })} style={{ width: '100%', fontSize: '0.74rem', padding: '3px' }} /></td>
                                                                                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                                                                    <button onClick={saveEditData} style={{ border: 'none', background: 'none', cursor: 'pointer' }} title="저장">💾</button>
                                                                                    <button onClick={() => setEditingDataUuid("")} style={{ border: 'none', background: 'none', cursor: 'pointer' }} title="취소">✕</button>
                                                                                </td>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <td style={{ padding: '4px 8px' }}>{d.Date}</td>
                                                                                <td style={{ padding: '4px 8px' }}>{d.Value}</td>
                                                                                <td style={{ padding: '4px 8px', color: '#64748b' }}>{d.Memo}</td>
                                                                                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                                                                    <button onClick={() => startEditData(d)} disabled={!d.UUID} title={d.UUID ? "편집" : "옛 기록 (편집 불가)"} style={{ border: 'none', background: 'none', cursor: d.UUID ? 'pointer' : 'default', opacity: d.UUID ? 1 : 0.3 }}>✏️</button>
                                                                                    <button onClick={() => deleteDataPoint(d.UUID)} disabled={!d.UUID} title={d.UUID ? "삭제" : "옛 기록 (삭제 불가)"} style={{ border: 'none', background: 'none', cursor: d.UUID ? 'pointer' : 'default', opacity: d.UUID ? 1 : 0.3 }}>🗑️</button>
                                                                                </td>
                                                                            </>
                                                                        )}
                                                                    </tr>
                                                                ))}
                                                                {(chart?.data_points || []).length === 0 && (
                                                                    <tr><td colSpan={4} style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>기록 없음</td></tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 6 }}>✅ 실행기록 ({(chart?.fidelity_points || []).length}건)</div>
                                                    <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                            <thead>
                                                                <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>날짜</th>
                                                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>실행</th>
                                                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>메모</th>
                                                                    <th style={{ padding: '6px 8px' }}></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {[...(chart?.fidelity_points || [])].reverse().map((f: any, i: number) => (
                                                                    <tr key={f.UUID || i} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                                        {editingFidelityUuid === f.UUID ? (
                                                                            <>
                                                                                <td style={{ padding: '4px 6px' }}><input type="date" value={editFidelityDraft.date} onChange={e => setEditFidelityDraft({ ...editFidelityDraft, date: e.target.value })} style={{ width: '100%', fontSize: '0.74rem', padding: '3px' }} /></td>
                                                                                <td style={{ padding: '4px 6px' }}>
                                                                                    <select value={editFidelityDraft.implemented} onChange={e => setEditFidelityDraft({ ...editFidelityDraft, implemented: e.target.value })} style={{ width: '100%', fontSize: '0.74rem', padding: '3px' }}>
                                                                                        <option value="O">O</option>
                                                                                        <option value="X">X</option>
                                                                                    </select>
                                                                                </td>
                                                                                <td style={{ padding: '4px 6px' }}><input type="text" value={editFidelityDraft.memo} onChange={e => setEditFidelityDraft({ ...editFidelityDraft, memo: e.target.value })} style={{ width: '100%', fontSize: '0.74rem', padding: '3px' }} /></td>
                                                                                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                                                                    <button onClick={saveEditFidelity} style={{ border: 'none', background: 'none', cursor: 'pointer' }} title="저장">💾</button>
                                                                                    <button onClick={() => setEditingFidelityUuid("")} style={{ border: 'none', background: 'none', cursor: 'pointer' }} title="취소">✕</button>
                                                                                </td>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <td style={{ padding: '4px 8px' }}>{f.Date}</td>
                                                                                <td style={{ padding: '4px 8px', fontWeight: 700, color: String(f.Implemented).toUpperCase() === 'O' ? '#166534' : '#b91c1c' }}>{f.Implemented}</td>
                                                                                <td style={{ padding: '4px 8px', color: '#64748b' }}>{f.Memo}</td>
                                                                                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                                                                    <button onClick={() => startEditFidelity(f)} disabled={!f.UUID} title={f.UUID ? "편집" : "옛 기록 (편집 불가)"} style={{ border: 'none', background: 'none', cursor: f.UUID ? 'pointer' : 'default', opacity: f.UUID ? 1 : 0.3 }}>✏️</button>
                                                                                    <button onClick={() => deleteFidelityPoint(f.UUID)} disabled={!f.UUID} title={f.UUID ? "삭제" : "옛 기록 (삭제 불가)"} style={{ border: 'none', background: 'none', cursor: f.UUID ? 'pointer' : 'default', opacity: f.UUID ? 1 : 0.3 }}>🗑️</button>
                                                                                </td>
                                                                            </>
                                                                        )}
                                                                    </tr>
                                                                ))}
                                                                {(chart?.fidelity_points || []).length === 0 && (
                                                                    <tr><td colSpan={4} style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>기록 없음</td></tr>
                                                                )}
                                                            </tbody>
                                                        </table>
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
                            </div>
                        )}
                    </div>
                </div>
            </AppShell>
        </AuthCheck>
    );
}
