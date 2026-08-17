"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "../types";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (userData: User) => void;
    logout: () => void;
    isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: false,
    login: () => {},
    logout: () => {},
    isAdmin: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem("user");
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (parsed && parsed.id && (parsed.role || parsed.Role)) {
                        return parsed;
                    } else {
                        localStorage.removeItem("user");
                    }
                } catch {
                    localStorage.removeItem("user");
                }
            }
        }
        return null;
    });

    const login = useCallback((userData: User) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem("user", JSON.stringify(userData));
        }
        setUser(userData);
    }, []);

    const logout = useCallback(() => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem("user");
        }
        setUser(null);
    }, []);

    const isAdmin = useCallback(() => {
        return (user?.role || user?.Role)?.toLowerCase() === "admin";
    }, [user?.role, user?.Role]);

    return (
        <AuthContext.Provider value={{ user, loading: false, login, logout, isAdmin }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthCheck({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
    const { user, loading, isAdmin } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading) {
            if (!user && pathname !== "/login") {
                router.push("/login");
            }
            if (requireAdmin && !isAdmin()) {
                alert("관리자 권한이 필요합니다.");
                router.push("/");
            }
        }
    }, [user, loading, pathname, router, requireAdmin, isAdmin]);

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
