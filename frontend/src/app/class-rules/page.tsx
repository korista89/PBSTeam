"use client";

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { API_BASE_URL, CLASS_LIST } from "../constants";
import { maskName } from "../utils";

interface Behavior { id: number; category: string; text: string; }
interface Catalog { categories: string[]; behaviors: Behavior[]; }
interface RuleState { text: string; source_id?: number; }
interface TokenStudent { student_code: string; name: string; token_count: number; exchanged_count: number; }
interface TokenLogEntry { Date: string; StudentCode: string; Category: string; Delta: number | string; Author: string; CreatedAt: string; }

const CATEGORY_COLORS: Record<string, string> = { "스스로": "#3b82f6", "바르게": "#10b981", "안전하게": "#ef4444" };
const CATEGORY_ICONS: Record<string, string> = { "스스로": "🙋", "바르게": "🤝", "안전하게": "🛡️" };

export default function ClassRulesPage() {
  const { user, isAdmin } = useAuth();
  const [classId, setClassId] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rules, setRules] = useState<Record<string, RuleState>>({});
  const [savingRules, setSavingRules] = useState(false);
  const [students, setStudents] = useState<TokenStudent[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [awardingKey, setAwardingKey] = useState<string | null>(null);
  const [log, setLog] = useState<TokenLogEntry[]>([]);

  useEffect(() => {
    if (!isAdmin() && user?.class_id) setClassId(user.class_id);
  }, [user, isAdmin]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/class-rules/catalog`).then(res => setCatalog(res.data)).catch(() => {});
  }, []);

  const fetchRules = useCallback(async () => {
    if (!classId) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/class-rules/${classId}`);
      const map: Record<string, RuleState> = {};
      (res.data.rules || []).forEach((r: any) => {
        map[r.Category] = { text: r.RuleText, source_id: r.SourceId ? Number(r.SourceId) : undefined };
      });
      setRules(map);
    } catch { setRules({}); }
  }, [classId]);

  const fetchTokens = useCallback(async () => {
    if (!classId) return;
    setLoadingTokens(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/class-rules/${classId}/tokens`);
      setStudents(res.data.students || []);
    } catch { setStudents([]); }
    finally { setLoadingTokens(false); }
  }, [classId]);

  const fetchLog = useCallback(async () => {
    if (!classId) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/class-rules/${classId}/tokens/log`);
      setLog(res.data.log || []);
    } catch { setLog([]); }
  }, [classId]);

  useEffect(() => { fetchRules(); fetchTokens(); fetchLog(); }, [fetchRules, fetchTokens, fetchLog]);

  const categories = catalog?.categories || ["스스로", "바르게", "안전하게"];

  const handleSaveRules = async () => {
    const missing = categories.filter(c => !rules[c]?.text?.trim());
    if (missing.length > 0) { alert(`${missing.join(", ")} 규칙을 선택하거나 입력해주세요.`); return; }
    setSavingRules(true);
    try {
      await axios.post(`${API_BASE_URL}/api/v1/class-rules/${classId}`, {
        rules: categories.map(c => ({ category: c, text: rules[c].text, source_id: rules[c].source_id }))
      });
      alert("학급 규칙이 저장되었습니다.");
    } catch (e: any) {
      alert("저장 실패: " + (e?.response?.data?.detail || e?.message || ""));
    } finally { setSavingRules(false); }
  };

  const handleAward = async (code: string, category: string, delta: number) => {
    const key = `${code}:${category}:${delta}`;
    setAwardingKey(key);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/v1/class-rules/${classId}/tokens/award`, { student_code: code, category, delta });
      setStudents(prev => prev.map(s => s.student_code === code ? { ...s, token_count: res.data.token_count, exchanged_count: res.data.exchanged_count } : s));
      fetchLog();
      if (res.data.exchanged_now > 0) {
        alert(`🎉 토큰 10개 모아 1000원 토큰 ${res.data.exchanged_now}개로 교환되었습니다!`);
      }
    } catch (e: any) {
      alert("토큰 지급 실패: " + (e?.response?.data?.detail || e?.message || ""));
    } finally { setAwardingKey(null); }
  };

  return (
    <AuthCheck>
      <AppShell
        currentPage="class-rules"
        title="🪙 학급 규칙 & 토큰 강화"
        subtitle="학교 기대행동과 연계된 학급 규칙 설정, 토큰판 적립 → 100원씩 모아 1000원 토큰 교환"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {isAdmin() && (
            <div className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>학급 선택:</label>
              <select value={classId} onChange={e => setClassId(e.target.value)} style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                <option value="">-- 학급 선택 --</option>
                {CLASS_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {!classId ? (
            <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>학급을 선택해주세요.</div>
          ) : (
            <>
              {/* 학급 규칙 설정 */}
              <div className="card" style={{ padding: "20px 24px" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "1.05rem", fontWeight: 800 }}>📐 학급 규칙 설정</h3>
                <p style={{ margin: "0 0 16px 0", fontSize: "0.8rem", color: "#64748b" }}>
                  학교 기대행동 15개 중 카테고리별로 1개씩 선택하거나, 우리 학급에 맞게 직접 입력해 총 3개의 학급 규칙을 만드세요.
                </p>
                <div className="responsive-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                  {categories.map(cat => {
                    const options = (catalog?.behaviors || []).filter(b => b.category === cat);
                    return (
                      <div key={cat} style={{ background: "#f8fafc", border: `1px solid ${CATEGORY_COLORS[cat] || "#e2e8f0"}40`, borderRadius: 12, padding: 14 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.9rem", color: CATEGORY_COLORS[cat] || "#0f172a", marginBottom: 8 }}>
                          {CATEGORY_ICONS[cat]} {cat}
                        </div>
                        <select
                          value={rules[cat]?.source_id ?? ""}
                          onChange={e => {
                            const b = options.find(o => String(o.id) === e.target.value);
                            if (b) setRules(prev => ({ ...prev, [cat]: { text: b.text, source_id: b.id } }));
                          }}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.78rem", marginBottom: 8, boxSizing: "border-box" }}
                        >
                          <option value="">-- 목록에서 선택 --</option>
                          {options.map(b => <option key={b.id} value={b.id}>{b.text}</option>)}
                        </select>
                        <textarea
                          value={rules[cat]?.text || ""}
                          onChange={e => setRules(prev => ({ ...prev, [cat]: { text: e.target.value, source_id: undefined } }))}
                          placeholder="또는 우리 학급 규칙을 직접 입력"
                          rows={2}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.78rem", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                        />
                      </div>
                    );
                  })}
                </div>
                <button onClick={handleSaveRules} disabled={savingRules} style={{ marginTop: 14, padding: "8px 18px", background: "#10b981", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: "0.82rem" }}>
                  {savingRules ? "저장 중..." : "💾 학급 규칙 저장"}
                </button>
              </div>

              {/* 토큰 보드 */}
              <div className="card" style={{ padding: "20px 24px" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "1.05rem", fontWeight: 800 }}>🪙 학급 토큰판</h3>
                <p style={{ margin: "0 0 16px 0", fontSize: "0.8rem", color: "#64748b" }}>
                  규칙을 지킨 학생에게 해당 카테고리 버튼을 눌러 토큰을 지급하세요. 토큰 1개 = 100원, 10개(1,000원)를 모으면 자동으로 1,000원 토큰과 교환됩니다.
                </p>
                {loadingTokens ? (
                  <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>불러오는 중...</div>
                ) : students.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>학급 학생이 없습니다.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {students.map(s => (
                      <div key={s.student_code} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fafafa", borderRadius: 10, border: "1px solid #e2e8f0", flexWrap: "wrap" }}>
                        <div style={{ minWidth: 90, fontWeight: 700, fontSize: "0.85rem" }}>{maskName(s.name) || s.student_code}</div>
                        <div style={{ display: "flex", gap: 3 }}>
                          {Array.from({ length: 10 }).map((_, i) => (
                            <span key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: i < s.token_count ? "#f59e0b" : "#e2e8f0", display: "inline-block" }} />
                          ))}
                        </div>
                        <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{s.token_count}/10 · 교환 {s.exchanged_count}회 (₩{s.exchanged_count * 1000})</span>
                        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                          {categories.map(cat => {
                            const key = `${s.student_code}:${cat}:1`;
                            return (
                              <button
                                key={cat}
                                onClick={() => handleAward(s.student_code, cat, 1)}
                                disabled={awardingKey === key}
                                title={rules[cat]?.text || cat}
                                style={{ padding: "5px 10px", background: CATEGORY_COLORS[cat], color: "white", border: "none", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                              >
                                {CATEGORY_ICONS[cat]} +1
                              </button>
                            );
                          })}
                          <button
                            onClick={() => handleAward(s.student_code, "정정", -1)}
                            disabled={awardingKey === `${s.student_code}:정정:-1`}
                            title="실수로 지급한 토큰 취소"
                            style={{ padding: "5px 8px", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: "0.72rem", cursor: "pointer" }}
                          >
                            ↩
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 최근 지급 기록 */}
              {log.length > 0 && (
                <div className="card" style={{ padding: "16px 20px" }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: "0.9rem", fontWeight: 700, color: "#475569" }}>📋 최근 지급 기록</h4>
                  <div style={{ maxHeight: 180, overflowY: "auto", fontSize: "0.75rem", color: "#64748b" }}>
                    {log.slice(0, 20).map((l, i) => (
                      <div key={i} style={{ padding: "4px 0", borderBottom: "1px dashed #e2e8f0" }}>
                        {l.CreatedAt} · {l.StudentCode} · {l.Category} · {Number(l.Delta) > 0 ? `+${l.Delta}` : l.Delta} · {l.Author}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </AppShell>
    </AuthCheck>
  );
}
