"use client";

import React, { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { CLASS_LIST } from "../constants";

export default function LoginPage() {
    const router = useRouter();
    const { login } = useAuth();

    const [loginType, setLoginType] = useState<"admin" | "teacher">("teacher");
    const [classId, setClassId] = useState(CLASS_LIST[0]?.code || "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        setLoading(true);
        setError("");

        try {
            // Construct user_id
            let userId = "";

            if (loginType === "teacher") {
                // Find selected class object
                const selectedClass = CLASS_LIST.find(c => c.code === classId);
                if (!selectedClass) {
                    setError("올바르지 않은 학급 선택입니다.");
                    setLoading(false);
                    return;
                }
                // Use the Korean ID (e.g., 초1-1관리자)
                userId = selectedClass.id || selectedClass.code;
            } else {
                // Admin: Fixed to "admin" (System Admin)
                userId = "admin";
            }

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const response = await axios.post(`${apiUrl}/api/v1/auth/login`, {
                user_id: userId,
                password: password
            });

            console.log("Login success:", response.data);
            const userData = response.data.user; // Extract user object
            login(userData); // Context update

            // Redirect based on role
            if (userData.role === 'admin') {
                router.push('/');
            } else {
                router.push('/cico');
            }

        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || "로그인에 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
            <div style={{
                background: 'white',
                padding: '40px',
                borderRadius: '16px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                width: '100%',
                maxWidth: '400px'
            }}>
                <h1 style={{ textAlign: 'center', marginBottom: '10px', color: '#333', fontSize: '1.8rem' }}>
                    🏫 경은PBST
                </h1>
                <p style={{ textAlign: 'center', marginBottom: '30px', color: '#666' }}>
                    통합관리플랫폼 로그인
                </p>

                {error && (
                    <div style={{
                        padding: '12px', marginBottom: '20px',
                        backgroundColor: '#fee2e2', color: '#dc2626',
                        borderRadius: '8px', textAlign: 'center', fontSize: '0.9rem'
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', marginBottom: '25px', borderBottom: '2px solid #e5e7eb' }}>
                    <button
                        onClick={() => { setLoginType("teacher"); setPassword(""); setError(""); }}
                        style={{
                            flex: 1, padding: '12px', border: 'none', background: 'none',
                            borderBottom: loginType === "teacher" ? '3px solid #6366f1' : '3px solid transparent',
                            color: loginType === "teacher" ? '#6366f1' : '#9ca3af',
                            fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginBottom: '-2px',
                            transition: 'all 0.2s'
                        }}
                    >
                        👨‍🏫 담임교사
                    </button>
                    <button
                        onClick={() => { setLoginType("admin"); setPassword(""); setError(""); }}
                        style={{
                            flex: 1, padding: '12px', border: 'none', background: 'none',
                            borderBottom: loginType === "admin" ? '3px solid #ef4444' : '3px solid transparent',
                            color: loginType === "admin" ? '#ef4444' : '#9ca3af',
                            fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginBottom: '-2px',
                            transition: 'all 0.2s'
                        }}
                    >
                        🛡️ 관리자
                    </button>
                </div>

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {loginType === "teacher" ? (
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151', fontSize: '0.9rem' }}>
                                학급 선택
                            </label>
                            <select
                                value={classId}
                                onChange={(e) => setClassId(e.target.value)}
                                style={{
                                    width: '100%', padding: '14px', border: '1px solid #d1d5db',
                                    borderRadius: '10px', fontSize: '1rem', backgroundColor: '#f9fafb',
                                    outline: 'none'
                                }}
                            >
                                {CLASS_LIST.map(cls => (
                                    <option key={cls.code} value={cls.code}>{cls.name}</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div style={{
                            padding: '15px', backgroundColor: '#fef2f2', borderRadius: '10px',
                            border: '1px solid #fee2e2', color: '#b91c1c', fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                            <span>🔒 <b>전체 관리자(admin)</b> 계정으로 로그인합니다.</span>
                        </div>
                    )}

                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151', fontSize: '0.9rem' }}>
                            비밀번호
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="비밀번호를 입력하세요"
                            style={{
                                width: '100%', padding: '14px', border: '1px solid #d1d5db',
                                borderRadius: '10px', fontSize: '1rem', outline: 'none'
                            }}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%', padding: '16px', marginTop: '10px',
                            backgroundColor: loading ? '#9ca3af' : (loginType === "teacher" ? '#6366f1' : '#ef4444'),
                            color: 'white', border: 'none', borderRadius: '12px',
                            fontSize: '1.1rem', fontWeight: 'bold',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            transition: 'transform 0.1s, background 0.2s'
                        }}
                    >
                        {loading ? "로그인 중..." : "로그인"}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '30px', borderTop: '1px solid #f3f4f6', paddingTop: '20px' }}>
                    <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                        Designed by <b>경은PBST Team</b>
                    </p>
                </div>
            </div>
        </div>
    );
}
