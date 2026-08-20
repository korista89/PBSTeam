"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import styles from "../page.module.css";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { maskName } from "../utils";

interface StudentStatus {
    번호: number;
    학급: string;
    학생코드: string;
    학생이름: string;
    재학여부: string;
    'BeAble코드': string;
    '그림말인증': number | string;
    'Tier1': string;
    'Tier2(CICO)': string;
    'Tier2(SST)': string;
    'Tier3': string;
    'Tier3+': string;
    변경일: string;
    메모: string;
    row_index?: number;
}

export default function TierStatusPage() {
    const { isAdmin } = useAuth();
    const router = useRouter();
    const [students, setStudents] = useState<StudentStatus[]>([]);
    const [enrolledCount, setEnrolledCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [courseFilter, setCourseFilter] = useState("all");
    const [saving, setSaving] = useState(false);

    // Editing states
    const [editingCode, setEditingCode] = useState<string | null>(null);
    const [editMemo, setEditMemo] = useState("");
    const [editEnrolled, setEditEnrolled] = useState("");
    const [editBeAble, setEditBeAble] = useState("");
    const [editName, setEditName] = useState("");
    const [editTiers, setEditTiers] = useState({
        tier1: "O",
        tier2_cico: "X",
        tier2_sst: "X",
        tier3: "X",
        tier3_plus: "X"
    });

    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            setErrorMsg(null);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const response = await axios.get(`${apiUrl}/api/v1/tier/status`);

            const fetchedStudents = response.data.students || response.data || [];

            if (fetchedStudents.length === 0) {
                setStudents([]);
                setEnrolledCount(0);
                setErrorMsg("DATA_UNAVAILABLE: 등록된 학생 지원 단계 데이터가 없습니다.");
            } else {
                setStudents(fetchedStudents);
                setEnrolledCount(response.data.enrolled_count || fetchedStudents.filter((s: StudentStatus) => s.재학여부 === "O").length);
            }
        } catch (error) {
            console.error("Failed to fetch tier status:", error);
            setStudents([]);
            setEnrolledCount(0);
            setErrorMsg("DATA_UNAVAILABLE: 학생 지원 단계(TierStatus) 데이터를 불러올 수 없습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (student: StudentStatus) => {
        setEditingCode(student.학생코드);
        setEditName(student.학생이름 || student.학생코드);
        setEditMemo(student.메모 || "");
        setEditEnrolled(student.재학여부);
        setEditBeAble(student['BeAble코드'] || "");
        setEditTiers({
            tier1: student['Tier1'] || "O",
            tier2_cico: student['Tier2(CICO)'] || "X",
            tier2_sst: student['Tier2(SST)'] || "X",
            tier3: student['Tier3'] || "X",
            tier3_plus: student['Tier3+'] || "X"
        });
    };

    // ===== Unified Save: single API call =====
    const handleSave = async () => {
        if (!editingCode) return;

        setSaving(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

            await axios.put(`${apiUrl}/api/v1/tier/status/unified`, {
                code: editingCode,
                tier1: editTiers.tier1,
                tier2_cico: editTiers.tier2_cico,
                tier2_sst: editTiers.tier2_sst,
                tier3: editTiers.tier3,
                tier3_plus: editTiers.tier3_plus,
                memo: editMemo,
                enrolled: editEnrolled,
                beable_code: editBeAble,
                student_name: editName
            });

            setEditingCode(null);
            fetchStatus();
        } catch (error) {
            console.error("Failed to save:", error);
            alert("저장에 실패했습니다.");
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setEditingCode(null);
    };

    const getCourse = (code: string) => {
        if (!code) return "";
        const first = code[0];
        switch (first) {
            case "1": return "유치원";
            case "2": return "초등";
            case "3": return "중학교";
            case "4": return "고등";
            case "5": return "전공과";
            case "6": return "예비";
            default: return "";
        }
    };


    // Filter students
    // Note: /api/v1/tier/status already scopes `students` to the caller's own class
    // for non-admins server-side (get_student_class_code / normalize_class_identifier),
    // so no client-side class filter is needed here. A previous version compared the
    // numeric 학생코드 against class_id via .startsWith(), which could never match -
    // it emptied an already-correctly-scoped list for every teacher.
    const filteredStudents = students.filter(s => {
        // Inclusive filtering logic
        if (filter !== "all") {
            if (filter === "Tier1") {
                // Tier 1 is "Pure" Tier 1 (no other tiers)
                if (!(s['Tier1'] === "O" && s['Tier2(CICO)'] === "X" && s['Tier2(SST)'] === "X" && s['Tier3'] === "X" && s['Tier3+'] === "X")) return false;
            } else if (filter === "Tier2(CICO)") {
                if (s['Tier2(CICO)'] !== "O") return false;
            } else if (filter === "Tier2(SST)") {
                if (s['Tier2(SST)'] !== "O") return false;
            } else if (filter === "Tier3") {
                if (s['Tier3'] !== "O") return false;
            } else if (filter === "Tier3+") {
                if (s['Tier3+'] !== "O") return false;
            }
        }

        if (courseFilter !== "all" && getCourse(s.학생코드) !== courseFilter) return false;
        return true;
    });

    if (loading) {
        return (
            <AuthCheck>
                <AppShell currentPage="tier-status" title="📋 전교생 Tier 지원 단계 현황">
                    <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '12px', animation: 'spin 2s linear infinite' }}>⏳</div>
                        <p style={{ fontWeight: 700 }}>학생 지원 단계 데이터를 불러오고 있습니다...</p>
                    </div>
                </AppShell>
            </AuthCheck>
        );
    }

    return (
        <AuthCheck>
            <AppShell
                currentPage="tier-status"
                title="📋 전교생 Tier 지원 단계 현황"
                subtitle={`전교생 ${enrolledCount}명 (재학생 기준) · 전체 ${students.length}명`}
                headerActions={
                    <button onClick={fetchStatus} className="btn btn-secondary">
                        🔄 새로고침
                    </button>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {!isAdmin() && (
                        <div style={{ padding: '10px 14px', backgroundColor: 'var(--tier2-bg)', borderRadius: '8px', border: '1px solid #fde68a', color: 'var(--tier2-text)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🔒</span> 담임교사는 배정 학급 학생의 데이터 조회가 가능하며, Tier 수정은 관리자 권한으로 수행됩니다.
                        </div>
                    )}

                    {errorMsg && (
                        <div className="card" style={{ padding: '16px 20px', background: 'var(--tier3-bg)', borderColor: '#fca5a5', color: 'var(--tier3-text)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>⚠️ {errorMsg}</span>
                            <button onClick={fetchStatus} className="btn btn-danger">다시 시도</button>
                        </div>
                    )}

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="form-select">
                            <option value="all">전체 Tier</option>
                            <option value="Tier1">Tier 1</option>
                            <option value="Tier2(CICO)">Tier2(CICO)</option>
                            <option value="Tier2(SST)">Tier2(SST)</option>
                            <option value="Tier3">Tier 3</option>
                            <option value="Tier3+">Tier 3+</option>
                        </select>
                        <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="form-select">
                            <option value="all">전체 과정</option>
                            <option value="유치원">유치원</option>
                            <option value="초등">초등</option>
                            <option value="중학교">중학교</option>
                            <option value="고등">고등</option>
                            <option value="전공과">전공과</option>
                        </select>
                        <span className="badge badge-neutral">표시: {filteredStudents.length}명</span>
                    </div>

                    {/* Table */}
                    <div className="table-container">
                        <table className="dense-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px', textAlign: 'center' }}>번호</th>
                                    <th style={{ width: '100px' }}>학급</th>
                                    <th style={{ width: '70px', textAlign: 'center' }}>학생코드</th>
                                    <th style={{ width: '90px', textAlign: 'center' }}>학생이름</th>
                                    <th style={{ width: '50px', textAlign: 'center' }}>재학</th>
                                    <th style={{ width: '80px', textAlign: 'center' }}>BeAble</th>
                                    <th style={{ width: '70px', textAlign: 'center' }}>그림말인증</th>
                                    <th style={{ width: '55px', textAlign: 'center', background: 'var(--tier1-bg)', color: 'var(--tier1-text)' }}>Tier1</th>
                                    <th style={{ width: '85px', textAlign: 'center', background: 'var(--tier2-bg)', color: 'var(--tier2-text)' }}>Tier2(CICO)</th>
                                    <th style={{ width: '85px', textAlign: 'center', background: 'var(--primary-light)', color: 'var(--primary-blue)' }}>Tier2(SST)</th>
                                    <th style={{ width: '55px', textAlign: 'center', background: 'var(--tier3-bg)', color: 'var(--tier3-text)' }}>Tier3</th>
                                    <th style={{ width: '55px', textAlign: 'center', background: 'var(--tier3-plus-bg)', color: 'var(--tier3-plus-text)' }}>Tier3+</th>
                                    <th style={{ width: '80px', textAlign: 'center' }}>변경일</th>
                                    <th style={{ width: '140px' }}>메모</th>
                                    <th style={{ width: '60px', textAlign: 'center' }}>상세분석</th>
                                    <th style={{ width: '50px', textAlign: 'center' }}>BIP</th>
                                    {isAdmin() && <th style={{ width: '80px', textAlign: 'center' }}>관리</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map((s) => {
                                    const isEditing = editingCode === s.학생코드;
                                    const isInactive = s.재학여부 === "X";

                                    return (
                                        <tr key={s.학생코드} style={{ opacity: isInactive ? 0.5 : 1 }}>
                                            <td style={{ textAlign: 'center' }}>{s.번호}</td>
                                            <td>{s.학급}</td>
                                            <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{s.학생코드}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="form-input" style={{ width: '70px', padding: '3px 6px' }} placeholder="이름" />
                                                ) : (
                                                    <span style={{ fontWeight: 700 }}>{maskName(s.학생이름) || s.학생코드}</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <select value={editEnrolled} onChange={(e) => setEditEnrolled(e.target.value)} className="form-select" style={{ padding: '3px 4px', width: '50px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span className={`badge ${s.재학여부 === "O" ? "badge-tier1" : "badge-neutral"}`}>{s.재학여부}</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <input type="text" value={editBeAble} onChange={(e) => setEditBeAble(e.target.value)} className="form-input" style={{ width: '70px', padding: '3px 6px' }} placeholder="코드" />
                                                ) : (
                                                    s['BeAble코드'] || '-'
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary-navy)' }}>
                                                {s['그림말인증'] !== undefined ? s['그림말인증'] : 0} / 13
                                            </td>
                                            {/* 5 Tier columns with O/X */}
                                            <td style={{ textAlign: 'center', background: 'var(--tier1-bg)' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier1} onChange={(e) => setEditTiers({ ...editTiers, tier1: e.target.value })} className="form-select" style={{ padding: '3px 4px', width: '50px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span className={`badge ${s['Tier1'] === "O" ? "badge-tier1" : "badge-neutral"}`}>{s['Tier1']}</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center', background: 'var(--tier2-bg)' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier2_cico} onChange={(e) => setEditTiers({ ...editTiers, tier2_cico: e.target.value })} className="form-select" style={{ padding: '3px 4px', width: '50px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span className={`badge ${s['Tier2(CICO)'] === "O" ? "badge-tier2" : "badge-neutral"}`}>{s['Tier2(CICO)']}</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center', background: 'var(--primary-light)' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier2_sst} onChange={(e) => setEditTiers({ ...editTiers, tier2_sst: e.target.value })} className="form-select" style={{ padding: '3px 4px', width: '50px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span className={`badge ${s['Tier2(SST)'] === "O" ? "badge-info" : "badge-neutral"}`}>{s['Tier2(SST)']}</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center', background: 'var(--tier3-bg)' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier3} onChange={(e) => setEditTiers({ ...editTiers, tier3: e.target.value })} className="form-select" style={{ padding: '3px 4px', width: '50px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span className={`badge ${s['Tier3'] === "O" ? "badge-tier3" : "badge-neutral"}`}>{s['Tier3']}</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center', background: 'var(--tier3-plus-bg)' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier3_plus} onChange={(e) => setEditTiers({ ...editTiers, tier3_plus: e.target.value })} className="form-select" style={{ padding: '3px 4px', width: '50px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span className={`badge ${s['Tier3+'] === "O" ? "badge-tier3-plus" : "badge-neutral"}`}>{s['Tier3+']}</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.변경일 || '-'}</td>
                                            <td style={{ fontSize: '0.8rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {isEditing ? (
                                                    <input type="text" value={editMemo} onChange={(e) => setEditMemo(e.target.value)} className="form-input" style={{ width: '100%', padding: '3px 6px' }} placeholder="메모" />
                                                ) : (
                                                    s.메모 || '-'
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button onClick={() => router.push(`/student/${encodeURIComponent(s.학생코드)}`)} className="btn btn-secondary" style={{ padding: '4px 8px' }}>📊</button>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button onClick={() => router.push(`/student/${encodeURIComponent(s.학생코드)}/bip`)} className="btn btn-secondary" style={{ padding: '4px 8px' }}>📋</button>
                                            </td>
                                            {isAdmin() && (
                                                <td style={{ textAlign: 'center' }}>
                                                    {isEditing ? (
                                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                            <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ padding: '3px 8px', fontSize: '0.72rem' }}>
                                                                {saving ? '...' : '저장'}
                                                            </button>
                                                            <button onClick={handleCancel} className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '0.72rem' }}>
                                                                취소
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => handleEdit(s)} className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '0.72rem' }}>
                                                            편집
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </AppShell>
        </AuthCheck>
    );
}
