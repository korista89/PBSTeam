"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import styles from "../page.module.css";

interface User {
    ID: number;
    Role: string;
    LastLogin: string;
}

export default function AdminPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<string>("");
    const [newPassword, setNewPassword] = useState("");
    const [message, setMessage] = useState("");
    const [currentUser, setCurrentUser] = useState<{id: string, role: string} | null>(null);

    useEffect(() => {
        // Check if user is admin
        const stored = localStorage.getItem("user");
        if (stored) {
            const user = JSON.parse(stored);
            setCurrentUser(user);
            if (user.role !== "admin") {
                alert("관리자 권한이 필요합니다.");
                window.location.href = "/";
                return;
            }
        } else {
            window.location.href = "/login";
            return;
        }
        
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const response = await axios.get(`${apiUrl}/api/v1/auth/users`);
            setUsers(response.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async () => {
        if (!selectedUser || !newPassword) {
            setMessage("사용자와 새 비밀번호를 입력하세요.");
            return;
        }

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            await axios.put(`${apiUrl}/api/v1/auth/users/${selectedUser}/password`, {
                user_id: selectedUser,
                new_password: newPassword
            });
            setMessage(`사용자 ${selectedUser}의 비밀번호가 변경되었습니다.`);
            setNewPassword("");
        } catch (err) {
            console.error(err);
            setMessage("비밀번호 변경 실패");
        }
    };

    if (loading) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>⚙️ 관리자 설정</h1>
                    <p className={styles.subtitle}>사용자 계정 및 비밀번호 관리</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={() => window.location.href = '/'}
                        style={{ padding: '8px 16px', cursor: 'pointer', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px' }}
                    >
                        🏠 대시보드로
                    </button>
                    <button 
                        onClick={() => {
                            localStorage.removeItem("user");
                            window.location.href = '/login';
                        }}
                        style={{ padding: '8px 16px', cursor: 'pointer', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px' }}
                    >
                        🚪 로그아웃
                    </button>
                </div>
            </header>

            <main className={styles.main}>
                {/* Password Change Section */}
                <div className={styles.card} style={{ marginBottom: '20px' }}>
                    <h2 style={{ marginBottom: '20px' }}>🔑 비밀번호 변경</h2>
                    
                    {message && (
                        <div style={{ 
                            padding: '10px', 
                            marginBottom: '15px', 
                            backgroundColor: message.includes('실패') ? '#fee2e2' : '#d1fae5',
                            color: message.includes('실패') ? '#dc2626' : '#059669',
                            borderRadius: '8px'
                        }}>
                            {message}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>대상 사용자</label>
                            <select 
                                value={selectedUser}
                                onChange={(e) => setSelectedUser(e.target.value)}
                                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', minWidth: '150px' }}
                            >
                                <option value="">선택...</option>
                                {users.map(u => (
                                    <option key={u.ID} value={u.ID}>
                                        {u.ID} ({u.Role})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>새 비밀번호</label>
                            <input 
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="새 비밀번호"
                                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', minWidth: '200px' }}
                            />
                        </div>
                        <button 
                            onClick={handlePasswordChange}
                            style={{ 
                                padding: '10px 20px', 
                                backgroundColor: '#10b981', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '8px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            변경 저장
                        </button>
                    </div>
                </div>

                {/* User List */}
                <div className={styles.card}>
                    <h2 style={{ marginBottom: '20px' }}>👥 사용자 목록</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                        {users.map(u => (
                            <div 
                                key={u.ID}
                                style={{
                                    padding: '10px',
                                    backgroundColor: u.Role === 'admin' ? '#fef3c7' : '#f3f4f6',
                                    borderRadius: '8px',
                                    textAlign: 'center'
                                }}
                            >
                                <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{u.ID}</div>
                                <div style={{ fontSize: '0.85rem', color: u.Role === 'admin' ? '#b45309' : '#6b7280' }}>
                                    {u.Role === 'admin' ? '👑 관리자' : '👤 교사'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
