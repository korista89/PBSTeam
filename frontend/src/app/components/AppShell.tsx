"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

interface AppShellProps {
    currentPage: string;
    title?: string;
    subtitle?: string;
    headerActions?: React.ReactNode;
    children: React.ReactNode;
    hideDateFilter?: boolean;
}

interface NavItem {
    href: string;
    label: string;
    key: string;
    icon: string;
}

interface NavGroup {
    groupTitle: string;
    items: NavItem[];
}

export default function AppShell({
    currentPage,
    title,
    subtitle,
    headerActions,
    children,
    hideDateFilter = false
}: AppShellProps) {
    const { user, logout, isAdmin } = useAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            setStartDate(prev.toISOString().split("T")[0]);
            setEndDate(today.toISOString().split("T")[0]);
        }
        setIsInitialized(true);
    }, []);

    useEffect(() => {
        if (isInitialized && startDate && endDate) {
            localStorage.setItem("pbis_start_date", startDate);
            localStorage.setItem("pbis_end_date", endDate);
        }
    }, [startDate, endDate, isInitialized]);

    const handleSearch = () => {
        window.dispatchEvent(
            new CustomEvent("pbis-date-change", {
                detail: { startDate, endDate }
            })
        );
    };

    const navGroups: NavGroup[] = [
        {
            groupTitle: "운영",
            items: [
                { href: "/", label: "대시보드", key: "dashboard", icon: "📊" },
                { href: "/today", label: "Today결정", key: "today", icon: "🧭" }
            ]
        },
        {
            groupTitle: "기록 / 학생",
            items: [
                { href: "/behavior", label: "행동기록", key: "behavior", icon: "✍️" },
                { href: "/tier-status", label: "Tier현황", key: "tier-status", icon: "📋" },
                { href: "/cico", label: "CICO입력", key: "cico", icon: "📝" }
            ]
        },
        {
            groupTitle: "분석 / EBP",
            items: [
                { href: "/report/tier2", label: "CICO리포트", key: "report-tier2", icon: "📈" },
                { href: "/report/tier3", label: "T3리포트", key: "report-tier3", icon: "🔴" },
                { href: "/ebp", label: "Be-Able EBP", key: "ebp", icon: "📚" }
            ]
        },
        {
            groupTitle: "협업 / 도구",
            items: [
                { href: "/meeting", label: "협의회", key: "meeting", icon: "🤝" },
                { href: "/protocol", label: "프로토콜", key: "protocol", icon: "📜" },
                { href: "/picture-word", label: "경은그림말", key: "picture-word", icon: "🎨" }
            ]
        }
    ];

    if (isAdmin()) {
        navGroups.push({
            groupTitle: "시스템 관리",
            items: [
                { href: "/admin/approvals", label: "결재함", key: "approvals", icon: "✅" },
                { href: "/admin", label: "관리자설정", key: "admin", icon: "⚙️" }
            ]
        });
    }

    if (!user) return null;

    return (
        <div className="app-layout">
            {/* Desktop Left Sidebar */}
            <aside className={`app-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
                <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", color: "white", fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>
                        <img src="/logo/school-logo.png" alt="경은학교 로고" style={{ height: "32px", width: "32px", borderRadius: "50%", backgroundColor: "white", padding: "2px" }} />
                        <span className="sidebar-logo-text">경은PBST</span>
                    </Link>
                    <button
                        onClick={() => setMobileMenuOpen(false)}
                        className="mobile-close-btn"
                        style={{ display: "none", background: "none", border: "none", color: "white", fontSize: "1.2rem", cursor: "pointer" }}
                    >
                        ✕
                    </button>
                </div>

                <nav style={{ padding: "14px 10px", flex: 1, overflowY: "auto" }}>
                    {navGroups.map((group, gIdx) => (
                        <div key={gIdx} style={{ marginBottom: "16px" }}>
                            <div className="sidebar-group-label" style={{ padding: "0 10px 6px", fontSize: "0.72rem", fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                                {group.groupTitle}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                {group.items.map((item) => {
                                    const isActive = currentPage === item.key;
                                    return (
                                        <Link
                                            key={item.key}
                                            href={item.href}
                                            className={`sidebar-link ${isActive ? "active" : ""}`}
                                            onClick={() => setMobileMenuOpen(false)}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "10px",
                                                padding: "8px 12px",
                                                borderRadius: "8px",
                                                fontSize: "0.85rem",
                                                fontWeight: isActive ? 700 : 500,
                                                color: isActive ? "#ffffff" : "#94a3b8",
                                                backgroundColor: isActive ? "var(--bg-sidebar-active)" : "transparent",
                                                borderLeft: isActive ? "3px solid #3b82f6" : "3px solid transparent",
                                                transition: "all 0.15s ease"
                                            }}
                                        >
                                            <span style={{ fontSize: "1.05rem", width: "20px", textAlign: "center" }}>{item.icon}</span>
                                            <span className="sidebar-link-text">{item.label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Sidebar Bottom User Info */}
                <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", background: "rgba(0,0,0,0.2)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: isAdmin() ? "#f59e0b" : "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "white", fontWeight: 700, flexShrink: 0 }}>
                                {isAdmin() ? "관" : "담"}
                            </div>
                            <div className="sidebar-link-text" style={{ overflow: "hidden" }}>
                                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "white", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                                    {user.name || user.id}
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                                    {isAdmin() ? "관리자" : (user.class_id || "담임교사")}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            title="로그아웃"
                            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.9rem", padding: "4px" }}
                        >
                            🚪
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Application Area */}
            <div className="app-main-wrapper">
                {/* Top Utility Bar */}
                <header className="app-topbar">
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className="mobile-hamburger"
                            style={{ display: "none", background: "none", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "6px 10px", fontSize: "1rem", cursor: "pointer" }}
                        >
                            ☰
                        </button>
                        <div>
                            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                                {title || "경은PBST 통합관리플랫폼"}
                            </div>
                            {subtitle && (
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1px" }}>
                                    {subtitle}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Date Picker & Utility Right */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", rowGap: "8px" }}>
                        {!hideDateFilter && (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--bg-subtle)", padding: "4px 8px", borderRadius: "8px", border: "1px solid var(--border-subtle)", flexShrink: 0, whiteSpace: "nowrap" }}>
                                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>📅 분석기간</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    style={{ border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "3px 6px", fontSize: "0.78rem", outline: "none", background: "white" }}
                                />
                                <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>~</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    style={{ border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "3px 6px", fontSize: "0.78rem", outline: "none", background: "white" }}
                                />
                                <button
                                    onClick={handleSearch}
                                    className="btn btn-primary"
                                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                                >
                                    조회
                                </button>
                            </div>
                        )}

                        {headerActions && (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                                {headerActions}
                            </div>
                        )}

                        <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingLeft: "8px", borderLeft: "1px solid var(--border-subtle)", flexShrink: 0, whiteSpace: "nowrap" }}>
                            <span className={`badge ${isAdmin() ? "badge-tier2" : "badge-neutral"}`} style={{ fontSize: "0.72rem" }}>
                                {isAdmin() ? "🛡️ 관리자" : `👨‍🏫 ${user.class_id || user.id}`}
                            </span>
                            <button
                                onClick={logout}
                                className="btn btn-secondary"
                                style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                            >
                                로그아웃
                            </button>
                        </div>
                    </div>
                </header>

                {/* Page Main Content Area */}
                <main className="app-content">
                    {children}
                </main>
            </div>

            <style jsx>{`
                .sidebar-link:hover {
                    background-color: var(--bg-sidebar-hover) !important;
                    color: #ffffff !important;
                }
                @media (max-width: 1024px) {
                    .mobile-hamburger {
                        display: block !important;
                    }
                    .app-sidebar {
                        position: fixed;
                        top: 0;
                        left: -240px;
                        height: 100vh;
                        width: 220px;
                        transition: left 0.25s ease-in-out;
                        box-shadow: 2px 0 10px rgba(0,0,0,0.3);
                    }
                    .app-sidebar.mobile-open {
                        left: 0 !important;
                    }
                    .mobile-close-btn {
                        display: block !important;
                    }
                }
            `}</style>
        </div>
    );
}
