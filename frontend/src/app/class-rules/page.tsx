"use client";

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { API_BASE_URL, CLASS_LIST } from "../constants";
import { maskName } from "../utils";
import { useSheetLiveSync } from "../hooks/useSheetLiveSync";

interface Behavior { id: number; place: string; category: string; label: string; text: string; image: string; }
interface Catalog { categories: string[]; places: string[]; behaviors: Behavior[]; }
interface TokenStudent {
  student_code: string; name: string; token_count: number; exchanged_count: number;
  bills: string[]; used_count: number; wish: string;
}
interface TokenLogEntry { Date: string; StudentCode: string; Category: string; Delta: number | string; Author: string; CreatedAt: string; }

const TOKENS_PER_BILL = 10;
const MAX_BILLS = 5;
const CATEGORY_COLORS: Record<string, string> = { "스스로": "#2563eb", "바르게": "#059669", "안전하게": "#dc2626" };
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const billMonth = (ym: string) => { const m = Number(ym.split("-")[1]); return m ? `${m}월` : ""; };

export default function ClassRulesPage() {
  const { user, isAdmin } = useAuth();
  const [classId, setClassId] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rule, setRule] = useState<Behavior | null>(null);
  const [ruleLoaded, setRuleLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [students, setStudents] = useState<TokenStudent[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [busy, setBusy] = useState(false);
  const [wishDraft, setWishDraft] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "celebrate" | "error" } | null>(null);
  const [log, setLog] = useState<TokenLogEntry[]>([]);

  useEffect(() => {
    if (!isAdmin() && user?.class_id) setClassId(user.class_id);
  }, [user, isAdmin]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/class-rules/catalog`).then(res => setCatalog(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "celebrate" ? 3200 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchRule = useCallback(async () => {
    if (!classId) return;
    setRuleLoaded(false);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/class-rules/${classId}`);
      setRule(res.data.rule || null);
      setPicking(!res.data.rule);
    } catch { setRule(null); }
    finally { setRuleLoaded(true); }
  }, [classId]);

  const fetchTokens = useCallback(async (silent = false) => {
    if (!classId) return;
    if (!silent) setLoadingTokens(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/class-rules/${classId}/tokens`);
      const list: TokenStudent[] = res.data.students || [];
      setStudents(list);
      setSelectedCode(prev => (prev && list.some(s => s.student_code === prev)) ? prev : (list[0]?.student_code || ""));
    } catch { setStudents([]); }
    finally { if (!silent) setLoadingTokens(false); }
  }, [classId]);

  const fetchLog = useCallback(async () => {
    if (!classId) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/class-rules/${classId}/tokens/log`);
      setLog(res.data.log || []);
    } catch { setLog([]); }
  }, [classId]);

  useEffect(() => { fetchRule(); fetchTokens(); fetchLog(); }, [fetchRule, fetchTokens, fetchLog]);
  useSheetLiveSync(async () => { await Promise.all([fetchTokens(true), fetchLog()]); }, {
    enabled: Boolean(classId) && !busy && wishDraft === null,
  });

  const selected = students.find(s => s.student_code === selectedCode) || null;
  const errText = (e: any) => e?.response?.data?.detail || e?.message || "알 수 없는 오류";

  const applyBoard = (data: any) => {
    setStudents(prev => prev.map(s => s.student_code === data.student_code ? {
      ...s,
      token_count: data.token_count, exchanged_count: data.exchanged_count,
      bills: data.bills, used_count: data.used_count, wish: data.wish,
    } : s));
    if (data.exchanged_now > 0) setToast({ text: "🎉 100원 10개를 모아 1000원으로 바꿨어요!", tone: "celebrate" });
    else if (data.wallet_full) setToast({ text: "토큰판과 1000원 5장이 모두 찼어요. 1000원을 사용하면 다시 모을 수 있어요.", tone: "celebrate" });
  };

  const handleSaveRule = async () => {
    if (!pickedId) return;
    setSavingRule(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/v1/class-rules/${classId}`, { source_id: pickedId });
      setRule(res.data.rule);
      setPicking(false);
    } catch (e: any) {
      setToast({ text: "기대행동 저장 실패: " + errText(e), tone: "error" });
    } finally { setSavingRule(false); }
  };

  const handleAward = async (delta: 1 | -1) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const category = rule ? `${rule.label} ${rule.text}` : "기대행동";
      const res = await axios.post(`${API_BASE_URL}/api/v1/class-rules/${classId}/tokens/award`, { student_code: selected.student_code, category, delta });
      applyBoard(res.data);
      fetchLog();
    } catch (e: any) {
      setToast({ text: errText(e), tone: "error" });
    } finally { setBusy(false); }
  };

  const handleUseBill = async (index: number) => {
    if (!selected || busy) return;
    if (!window.confirm(`${maskName(selected.name)} 학생의 1000원 1장을 사용 처리할까요?`)) return;
    setBusy(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/v1/class-rules/${classId}/tokens/use`, { student_code: selected.student_code, index });
      applyBoard(res.data);
      fetchLog();
    } catch (e: any) {
      setToast({ text: errText(e), tone: "error" });
    } finally { setBusy(false); }
  };

  const handleSaveWish = async () => {
    if (!selected || wishDraft === null) return;
    setBusy(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/v1/class-rules/${classId}/tokens/wish`, { student_code: selected.student_code, wish: wishDraft });
      applyBoard(res.data);
      setWishDraft(null);
    } catch (e: any) {
      setToast({ text: "저장 실패: " + errText(e), tone: "error" });
    } finally { setBusy(false); }
  };

  const nameOf = (code: string) => maskName(students.find(s => s.student_code === code)?.name) || code;
  const places = catalog?.places || Array.from(new Set((catalog?.behaviors || []).map(b => b.place)));

  return (
    <AuthCheck>
      <AppShell
        currentPage="class-rules"
        title="🪙 학급 기대행동 & 토큰 강화"
        subtitle="우리 반 기대행동 1개를 정하고, 지킬 때마다 100원 토큰 → 10개 모으면 1000원 (최대 5장 보관)"
      >
        <style>{CSS}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {isAdmin() && (
            <div className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>학급 선택:</label>
              <select value={classId} onChange={e => setClassId(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1" }}>
                <option value="">-- 학급 선택 --</option>
                {CLASS_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {!classId ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>학급을 선택해주세요.</div>
          ) : (
            <>
              {/* ── 우리 반 기대행동 ───────────────────────── */}
              <div className="card" style={{ padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>📐 우리 반 기대행동</h3>
                  {rule && !picking && (
                    <button className="cr-btn cr-btn-ghost" onClick={() => { setPickedId(rule.id); setPicking(true); }}>기대행동 바꾸기</button>
                  )}
                </div>

                {!ruleLoaded ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>불러오는 중...</div>
                ) : rule && !picking ? (
                  <RuleBanner rule={rule} />
                ) : (
                  <>
                    <p style={{ margin: "0 0 14px 0", fontSize: "0.82rem", color: "#64748b" }}>
                      경은학교 기대행동 게시물 15개 중 <b>우리 반이 지금 가장 집중할 기대행동 1개</b>를 골라주세요.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {places.map(place => (
                        <div key={place}>
                          <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "#334155", marginBottom: 6 }}>📍 {place}</div>
                          <div className="cr-pick-grid">
                            {(catalog?.behaviors || []).filter(b => b.place === place).map(b => (
                              <button
                                key={b.id}
                                className={`cr-pick${pickedId === b.id ? " is-picked" : ""}`}
                                onClick={() => setPickedId(b.id)}
                                aria-pressed={pickedId === b.id}
                              >
                                <img src={b.image} alt="" />
                                <span className="cr-pick-label" style={{ color: CATEGORY_COLORS[b.category] }}>{b.label}</span>
                                <span className="cr-pick-text">{b.text}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                      <button className="cr-btn cr-btn-primary" onClick={handleSaveRule} disabled={!pickedId || savingRule}>
                        {savingRule ? "저장 중..." : "💾 이 기대행동으로 정하기"}
                      </button>
                      {rule && <button className="cr-btn cr-btn-ghost" onClick={() => setPicking(false)}>취소</button>}
                    </div>
                  </>
                )}
              </div>

              {/* ── 토큰판 · 1000원 지갑 ───────────────────── */}
              <div className="card" style={{ padding: "20px 24px" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "1.05rem", fontWeight: 800 }}>🪙 토큰판</h3>
                {loadingTokens ? (
                  <div style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>불러오는 중...</div>
                ) : students.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>학급 학생이 없습니다.</div>
                ) : (
                  <>
                    <div className="cr-chips">
                      {students.map(s => (
                        <button
                          key={s.student_code}
                          className={`cr-chip${s.student_code === selectedCode ? " is-on" : ""}`}
                          onClick={() => { setSelectedCode(s.student_code); setWishDraft(null); }}
                        >
                          <b>{maskName(s.name) || s.student_code}</b>
                          <span>🪙 {s.token_count}/10 · 💵 {s.bills.length}장</span>
                        </button>
                      ))}
                    </div>

                    {selected && (
                      <div className="cr-main">
                        <div className="cr-col">
                        {/* 토큰판 */}
                        <div className="cr-board">
                          <div className="cr-board-top">
                            <div className="cr-board-title">내가 원하는 것은</div>
                            <div
                              className="cr-wish"
                              role={wishDraft === null ? "button" : undefined}
                              tabIndex={wishDraft === null ? 0 : undefined}
                              onClick={() => wishDraft === null && setWishDraft(selected.wish)}
                              onKeyDown={e => { if (wishDraft === null && e.key === "Enter") setWishDraft(selected.wish); }}
                              title="원하는 것(강화제)을 입력하려면 누르세요"
                            >
                              {wishDraft !== null ? (
                                <span className="cr-wish-edit">
                                  <input
                                    autoFocus
                                    value={wishDraft}
                                    maxLength={40}
                                    placeholder="예: 과자, 태블릿 10분"
                                    onChange={e => setWishDraft(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") handleSaveWish(); if (e.key === "Escape") setWishDraft(null); }}
                                  />
                                  <span style={{ display: "flex", gap: 4 }}>
                                    <button type="button" className="cr-mini" onClick={handleSaveWish} disabled={busy}>저장</button>
                                    <button type="button" className="cr-mini cr-mini-ghost" onClick={() => setWishDraft(null)}>취소</button>
                                  </span>
                                </span>
                              ) : selected.wish ? (
                                <span className="cr-wish-text">{selected.wish}</span>
                              ) : (
                                <span className="cr-dot" />
                              )}
                            </div>
                          </div>
                          <div className="cr-slots">
                            {Array.from({ length: TOKENS_PER_BILL }).map((_, i) => {
                              const filled = i < selected.token_count;
                              const isNext = i === selected.token_count;
                              return (
                                <button
                                  key={i}
                                  className={`cr-slot${filled ? " is-filled" : ""}${isNext ? " is-next" : ""}`}
                                  onClick={() => isNext && handleAward(1)}
                                  disabled={busy || !isNext}
                                  aria-label={filled ? `100원 토큰 ${i + 1}` : isNext ? "100원 토큰 주기" : "빈 칸"}
                                >
                                  {filled ? <img key={`${selected.student_code}-${i}`} src="/pbs/coin-100.webp" alt="" className="cr-coin" /> : <span className="cr-dot" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 지급 버튼 */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <button className="cr-btn cr-btn-award" onClick={() => handleAward(1)} disabled={busy || selected.token_count >= TOKENS_PER_BILL}>
                            👍 100원 주기{rule ? ` · ${rule.label} ${rule.text}` : ""}
                          </button>
                          <button className="cr-btn cr-btn-ghost" onClick={() => handleAward(-1)} disabled={busy || selected.token_count === 0} title="실수로 준 토큰 1개 빼기">
                            ↩ 1개 빼기
                          </button>
                          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>토큰판의 다음 빈 칸을 눌러도 100원이 들어갑니다.</span>
                        </div>

                        </div>

                        <div className="cr-col">
                        {/* 1000원 지갑 */}
                        <div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                            <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800 }}>💵 모은 1000원 <span style={{ color: "#2563eb" }}>{selected.bills.length}</span> / {MAX_BILLS}장</h4>
                            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>사용했으면 해당 1000원의 [사용] 버튼을 누르세요.</span>
                          </div>
                          <div className="cr-wallet">
                            {Array.from({ length: MAX_BILLS }).map((_, i) => {
                              const ym = selected.bills[i];
                              return ym ? (
                                <div key={i} className="cr-bill-wrap">
                                  <div className="cr-bill">
                                    <img src="/pbs/bill-1000.webp" alt="경은은행 1000원" />
                                    <span className="cr-bill-name">{maskName(selected.name)}</span>
                                    <span className="cr-bill-month">{billMonth(ym)}</span>
                                  </div>
                                  <button className="cr-btn cr-btn-use" onClick={() => handleUseBill(i)} disabled={busy}>사용</button>
                                </div>
                              ) : (
                                <div key={i} className="cr-bill-wrap">
                                  <div className="cr-bill cr-bill-empty"><span>1000원 자리</span></div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 합계 */}
                        <div className="cr-stats">
                          <Stat label="지금 가진 돈" value={won(selected.token_count * 100 + selected.bills.length * 1000)} sub={`100원 ${selected.token_count}개 + 1000원 ${selected.bills.length}장`} />
                          <Stat label="누적 1000원 사용 금액" value={won(selected.used_count * 1000)} sub={`${selected.used_count}장 사용`} accent />
                          <Stat label="지금까지 모은 1000원" value={`${selected.exchanged_count}장`} sub={won(selected.exchanged_count * 1000)} />
                        </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 최근 기록 */}
              {log.length > 0 && (
                <div className="card" style={{ padding: "16px 20px" }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: "0.9rem", fontWeight: 700, color: "#475569" }}>📋 최근 기록</h4>
                  <div style={{ maxHeight: 180, overflowY: "auto", fontSize: "0.75rem", color: "#64748b" }}>
                    {log.slice(0, 20).map((l, i) => {
                      const d = Number(l.Delta);
                      const what = l.Category === "1000원 사용" ? "1000원 사용" : `${l.Category} · ${d > 0 ? `+${d * 100}원` : `${d * 100}원 정정`}`;
                      return (
                        <div key={i} style={{ padding: "4px 0", borderBottom: "1px dashed #e2e8f0" }}>
                          {l.CreatedAt} · {nameOf(String(l.StudentCode))} · {what} · {l.Author}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {toast && <div className={`cr-toast cr-toast-${toast.tone}`} role="status">{toast.text}</div>}
      </AppShell>
    </AuthCheck>
  );
}

function RuleBanner({ rule }: { rule: Behavior }) {
  const color = CATEGORY_COLORS[rule.category] || "#0f172a";
  return (
    <div className="cr-rule">
      <img src={rule.image} alt={`${rule.label} ${rule.text}`} />
      <div className="cr-rule-body">
        <span className="cr-rule-place">📍 {rule.place}</span>
        <div className="cr-rule-label" style={{ color }}>{rule.label}!</div>
        <div className="cr-rule-text">{rule.text}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="cr-stat" style={accent ? { borderColor: "#fdba74", background: "#fff7ed" } : undefined}>
      <div className="cr-stat-label">{label}</div>
      <div className="cr-stat-value" style={accent ? { color: "#c2410c" } : undefined}>{value}</div>
      <div className="cr-stat-sub">{sub}</div>
    </div>
  );
}

const CSS = `
.cr-btn { padding: 9px 16px; border-radius: 10px; font-weight: 800; font-size: 0.85rem; cursor: pointer; border: none; }
.cr-btn:disabled { opacity: .45; cursor: not-allowed; }
.cr-btn-primary { background: #10b981; color: #fff; }
.cr-btn-ghost { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
.cr-btn-award { background: #2563eb; color: #fff; font-size: 0.95rem; padding: 12px 20px; }
.cr-btn-use { background: #f97316; color: #fff; width: 100%; padding: 8px 0; }

.cr-pick-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.cr-pick { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 8px 10px; background: #fff; border: 2px solid #e2e8f0; border-radius: 16px; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.cr-pick:hover { border-color: #94a3b8; }
.cr-pick.is-picked { border-color: #2563eb; box-shadow: 0 0 0 4px #bfdbfe; }
.cr-pick img { width: 100%; max-width: 116px; aspect-ratio: 1; object-fit: contain; border-radius: 10px; }
.cr-pick-label { font-weight: 900; font-size: 0.95rem; }
.cr-pick-text { font-weight: 700; font-size: 0.85rem; color: #0f172a; text-align: center; word-break: keep-all; }

.cr-rule { display: flex; align-items: center; gap: 24px; padding: 16px; border: 3px solid #bae6fd; background: #f0f9ff; border-radius: 22px; }
.cr-rule img { width: 180px; max-width: 42%; aspect-ratio: 1; object-fit: contain; background: #fff; border-radius: 16px; }
.cr-rule-place { display: inline-block; padding: 4px 12px; border-radius: 999px; background: #fde4d4; font-weight: 800; font-size: 0.85rem; color: #7c2d12; }
.cr-rule-label { font-size: 2.4rem; font-weight: 900; margin-top: 8px; line-height: 1.2; }
.cr-rule-text { font-size: 2.1rem; font-weight: 900; color: #0f172a; line-height: 1.25; word-break: keep-all; }

.cr-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.cr-chip { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 14px; border-radius: 12px; border: 2px solid #e2e8f0; background: #fff; cursor: pointer; font-size: 0.85rem; }
.cr-chip span { font-size: 0.72rem; color: #64748b; }
.cr-chip.is-on { border-color: #2563eb; background: #eff6ff; }

.cr-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; margin-top: 16px; }
.cr-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
@media (min-width: 1200px) {
  .cr-main { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); align-items: start; }
  .cr-main .cr-wallet { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cr-main .cr-stats { grid-template-columns: 1fr 1fr; }
  .cr-main .cr-stats > :first-child { grid-column: 1 / -1; }
  .cr-board-title { font-size: clamp(1.1rem, 2.2vw, 2.6rem); }
  .cr-wish-text { font-size: clamp(0.8rem, 1.2vw, 1.4rem); }
}
.cr-board { border: 4px solid #111; border-radius: 28px; background: #fff; padding: clamp(12px, 2.4vw, 28px); }
.cr-board-top { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: clamp(6px, 1.2vw, 14px); align-items: center; margin-bottom: clamp(8px, 1.4vw, 16px); }
.cr-board-title { grid-column: 1 / 4; text-align: right; padding-right: 4%; font-size: clamp(1.1rem, 3.6vw, 3rem); font-weight: 900; color: #111; text-shadow: 2px 3px 3px rgba(0,0,0,.25); white-space: nowrap; }
.cr-wish { grid-column: 4 / 5; aspect-ratio: 1; border: 3px solid #0ea5e9; border-radius: 16px; background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 6px; min-width: 0; }
.cr-wish-text { font-size: clamp(0.8rem, 1.9vw, 1.6rem); font-weight: 900; color: #0f172a; word-break: keep-all; text-align: center; line-height: 1.2; }
.cr-wish-edit { display: flex; flex-direction: column; gap: 6px; width: 100%; align-items: center; }
.cr-wish-edit input { width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; box-sizing: border-box; }
.cr-mini { border: none; padding: 4px 8px; border-radius: 6px; background: #0ea5e9; color: #fff; font-size: 0.72rem; font-weight: 800; cursor: pointer; }
.cr-mini-ghost { background: #f1f5f9; color: #475569; }
.cr-slots { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: clamp(6px, 1.2vw, 14px); }
.cr-slot { aspect-ratio: 1; border: 3px solid #a1a1aa; border-radius: 14px; background: #fff; display: flex; align-items: center; justify-content: center; padding: 6%; cursor: default; }
.cr-slot:disabled { opacity: 1; }
.cr-slot.is-next:not(:disabled) { cursor: pointer; }
.cr-slot.is-next:not(:disabled):hover { border-color: #2563eb; background: #eff6ff; }
.cr-coin { width: 100%; height: 100%; object-fit: contain; animation: cr-pop .35s ease-out; }
.cr-dot { width: 26%; aspect-ratio: 1; border-radius: 50%; border: 2px dotted #a1a1aa; }
@keyframes cr-pop { 0% { transform: scale(.4); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }

.cr-wallet { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.cr-bill-wrap { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cr-bill { position: relative; aspect-ratio: 831 / 370; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(15,23,42,.25); container-type: inline-size; animation: cr-pop .35s ease-out; }
.cr-bill img { width: 100%; height: 100%; display: block; }
.cr-bill-name { position: absolute; left: 19%; top: 41%; width: 36.5%; height: 29.5%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11cqw; color: #0f172a; white-space: nowrap; overflow: hidden; }
.cr-bill-month { position: absolute; left: 87.6%; top: 86.5%; width: 11%; height: 12%; display: flex; align-items: center; font-weight: 800; font-size: 5.6cqw; color: #0f172a; white-space: nowrap; }
.cr-bill-empty { display: flex; align-items: center; justify-content: center; border: 2px dashed #cbd5e1; box-shadow: none; background: #f8fafc; color: #94a3b8; font-size: 0.75rem; font-weight: 700; animation: none; }

.cr-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.cr-stat { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 12px; padding: 12px 14px; }
.cr-stat-label { font-size: 0.75rem; color: #64748b; font-weight: 700; }
.cr-stat-value { font-size: 1.35rem; font-weight: 900; color: #0f172a; margin-top: 2px; }
.cr-stat-sub { font-size: 0.72rem; color: #94a3b8; }

.cr-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1000; padding: 14px 22px; border-radius: 14px; font-weight: 800; font-size: 1rem; box-shadow: 0 8px 24px rgba(15,23,42,.25); max-width: calc(100vw - 32px); animation: cr-pop .3s ease-out; }
.cr-toast-celebrate { background: #fef3c7; color: #78350f; border: 2px solid #f59e0b; }
.cr-toast-error { background: #fee2e2; color: #991b1b; border: 2px solid #f87171; }

@media (max-width: 900px) {
  .cr-wallet { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .cr-pick-grid { gap: 6px; }
  .cr-pick-text { font-size: 0.75rem; }
  .cr-rule { flex-direction: column; text-align: center; gap: 10px; }
  .cr-rule img { max-width: 70%; }
  .cr-rule-label { font-size: 1.8rem; }
  .cr-rule-text { font-size: 1.6rem; }
  .cr-board-title { grid-column: 1 / 4; }
  .cr-wallet { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cr-stats { grid-template-columns: 1fr; }
}
`;
