"use client";

// 개별학생대시보드 진입 화면 — 학생을 골라 /student/{코드} 프로파일로 이동한다. Tier3 학생을 먼저 보여준다.
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import AppShell from "../components/AppShell";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import { maskName } from "../utils";

const isO = (v: unknown) => String(v ?? "").trim().toUpperCase() === "O";
const tierOf = (s: any) => (isO(s["Tier3"]) || isO(s["Tier3+"]) ? 3 : isO(s["Tier2(CICO)"]) || isO(s["Tier2(SST)"]) ? 2 : 1);

export default function StudentPickerPage() {
    const { user } = useAuth();
    const [students, setStudents] = useState<any[]>([]);
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/v1/tier/status`);
            const data = res.data.students || res.data || [];
            setStudents(Array.isArray(data) ? data.filter((s: any) => s.학생코드 && s.재학여부 !== "X") : []);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { if (user) void load(); }, [user, load]);

    const list = students
        .filter(s => !q || String(s.학생이름 || "").includes(q) || String(s.학생코드).includes(q) || String(s.학급 || "").includes(q))
        .sort((a, b) => tierOf(b) - tierOf(a) || String(a.학생코드).localeCompare(String(b.학생코드)));

    return (
        <AuthCheck>
            <AppShell currentPage="student" title="👤 개별학생대시보드" subtitle="학생을 고르면 개별 대시보드(FBA 프로파일)가 열립니다 · Tier3 학생이 먼저 나옵니다" hideDateFilter={true}>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 · 학생코드 · 학급 검색"
                    style={{ width: "100%", maxWidth: 360, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 16, fontSize: "0.95rem" }} />
                {loading ? <div className="card" style={{ padding: 20 }}>⏳ 학생 목록을 불러오는 중...</div> : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
                        {list.map(s => {
                            const t = tierOf(s);
                            return (
                                <a key={s.학생코드} href={`/student/${encodeURIComponent(s.학생코드)}`} className="card"
                                    style={{ padding: 12, textDecoration: "none", color: "#0f172a", borderLeft: `5px solid ${t === 3 ? "#dc2626" : t === 2 ? "#f59e0b" : "#cbd5e1"}` }}>
                                    <div style={{ fontWeight: 800 }}>{maskName(s.학생이름) || s.학생코드}</div>
                                    <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{s.학급} · {s.학생코드} · Tier{t}</div>
                                </a>
                            );
                        })}
                        {list.length === 0 && <div style={{ color: "#64748b" }}>해당하는 학생이 없습니다.</div>}
                    </div>
                )}
            </AppShell>
        </AuthCheck>
    );
}
