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
    const [editTiers, setEditTiers] = useState({
        tier1: "O",
        tier2_cico: "X",
        tier2_sst: "X",
        tier3: "X",
        tier3_plus: "X"
    });

    // 210 fixed student codes (fallback)
    const STUDENT_CODES = [
        "1011", "1012", "1013", "1014", "1021", "1022", "1023", "1024",
        "2111", "2112", "2113", "2114", "2115", "2116", "2121", "2122", "2123", "2124", "2125", "2126",
        "2211", "2212", "2213", "2214", "2215", "2216", "2221", "2222", "2223", "2224", "2225", "2226",
        "2311", "2312", "2313", "2314", "2315", "2316", "2411", "2412", "2413", "2414", "2415", "2416",
        "2421", "2422", "2423", "2424", "2425", "2426", "2511", "2512", "2513", "2514", "2515", "2516",
        "2521", "2522", "2523", "2524", "2525", "2526", "2611", "2612", "2613", "2614", "2615", "2616",
        "2621", "2622", "2623", "2624", "2625", "2626",
        "3111", "3112", "3113", "3114", "3115", "3116", "3121", "3122", "3123", "3124", "3125", "3126",
        "3211", "3212", "3213", "3214", "3215", "3216", "3221", "3222", "3223", "3224", "3225", "3226",
        "3311", "3312", "3313", "3314", "3315", "3316", "3321", "3322", "3323", "3324", "3325", "3326",
        "3401", "3402", "3403", "3404", "3405",
        "4111", "4112", "4113", "4114", "4115", "4116", "4117", "4121", "4122", "4123", "4124", "4125", "4126", "4127",
        "4211", "4212", "4213", "4214", "4215", "4216", "4217", "4221", "4222", "4223", "4224", "4225", "4226", "4227",
        "4311", "4312", "4313", "4314", "4315", "4316", "4317", "4321", "4322", "4323", "4324", "4325", "4326", "4327",
        "4401", "4402", "4403", "4404", "4405",
        "5111", "5112", "5113", "5114", "5115", "5116", "5117", "5121", "5122", "5123", "5124", "5125", "5126", "5127",
        "5131", "5132", "5133", "5134", "5135", "5136", "5137",
        "5211", "5212", "5213", "5214", "5215", "5216", "5217", "5221", "5222", "5223", "5224", "5225", "5226", "5227",
        "5231", "5232", "5233", "5234", "5235", "5236", "5237",
        "6001", "6002", "6003", "6004", "6005", "6006"
    ];

    const codeToClassName = (code: string): string => {
        if (code.length !== 4) return "";
        const course = code[0];
        const grade = code[1];
        const cls = code[2];
        const courseNames: {[key: string]: string} = {
            "1": "유치원", "2": "초등", "3": "중학교", "4": "고등", "5": "전공과", "6": "예비"
        };
        if (code.substring(0,2) === "34") return "중학교 순회학급";
        if (code.substring(0,2) === "44") return "고등 순회학급";
        if (code[0] === "6") return "예비";
        return `${courseNames[course] || ""} ${grade}학년 ${cls}반`;
    };

    const generateDefaultStudents = (): StudentStatus[] => {
        return STUDENT_CODES.map((code, idx) => ({
            번호: idx + 1,
            학급: codeToClassName(code),
            학생코드: code,
            재학여부: "O",
            'BeAble코드': "",
            'Tier1': "O",
            'Tier2(CICO)': "X",
            'Tier2(SST)': "X",
            'Tier3': "X",
            'Tier3+': "X",
            변경일: "",
            메모: ""
        }));
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const response = await axios.get(`${apiUrl}/api/v1/tier/status`);
            
            const fetchedStudents = response.data.students || response.data || [];
            
            if (fetchedStudents.length === 0) {
                const defaults = generateDefaultStudents();
                setStudents(defaults);
                setEnrolledCount(defaults.length);
            } else {
                setStudents(fetchedStudents);
                setEnrolledCount(response.data.enrolled_count || fetchedStudents.filter((s: StudentStatus) => s.재학여부 === "O").length);
            }
        } catch (error) {
            console.error("Failed to fetch tier status:", error);
            const defaults = generateDefaultStudents();
            setStudents(defaults);
            setEnrolledCount(defaults.length);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (student: StudentStatus) => {
        setEditingCode(student.학생코드);
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

    const handleSave = async () => {
        if (!editingCode) return;
        
        setSaving(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            
            // Update tiers
            await axios.put(`${apiUrl}/api/v1/tier/status`, {
                code: editingCode,
                tier1: editTiers.tier1,
                tier2_cico: editTiers.tier2_cico,
                tier2_sst: editTiers.tier2_sst,
                tier3: editTiers.tier3,
                tier3_plus: editTiers.tier3_plus,
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

    // Get tier level for filtering
    const getTierLevel = (s: StudentStatus): string => {
        if (s['Tier3+'] === "O") return "Tier3+";
        if (s['Tier3'] === "O") return "Tier3";
        if (s['Tier2(SST)'] === "O") return "Tier2(SST)";
        if (s['Tier2(CICO)'] === "O") return "Tier2(CICO)";
        return "Tier1";
    };

    // Filter students
    const filteredStudents = students.filter(s => {
        if (filter !== "all" && getTierLevel(s) !== filter) return false;
        if (courseFilter !== "all" && getCourse(s.학생코드) !== courseFilter) return false;
        return true;
    });

    // Count by tier (enrolled only)
    const tierCounts = {
        tier1: students.filter(s => s.재학여부 === "O" && s['Tier1'] === "O" && s['Tier2(CICO)'] === "X" && s['Tier2(SST)'] === "X" && s['Tier3'] === "X" && s['Tier3+'] === "X").length,
        tier2_cico: students.filter(s => s.재학여부 === "O" && s['Tier2(CICO)'] === "O").length,
        tier2_sst: students.filter(s => s.재학여부 === "O" && s['Tier2(SST)'] === "O").length,
        tier3: students.filter(s => s.재학여부 === "O" && s['Tier3'] === "O").length,
        tier3_plus: students.filter(s => s.재학여부 === "O" && s['Tier3+'] === "O").length,
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
                            전교생 <strong>{enrolledCount}</strong>명 (재학생 기준) | 전체 {students.length}명
                        </p>
                    </div>
                    {!isAdmin() && (
                        <div style={{ padding: '8px 16px', backgroundColor: '#fef3c7', borderRadius: '8px', color: '#b45309', fontSize: '0.9rem' }}>
                            🔒 조회 전용 (관리자만 편집 가능)
                        </div>
                    )}
                </div>

                {/* Summary Cards - 5 Tier Types */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '20px' }}>
                    <div style={{ padding: '12px', backgroundColor: '#e8f5e9', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2e7d32' }}>{tierCounts.tier1}</div>
                        <div style={{ color: '#666', fontSize: '0.85rem' }}>Tier 1</div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#fff3e0', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f57c00' }}>{tierCounts.tier2_cico}</div>
                        <div style={{ color: '#666', fontSize: '0.85rem' }}>Tier2(CICO)</div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#e3f2fd', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1976d2' }}>{tierCounts.tier2_sst}</div>
                        <div style={{ color: '#666', fontSize: '0.85rem' }}>Tier2(SST)</div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#ffebee', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#d32f2f' }}>{tierCounts.tier3}</div>
                        <div style={{ color: '#666', fontSize: '0.85rem' }}>Tier 3</div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#4a148c', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>{tierCounts.tier3_plus}</div>
                        <div style={{ color: '#ddd', fontSize: '0.85rem' }}>Tier 3+</div>
                    </div>
                </div>

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
                                <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px' }}>재학</th>
                                <th style={{ padding: '8px', border: '1px solid #ddd', width: '80px' }}>BeAble</th>
                                <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px', backgroundColor: '#e8f5e9' }}>T1</th>
                                <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px', backgroundColor: '#fff3e0' }}>T2-C</th>
                                <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px', backgroundColor: '#e3f2fd' }}>T2-S</th>
                                <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px', backgroundColor: '#ffebee' }}>T3</th>
                                <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px', backgroundColor: '#4a148c', color: 'white' }}>T3+</th>
                                <th style={{ padding: '8px', border: '1px solid #ddd', width: '80px' }}>변경일</th>
                                {isAdmin() && <th style={{ padding: '8px', border: '1px solid #ddd', width: '60px' }}>관리</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((s) => {
                                const isEditing = editingCode === s.학생코드;
                                const isInactive = s.재학여부 === "X";
                                
                                return (
                                    <tr key={s.학생코드} style={{ backgroundColor: isInactive ? '#f9f9f9' : 'white', opacity: isInactive ? 0.5 : 1 }}>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center' }}>{s.번호}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', fontSize: '0.8rem' }}>{s.학급}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', fontFamily: 'monospace' }}>{s.학생코드}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center' }}>
                                            {isEditing ? (
                                                <select value={editEnrolled} onChange={(e) => setEditEnrolled(e.target.value)} style={{ padding: '2px', width: '40px' }}>
                                                    <option value="O">O</option>
                                                    <option value="X">X</option>
                                                </select>
                                            ) : (
                                                <span style={{ color: s.재학여부 === "O" ? '#2e7d32' : '#999', fontWeight: 'bold' }}>{s.재학여부}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center' }}>
                                            {isEditing ? (
                                                <input type="text" value={editBeAble} onChange={(e) => setEditBeAble(e.target.value)} style={{ width: '60px', padding: '2px' }} placeholder="코드" />
                                            ) : (
                                                s['BeAble코드'] || '-'
                                            )}
                                        </td>
                                        {/* 5 Tier columns with O/X */}
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#f1f8e9' }}>
                                            {isEditing ? (
                                                <select value={editTiers.tier1} onChange={(e) => setEditTiers({...editTiers, tier1: e.target.value})} style={{ padding: '2px', width: '40px' }}>
                                                    <option value="O">O</option>
                                                    <option value="X">X</option>
                                                </select>
                                            ) : (
                                                <span style={{ color: s['Tier1'] === "O" ? '#2e7d32' : '#ccc', fontWeight: 'bold' }}>{s['Tier1']}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#fff8e1' }}>
                                            {isEditing ? (
                                                <select value={editTiers.tier2_cico} onChange={(e) => setEditTiers({...editTiers, tier2_cico: e.target.value})} style={{ padding: '2px', width: '40px' }}>
                                                    <option value="O">O</option>
                                                    <option value="X">X</option>
                                                </select>
                                            ) : (
                                                <span style={{ color: s['Tier2(CICO)'] === "O" ? '#f57c00' : '#ccc', fontWeight: 'bold' }}>{s['Tier2(CICO)']}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#e3f2fd' }}>
                                            {isEditing ? (
                                                <select value={editTiers.tier2_sst} onChange={(e) => setEditTiers({...editTiers, tier2_sst: e.target.value})} style={{ padding: '2px', width: '40px' }}>
                                                    <option value="O">O</option>
                                                    <option value="X">X</option>
                                                </select>
                                            ) : (
                                                <span style={{ color: s['Tier2(SST)'] === "O" ? '#1976d2' : '#ccc', fontWeight: 'bold' }}>{s['Tier2(SST)']}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#ffebee' }}>
                                            {isEditing ? (
                                                <select value={editTiers.tier3} onChange={(e) => setEditTiers({...editTiers, tier3: e.target.value})} style={{ padding: '2px', width: '40px' }}>
                                                    <option value="O">O</option>
                                                    <option value="X">X</option>
                                                </select>
                                            ) : (
                                                <span style={{ color: s['Tier3'] === "O" ? '#d32f2f' : '#ccc', fontWeight: 'bold' }}>{s['Tier3']}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', backgroundColor: '#4a148c' }}>
                                            {isEditing ? (
                                                <select value={editTiers.tier3_plus} onChange={(e) => setEditTiers({...editTiers, tier3_plus: e.target.value})} style={{ padding: '2px', width: '40px', backgroundColor: '#4a148c', color: 'white' }}>
                                                    <option value="O">O</option>
                                                    <option value="X">X</option>
                                                </select>
                                            ) : (
                                                <span style={{ color: s['Tier3+'] === "O" ? '#fff' : '#888', fontWeight: 'bold' }}>{s['Tier3+']}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '0.75rem', color: '#666' }}>{s.변경일 || '-'}</td>
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
