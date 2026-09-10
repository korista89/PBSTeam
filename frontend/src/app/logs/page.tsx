"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import AppShell from "../components/AppShell";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import { useDateRange } from "../components/GlobalNav";
import { useSheetLiveSync } from "../hooks/useSheetLiveSync";
import { maskName } from "../utils";
import LogDetailPanel from "../components/LogDetailPanel";

const STATUS_OPTIONS = ["전체", "Pending", "Approved", "Revision Requested"];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    Pending: { bg: "#fef3c7", color: "#92400e", label: "결재 대기" },
    Approved: { bg: "#dcfce7", color: "#166534", label: "승인됨" },
    "Revision Requested": { bg: "#fee2e2", color: "#b91c1c", label: "재작성 요청" },
};

export default function LogsPage() {
    const { isAdmin } = useAuth();
    const { startDate, endDate } = useDateRange();

    const [logs, setLogs] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [status, setStatus] = useState("전체");
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    // 검색어를 매 키 입력마다 요청하면 네트워크 지연에 따라 응답이 요청 순서와 다르게
    // 도착할 수 있다(예: "2" 요청이 "2421" 요청보다 늦게 도착해 더 넓은 결과로 화면을
    // 덮어씀). 요청마다 증가하는 시퀀스 번호를 매겨, 가장 최근에 보낸 요청의 응답만
    // 반영하도록 막는다.
    const requestSeq = useRef(0);

    // 학생 프로파일 페이지의 "전체 로그에서 보기" 버튼이 ?q=학생코드 로 링크하므로,
    // 최초 진입 시 URL의 q 파라미터를 그대로 검색창에 반영한다.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const q = params.get("q");
        if (q) { setQuery(q); setDebouncedQuery(q); }
    }, []);

    // 검색창 입력은 300ms 디바운스 — 타이핑 중간마다 전체 목록을 다시 요청하지 않는다.
    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedQuery(query), 300);
        return () => window.clearTimeout(t);
    }, [query]);

    const fetchLogs = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError("");
        const mySeq = ++requestSeq.current;
        try {
            const params = new URLSearchParams();
            if (debouncedQuery.trim()) params.append("q", debouncedQuery.trim());
            if (status && status !== "전체") params.append("status", status);
            if (startDate && endDate) {
                params.append("start_date", startDate);
                params.append("end_date", endDate);
            }
            const res = await axios.get(`${API_BASE_URL}/api/v1/behavior-log/logs?${params.toString()}`);
            if (mySeq !== requestSeq.current) return; // 이 응답이 오는 사이 더 최신 요청이 나감 — 폐기
            setLogs(res.data.logs || []);
            setTotal(res.data.total ?? (res.data.logs || []).length);
        } catch (err: any) {
            if (mySeq !== requestSeq.current) return;
            setError(err.response?.data?.detail || err.message || "데이터를 불러오지 못했습니다.");
        } finally {
            if (mySeq === requestSeq.current && !silent) setLoading(false);
        }
    }, [debouncedQuery, status, startDate, endDate]);

    useEffect(() => { void fetchLogs(); }, [fetchLogs]);
    useSheetLiveSync(() => fetchLogs(true));

    return (
        <AuthCheck>
            <AppShell
                currentPage="logs"
                title="🗂️ 전체 로그"
                subtitle={isAdmin() ? `전교 데이터 입력 현황 · 총 ${total}건` : `담당 학급 데이터 입력 현황 · 총 ${total}건`}
                headerActions={
                    <button onClick={() => void fetchLogs()} className="btn btn-secondary">
                        🔄 새로고침
                    </button>
                }
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 16px" }}>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="학생명 · 학생코드 · 교사명 · 행동유형 · 특기사항 검색..."
                            style={{ flex: 1, minWidth: "220px", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.88rem" }}
                        />
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            style={{ padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.85rem" }}
                        >
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === "전체" ? "전체 상태" : (STATUS_STYLE[s]?.label || s)}</option>)}
                        </select>
                        {query && (
                            <button onClick={() => setQuery("")} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                                검색 초기화
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="card" style={{ padding: "60px", textAlign: "center", color: "var(--text-secondary)" }}>
                            <div style={{ fontSize: "2rem", marginBottom: "12px", animation: "spin 2s linear infinite" }}>⏳</div>
                            <p style={{ fontWeight: 700 }}>로그를 불러오고 있습니다...</p>
                        </div>
                    ) : error ? (
                        <div className="card" style={{ padding: "20px", background: "#fef2f2", color: "#dc2626", textAlign: "center" }}>
                            ⚠️ {error}
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🗂️</div>
                            <div className="empty-state-title">조건에 맞는 로그가 없습니다</div>
                            <div className="empty-state-text">검색어·상태·날짜 범위를 조정해 다시 시도해 보세요.</div>
                        </div>
                    ) : (
                        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
                                    <thead>
                                        <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                            {["날짜/시간대", "학생", "학급", "입력교사", "행동유형", "강도", "장소", "제지", "상태"].map(h => (
                                                <th key={h} style={{
                                                    textAlign: "left", padding: "10px 12px", fontWeight: 700, color: "#475569", whiteSpace: "nowrap",
                                                    width: h === "날짜/시간대" ? "110px" : h === "행동유형" ? "180px" : h === "장소" ? "140px" : undefined,
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, i) => {
                                            const st = STATUS_STYLE[log["Status"]] || { bg: "#f1f5f9", color: "#475569", label: log["Status"] || "-" };
                                            const logId = log["Log_ID"] || String(i);
                                            const isCrisis = String(log["물리적제지여부"] || "").startsWith("O");
                                            const hasDetails = !!log.crisis_details;
                                            const isExpanded = expandedLogId === logId;
                                            const missingLegal = isCrisis && hasDetails && (
                                                !String(log.crisis_details["관리자_보고_시간"] || "").trim() ||
                                                !String(log.crisis_details["학부모_알림_시간"] || "").trim()
                                            );
                                            return (
                                                <React.Fragment key={logId}>
                                                    <tr
                                                        onClick={() => setExpandedLogId(isExpanded ? null : logId)}
                                                        style={{ borderBottom: isExpanded ? "none" : "1px solid #f1f5f9", cursor: "pointer" }}
                                                        onMouseOver={(e) => (e.currentTarget.style.background = "#f8fafc")}
                                                        onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                                                    >
                                                        <td style={{ padding: "10px 12px", color: "#64748b", width: "110px", maxWidth: "110px" }}>
                                                            <div style={{ whiteSpace: "nowrap" }}>{log["행동발생날짜"]}</div>
                                                            <div style={{ fontSize: "0.74rem", color: "#94a3b8", whiteSpace: "normal", lineHeight: 1.3 }}>{log["시간대"]}</div>
                                                        </td>
                                                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontWeight: 700, color: "#0f172a" }}>{maskName(log["학생명"])} <span style={{ color: "#94a3b8", fontWeight: 400 }}>({log["학생코드"] || log["코드번호"]})</span></td>
                                                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#64748b" }}>{log["학급"]}</td>
                                                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#64748b" }}>{log["입력교사명"]}</td>
                                                        <td style={{ padding: "10px 12px", maxWidth: "180px", whiteSpace: "normal", wordBreak: "keep-all" }}>{log["행동유형"]}</td>
                                                        <td style={{ padding: "10px 12px", textAlign: "center" }}>{log["강도"]}</td>
                                                        <td style={{ padding: "10px 12px", maxWidth: "140px", whiteSpace: "normal", wordBreak: "keep-all" }}>{log["장소"]}</td>
                                                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                                            {isCrisis ? (
                                                                <span title={missingLegal ? "법정 보고·알림 기록 누락" : "위기 대응 기록"} style={{ position: "relative" }}>
                                                                    🚨{missingLegal && <span style={{ position: "absolute", top: -4, right: -6, fontSize: "0.6rem" }}>⚠️</span>}
                                                                </span>
                                                            ) : "-"}
                                                        </td>
                                                        <td style={{ padding: "10px 12px" }}>
                                                            <span style={{ padding: "3px 9px", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 700, background: st.bg, color: st.color, whiteSpace: "nowrap" }}>
                                                                {st.label}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                            <td colSpan={9} style={{ padding: "0 12px 16px", background: "#f8fafc" }} onClick={(e) => e.stopPropagation()}>
                                                                <LogDetailPanel log={log} isCrisis={isCrisis} onSaved={() => void fetchLogs(true)} />
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </AppShell>
        </AuthCheck>
    );
}
