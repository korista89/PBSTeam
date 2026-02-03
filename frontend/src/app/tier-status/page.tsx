"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import styles from "../page.module.css";

interface StudentStatus {
    Code: string;
    Name: string;
    Class: string;
    CurrentTier: string;
    ChangedDate: string;
    Memo: string;
}

export default function TierStatusPage() {
    const [students, setStudents] = useState<StudentStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [saving, setSaving] = useState(false);
    const [editingCode, setEditingCode] = useState<string | null>(null);
    const [editTier, setEditTier] = useState("");
    const [editMemo, setEditMemo] = useState("");

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            
            // Fetch student status from tier API
            const statusRes = await axios.get(`${apiUrl}/api/v1/tier/status`);
            
            // Fetch student codes to merge names
            const codesRes = await axios.get(`${apiUrl}/api/v1/roster/codes`);
            const codeMap = codesRes.data; // {Name: Code}
            
            // Create reverse map {Code: Name}
            const reverseCodeMap: {[key: string]: string} = {};
            Object.entries(codeMap).forEach(([name, code]) => {
                reverseCodeMap[code as string] = name;
            });

            // Merge data - if status exists use it, otherwise create empty entry
            let mergedData: StudentStatus[] = statusRes.data;
            
            // If no status data, generate from codes
            if (mergedData.length === 0) {
                // Generate preset codes (same as roster/edit)
                const presets: StudentStatus[] = [];
                
                // Kindergarten
                for(let c=1; c<=3; c++) {
                    for(let n=1; n<=10; n++) {
                        const code = `00${c}${n}`;
                        presets.push({ 
                            Code: code, 
                            Name: reverseCodeMap[code] || "", 
                            Class: `유치원 ${c}반`, 
                            CurrentTier: "Tier 1", 
                            ChangedDate: "", 
                            Memo: "" 
                        });
                    }
                }
                
                // Elementary
                for(let g=1; g<=6; g++) {
                    for(let c=1; c<=3; c++) {
                        for(let n=1; n<=5; n++) {
                            const code = `2${g}${c}${n}`;
                            presets.push({ 
                                Code: code, 
                                Name: reverseCodeMap[code] || "", 
                                Class: `초등 ${g}-${c}`, 
                                CurrentTier: "Tier 1", 
                                ChangedDate: "", 
                                Memo: "" 
                            });
                        }
                    }
                }
                
                // Middle School
                for(let g=1; g<=3; g++) {
                    for(let c=1; c<=2; c++) {
                        for(let n=1; n<=5; n++) {
                            const code = `3${g}${c}${n}`;
                            presets.push({ 
                                Code: code, 
                                Name: reverseCodeMap[code] || "", 
                                Class: `중등 ${g}-${c}`, 
                                CurrentTier: "Tier 1", 
                                ChangedDate: "", 
                                Memo: "" 
                            });
                        }
                    }
                }
                
                mergedData = presets;
            }
            
            setStudents(mergedData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveTier = async (code: string) => {
        try {
            setSaving(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            await axios.put(`${apiUrl}/api/v1/tier/status`, {
                code: code,
                tier: editTier,
                memo: editMemo
            });
            
            // Update local state
            setStudents(prev => prev.map(s => 
                s.Code === code ? { ...s, CurrentTier: editTier, Memo: editMemo, ChangedDate: new Date().toLocaleDateString() } : s
            ));
            
            setEditingCode(null);
            alert("Tier가 변경되었습니다.");
        } catch (err) {
            console.error(err);
            alert("저장 실패");
        } finally {
            setSaving(false);
        }
    };

    const filteredStudents = filter === "all" 
        ? students 
        : students.filter(s => s.CurrentTier === filter);

    const tierCounts = {
        "Tier 1": students.filter(s => s.CurrentTier === "Tier 1").length,
        "Tier 2": students.filter(s => s.CurrentTier === "Tier 2").length,
        "Tier 3": students.filter(s => s.CurrentTier === "Tier 3").length
    };

    if (loading) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>📊 Tier별 현황</h1>
                    <p className={styles.subtitle}>전교생 {students.length}명의 행동지원 단계 관리</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => window.location.href='/'} style={{ padding: '8px 16px', cursor: 'pointer' }}>
                        ← 대시보드
                    </button>
                </div>
            </header>

            <main className={styles.main}>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
                    <div 
                        onClick={() => setFilter("all")}
                        style={{ 
                            padding: '20px', 
                            backgroundColor: filter === "all" ? '#e0e7ff' : 'white', 
                            borderRadius: '12px', 
                            textAlign: 'center',
                            cursor: 'pointer',
                            border: filter === "all" ? '2px solid #6366f1' : '1px solid #e5e7eb'
                        }}
                    >
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6366f1' }}>{students.length}</div>
                        <div style={{ color: '#666' }}>전체</div>
                    </div>
                    <div 
                        onClick={() => setFilter("Tier 1")}
                        style={{ 
                            padding: '20px', 
                            backgroundColor: filter === "Tier 1" ? '#d1fae5' : 'white', 
                            borderRadius: '12px', 
                            textAlign: 'center',
                            cursor: 'pointer',
                            border: filter === "Tier 1" ? '2px solid #10b981' : '1px solid #e5e7eb'
                        }}
                    >
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{tierCounts["Tier 1"]}</div>
                        <div style={{ color: '#666' }}>Tier 1 (보편)</div>
                    </div>
                    <div 
                        onClick={() => setFilter("Tier 2")}
                        style={{ 
                            padding: '20px', 
                            backgroundColor: filter === "Tier 2" ? '#fef3c7' : 'white', 
                            borderRadius: '12px', 
                            textAlign: 'center',
                            cursor: 'pointer',
                            border: filter === "Tier 2" ? '2px solid #f59e0b' : '1px solid #e5e7eb'
                        }}
                    >
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>{tierCounts["Tier 2"]}</div>
                        <div style={{ color: '#666' }}>Tier 2 (CICO)</div>
                    </div>
                    <div 
                        onClick={() => setFilter("Tier 3")}
                        style={{ 
                            padding: '20px', 
                            backgroundColor: filter === "Tier 3" ? '#fee2e2' : 'white', 
                            borderRadius: '12px', 
                            textAlign: 'center',
                            cursor: 'pointer',
                            border: filter === "Tier 3" ? '2px solid #ef4444' : '1px solid #e5e7eb'
                        }}
                    >
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>{tierCounts["Tier 3"]}</div>
                        <div style={{ color: '#666' }}>Tier 3 (집중)</div>
                    </div>
                </div>

                {/* Student Grid */}
                <div className={styles.card}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb' }}>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>코드</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>이름</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>학급</th>
                                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>현재 Tier</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>변경일</th>
                                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((s, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#6366f1' }}>{s.Code}</td>
                                    <td style={{ padding: '10px' }}>{s.Name || <span style={{color:'#ccc'}}>미등록</span>}</td>
                                    <td style={{ padding: '10px', color: '#666' }}>{s.Class}</td>
                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                        {editingCode === s.Code ? (
                                            <select 
                                                value={editTier}
                                                onChange={(e) => setEditTier(e.target.value)}
                                                style={{ padding: '5px', borderRadius: '4px' }}
                                            >
                                                <option value="Tier 1">Tier 1</option>
                                                <option value="Tier 2">Tier 2</option>
                                                <option value="Tier 3">Tier 3</option>
                                            </select>
                                        ) : (
                                            <span style={{
                                                padding: '4px 12px',
                                                borderRadius: '20px',
                                                backgroundColor: s.CurrentTier === 'Tier 1' ? '#d1fae5' : s.CurrentTier === 'Tier 2' ? '#fef3c7' : '#fee2e2',
                                                color: s.CurrentTier === 'Tier 1' ? '#059669' : s.CurrentTier === 'Tier 2' ? '#b45309' : '#dc2626',
                                                fontWeight: 'bold',
                                                fontSize: '0.85rem'
                                            }}>
                                                {s.CurrentTier}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px', color: '#999', fontSize: '0.85rem' }}>{s.ChangedDate || '-'}</td>
                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                        {editingCode === s.Code ? (
                                            <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                                                <button 
                                                    onClick={() => handleSaveTier(s.Code)}
                                                    disabled={saving}
                                                    style={{ padding: '4px 10px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                                                >
                                                    저장
                                                </button>
                                                <button 
                                                    onClick={() => setEditingCode(null)}
                                                    style={{ padding: '4px 10px', backgroundColor: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                                                >
                                                    취소
                                                </button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => {
                                                    setEditingCode(s.Code);
                                                    setEditTier(s.CurrentTier);
                                                    setEditMemo(s.Memo);
                                                }}
                                                style={{ padding: '4px 10px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                                            >
                                                변경
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
