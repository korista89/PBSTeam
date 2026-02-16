"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "../types";

interface AuthProviderProps {
    children: ReactNode;
}

export function useAuth() {
    const [user, setUser] = useState<User | null>(() => {
        // Lazy initialization - runs only on first render
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem("user");
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch {
                    localStorage.removeItem("user");
                }
            }
        }
        return null;
    });
    const loading = false; // No async loading needed with lazy init

    const login = (userData: User) => {
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem("user");
        setUser(null);
    };

    const isAdmin = () => user?.role?.toLowerCase() === "admin";

    return { user, loading, login, logout, isAdmin };
}

export function AuthCheck({ children, requireAdmin = false }: AuthProviderProps & { requireAdmin?: boolean }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading) {
            if (!user && pathname !== "/login") {
                router.push("/login");
            }
            if (requireAdmin && user?.role !== "admin") {
                alert("관리자 권한이 필요합니다.");
                router.push("/");
            }
        }
    }, [user, loading, pathname, router, requireAdmin]);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                fontSize: '1.2rem',
                color: '#666'
            }}>
                인증 확인 중...
            </div>
        );
    }

    if (!user && pathname !== "/login") {
        return null;
    }

    return <>{children}</>;
}
