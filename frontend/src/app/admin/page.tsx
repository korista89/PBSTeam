"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import styles from "../page.module.css";

interface User {
    ID: string;
    Role: string;
    LastLogin: string;
    ClassID?: string;
    ClassName?: string;
}

export default function AdminPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<string>("");
    const [newPassword, setNewPassword] = useState("");
    const [message, setMessage] = useState("");
    const [currentUser, setCurrentUser] = useState<{ id: string, role: string } | null>(null);

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
                        onClick={async () => {
                            if (!confirm("모든 월별 시트를 초기화/갱신하시겠습니까? 시간이 걸릴 수 있습니다.")) return;
                            try {
                                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                                await axios.post(`${apiUrl}/api/v1/analytics/dashboard/refresh`);
                                alert("데이터 갱신 완료!");
                            } catch (e) {
                                console.error(e);
                                alert("갱신 실패");
                            }
                        }}
                        style={{ padding: '8px 16px', cursor: 'pointer', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px' }}
                    >
                        🔄 데이터 갱신
                    </button>
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

                {/* User List & Role Management */}
                <div className={styles.card}>
                    <h2 style={{ marginBottom: '20px' }}>👥 사용자 권한 관리</h2>
                    <div style={{ padding: '10px', backgroundColor: '#eef2ff', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', borderLeft: '4px solid #6366f1' }}>
                        💡 사용자를 클릭하여 역할과 담당 학급을 수정할 수 있습니다.
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                        {users.map(u => (
                            <div
                                key={u.ID}
                                onClick={() => {
                                    setSelectedUser(u.ID);
                                    // Reset edit fields when selecting new user
                                    setNewPassword("");
                                    setMessage("");
                                }}
                                style={{
                                    padding: '15px',
                                    backgroundColor: selectedUser === u.ID ? '#eff6ff' : (u.Role === 'admin' ? '#fef3c7' : '#f3f4f6'),
                                    border: selectedUser === u.ID ? '2px solid #3b82f6' : '1px solid #ddd',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    position: 'relative'
                                }}
                            >
                                <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '5px' }}>{u.ID}</div>
                                <div style={{ fontSize: '0.9rem', color: u.Role === 'admin' ? '#b45309' : '#4b5563', marginBottom: '3px' }}>
                                    {u.Role === 'admin' ? '👑 관리자' : (u.Role === 'class_manager' ? '🛡️ 학급관리자' : '👤 일반 교사')}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                    {u.ClassID ? `🏫 ${u.ClassID}` : '(담당 학급 없음)'}
                                </div>

                                {selectedUser === u.ID && (
                                    <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #cbd5e1' }} onClick={e => e.stopPropagation()}>
                                        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>정보 수정</h4>
                                        <RoleEditor
                                            user={u}
                                            onUpdate={() => {
                                                fetchUsers();
                                                setMessage("정보가 업데이트되었습니다.");
                                            }}
                                        />
                                        <div style={{ marginTop: '10px' }}>
                                            <input
                                                type="password"
                                                placeholder="새비밀번호 변경 시 입력"
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                style={{ width: '100%', padding: '6px', fontSize: '12px', marginBottom: '5px' }}
                                            />
                                            <button
                                                onClick={handlePasswordChange}
                                                disabled={!newPassword}
                                                style={{
                                                    width: '100%', padding: '6px',
                                                    backgroundColor: newPassword ? '#10b981' : '#cbd5e1',
                                                    color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                                                }}
                                            >
                                                비밀번호 변경
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}

function RoleEditor({ user, onUpdate }: { user: any, onUpdate: () => void }) {
    const [role, setRole] = useState(user.Role);
    const [classId, setClassId] = useState(user.ClassID || ""); // Use ClassID field
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setRole(user.Role);
        setClassId(user.ClassID || "");
    }, [user]);

    const handleSave = async () => {
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            await axios.put(`${apiUrl}/api/v1/auth/users/${user.ID}/role`, {
                user_id: user.ID,
                new_role: role,
                new_class: classId
            });
            onUpdate();
        } catch (e) {
            console.error(e);
            alert("업데이트 실패");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ fontSize: '13px' }}>
            <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '3px', fontWeight: 'bold' }}>권한 (Role)</label>
                <select
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    style={{ width: '100%', padding: '5px' }}
                >
                    <option value="teacher">교사 (Teacher)</option>
                    <option value="class_manager">학급관리자 (Class Manager)</option>
                    <option value="admin">최고관리자 (Admin)</option>
                </select>
            </div>
            <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '3px', fontWeight: 'bold' }}>담당 학급 (Class)</label>
                <input
                    type="text"
                    value={classId}
                    onChange={e => setClassId(e.target.value)}
                    placeholder="예: 1-1, 2-3"
                    style={{ width: '100%', padding: '5px' }}
                />
            </div>
            <button
                onClick={handleSave}
                disabled={loading}
                style={{
                    width: '100%', padding: '6px',
                    backgroundColor: '#3b82f6', color: 'white',
                    border: 'none', borderRadius: '4px', cursor: 'pointer'
                }}
            >
                {loading ? "저장 중..." : "설정 저장"}
            </button>
        </div>
    );
}
