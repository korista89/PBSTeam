"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import axios from "axios";
import { User } from "../types";
import { API_BASE_URL } from "../constants";

// Global axios configuration to ensure session cookies are sent on all requests
if (typeof window !== "undefined") {
    axios.defaults.withCredentials = true;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (userData: User) => void;
    logout: () => Promise<void>;
    isAdmin: () => boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    login: () => {},
    logout: async () => {},
    isAdmin: () => false,
    refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const fetchCurrentUser = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/v1/auth/me`, {
                withCredentials: true
            });
            if (res.data && res.data.id) {
                const me = res.data;
                setUser({
                    id: me.id,
                    role: me.role,
                    Role: me.role,
                    class_id: me.class_id || "",
                    class_name: me.class_name || "",
                    name: me.name || ""
                });
            } else {
                setUser(null);
            }
        } catch (err: any) {
            // 401 Unauthorized or network error means no active backend session
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCurrentUser();
    }, [fetchCurrentUser]);

    const login = useCallback((userData: User) => {
        // Update in-memory state only (HttpOnly session cookie is already set by backend /auth/login)
        setUser(userData);
    }, []);

    const logout = useCallback(async () => {
        try {
            await axios.post(`${API_BASE_URL}/api/v1/auth/logout`, {}, {
                withCredentials: true
            });
        } catch (err) {
            console.error("Logout request error", err);
        } finally {
            setUser(null);
            router.push("/login");
        }
    }, [router]);

    const isAdmin = useCallback(() => {
        return (user?.role || user?.Role)?.toLowerCase() === "admin";
    }, [user?.role, user?.Role]);

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, refreshUser: fetchCurrentUser }}>
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
