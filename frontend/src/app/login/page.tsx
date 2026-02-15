"use client";

import React, { useState } from "react";
import axios from "axios";
import styles from "../page.module.css";
import { CLASS_LIST } from "../constants";

export default function LoginPage() {
    const [loginType, setLoginType] = useState<"admin" | "teacher">("teacher");
    const [adminId, setAdminId] = useState("1");
    const [classId, setClassId] = useState(CLASS_LIST[0]?.id || "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        setError("");

        try {
            // Construct user_id
            let userId = "";
            if (loginType === "admin") {
                // admin01 ~ admin10
                userId = `admin${adminId.padStart(2, '0')}`;
            } else {
                userId = classId;
            }

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const response = await axios.post(`${apiUrl}/api/v1/auth/login`, {
                user_id: userId,
                password: password
            });

            // Store login info in localStorage
            localStorage.setItem("user", JSON.stringify(response.data.user));

            // Redirect to dashboard
            window.location.href = "/";
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "로그인 실패");
            } else {
                setError("로그인 실패");
            }
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
                <h1 style={{ textAlign: 'center', marginBottom: '10px', color: '#333' }}>
                    🏫 특수학교 PBIS
                </h1>
                <p style={{ textAlign: 'center', marginBottom: '30px', color: '#666' }}>
                    통합관리플랫폼 로그인
                </p>

                {error && (
                    <div style={{
                        padding: '10px', marginBottom: '20px',
                        backgroundColor: '#fee2e2', color: '#dc2626',
                        borderRadius: '8px', textAlign: 'center'
                    }}>
                        {error}
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '2px solid #e5e7eb' }}>
                    <button
                        onClick={() => { setLoginType("teacher"); setPassword(""); }}
                        style={{
                            flex: 1, padding: '10px', border: 'none', background: 'none',
                            borderBottom: loginType === "teacher" ? '2px solid #6366f1' : 'none',
                            color: loginType === "teacher" ? '#6366f1' : '#6b7280',
                            fontWeight: 'bold', cursor: 'pointer', marginBottom: '-2px'
                        }}
                    >
                        👨‍🏫 담임교사
                    </button>
                    <button
                        onClick={() => { setLoginType("admin"); setPassword(""); }}
                        style={{
                            flex: 1, padding: '10px', border: 'none', background: 'none',
                            borderBottom: loginType === "admin" ? '2px solid #6366f1' : 'none',
                            color: loginType === "admin" ? '#6366f1' : '#6b7280',
                            fontWeight: 'bold', cursor: 'pointer', marginBottom: '-2px'
                        }}
                    >
                        🛡️ 관리자
                    </button>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                        {loginType === "admin" ? "관리자 번호" : "학급 선택"}
                    </label>

                    {loginType === "admin" ? (
                        <select
                            value={adminId}
                            onChange={(e) => setAdminId(e.target.value)}
                            style={{
                                width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                                borderRadius: '8px', fontSize: '1rem', backgroundColor: 'white'
                            }}
                        >
                            {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                                <option key={num} value={num}>{num}번 관리자</option>
                            ))}
                        </select>
                    ) : (
                        <select
                            value={classId}
                            onChange={(e) => setClassId(e.target.value)}
                            style={{
                                width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                                borderRadius: '8px', fontSize: '1rem', backgroundColor: 'white'
                            }}
                        >
                            {CLASS_LIST.map(cls => (
                                <option key={cls.id} value={cls.id}>{cls.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div style={{ marginBottom: '30px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                        비밀번호
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="비밀번호를 입력하세요"
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        style={{
                            width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                            borderRadius: '8px', fontSize: '1rem'
                        }}
                    />
                </div>

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    style={{
                        width: '100%', padding: '14px',
                        backgroundColor: loading ? '#9ca3af' : '#6366f1',
                        color: 'white', border: 'none', borderRadius: '8px',
                        fontSize: '1.1rem', fontWeight: 'bold',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s'
                    }}
                >
                    {loading ? "로그인 중..." : "🔐 로그인"}
                </button>

                <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.85rem', color: '#999' }}>
                    초기 비밀번호: admin123 / teacher123
                </p>
            </div>
        </div>
    );
}
