"use client";

// 내 설정(담임) — 관리자설정 대신 보이는 화면. 내 계정 정보 확인과 비밀번호 변경.
import React, { useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import AppShell from "../components/AppShell";
import { AuthCheck, useAuth } from "../components/AuthProvider";

const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.95rem", boxSizing: "border-box" };

export default function SettingsPage() {
    const { user } = useAuth();
    const [cur, setCur] = useState("");
    const [next, setNext] = useState("");
    const [again, setAgain] = useState("");
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (next !== again) { setMsg({ ok: false, text: "새 비밀번호가 서로 다릅니다." }); return; }
        setBusy(true); setMsg(null);
        try {
            await axios.put(`${API_BASE_URL}/api/v1/auth/me/password`, { current_password: cur, new_password: next });
            setMsg({ ok: true, text: "비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요." });
            setCur(""); setNext(""); setAgain("");
        } catch (err: any) {
            setMsg({ ok: false, text: err.response?.data?.detail || err.message || "변경에 실패했습니다." });
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthCheck>
            <AppShell currentPage="settings" title="⚙️ 내 설정" subtitle="내 계정 정보와 비밀번호" hideDateFilter={true}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, maxWidth: 900 }}>
                    <div className="card" style={{ padding: 20 }}>
                        <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>👤 내 계정</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", rowGap: 8, fontSize: "0.92rem" }}>
                            <span style={{ color: "#64748b" }}>아이디</span><b>{user?.id || "-"}</b>
                            <span style={{ color: "#64748b" }}>담당 학급</span><b>{user?.class_name || user?.class_id || "-"}</b>
                            <span style={{ color: "#64748b" }}>권한</span><b>학급 담임</b>
                        </div>
                        <p style={{ margin: "14px 0 0", fontSize: "0.82rem", color: "#64748b", lineHeight: 1.6 }}>
                            담당 학급 학생의 기록만 보고 입력할 수 있습니다. 학급·권한 변경은 관리자에게 요청하세요.
                        </p>
                    </div>
                    <form onSubmit={submit} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                        <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>🔒 비밀번호 변경</h3>
                        <input type="password" placeholder="현재 비밀번호" value={cur} onChange={e => setCur(e.target.value)} required autoComplete="current-password" style={input} />
                        <input type="password" placeholder="새 비밀번호 (4자 이상)" value={next} onChange={e => setNext(e.target.value)} required minLength={4} autoComplete="new-password" style={input} />
                        <input type="password" placeholder="새 비밀번호 다시 입력" value={again} onChange={e => setAgain(e.target.value)} required minLength={4} autoComplete="new-password" style={input} />
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "바꾸는 중..." : "비밀번호 바꾸기"}</button>
                        {msg && <div style={{ fontSize: "0.88rem", fontWeight: 700, color: msg.ok ? "#15803d" : "#dc2626" }}>{msg.ok ? "✅" : "⚠️"} {msg.text}</div>}
                    </form>
                </div>
            </AppShell>
        </AuthCheck>
    );
}
