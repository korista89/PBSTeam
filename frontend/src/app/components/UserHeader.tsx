"use client";

import { useAuth } from "./AuthProvider";

export default function UserHeader() {
    const { user, logout, isAdmin } = useAuth();

    if (!user) return null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            padding: '8px 16px',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: '8px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                    fontSize: '1.5rem'
                }}>
                    {isAdmin() ? '👑' : '👤'}
                </span>
                <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                        사용자 {user.id}
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        {isAdmin() ? '관리자' : '교사'}
                    </div>
                </div>
            </div>
            <button
                onClick={() => {
                    logout();
                    window.location.href = '/login';
                }}
                style={{
                    padding: '5px 12px',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                }}
            >
                로그아웃
            </button>
        </div>
    );
}
