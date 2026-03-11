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
            background: 'linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%)',
            padding: '20px'
        }}>
            <div style={{
                background: 'white',
                borderRadius: '24px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                width: '100%',
                maxWidth: '1000px',
                display: 'flex',
                overflow: 'hidden',
                minHeight: '640px'
            }}>
                {/* Left Side: Hero Image (Hidden on mobile) */}
                <div style={{
                    flex: 1.2,
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                }}>
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <img 
                            src="/hero-bg.png" 
                            alt="특수교육 교구 자료" 
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'cover'
                            }} 
                        />
                        {/* Overlay to blend with brand */}
                        <div style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            background: 'linear-gradient(to right, rgba(30,58,138,0.1) 0%, rgba(30,58,138,0) 50%, rgba(255,255,255,0.1) 100%)'
                        }} />

                        {/* User Requested Watermark */}
                        <div style={{
                            position: 'absolute',
                            bottom: '25px',
                            right: '25px',
                            color: 'rgba(255, 255, 255, 0.4)', // Very light color as requested
                            fontSize: '14px',
                            fontWeight: '600',
                            textShadow: '1px 1px 2px rgba(0,0,0,0.2)',
                            pointerEvents: 'none',
                            textAlign: 'right',
                            lineHeight: '1.4',
                            letterSpacing: '0.5px'
                        }}>
                            Jong Ho Park<br />
                            Special Educator · BCBA
                        </div>
                    </div>
                </div>

                {/* Right Side: Login Form */}
                <div style={{
                    width: '450px',
                    padding: '50px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    background: 'white'
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                        <h1 style={{ margin: '0 0 10px', color: '#1e3a8a', fontSize: '2.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src="/logo/school-logo.png" alt="경은학교 로고" style={{ height: '56px', marginRight: '15px' }} />
                            경은PBST
                        </h1>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '1rem', fontWeight: 500 }}>
                            통합관리플랫폼 로그인
                        </p>
                    </div>

                    {error && (
                        <div style={{
                            padding: '12px', marginBottom: '25px',
                            backgroundColor: '#fef2f2', color: '#dc2626',
                            border: '1px solid #fee2e2',
                            borderRadius: '10px', textAlign: 'center', fontSize: '0.9rem'
                        }}>
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Tabs */}
                    <div style={{ display: 'flex', marginBottom: '30px', background: '#f8fafc', padding: '4px', borderRadius: '12px' }}>
                        <button
                            onClick={() => { setLoginType("teacher"); setPassword(""); setError(""); }}
                            style={{
                                flex: 1, padding: '12px', border: 'none', 
                                background: loginType === "teacher" ? 'white' : 'transparent',
                                borderRadius: '8px',
                                boxShadow: loginType === "teacher" ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                                color: loginType === "teacher" ? '#1e3a8a' : '#64748b',
                                fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            👨‍🏫 담임교사
                        </button>
                        <button
                            onClick={() => { setLoginType("admin"); setPassword(""); setError(""); }}
                            style={{
                                flex: 1, padding: '12px', border: 'none', 
                                background: loginType === "admin" ? 'white' : 'transparent',
                                borderRadius: '8px',
                                boxShadow: loginType === "admin" ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                                color: loginType === "admin" ? '#ef4444' : '#64748b',
                                fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            🛡️ 관리자
                        </button>
                    </div>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {loginType === "teacher" ? (
                            <div>
                                <label style={{ display: 'block', marginBottom: '10px', fontWeight: '700', color: '#334155', fontSize: '0.88rem' }}>
                                    학급 선택
                                </label>
                                <select
                                    value={classId}
                                    onChange={(e) => setClassId(e.target.value)}
                                    style={{
                                        width: '100%', padding: '14px', border: '1.5px solid #e2e8f0',
                                        borderRadius: '12px', fontSize: '1rem', backgroundColor: '#fff',
                                        outline: 'none', transition: 'border-color 0.2s'
                                    }}
                                >
                                    {CLASS_LIST.map(cls => (
                                        <option key={cls.code} value={cls.code}>{cls.name}</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div style={{
                                padding: '16px', backgroundColor: '#fef2f2', borderRadius: '12px',
                                border: '1px solid #fee2e2', color: '#b91c1c', fontSize: '0.88rem',
                                display: 'flex', alignItems: 'center', gap: '10px'
                            }}>
                                <span>🔒 <b>전체 관리자(admin)</b> 계정으로 로그인합니다.</span>
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', marginBottom: '10px', fontWeight: '700', color: '#334155', fontSize: '0.88rem' }}>
                                비밀번호
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="비밀번호를 입력하세요"
                                style={{
                                    width: '100%', padding: '14px', border: '1.5px solid #e2e8f0',
                                    borderRadius: '12px', fontSize: '1rem', outline: 'none',
                                    transition: 'border-color 0.2s'
                                }}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%', padding: '16px', marginTop: '10px',
                                backgroundColor: loading ? '#9ca3af' : (loginType === "teacher" ? '#1e3a8a' : '#ef4444'),
                                color: 'white', border: 'none', borderRadius: '12px',
                                fontSize: '1.1rem', fontWeight: '800',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
                                transition: 'transform 0.1s, background 0.2s'
                            }}
                        >
                            {loading ? "로그인 중..." : "로그인"}
                        </button>
                    </form>

                    <div style={{ textAlign: 'center', marginTop: '40px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                        <p style={{ fontSize: '0.82rem', color: '#94a338b', margin: 0 }}>
                            Designed by <b style={{ color: '#64748b' }}>경은PBST Team</b>
                        </p>
                    </div>
                </div>
            </div>
            
            <style jsx>{`
                @media (max-width: 900px) {
                    div[style*="flex: 1.2"] {
                        display: none !important;
                    }
                    div[style*="width: 450px"] {
                        width: 100% !important;
                        padding: 40px 30px !important;
                    }
                    div[style*="maxWidth: 1000px"] {
                        maxWidth: 450px !important;
                    }
                }
            `}</style>
        </div>
    );
}
