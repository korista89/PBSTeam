"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

interface GlobalNavProps {
    currentPage?: string;
}

export default function GlobalNav({ currentPage }: GlobalNavProps) {
    const { user, logout, isAdmin } = useAuth();

    // Date state with localStorage persistence
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        // Load dates from localStorage on mount (Priority: URL > LocalStorage > Default)
        const searchParams = new URLSearchParams(window.location.search);
        const urlStart = searchParams.get("startDate");
        const urlEnd = searchParams.get("endDate");

        const savedStart = localStorage.getItem("pbis_start_date");
        const savedEnd = localStorage.getItem("pbis_end_date");

        if (urlStart && urlEnd) {
            setStartDate(urlStart);
            setEndDate(urlEnd);
            localStorage.setItem("pbis_start_date", urlStart);
            localStorage.setItem("pbis_end_date", urlEnd);
        } else if (savedStart && savedEnd) {
            setStartDate(savedStart);
            setEndDate(savedEnd);
        } else {
            // Default: last 4 weeks
            const today = new Date();
            const prev = new Date();
            prev.setDate(today.getDate() - 28);
            setStartDate(prev.toISOString().split('T')[0]);
            setEndDate(today.toISOString().split('T')[0]);
        }
        setIsInitialized(true);
    }, []);

    useEffect(() => {
        // Save dates to localStorage when they change
        if (isInitialized && startDate && endDate) {
            localStorage.setItem("pbis_start_date", startDate);
            localStorage.setItem("pbis_end_date", endDate);
        }
    }, [startDate, endDate, isInitialized]);

    const navItems = [
        { href: "/", label: "📊 대시보드", key: "dashboard" },
        { href: "/tier-status", label: "📋 Tier현황", key: "tier-status" },
        { href: "/cico", label: "📝 CICO입력", key: "cico" },
        { href: "/report", label: "📄 T1리포트", key: "report" },
        { href: "/report/tier2", label: "📈 CICO리포트", key: "report-tier2" },
        { href: "/report/tier3", label: "🔴 T3리포트", key: "report-tier3" },
        { href: "/meeting", label: "🤝 협의회", key: "meeting" },
        { href: "/protocol", label: "📜 프로토콜", key: "protocol" },
        { href: "/board", label: "📢 게시판", key: "board" },
    ];

    if (isAdmin()) {
        navItems.push({ href: "/admin", label: "⚙️ 관리", key: "admin" });
    }

    if (!user) return null;

    const handleSearch = () => {
        // Dispatch custom event for date change
        window.dispatchEvent(new CustomEvent('pbis-date-change', {
            detail: { startDate, endDate }
        }));
    };

    return (
        <nav style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%)',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            position: 'sticky',
            top: 0,
            zIndex: 1000,
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
        }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'white' }}>
                    🏫 PBIS
                </span>
            </div>

            {/* Navigation Links */}
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {navItems.map(item => (
                    <a
                        key={item.key}
                        href={item.href}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: currentPage === item.key ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                            color: 'white',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontSize: '0.85rem',
                            fontWeight: currentPage === item.key ? 'bold' : 'normal',
                            transition: 'background 0.2s'
                        }}
                    >
                        {item.label}
                    </a>
                ))}
            </div>

            {/* Date Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: '4px', border: 'none', fontSize: '0.85rem' }}
                />
                <span style={{ color: 'white' }}>~</span>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: '4px', border: 'none', fontSize: '0.85rem' }}
                />
                <button
                    onClick={handleSearch}
                    style={{
                        padding: '5px 12px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.85rem'
                    }}
                >
                    조회
                </button>
            </div>

            {/* User Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'white', fontSize: '0.85rem' }}>
                    {isAdmin() ? '👑' : '👤'} {user.id}번
                    <span style={{ fontSize: '0.7rem', color: '#fbbf24', marginLeft: '8px' }}>
                        (Debug: {user.role || user.Role || "NoRole"})
                    </span>
                </span>
                <button
                    onClick={() => {
                        logout();
                        window.location.href = '/login';
                    }}
                    style={{
                        padding: '5px 10px',
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
        </nav>
    );
}

// Hook to get current date range from localStorage and URL
export function useDateRange() {
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    useEffect(() => {
        const loadDates = () => {
            // Priority: 1. URL Params, 2. localStorage, 3. Default (4 weeks)
            const searchParams = new URLSearchParams(window.location.search);
            const urlStart = searchParams.get("startDate");
            const urlEnd = searchParams.get("endDate");

            const savedStart = localStorage.getItem("pbis_start_date");
            const savedEnd = localStorage.getItem("pbis_end_date");

            if (urlStart && urlEnd) {
                setStartDate(urlStart);
                setEndDate(urlEnd);
                // Sync to localStorage
                localStorage.setItem("pbis_start_date", urlStart);
                localStorage.setItem("pbis_end_date", urlEnd);
            } else if (savedStart && savedEnd) {
                setStartDate(savedStart);
                setEndDate(savedEnd);
            } else {
                const today = new Date();
                const prev = new Date();
                prev.setDate(today.getDate() - 28);
                const defaultStart = prev.toISOString().split('T')[0];
                const defaultEnd = today.toISOString().split('T')[0];
                setStartDate(defaultStart);
                setEndDate(defaultEnd);
            }
        };

        loadDates();

        // Listen for date changes from GlobalNav
        const handleDateChange = (e: CustomEvent) => {
            setStartDate(e.detail.startDate);
            setEndDate(e.detail.endDate);
        };

        window.addEventListener('pbis-date-change', handleDateChange as EventListener);
        return () => window.removeEventListener('pbis-date-change', handleDateChange as EventListener);
    }, []);

    return { startDate, endDate };
}
