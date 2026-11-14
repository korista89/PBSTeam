"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { maskName, cicoYear } from "../utils";
import { API_BASE_URL } from "@/app/lib/api";

// CICO 관리 탭: 월별 대상자(목표 줄) 추가·해제·복원. 일일 기록은 CICO 기록 탭(/cico-record).
interface Target {
  set_row: number;
  row: number;
  code: string;
  name: string;
  class: string;
  goal: string;
  target_behavior: string;
  active: boolean;
  record_count: number;
}
interface RosterStudent { 학생코드: string; 학생이름: string; 학급: string; 재학여부?: string; }

function defaultMonth() {
  const m = new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;
  return m >= 3 && m <= 12 ? m : 3;
}

export default function CicoManagePage() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const [month, setMonth] = useState(defaultMonth);
  const [targets, setTargets] = useState<Target[]>([]);
  const [exists, setExists] = useState(true);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [pick, setPick] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/cico/targets`, { params: { month } });
      setTargets(data.targets || []);
      setExists(!!data.exists);
    } catch (e: any) {
      setStatus(`⚠ 불러오기 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!admin) return;
    axios.get(`${API_BASE_URL}/api/v1/tier/status`)
      .then(r => setRoster((r.data.students || []).filter((s: RosterStudent) => s.학생코드 && String(s.재학여부 ?? "O").trim() !== "X")))
      .catch(() => setRoster([]));
  }, [admin]);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(true);
    setStatus(`${label} 중...`);
    try {
      const res = await fn();
      setStatus(`✓ ${res?.data?.message || label + " 완료"}`);
      await load();
    } catch (e: any) {
      setStatus(`⚠ ${label} 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const syncRoster = () => run("명단 맞추기", () =>
    axios.post(`${API_BASE_URL}/api/v1/cico/generate`, { year: cicoYear(month), month }));
  const addTarget = () => pick && run("추가", () =>
    axios.post(`${API_BASE_URL}/api/v1/cico/targets`, { year: cicoYear(month), month, student_code: pick }).then(r => { setPick(""); return r; }));
  const setActive = (t: Target, active: boolean) => run(active ? "복원" : "대상 해제", () =>
    axios.post(`${API_BASE_URL}/api/v1/cico/targets/active`, { month, set_row: t.set_row, active }));

  const activeCodes = useMemo(() => new Set(targets.filter(t => t.active).map(t => t.code)), [targets]);
  const rosterByClass = useMemo(() => {
    const groups = new Map<string, RosterStudent[]>();
    [...roster].sort((a, b) => a.학생코드.localeCompare(b.학생코드)).forEach(s => {
      const key = s.학급 || "학급 미지정";
      groups.set(key, [...(groups.get(key) || []), s]);
    });
    return [...groups.entries()];
  }, [roster]);
  const sorted = useMemo(() => [...targets].sort((a, b) =>
    Number(b.active) - Number(a.active) || a.code.localeCompare(b.code) || Number(a.goal) - Number(b.goal)), [targets]);
  const activeCount = targets.filter(t => t.active).length;

  return (
    <AuthCheck>
      <AppShell
        currentPage="cico"
        title="🗂️ CICO 관리"
        subtitle="월별 CICO 대상자를 추가·해제합니다. 일일 기록과 목표 설정은 CICO 기록 탭에서 합니다"
        headerActions={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {status && (
              <span className={`badge ${status.startsWith("⚠") ? "badge-tier3" : "badge-tier1"}`} style={{ fontSize: "0.78rem" }}>{status}</span>
            )}
            <select value={month} onChange={e => { setMonth(Number(e.target.value)); setStatus(""); }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--primary-blue)", fontWeight: 700, fontSize: "0.82rem", background: "white" }}>
              {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>{String(cicoYear(m)).slice(-2)}-{String(m).padStart(2, "0")}월</option>
              ))}
            </select>
            <a href="/cico-record" className="btn btn-primary">📝 CICO 기록 →</a>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {admin ? (
            <div className="card" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 320px" }}>
                <label style={labelStyle}>학생 추가 (이미 대상이면 목표가 하나 더 생깁니다)</label>
                <select value={pick} onChange={e => setPick(e.target.value)} disabled={busy} style={inputStyle}>
                  <option value="">학생을 고르세요</option>
                  {rosterByClass.map(([cls, list]) => (
                    <optgroup key={cls} label={cls}>
                      {list.map(s => (
                        <option key={s.학생코드} value={s.학생코드}>
                          {maskName(s.학생이름)} ({s.학생코드}){activeCodes.has(s.학생코드) ? " — 목표 추가" : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button onClick={addTarget} disabled={busy || !pick} className="btn btn-primary">➕ {month}월 대상에 추가</button>
              <button onClick={syncRoster} disabled={busy} className="btn btn-secondary"
                title="Tier현황에서 CICO(O)인 학생 중 이 달 명단에 없는 학생을 넣습니다. 없는 달이면 새로 만듭니다">
                🗓️ Tier현황으로 명단 맞추기
              </button>
            </div>
          ) : (
            <div className="card" style={{ padding: 12, fontSize: "0.8rem", color: "#64748b" }}>
              대상자 추가·해제는 관리자가 합니다. 우리 반 대상자만 보입니다.
            </div>
          )}

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>
              {month}월 대상자 <span style={{ color: "#3b82f6" }}>{activeCount}줄</span>
              <span style={{ fontWeight: 500, fontSize: "0.75rem", color: "#94a3b8" }}> · 목표가 둘 이상인 학생은 목표마다 한 줄</span>
            </div>
            {loading ? (
              <p style={{ color: "#94a3b8" }}>불러오는 중...</p>
            ) : targets.length === 0 ? (
              <p style={{ color: "#94a3b8" }}>
                {exists ? "이 달 대상자가 없습니다." : `${month}월 CICO가 아직 없습니다.`}
                {admin && " 위에서 학생을 추가하거나 명단 맞추기를 누르세요."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", color: "#475569", textAlign: "left" }}>
                      {["학급", "학생", "목표", "목표행동", "기록", "상태", ""].map(h => <th key={h} style={cellStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(t => (
                      <tr key={t.set_row} style={{ opacity: t.active ? 1 : 0.55, borderTop: "1px solid #f1f5f9" }}>
                        <td style={cellStyle}>{t.class}</td>
                        <td style={cellStyle}><strong>{maskName(t.name)}</strong> <span style={{ color: "#94a3b8" }}>{t.code}</span></td>
                        <td style={cellStyle}>{t.goal}</td>
                        <td style={cellStyle}>{t.target_behavior || <span style={{ color: "#cbd5e1" }}>미설정</span>}</td>
                        <td style={cellStyle}>{t.record_count}일</td>
                        <td style={cellStyle}>
                          <span className={`badge ${t.active ? "badge-tier1" : "badge-tier3"}`} style={{ fontSize: "0.7rem" }}>{t.active ? "대상" : "해제"}</span>
                        </td>
                        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                          {t.active && <a href={`/cico-record?student=${encodeURIComponent(t.code)}`} style={{ marginRight: 8 }}>기록</a>}
                          {admin && (
                            <button onClick={() => setActive(t, !t.active)} disabled={busy} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.75rem" }}>
                              {t.active ? "대상 해제" : "복원"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 8 }}>
                  ※ 대상 해제는 기록을 지우지 않습니다. 기록 탭과 분석에서만 빠지고, 복원하면 그대로 돌아옵니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </AuthCheck>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.72rem", color: "#64748b", fontWeight: 700, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem", background: "#fff" };
const cellStyle: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
