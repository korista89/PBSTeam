"use client";

// 결재함 — 보고서(제지·개별학생교육지원·상해)와 '데이터만 입력' 기록을 모두 모아
// 담당자확인·교감확인·학교장확인을 순서와 관계없이 모두 받으면 결재 완료(보고서는 최종 승인)다.
// 필요하면 학교장보고를 요청한다. 단계 기록은 시트 'Approvals' 탭에 남는다.
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../constants";
import AppShell from "../../components/AppShell";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import { useSheetLiveSync } from "../../hooks/useSheetLiveSync";
import LogDetailPanel from "../../components/LogDetailPanel";
import { maskName } from "../../utils";

type Sign = { by: string; at: string; memo?: string };
type Row = Record<string, any> & { kind: "report" | "data"; signoffs: Record<string, Sign>; complete?: boolean };

const STEPS = [
  { key: "담당자확인", icon: "👤" },
  { key: "교감확인", icon: "🧑‍💼" },
  { key: "학교장확인", icon: "🏫" },
] as const;
const REPORT_REQ = "학교장보고요청";
const KINDS = [
  { key: "all", label: "전체" },
  { key: "report", label: "🚨 보고서" },
  { key: "data", label: "📝 데이터만 입력" },
] as const;
// 결재 상태는 3단계 확인 완료 여부가 기준이다(구글폼 보고서는 시트 Status 가 비어 있어 Status 만으로는 알 수 없다).
const stateOf = (r: Row) =>
  r.Status === "Revision Requested" ? { label: "재작성 요청", bg: "#ffedd5", fg: "#c2410c" }
  : r.complete ? { label: "결재 완료", bg: "#dcfce7", fg: "#15803d" }
  : { label: `${STEPS.filter(s => r.signoffs?.[s.key]).length}/3 확인`, bg: r.kind === "report" ? "#fef3c7" : "#f1f5f9", fg: r.kind === "report" ? "#b45309" : "#475569" };
const short = (v: unknown) => String(v ?? "").split(":")[0].split("(")[0].trim() || "-";
const kdate = (s: string) => { const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[2]}. ${+m[3]}.` : s || "-"; };
const hm = (at: string) => String(at || "").slice(5, 16).replace("-", ".").replace(" ", " ");

export default function ApprovalsPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("all");
  const [pendingOnly, setPendingOnly] = useState(true);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const [reviseFor, setReviseFor] = useState<string | null>(null);
  const [memo, setMemo] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/behavior-log/inbox`, { params: { kind, days, pending_only: pendingOnly } });
      setRows(res.data.logs || []);
      setError("");
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "결재함을 불러오지 못했습니다.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [kind, days, pendingOnly]);

  useEffect(() => { void load(); }, [load]);
  // 담임은 자기 학급 기록의 결재 진행을 보고, 재작성 요청에 응한다(결재 버튼은 관리자 전용)
  const admin = isAdmin();
  useSheetLiveSync(() => load(true));

  const sign = async (r: Row, step: string) => {
    const done = !!r.signoffs?.[step];
    setBusy(`${r.Log_ID}|${step}`);
    try {
      await axios.post(`${API_BASE_URL}/api/v1/behavior-log/sign`, { log_id: r.Log_ID, step, cancel: done });
      await load(true);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "처리에 실패했습니다.");
    } finally {
      setBusy("");
    }
  };

  const revise = async (r: Row) => {
    setBusy(`${r.Log_ID}|revise`);
    try {
      await axios.post(`${API_BASE_URL}/api/v1/behavior-log/revise`, { log_id: r.Log_ID, memo });
      setReviseFor(null); setMemo("");
      await load(true);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "처리에 실패했습니다.");
    } finally {
      setBusy("");
    }
  };

  const counts = {
    total: rows.length,
    waitingPrincipal: rows.filter(r => !r.complete).length,
    reportReq: rows.filter(r => r.signoffs?.[REPORT_REQ]).length,
    pending: rows.filter(r => r.kind === "report" && !r.complete).length,
  };

  return (
    <AuthCheck>
      <AppShell currentPage="approvals" title={admin ? "✅ 결재함" : "✅ 결재함 (우리 반)"}
        subtitle={admin ? "담당자·교감·학교장 확인 3개가 모두 끝나야 결재 완료됩니다 (순서 무관)" : "우리 반 기록의 결재 진행 상황입니다 · 재작성 요청을 받은 기록은 '상세·수정'에서 고치면 다시 결재가 올라갑니다"} hideDateFilter={true}
        headerActions={<button onClick={() => void load()} className="btn btn-secondary" disabled={loading}>🔄 새로고침</button>}>
        {(
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 요약 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              {[
                { label: "목록", value: counts.total, color: "#0f172a" },
                { label: "결재 미완료", value: counts.waitingPrincipal, color: "#b45309" },
                { label: "결재 미완료 보고서", value: counts.pending, color: "#dc2626" },
                { label: "학교장보고 요청", value: counts.reportReq, color: "#7c3aed" },
              ].map(c => (
                <div key={c.label} className="card" style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>{c.label}</div>
                  <div style={{ fontSize: "1.7rem", fontWeight: 900, color: c.color }}>{c.value}<span style={{ fontSize: "0.9rem" }}>건</span></div>
                </div>
              ))}
            </div>

            {/* 필터 */}
            <div className="card" style={{ padding: "12px 16px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" }}>
                {KINDS.map(k => (
                  <button key={k.key} onClick={() => setKind(k.key)}
                    style={{ padding: "8px 14px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                      background: kind === k.key ? "#0f172a" : "#fff", color: kind === k.key ? "#fff" : "#0f172a" }}>{k.label}</button>
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9rem", cursor: "pointer" }}>
                <input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)} /> 결재 미완료만
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9rem" }}>
                기간
                <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
                  {[7, 14, 30, 90, 180, 365].map(d => <option key={d} value={d}>최근 {d}일</option>)}
                </select>
              </label>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>결재 대기·재작성 요청은 기간과 관계없이 항상 보입니다.</span>
            </div>

            {error && <div className="card" style={{ padding: 12, background: "#fef2f2", color: "#dc2626" }}>⚠️ {error}</div>}
            {loading ? <div className="card" style={{ padding: 30, textAlign: "center" }}>⏳ 결재함을 불러오는 중...</div> :
              rows.length === 0 ? <div className="card" style={{ padding: 30, textAlign: "center", color: "#16a34a", fontWeight: 700 }}>✅ 확인할 기록이 없습니다.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.map(r => {
                  const id = r.Log_ID as string;
                  const st = stateOf(r);
                  const report = r.kind === "report";
                  const reqd = r.signoffs?.[REPORT_REQ];
                  return (
                    <div key={id} className="card" style={{ padding: 0, overflow: "hidden", borderLeft: `5px solid ${report ? "#dc2626" : "#3b82f6"}` }}>
                      {/* 기록 요약 */}
                      <div style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 800, padding: "2px 8px", borderRadius: 6,
                          background: report ? "#fee2e2" : "#dbeafe", color: report ? "#b91c1c" : "#1d4ed8" }}>{report ? "🚨 보고서" : "📝 데이터"}</span>
                        <b style={{ fontSize: "0.95rem" }}>{kdate(r["행동발생날짜"])}</b>
                        <b>{maskName(r["학생명"])}</b><span style={{ color: "#64748b", fontSize: "0.85rem" }}>({r["학생코드"]}) {r["학급"] || ""}</span>
                        <span style={{ color: "#334155", fontSize: "0.88rem" }}>{short(r["장소"])} · {short(r["행동유형"])} · 강도 {String(r["강도"] || "-").slice(0, 1)}</span>
                        {report && <span style={{ color: "#dc2626", fontWeight: 700, fontSize: "0.85rem" }}>{short(r["제지유형_원문"])}</span>}
                        <span style={{ marginLeft: "auto", fontSize: "0.75rem", fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: st.bg, color: st.fg }}>{st.label}</span>
                        {reqd && <span style={{ fontSize: "0.75rem", fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: "#ede9fe", color: "#6d28d9" }}>📣 학교장보고 요청됨</span>}
                      </div>

                      {/* 결재 단계 */}
                      <div style={{ padding: "10px 16px", background: "#f8fafc", borderTop: "1px solid #eef2f7", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {STEPS.map((s, i) => {
                          const done = r.signoffs?.[s.key];
                          return (
                            <React.Fragment key={s.key}>
                              {i > 0 && <span style={{ color: "#cbd5e1" }}>·</span>}
                              <button onClick={() => admin && void sign(r, s.key)} disabled={!!busy || !admin}
                                title={done ? `${done.by} · ${done.at}${admin ? " (다시 누르면 취소)" : ""}` : admin ? `${s.key} 하기` : `${s.key} 전`}
                                style={{ padding: "7px 12px", borderRadius: 8, cursor: admin ? "pointer" : "default", fontWeight: 800, fontSize: "0.85rem",
                                  border: done ? "1px solid #16a34a" : "1px solid #cbd5e1",
                                  background: done ? "#16a34a" : "#fff", color: done ? "#fff" : "#0f172a", opacity: busy === `${id}|${s.key}` ? 0.5 : 1 }}>
                                {done ? "✓" : s.icon} {s.key}{done && <span style={{ fontWeight: 500, marginLeft: 6, fontSize: "0.75rem" }}>{hm(done.at)}</span>}
                              </button>
                            </React.Fragment>
                          );
                        })}
                        {admin && <>
                        <span style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 4px" }} />
                        <button onClick={() => void sign(r, REPORT_REQ)} disabled={!!busy}
                          title={reqd ? `${reqd.by} · ${reqd.at} (다시 누르면 취소)` : "학교장에게 보고를 요청합니다"}
                          style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 800, fontSize: "0.85rem",
                            border: "1px solid #7c3aed", background: reqd ? "#7c3aed" : "#fff", color: reqd ? "#fff" : "#7c3aed" }}>
                          📣 학교장보고요청{reqd ? " ✓" : ""}
                        </button>
                        <button onClick={() => { setReviseFor(reviseFor === id ? null : id); setMemo(""); }} disabled={!!busy}
                          style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: "0.85rem", border: "1px solid #f59e0b", background: "#fff", color: "#b45309" }}>
                          ↩️ 재작성 요청
                        </button>
                        </>}
                        <button onClick={() => setOpen(open === id ? null : id)}
                          style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: "0.85rem", border: "1px solid #cbd5e1", background: "#fff" }}>
                          {open === id ? "▲ 닫기" : "▼ 상세·수정"}
                        </button>
                      </div>

                      {r.Status === "Revision Requested" && (
                        <div style={{ padding: "10px 16px", borderTop: "1px solid #eef2f7", background: "#fff7ed", color: "#9a3412", fontSize: "0.88rem" }}>
                          ↩️ <b>보완 요청:</b> {String(r["Approval_Meta"] || "").split("Memo:")[1]?.trim() || "관리자가 보완을 요청했습니다."}
                          {!admin && " — '상세·수정'에서 고친 뒤 저장하면 다시 결재가 올라갑니다."}
                        </div>
                      )}
                      {reviseFor === id && (
                        <div style={{ padding: "10px 16px", display: "flex", gap: 8, borderTop: "1px solid #eef2f7" }}>
                          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="보완할 내용 (작성자에게 보입니다)"
                            style={{ flex: 1, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
                          <button onClick={() => void revise(r)} className="btn btn-primary" disabled={!!busy}>요청 보내기</button>
                        </div>
                      )}
                      {open === id && (
                        <div style={{ padding: 16, borderTop: "1px solid #eef2f7" }}>
                          <LogDetailPanel log={r} isCrisis={report} onSaved={() => void load(true)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </AppShell>
    </AuthCheck>
  );
}
