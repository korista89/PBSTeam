"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

interface GlobalNavProps {
    currentPage?: string;
}

export default function GlobalNav({ currentPage }: GlobalNavProps) {
    const { user, logout, isAdmin } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);

    // Date state with localStorage persistence
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
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
            const today = new Date();
            const prev = new Date();
            prev.setDate(today.getDate() - 28);
            setStartDate(prev.toISOString().split('T')[0]);
            setEndDate(today.toISOString().split('T')[0]);
        }
        setIsInitialized(true);
    }, []);

    useEffect(() => {
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
        window.dispatchEvent(new CustomEvent('pbis-date-change', {
            detail: { startDate, endDate }
        }));
    };

    return (
        <>
            <style jsx>{`
                .gnav {
                    background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
                    padding: 10px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 8px;
                    position: sticky;
                    top: 0;
                    z-index: 1000;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                }
                .gnav-logo {
                    font-size: 1.3rem;
                    font-weight: bold;
                    color: white;
                    text-decoration: none;
                    cursor: pointer;
                }
                .gnav-hamburger {
                    display: none;
                    background: rgba(255,255,255,0.15);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    font-size: 1.4rem;
                    padding: 4px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    line-height: 1;
                }
                .gnav-links {
                    display: flex;
                    gap: 4px;
                    flex-wrap: wrap;
                }
                .gnav-link {
                    padding: 5px 10px;
                    color: white;
                    border-radius: 6px;
                    text-decoration: none;
                    font-size: 0.82rem;
                    transition: background 0.2s;
                }
                .gnav-link:hover { background: rgba(255,255,255,0.2); }
                .gnav-controls {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .gnav-date {
                    padding: 4px 8px;
                    border-radius: 4px;
                    border: none;
                    font-size: 0.82rem;
                }
                .gnav-search-btn {
                    padding: 4px 10px;
                    background-color: #10b981;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 0.82rem;
                }
                .gnav-user {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .gnav-user span {
                    color: white;
                    font-size: 0.82rem;
                }
                .gnav-logout {
                    padding: 4px 10px;
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.78rem;
                }

                @media (max-width: 768px) {
                    .gnav {
                        padding: 8px 12px;
                        gap: 6px;
                    }
                    .gnav-top-row {
                        display: flex;
                        width: 100%;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .gnav-hamburger {
                        display: inline-block;
                    }
                    .gnav-links {
                        display: none;
                        width: 100%;
                        flex-direction: column;
                        gap: 2px;
                    }
                    .gnav-links.open {
                        display: flex;
                    }
                    .gnav-link {
                        padding: 8px 12px;
                        font-size: 0.9rem;
                        border-radius: 6px;
                    }
                    .gnav-controls {
                        width: 100%;
                        justify-content: center;
                    }
                    .gnav-user {
                        width: 100%;
                        justify-content: center;
                    }
                }
            `}</style>

            <nav className="gnav">
                {/* Top Row: Logo + Hamburger + User (mobile) */}
                <div className="gnav-top-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <a href="/" className="gnav-logo">🏫 PBIS</a>
                    <button
                        className="gnav-hamburger"
                        onClick={() => setMenuOpen(!menuOpen)}
                        aria-label="메뉴 열기/닫기"
                    >
                        {menuOpen ? '✕' : '☰'}
                    </button>
                </div>

                {/* Navigation Links */}
                <div className={`gnav-links ${menuOpen ? 'open' : ''}`}>
                    {navItems.map(item => (
                        <a
                            key={item.key}
                            href={item.href}
                            className="gnav-link"
                            style={{
                                backgroundColor: currentPage === item.key ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                                fontWeight: currentPage === item.key ? 'bold' : 'normal',
                            }}
                            onClick={() => setMenuOpen(false)}
                        >
                            {item.label}
                        </a>
                    ))}
                </div>

                {/* Date Controls */}
                <div className="gnav-controls">
                    <input type="date" className="gnav-date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    <span style={{ color: 'white', fontSize: '0.85rem' }}>~</span>
                    <input type="date" className="gnav-date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    <button className="gnav-search-btn" onClick={handleSearch}>조회</button>
                </div>

                {/* User Info */}
                <div className="gnav-user">
                    <span>{isAdmin() ? '👑' : '👤'} {user.id}</span>
                    <button className="gnav-logout" onClick={() => { logout(); window.location.href = '/login'; }}>
                        로그아웃
                    </button>
                </div>
            </nav>
        </>
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
