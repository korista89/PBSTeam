"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import styles from "../page.module.css";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import GlobalNav from "../components/GlobalNav";
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
    const { user, isAdmin } = useAuth();
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
    const filteredStudents = students.filter(s => {
        // Teacher class-filtering
        if (!isAdmin()) {
            const userClassId = user?.class_id || "";
            if (userClassId && !String(s.학생코드).startsWith(String(userClassId))) {
                 return false;
            }
        }
        
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

    // Count by tier (enrolled only)
    const enrolledStudents = students.filter(s => s.재학여부 === "O");
    const tierCounts = {
        tier1: enrolledStudents.filter(s => s['Tier1'] === "O" && s['Tier2(CICO)'] === "X" && s['Tier2(SST)'] === "X" && s['Tier3'] === "X" && s['Tier3+'] === "X").length,
        tier2_cico: enrolledStudents.filter(s => s['Tier2(CICO)'] === "O").length,
        tier2_sst: enrolledStudents.filter(s => s['Tier2(SST)'] === "O").length,
        tier3: enrolledStudents.filter(s => s['Tier3'] === "O").length,
        tier3_plus: enrolledStudents.filter(s => s['Tier3+'] === "O").length,
    };

    // Tier2 CICO "pure" count (excluding Tier3/3+)
    const tier2CicoPure = enrolledStudents.filter(s =>
        s['Tier2(CICO)'] === "O" && s['Tier3'] === "X" && s['Tier3+'] === "X"
    ).length;

    // Percentage helper
    const pct = (count: number) => enrolledCount > 0 ? ((count / enrolledCount) * 100).toFixed(1) : "0";

    if (loading) {
        return (
            <AuthCheck>
                <div className={styles.container}>
                    <GlobalNav currentPage="tier-status" />
                    <div style={{ padding: '50px', textAlign: 'center' }}>데이터 로딩 중...</div>
                </div>
            </AuthCheck>
        );
    }

    return (
        <AuthCheck>
            <div className={styles.container}>
                <GlobalNav currentPage="tier-status" />

                <div style={{ padding: '20px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h2 style={{ margin: 0 }}>📊 Tier별 현황</h2>
                            <p style={{ color: '#666', margin: '5px 0 0 0' }}>
                                전교생 <strong>{enrolledCount}</strong>명 (재학생 기준) | 전체 {students.length}명
                            </p>
                        </div>
                        {!isAdmin() && (
                            <div style={{ padding: '8px 16px', backgroundColor: '#fef3c7', borderRadius: '8px', color: '#b45309', fontSize: '0.9rem' }}>
                                🔒 조회 전용 (관리자만 편집 가능)
                            </div>
                        )}
                    </div>

                    {/* Summary Cards - 5 Tier Types with % */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '20px' }}>
                        <div style={{ padding: '14px', backgroundColor: '#e8f5e9', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#2e7d32' }}>{tierCounts.tier1}</div>
                            <div style={{ color: '#2e7d32', fontSize: '0.85rem', fontWeight: '600' }}>Tier 1</div>
                            <div style={{ color: '#4caf50', fontSize: '0.75rem', marginTop: '2px' }}>{pct(tierCounts.tier1)}%</div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fff3e0', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#f57c00' }}>{tierCounts.tier2_cico}</div>
                            <div style={{ color: '#f57c00', fontSize: '0.85rem', fontWeight: '600' }}>Tier2(CICO)</div>
                            <div style={{ color: '#fb8c00', fontSize: '0.75rem', marginTop: '2px' }}>
                                {pct(tierCounts.tier2_cico)}%
                                <span style={{ color: '#999', fontSize: '0.7rem' }}> (순수 {tier2CicoPure}명)</span>
                            </div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#e3f2fd', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#1976d2' }}>{tierCounts.tier2_sst}</div>
                            <div style={{ color: '#1976d2', fontSize: '0.85rem', fontWeight: '600' }}>Tier2(SST)</div>
                            <div style={{ color: '#42a5f5', fontSize: '0.75rem', marginTop: '2px' }}>{pct(tierCounts.tier2_sst)}%</div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#ffebee', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#d32f2f' }}>{tierCounts.tier3}</div>
                            <div style={{ color: '#d32f2f', fontSize: '0.85rem', fontWeight: '600' }}>Tier 3</div>
                            <div style={{ color: '#ef5350', fontSize: '0.75rem', marginTop: '2px' }}>{pct(tierCounts.tier3)}%</div>
                        </div>
                        <div style={{ padding: '14px', background: 'linear-gradient(135deg, #4a148c, #7b1fa2)', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'white' }}>{tierCounts.tier3_plus}</div>
                            <div style={{ color: '#e1bee7', fontSize: '0.85rem', fontWeight: '600' }}>Tier 3+</div>
                            <div style={{ color: '#ce93d8', fontSize: '0.75rem', marginTop: '2px' }}>{pct(tierCounts.tier3_plus)}%</div>
                        </div>
                    </div>

                    {errorMsg && (
                        <div style={{ padding: '16px 20px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', color: '#991b1b', fontWeight: 600, marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>⚠️ {errorMsg}</span>
                            <button onClick={fetchStatus} style={{ padding: '6px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>다시 시도</button>
                        </div>
                    )}

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}>
                            <option value="all">전체 Tier</option>
                            <option value="Tier1">Tier 1</option>
                            <option value="Tier2(CICO)">Tier2(CICO)</option>
                            <option value="Tier2(SST)">Tier2(SST)</option>
                            <option value="Tier3">Tier 3</option>
                            <option value="Tier3+">Tier 3+</option>
                        </select>
                        <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}>
                            <option value="all">전체 과정</option>
                            <option value="유치원">유치원</option>
                            <option value="초등">초등</option>
                            <option value="중학교">중학교</option>
                            <option value="고등">고등</option>
                            <option value="전공과">전공과</option>
                        </select>
                        <span style={{ color: '#666', alignSelf: 'center' }}>표시: {filteredStudents.length}명</span>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f5f5f5' }}>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '40px' }}>번호</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '100px' }}>학급</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '70px' }}>학생코드</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '80px' }}>학생이름</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px' }}>재학</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '80px' }}>BeAble</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px' }}>그림말인증</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px', backgroundColor: '#e8f5e9' }}>Tier1</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '80px', backgroundColor: '#fff3e0' }}>Tier2(CICO)</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '80px', backgroundColor: '#e3f2fd' }}>Tier2(SST)</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px', backgroundColor: '#ffebee' }}>Tier3</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px', backgroundColor: '#4a148c', color: 'white' }}>Tier3+</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '80px' }}>변경일</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '120px' }}>메모</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '60px' }}>상세분석</th>
                                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px' }}>BIP</th>
                                    {isAdmin() && <th style={{ padding: '8px', border: '1px solid #ddd', width: '60px' }}>관리</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map((s) => {
                                    const isEditing = editingCode === s.학생코드;
                                    const isInactive = s.재학여부 === "X";

                                    return (
                                        <tr key={s.학생코드} style={{ backgroundColor: isInactive ? '#f9f9f9' : 'white', opacity: isInactive ? 0.5 : 1 }}>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>{s.번호}</td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', fontSize: '0.8rem' }}>{s.학급}</td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', fontFamily: 'monospace' }}>{s.학생코드}</td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '60px', padding: '2px' }} placeholder="이름" />
                                                ) : (
                                                    <span style={{ fontWeight: 'bold', color: '#333' }}>{maskName(s.학생이름) || s.학생코드}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <select value={editEnrolled} onChange={(e) => setEditEnrolled(e.target.value)} style={{ padding: '2px', width: '40px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span style={{ color: s.재학여부 === "O" ? '#2e7d32' : '#999', fontWeight: 'bold' }}>{s.재학여부}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <input type="text" value={editBeAble} onChange={(e) => setEditBeAble(e.target.value)} style={{ width: '60px', padding: '2px' }} placeholder="코드" />
                                                ) : (
                                                    s['BeAble코드'] || '-'
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold', color: '#1e3a8a' }}>
                                                {s['그림말인증'] !== undefined ? s['그림말인증'] : 0} / 13
                                            </td>
                                            {/* 5 Tier columns with O/X */}
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#f1f8e9' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier1} onChange={(e) => setEditTiers({ ...editTiers, tier1: e.target.value })} style={{ padding: '2px', width: '40px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span style={{ color: s['Tier1'] === "O" ? '#2e7d32' : '#ccc', fontWeight: 'bold' }}>{s['Tier1']}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#fff8e1' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier2_cico} onChange={(e) => setEditTiers({ ...editTiers, tier2_cico: e.target.value })} style={{ padding: '2px', width: '40px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span style={{ color: s['Tier2(CICO)'] === "O" ? '#f57c00' : '#ccc', fontWeight: 'bold' }}>{s['Tier2(CICO)']}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#e3f2fd' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier2_sst} onChange={(e) => setEditTiers({ ...editTiers, tier2_sst: e.target.value })} style={{ padding: '2px', width: '40px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span style={{ color: s['Tier2(SST)'] === "O" ? '#1976d2' : '#ccc', fontWeight: 'bold' }}>{s['Tier2(SST)']}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#ffebee' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier3} onChange={(e) => setEditTiers({ ...editTiers, tier3: e.target.value })} style={{ padding: '2px', width: '40px' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span style={{ color: s['Tier3'] === "O" ? '#d32f2f' : '#ccc', fontWeight: 'bold' }}>{s['Tier3']}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#4a148c' }}>
                                                {isEditing ? (
                                                    <select value={editTiers.tier3_plus} onChange={(e) => setEditTiers({ ...editTiers, tier3_plus: e.target.value })} style={{ padding: '2px', width: '40px', backgroundColor: '#4a148c', color: 'white' }}>
                                                        <option value="O">O</option>
                                                        <option value="X">X</option>
                                                    </select>
                                                ) : (
                                                    <span style={{ color: s['Tier3+'] === "O" ? '#fff' : '#888', fontWeight: 'bold' }}>{s['Tier3+']}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', fontSize: '0.75rem', color: '#666' }}>{s.변경일 || '-'}</td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left', fontSize: '0.8rem', color: '#333', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {isEditing ? (
                                                    <input type="text" value={editMemo} onChange={(e) => setEditMemo(e.target.value)} style={{ width: '100%', padding: '2px' }} placeholder="메모" />
                                                ) : (
                                                    s.메모 || '-'
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                                <button onClick={() => router.push(`/student/${encodeURIComponent(s.학생코드)}`)} style={{ padding: '4px 10px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>📊</button>
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                                <button onClick={() => router.push(`/student/${encodeURIComponent(s.학생코드)}/bip`)} style={{ padding: '4px 10px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>📋</button>
                                            </td>
                                            {isAdmin() && (
                                                <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center' }}>
                                                    {isEditing ? (
                                                        <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                                                            <button onClick={handleSave} disabled={saving} style={{ padding: '2px 6px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                                {saving ? '...' : '저장'}
                                                            </button>
                                                            <button onClick={handleCancel} style={{ padding: '2px 6px', backgroundColor: '#9e9e9e', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                                취소
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => handleEdit(s)} style={{ padding: '2px 8px', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem' }}>
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
            </div>
        </AuthCheck>
    );
}
