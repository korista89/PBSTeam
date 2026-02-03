"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import styles from "../page.module.css";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import GlobalNav from "../components/GlobalNav";

interface StudentStatus {
    번호: number;
    학급: string;
    학생코드: string;
    재학여부: string;
    'BeAble코드': string;
    현재Tier: string;
    변경일: string;
    메모: string;
    row_index?: number;
}

export default function TierStatusPage() {
    const { isAdmin } = useAuth();
    const [students, setStudents] = useState<StudentStatus[]>([]);
    const [enrolledCount, setEnrolledCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [courseFilter, setCourseFilter] = useState("all");
    const [saving, setSaving] = useState(false);
    
    // Editing states
    const [editingCode, setEditingCode] = useState<string | null>(null);
    const [editTier, setEditTier] = useState("");
    const [editMemo, setEditMemo] = useState("");
    const [editEnrolled, setEditEnrolled] = useState("");
    const [editBeAble, setEditBeAble] = useState("");

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const response = await axios.get(`${apiUrl}/api/v1/tier/status`);
            
            setStudents(response.data.students || []);
            setEnrolledCount(response.data.enrolled_count || 0);
        } catch (error) {
            console.error("Failed to fetch tier status:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (student: StudentStatus) => {
        setEditingCode(student.학생코드);
        setEditTier(student.현재Tier);
        setEditMemo(student.메모 || "");
        setEditEnrolled(student.재학여부);
        setEditBeAble(student['BeAble코드'] || "");
    };

    const handleSave = async () => {
        if (!editingCode) return;
        
        setSaving(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            
            // Update tier
            await axios.put(`${apiUrl}/api/v1/tier/status`, {
                code: editingCode,
                tier: editTier,
                memo: editMemo
            });

            // Update enrollment
            await axios.put(`${apiUrl}/api/v1/tier/enrollment`, {
                code: editingCode,
                enrolled: editEnrolled
            });

            // Update BeAble code
            await axios.put(`${apiUrl}/api/v1/tier/beable`, {
                code: editingCode,
                beable_code: editBeAble
            });

            setEditingCode(null);
            fetchStatus(); // Refresh data
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

    // Get course from student code
    const getCourse = (code: string) => {
        if (!code) return "";
        const first = code[0];
        switch(first) {
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
        // Tier filter
        if (filter !== "all" && s.현재Tier !== filter) return false;
        // Course filter
        if (courseFilter !== "all" && getCourse(s.학생코드) !== courseFilter) return false;
        return true;
    });

    // Count by tier (enrolled only)
    const tierCounts = {
        tier1: students.filter(s => s.재학여부 === "O" && s.현재Tier === "Tier 1").length,
        tier2: students.filter(s => s.재학여부 === "O" && s.현재Tier === "Tier 2").length,
        tier3: students.filter(s => s.재학여부 === "O" && s.현재Tier === "Tier 3").length,
    };

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
                            전교생 <strong>{enrolledCount}</strong>명 (재학생 기준) | 
                            전체 {students.length}명
                        </p>
                    </div>
                    {!isAdmin() && (
                        <div style={{ padding: '8px 16px', backgroundColor: '#fef3c7', borderRadius: '8px', color: '#b45309', fontSize: '0.9rem' }}>
                            🔒 조회 전용 (관리자만 편집 가능)
                        </div>
                    )}
                </div>

                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
                    <div style={{ padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2e7d32' }}>{tierCounts.tier1}</div>
                        <div style={{ color: '#666' }}>Tier 1 (보편적 지원)</div>
                    </div>
                    <div style={{ padding: '15px', backgroundColor: '#fff3e0', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f57c00' }}>{tierCounts.tier2}</div>
                        <div style={{ color: '#666' }}>Tier 2 (선별적 지원)</div>
                    </div>
                    <div style={{ padding: '15px', backgroundColor: '#ffebee', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#d32f2f' }}>{tierCounts.tier3}</div>
                        <div style={{ color: '#666' }}>Tier 3 (집중적 지원)</div>
                    </div>
                    <div style={{ padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1976d2' }}>{enrolledCount}</div>
                        <div style={{ color: '#666' }}>재학생 수</div>
                    </div>
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                    <select 
                        value={filter} 
                        onChange={(e) => setFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}
                    >
                        <option value="all">전체 Tier</option>
                        <option value="Tier 1">Tier 1</option>
                        <option value="Tier 2">Tier 2</option>
                        <option value="Tier 3">Tier 3</option>
                    </select>
                    <select 
                        value={courseFilter} 
                        onChange={(e) => setCourseFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}
                    >
                        <option value="all">전체 과정</option>
                        <option value="유치원">유치원</option>
                        <option value="초등">초등</option>
                        <option value="중학교">중학교</option>
                        <option value="고등">고등</option>
                        <option value="전공과">전공과</option>
                        <option value="예비">예비</option>
                    </select>
                    <span style={{ color: '#666', alignSelf: 'center' }}>
                        표시: {filteredStudents.length}명
                    </span>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f5f5f5' }}>
                                <th style={{ padding: '10px', border: '1px solid #ddd', width: '50px' }}>번호</th>
                                <th style={{ padding: '10px', border: '1px solid #ddd', width: '120px' }}>학급</th>
                                <th style={{ padding: '10px', border: '1px solid #ddd', width: '80px' }}>학생코드</th>
                                <th style={{ padding: '10px', border: '1px solid #ddd', width: '70px' }}>재학여부</th>
                                <th style={{ padding: '10px', border: '1px solid #ddd', width: '100px' }}>BeAble코드</th>
                                <th style={{ padding: '10px', border: '1px solid #ddd', width: '100px' }}>현재 Tier</th>
                                <th style={{ padding: '10px', border: '1px solid #ddd', width: '100px' }}>변경일</th>
                                {isAdmin() && (
                                    <th style={{ padding: '10px', border: '1px solid #ddd', width: '80px' }}>관리</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((s) => {
                                const isEditing = editingCode === s.학생코드;
                                const isInactive = s.재학여부 === "X";
                                
                                return (
                                    <tr 
                                        key={s.학생코드} 
                                        style={{ 
                                            backgroundColor: isInactive ? '#f9f9f9' : 'white',
                                            opacity: isInactive ? 0.5 : 1
                                        }}
                                    >
                                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                            {s.번호}
                                        </td>
                                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                                            {s.학급}
                                        </td>
                                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', fontFamily: 'monospace' }}>
                                            {s.학생코드}
                                        </td>
                                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                            {isEditing ? (
                                                <select 
                                                    value={editEnrolled} 
                                                    onChange={(e) => setEditEnrolled(e.target.value)}
                                                    style={{ padding: '4px' }}
                                                >
                                                    <option value="O">O</option>
                                                    <option value="X">X</option>
                                                </select>
                                            ) : (
                                                <span style={{ 
                                                    color: s.재학여부 === "O" ? '#2e7d32' : '#999',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {s.재학여부}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                            {isEditing ? (
                                                <input 
                                                    type="text"
                                                    value={editBeAble}
                                                    onChange={(e) => setEditBeAble(e.target.value)}
                                                    style={{ width: '80px', padding: '4px' }}
                                                    placeholder="코드입력"
                                                    disabled={editEnrolled === "X"}
                                                />
                                            ) : (
                                                s['BeAble코드'] || '-'
                                            )}
                                        </td>
                                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                            {isEditing ? (
                                                <select 
                                                    value={editTier} 
                                                    onChange={(e) => setEditTier(e.target.value)}
                                                    style={{ padding: '4px' }}
                                                    disabled={editEnrolled === "X"}
                                                >
                                                    <option value="Tier 1">Tier 1</option>
                                                    <option value="Tier 2">Tier 2</option>
                                                    <option value="Tier 3">Tier 3</option>
                                                </select>
                                            ) : (
                                                <span style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    backgroundColor: 
                                                        s.현재Tier === "Tier 1" ? '#e8f5e9' :
                                                        s.현재Tier === "Tier 2" ? '#fff3e0' : '#ffebee',
                                                    color:
                                                        s.현재Tier === "Tier 1" ? '#2e7d32' :
                                                        s.현재Tier === "Tier 2" ? '#f57c00' : '#d32f2f',
                                                    fontWeight: 'bold',
                                                    fontSize: '0.85rem'
                                                }}>
                                                    {s.현재Tier}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>
                                            {s.변경일 || '-'}
                                        </td>
                                        {isAdmin() && (
                                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                        <button 
                                                            onClick={handleSave}
                                                            disabled={saving}
                                                            style={{ 
                                                                padding: '4px 8px', 
                                                                backgroundColor: '#4caf50', 
                                                                color: 'white', 
                                                                border: 'none', 
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.8rem'
                                                            }}
                                                        >
                                                            {saving ? '...' : '저장'}
                                                        </button>
                                                        <button 
                                                            onClick={handleCancel}
                                                            style={{ 
                                                                padding: '4px 8px', 
                                                                backgroundColor: '#9e9e9e', 
                                                                color: 'white', 
                                                                border: 'none', 
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.8rem'
                                                            }}
                                                        >
                                                            취소
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleEdit(s)}
                                                        style={{ 
                                                            padding: '4px 12px', 
                                                            backgroundColor: '#1976d2', 
                                                            color: 'white', 
                                                            border: 'none', 
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.8rem'
                                                        }}
                                                    >
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
