"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { maskName } from "../utils";
import { useSheetLiveSync } from "../hooks/useSheetLiveSync";
import { API_BASE_URL } from "@/app/lib/api";
import HandoverMatch from "./HandoverMatch";

// Tier현황(월별): CICO·SST·Tier3는 그 달의 관리 탭 표(CICO관리·SST관리·Tier3관리)가 출처다.
// 여기서 CICO·Tier3를 고치면 그 표에 저장되고, 이번 달이면 TierStatus 시트의 칸(사이트 다른 화면이 읽는 거울)도 그 학생만 맞춘다.
// 이름·재학·BeAble·Tier1·메모는 월별이 아니라 TierStatus 그대로다.
type Flags = { cico: boolean; sst: boolean | string[]; t3: string };
interface Row {
  번호: number | string; 학급: string; 학생코드: string; 학생이름: string; 재학여부: string;
  BeAble코드: string; 그림말인증: number | string; Tier1: string; 변경일: string; 메모: string;
  cico: boolean; sst: string[]; t3: string; prev: Flags | null; now: Flags;
}
interface Overview {
  month: number; prev_month: number | null; is_current: boolean;
  ready: { cico: boolean; sst: boolean; t3: boolean }; prev_ready: { cico: boolean; sst: boolean; t3: boolean } | null;
  sst_programs: number; students: Row[];
}
interface Diff { code: string; name: string; class: string; col: string; from: string; to: string; }

const SCHOOL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
const nowMonth = () => new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;
const COURSE: Record<string, string> = { "1": "유치원", "2": "초등", "3": "중학교", "4": "고등", "5": "전공과", "6": "예비" };

export default function TierStatusPage() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const router = useRouter();
  const [month, setMonth] = useState(nowMonth);
  const [data, setData] = useState<Overview | null>(null);
  const [diff, setDiff] = useState<Diff[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{
    code: string; name: string; enrolled: string; beable: string; tier1: string; memo: string; cico: boolean; t3: string;
  } | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/tier-monthly/overview`, { params: { month } });
      setData(data);
      if (admin && data.is_current) {
        const r = await axios.get(`${API_BASE_URL}/api/v1/tier-monthly/mirror`);
        setDiff(r.data.diff || []);
      } else setDiff(null);
    } catch (e: any) {
      setErrorMsg(`학생 지원 단계를 불러올 수 없습니다. (${e?.response?.data?.detail || e.message})`);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [month, admin]);
  useEffect(() => { void fetchAll(); }, [fetchAll]);
  useSheetLiveSync(() => fetchAll(true), { enabled: editing === null && !saving });

  const run = async (label: string, fn: () => Promise<any>) => {
    setSaving(true);
    setStatus(`${label} 중...`);
    try {
      const res = await fn();
      const m = res?.data?.mirror;
      const mirrored = m?.changed ? ` · Tier현황 ${m.changed}칸 맞춤` : "";
      setStatus(`✓ ${res?.data?.message || label + " 완료"}${mirrored}`);
      await fetchAll(true);
    } catch (e: any) {
      setStatus(`⚠ ${label} 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 표에 보일 이 달 값: 그 단계 표가 있으면 월별 값, 없으면 이번 달만 Tier현황(지금) 값을 흐리게
  const ready = data?.ready;
  const view = (s: Row) => ({
    cico: ready?.cico ? s.cico : data?.is_current ? s.now.cico : null,
    sst: ready?.sst ? s.sst.length > 0 : data?.is_current ? !!s.now.sst : null,
    t3: ready?.t3 ? s.t3 : data?.is_current ? s.now.t3 : null,
  });

  const save = async () => {
    if (!editing || !data) return;
    const s = data.students.find(x => x.학생코드 === editing.code);
    if (!s) return;
    await run("저장", async () => {
      await axios.put(`${API_BASE_URL}/api/v1/tier/status/unified`, {
        code: editing.code, tier1: editing.tier1, memo: editing.memo, enrolled: editing.enrolled,
        beable_code: editing.beable, student_name: editing.name,
      });
      const v = view(s);
      const body: Record<string, unknown> = { month, code: editing.code };
      if (editing.cico !== !!v.cico) body.cico = editing.cico;
      if (editing.t3 !== (v.t3 || "")) body.t3 = editing.t3;
      if ("cico" in body || "t3" in body) return axios.post(`${API_BASE_URL}/api/v1/tier-monthly/student`, body);
      return { data: { message: "저장했습니다." } };
    });
    setEditing(null);
  };

  if (loading || !data) {
    return (
      <AuthCheck>
        <AppShell currentPage="tier-status" title="📋 전교생 Tier 지원 단계 현황">
          <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>
            {errorMsg ? <p style={{ color: "var(--tier3-text)", fontWeight: 700 }}>⚠️ {errorMsg}</p> : <p style={{ fontWeight: 700 }}>⏳ 학생 지원 단계를 불러오고 있습니다...</p>}
          </div>
        </AppShell>
      </AuthCheck>
    );
  }

  const students = data.students;
  const enrolled = students.filter(s => s.재학여부 === "O").length;
  const filtered = students.filter(s => {
    const v = view(s);
    if (filter === "Tier1" && (v.cico || v.sst || v.t3)) return false;
    if (filter === "Tier2(CICO)" && !v.cico) return false;
    if (filter === "Tier2(SST)" && !v.sst) return false;
    if (filter === "Tier3" && !v.t3) return false;
    if (filter === "Tier3+" && v.t3 !== "Tier3+") return false;
    if (courseFilter !== "all" && COURSE[s.학생코드?.[0]] !== courseFilter) return false;
    return true;
  });
  const missing = [!data.ready.cico && month >= 3 && month <= 12 && "CICO", !data.ready.t3 && "Tier3"].filter(Boolean) as string[];
  const ox = (on: boolean | null, cls: string, title?: string) =>
    on === null ? <span style={{ color: "#cbd5e1" }}>-</span> : <span className={`badge ${on ? cls : "badge-neutral"}`} title={title}>{on ? "O" : "X"}</span>;
  const changeMark = (s: Row, key: "cico" | "t3") => {
    if (!s.prev || !data.prev_ready || !data.ready[key] || !data.prev_ready[key]) return null;
    const was = key === "cico" ? s.prev.cico : !!s.prev.t3;
    const is = key === "cico" ? s.cico : !!s.t3;
    if (was === is) return null;
    return <span style={{ fontSize: "0.6rem", fontWeight: 800, color: is ? "#10b981" : "#94a3b8", marginLeft: 2 }}>{is ? "신규" : "종료"}</span>;
  };
  const sel = { padding: "3px 4px", fontSize: "0.75rem" } as React.CSSProperties;

  return (
    <AuthCheck>
      <AppShell
        currentPage="tier-status"
        title="📋 전교생 Tier 지원 단계 현황"
        subtitle={`${month}월 기준 · 재학생 ${enrolled}명 · 전체 ${students.length}명 · CICO·SST·Tier3는 각 관리 탭의 월별 표가 출처`}
        headerActions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {status && <span className={`badge ${status.startsWith("⚠") ? "badge-tier3" : "badge-tier1"}`} style={{ fontSize: "0.78rem" }}>{status}</span>}
            <select value={month} onChange={e => { setMonth(Number(e.target.value)); setEditing(null); setStatus(""); }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--primary-blue)", fontWeight: 700, fontSize: "0.82rem", background: "white" }}>
              {SCHOOL_MONTHS.map(m => <option key={m} value={m}>{m}월{m === nowMonth() ? " (이번 달)" : ""}</option>)}
            </select>
            <button onClick={() => void fetchAll()} className="btn btn-secondary">🔄 새로고침</button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!admin && (
            <div style={{ padding: "10px 14px", backgroundColor: "var(--tier2-bg)", borderRadius: 8, border: "1px solid #fde68a", color: "var(--tier2-text)", fontSize: "0.82rem" }}>
              🔒 담임교사는 배정 학급 학생을 조회할 수 있고, Tier 수정은 관리자가 합니다.
            </div>
          )}

          {/* 이 달 표 상태 */}
          <div className="card" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: "0.8rem" }}>
            <strong>{month}월 표</strong>
            <Pill ok={data.ready.cico || month < 3} label={month < 3 ? "CICO 운영 안 함" : `CICO ${data.ready.cico ? "있음" : "없음"}`} href="/cico" />
            <Pill ok={data.ready.sst} label={`SST 프로그램 ${data.sst_programs}개`} href="/sst" />
            <Pill ok={data.ready.t3} label={`Tier3 명단 ${data.ready.t3 ? "있음" : "없음"}`} href="/tier3" />
            {missing.length > 0 && (
              <span style={{ color: "#64748b" }}>
                {data.is_current ? "· 표가 없는 단계는 Tier현황(지금) 값을 흐리게 보여 줍니다." : "· 표가 없는 단계는 ‘-’로 보입니다."}
              </span>
            )}
            {admin && missing.length > 0 && data.prev_month && (
              <button className="btn btn-primary" style={{ padding: "4px 12px", fontSize: "0.78rem", marginLeft: "auto" }} disabled={saving}
                onClick={() => {
                  if (!window.confirm(`${missing.join("·")} 표를 ${data.prev_month}월 그대로 만들어 ${month}월을 시작할까요?`)) return;
                  void run(`${month}월 시작`, () => axios.post(`${API_BASE_URL}/api/v1/tier-monthly/start`, { month }));
                }}>
                📋 {data.prev_month}월 그대로 {month}월 시작하기 ({missing.join("·")})
              </button>
            )}
          </div>

          {/* 이번 달 거울 차이 */}
          {admin && data.is_current && diff && diff.length > 0 && (
            <div className="card" style={{ padding: 14, border: "1.5px solid #f59e0b" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ color: "#b45309" }}>⚠ Tier현황 시트와 {month}월 월별 표가 다른 칸 {diff.length}개</strong>
                <button className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: "0.78rem" }} disabled={saving}
                  onClick={() => {
                    if (!window.confirm(`Tier현황 시트의 ${diff.length}칸을 ${month}월 월별 표에 맞춥니다. 대시보드·브리핑·CICO 판정이 이 값을 씁니다. 진행할까요?`)) return;
                    void run("Tier현황 맞추기", () => axios.post(`${API_BASE_URL}/api/v1/tier-monthly/mirror`));
                  }}>
                  월별 표대로 모두 반영
                </button>
              </div>
              <p style={{ fontSize: "0.72rem", color: "#64748b", margin: "6px 0" }}>
                사이트의 다른 화면은 Tier현황 시트 칸을 읽습니다. 월별 표가 맞으면 ‘모두 반영’, 시트가 맞으면 해당 관리 탭(CICO관리·SST관리·Tier3관리)에서 월별 표를 고치세요.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: "0.75rem" }}>
                {diff.map(d => (
                  <span key={d.code + d.col} style={{ padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e" }}>
                    {maskName(d.name) || d.code} {d.col} {d.from}→{d.to}
                  </span>
                ))}
              </div>
            </div>
          )}

          {admin && <HandoverMatch students={students} />}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select value={filter} onChange={e => setFilter(e.target.value)} className="form-select">
              <option value="all">전체 Tier</option>
              <option value="Tier1">Tier 1만</option>
              <option value="Tier2(CICO)">Tier2(CICO)</option>
              <option value="Tier2(SST)">Tier2(SST)</option>
              <option value="Tier3">Tier 3 (3+ 포함)</option>
              <option value="Tier3+">Tier 3+</option>
            </select>
            <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className="form-select">
              <option value="all">전체 과정</option>
              {["유치원", "초등", "중학교", "고등", "전공과"].map(c => <option key={c}>{c}</option>)}
            </select>
            <span className="badge badge-neutral">표시: {filtered.length}명</span>
          </div>

          <div className="table-container">
            <table className="dense-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: "center" }}>번호</th>
                  <th style={{ width: 100 }}>학급</th>
                  <th style={{ width: 70, textAlign: "center" }}>학생코드</th>
                  <th style={{ width: 90, textAlign: "center" }}>학생이름</th>
                  <th style={{ width: 50, textAlign: "center" }}>재학</th>
                  <th style={{ width: 80, textAlign: "center" }}>BeAble</th>
                  <th style={{ width: 70, textAlign: "center" }}>그림말인증</th>
                  <th style={{ width: 55, textAlign: "center", background: "var(--tier1-bg)", color: "var(--tier1-text)" }}>Tier1</th>
                  <th style={{ width: 85, textAlign: "center", background: "var(--tier2-bg)", color: "var(--tier2-text)" }}>CICO</th>
                  <th style={{ width: 85, textAlign: "center", background: "var(--primary-light)", color: "var(--primary-blue)" }}>SST</th>
                  <th style={{ width: 90, textAlign: "center", background: "var(--tier3-bg)", color: "var(--tier3-text)" }}>Tier3 / 3+</th>
                  <th style={{ width: 80, textAlign: "center" }}>변경일</th>
                  <th style={{ width: 140 }}>메모</th>
                  <th style={{ width: 60, textAlign: "center" }}>상세분석</th>
                  {admin && <th style={{ width: 80, textAlign: "center" }}>관리</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const v = view(s);
                  const e = editing?.code === s.학생코드 ? editing : null;
                  const dim = (k: "cico" | "sst" | "t3") => (!data.ready[k] ? { opacity: 0.5 } : undefined);
                  return (
                    <tr key={s.학생코드} style={{ opacity: s.재학여부 === "X" ? 0.5 : 1 }}>
                      <td style={{ textAlign: "center" }}>{s.번호}</td>
                      <td>{s.학급}</td>
                      <td style={{ textAlign: "center", fontFamily: "monospace" }}>{s.학생코드}</td>
                      <td style={{ textAlign: "center" }}>
                        {e ? <input value={e.name} onChange={x => setEditing({ ...e, name: x.target.value })} className="form-input" style={{ width: 70, padding: "3px 6px" }} />
                          : <span style={{ fontWeight: 700 }}>{maskName(s.학생이름) || s.학생코드}</span>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {e ? <select value={e.enrolled} onChange={x => setEditing({ ...e, enrolled: x.target.value })} className="form-select" style={sel}><option>O</option><option>X</option></select>
                          : <span className={`badge ${s.재학여부 === "O" ? "badge-tier1" : "badge-neutral"}`}>{s.재학여부}</span>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {e ? <input value={e.beable} onChange={x => setEditing({ ...e, beable: x.target.value })} className="form-input" style={{ width: 70, padding: "3px 6px" }} />
                          : s.BeAble코드 || "-"}
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: "var(--primary-navy)" }}>{s.그림말인증 ?? 0} / 13</td>
                      <td style={{ textAlign: "center", background: "var(--tier1-bg)" }}>
                        {e ? <select value={e.tier1} onChange={x => setEditing({ ...e, tier1: x.target.value })} className="form-select" style={sel}><option>O</option><option>X</option></select>
                          : ox(s.Tier1 === "O", "badge-tier1")}
                      </td>
                      <td style={{ textAlign: "center", background: "var(--tier2-bg)", ...dim("cico") }}>
                        {e && month >= 3 && month <= 12
                          ? <select value={e.cico ? "O" : "X"} onChange={x => setEditing({ ...e, cico: x.target.value === "O" })} className="form-select" style={sel}><option>O</option><option>X</option></select>
                          : <>{ox(v.cico, "badge-tier2")}{changeMark(s, "cico")}</>}
                      </td>
                      <td style={{ textAlign: "center", background: "var(--primary-light)", ...dim("sst") }}>
                        {e ? <a href="/sst" style={{ fontSize: "0.7rem" }} title="SST는 SST관리의 프로그램 대상으로 정합니다">SST관리 →</a>
                          : ox(v.sst, "badge-info", s.sst.join(", ") || undefined)}
                      </td>
                      <td style={{ textAlign: "center", background: "var(--tier3-bg)", ...dim("t3") }}>
                        {e ? (
                          <select value={e.t3} onChange={x => setEditing({ ...e, t3: x.target.value })} className="form-select" style={sel}>
                            <option value="">없음</option><option>Tier3</option><option>Tier3+</option>
                          </select>
                        ) : v.t3 === null ? <span style={{ color: "#cbd5e1" }}>-</span> : v.t3 ? (
                          <span className={`badge ${v.t3 === "Tier3+" ? "badge-tier3-plus" : "badge-tier3"}`}>{v.t3}</span>
                        ) : <span className="badge badge-neutral">X</span>}
                        {!e && changeMark(s, "t3")}
                      </td>
                      <td style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--text-muted)" }}>{s.변경일 || "-"}</td>
                      <td style={{ fontSize: "0.8rem", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e ? <input value={e.memo} onChange={x => setEditing({ ...e, memo: x.target.value })} className="form-input" style={{ width: "100%", padding: "3px 6px" }} />
                          : s.메모 || "-"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button onClick={() => router.push(`/student/${encodeURIComponent(s.학생코드)}`)} className="btn btn-secondary" style={{ padding: "4px 8px" }}>📊</button>
                      </td>
                      {admin && (
                        <td style={{ textAlign: "center" }}>
                          {e ? (
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              <button onClick={() => void save()} disabled={saving} className="btn btn-primary" style={{ padding: "3px 8px", fontSize: "0.72rem" }}>{saving ? "..." : "저장"}</button>
                              <button onClick={() => setEditing(null)} className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: "0.72rem" }}>취소</button>
                            </div>
                          ) : (
                            <button className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.72rem" }} disabled={saving}
                              onClick={() => setEditing({
                                code: s.학생코드, name: s.학생이름 || "", enrolled: s.재학여부 || "O", beable: s.BeAble코드 || "",
                                tier1: s.Tier1 || "O", memo: s.메모 || "", cico: !!v.cico, t3: v.t3 || "",
                              })}>편집</button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
            ※ ‘신규·종료’는 {data.prev_month ? `${data.prev_month}월` : "지난달"} 대비입니다. CICO·Tier3를 여기서 고치면 {month}월 CICO관리·Tier3관리 표에 저장됩니다. SST는 SST관리의 프로그램 대상으로 정합니다.
          </p>
        </div>
      </AppShell>
    </AuthCheck>
  );
}

function Pill({ ok, label, href }: { ok: boolean; label: string; href: string }) {
  return (
    <a href={href} style={{ padding: "2px 10px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: "0.75rem",
      background: ok ? "#dcfce7" : "#f1f5f9", color: ok ? "#166534" : "#64748b" }}>
      {ok ? "✓ " : "○ "}{label}
    </a>
  );
}
