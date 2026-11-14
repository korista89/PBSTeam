"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { maskName } from "../utils";
import { API_BASE_URL } from "@/app/lib/api";
import {
  MonitorPanel, ProgramForm, SummaryCompare, VerdictBadge, smallBtn, statusOf, nowMonth,
  type Monitor, type Program, type ProgramDraft, type Student, type Summary,
} from "../components/ProgramKit";

// Tier3+ 관리: 개별학생 지역사회·외부 연계 프로그램(1개 = 학생 1명, 학년도 최대 20개)과 운영 기간 성과.
// Tier3+ '단계'는 Tier3관리 월별 명단이 출처이고, 여기서는 운영 중인 학생의 단계가 다르면 알려만 준다.
const ACCENT = "#7f1d1d";
const EMPTY: ProgramDraft = { name: "", type: "의료 협력(진료·약물)", start: nowMonth(), end: nowMonth(), targets: [], skills: "", staff: "", memo: "", agency: "" };
type Roster = Student & { Tier3?: string; "Tier3+"?: string };

export default function Tier3PlusPage() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [max, setMax] = useState(20);
  const [types, setTypes] = useState<string[]>([]);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [onlyT3, setOnlyT3] = useState(true);
  const [editing, setEditing] = useState<ProgramDraft | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [check, setCheck] = useState<{ program: string; code: string; level: string }[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/tier3plus/programs`);
      setPrograms((data.programs || []).sort((a: Program, b: Program) => (a.targets[0] || "").localeCompare(b.targets[0] || "")));
      setMax(data.max || 20);
      setTypes(data.types || []);
      axios.get(`${API_BASE_URL}/api/v1/tier3plus/summary`, { timeout: 120000 }).then(r => setSummaries(r.data.programs || [])).catch(() => setSummaries([]));
      if (admin) axios.get(`${API_BASE_URL}/api/v1/tier3plus/level-check`, { params: { month: nowMonth() } }).then(r => setCheck(r.data.items || [])).catch(() => setCheck([]));
    } catch (e: any) {
      setStatus(`⚠ 불러오기 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  }, [admin]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/tier/status`)
      .then(r => setRoster((r.data.students || []).filter((s: Roster) => s.학생코드 && String(s.재학여부 ?? "O").trim() !== "X")))
      .catch(() => setRoster([]));
  }, []);
  useEffect(() => {
    if (selected == null) { setMonitor(null); return; }
    setMonitor(null);
    axios.get(`${API_BASE_URL}/api/v1/tier3plus/programs/${selected}/monitor`)
      .then(r => setMonitor(r.data))
      .catch(e => setStatus(`⚠ 성과 자료 실패 — ${e?.response?.data?.detail || e.message}`));
  }, [selected, programs]);

  const run = async (label: string, fn: () => Promise<any>, after?: () => void) => {
    setBusy(true);
    setStatus(`${label} 중...`);
    try {
      const res = await fn();
      setStatus(`✓ ${res?.data?.message || label + " 완료"}`);
      after?.();
      await load();
    } catch (e: any) {
      setStatus(`⚠ ${label} 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const save = () => editing && run("저장", () => {
    const { id, ...body } = editing;
    return id ? axios.put(`${API_BASE_URL}/api/v1/tier3plus/programs/${id}`, body) : axios.post(`${API_BASE_URL}/api/v1/tier3plus/programs`, body);
  }, () => setEditing(null));
  const remove = (p: Program) => {
    if (!window.confirm(`'${p.name}' 프로그램을 삭제할까요? (시트에는 '삭제' 표시로 남습니다)`)) return;
    void run("삭제", () => axios.delete(`${API_BASE_URL}/api/v1/tier3plus/programs/${p.id}`), () => { if (selected === p.id) setSelected(null); });
  };

  const byCode = useMemo(() => new Map(roster.map(s => [s.학생코드, s])), [roster]);
  const nameOf = (code: string) => maskName(byCode.get(code)?.학생이름 || "") || code;
  const formRoster = onlyT3 ? roster.filter(s => s.Tier3 === "O" || s["Tier3+"] === "O" || editing?.targets.includes(s.학생코드)) : roster;
  const studentsWith = new Set(programs.flatMap(p => p.targets)).size;

  return (
    <AuthCheck>
      <AppShell
        currentPage="tier3plus"
        title="🏥 Tier3+ 관리"
        subtitle="Tier3+ 학생의 지역사회·외부 연계 개별 프로그램을 월 단위로 운영하고, 위기행동·강도·CICO로 성과를 확인합니다"
        headerActions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {status && <span className={`badge ${status.startsWith("⚠") ? "badge-tier3" : "badge-tier1"}`} style={{ fontSize: "0.78rem" }}>{status}</span>}
            {admin && (
              <button className="btn btn-primary" disabled={busy || programs.length >= max} onClick={() => setEditing({ ...EMPTY, type: types[0] || EMPTY.type })}
                title={programs.length >= max ? `학년도마다 ${max}개까지` : ""}>
                ➕ 새 개별 프로그램 ({programs.length}/{max})
              </button>
            )}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {editing && (
            <>
              <label style={{ fontSize: "0.78rem", color: "#475569", display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={onlyT3} onChange={e => setOnlyT3(e.target.checked)} /> 대상 학생 목록에 Tier3·Tier3+ 학생만 보기(Tier현황 기준)
              </label>
              <ProgramForm value={editing} types={types} roster={formRoster} busy={busy} single title="새 Tier3+ 개별 프로그램" accent={ACCENT}
                namePlaceholder="예: 소아정신과 진료 연계" skillsLabel="목표" skillsPlaceholder="예: 자해행동 주 3회 → 1회 이하, 약물 조정 후 안정"
                staffPlaceholder="예: 담임·보건교사·특수교육지원센터" showAgency
                onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />
            </>
          )}

          {admin && check.length > 0 && (
            <div className="card" style={{ padding: 12, border: "1.5px solid #f59e0b", fontSize: "0.78rem" }}>
              <strong style={{ color: "#b45309" }}>ⓘ 이번 달 운영 중인 프로그램 학생 {check.length}명의 Tier3관리 단계가 Tier3+가 아닙니다</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {check.map(c => <span key={c.code + c.program} style={{ padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e" }}>{nameOf(c.code)} · 지금 {c.level}</span>)}
              </div>
              <div style={{ color: "#64748b", marginTop: 6 }}>단계는 <a href="/tier3">Tier3관리</a>에서 정합니다(여기서 자동으로 바꾸지 않음).</div>
            </div>
          )}

          {loading ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>불러오는 중...</div>
          ) : programs.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              이 학년도 Tier3+ 개별 프로그램이 없습니다.{admin && " 오른쪽 위 ‘새 개별 프로그램’으로 만드세요."}
            </div>
          ) : (
            <>
              <div style={{ fontSize: "0.8rem", color: "#475569" }}>프로그램 {programs.length}개 · 학생 {studentsWith}명 · 운영 중 {programs.filter(p => statusOf(p).label === "운영 중").length}개</div>
              <SummaryCompare items={summaries} title="📊 학생별 프로그램 성과 (운영 전 대비 위기행동 변화)" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {programs.map(p => {
                  const st = statusOf(p);
                  const active = selected === p.id;
                  const code = p.targets[0] || "";
                  return (
                    <div key={p.id} className="card" style={{ padding: 14, border: active ? `2px solid ${ACCENT}` : undefined, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: "0.95rem", fontWeight: 900, color: ACCENT }}>👤 {nameOf(code)} <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 500 }}>{byCode.get(code)?.학급}</span></div>
                          <div style={{ fontWeight: 800, marginTop: 2 }}>{p.name}</div>
                          <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{p.type} · {p.start}월 ~ {p.end}월</div>
                        </div>
                        <span style={{ alignSelf: "flex-start", fontSize: "0.7rem", fontWeight: 700, color: st.color, background: `${st.color}18`, padding: "2px 8px", borderRadius: 6 }}>{st.label}</span>
                      </div>
                      {p.agency && <div style={{ fontSize: "0.75rem", color: "#334155" }}>🏥 {p.agency}</div>}
                      {p.skills && <div style={{ fontSize: "0.75rem", color: "#334155" }}>🎯 {p.skills}</div>}
                      {p.staff && <div style={{ fontSize: "0.72rem", color: "#64748b" }}>담당 {p.staff}</div>}
                      <div><VerdictBadge s={summaries.find(x => x.id === p.id)} /></div>
                      <div style={{ display: "flex", gap: 6, marginTop: "auto", flexWrap: "wrap" }}>
                        <button className="btn btn-primary" style={smallBtn} onClick={() => setSelected(active ? null : p.id)}>{active ? "닫기" : "📈 성과 보기"}</button>
                        <a className="btn btn-secondary" style={smallBtn} href={`/target-behavior?student=${encodeURIComponent(code)}`}>행동중재</a>
                        {admin && <button className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={() => setEditing({ ...p })}>수정</button>}
                        {admin && <button className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={() => remove(p)}>삭제</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {selected != null && <MonitorPanel data={monitor} nameOf={nameOf} accent={ACCENT} />}

          <p style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
            ※ 한 프로그램은 학생 한 명입니다. 한 학생에게 여러 연계(예: 진료 + 지원단)가 있으면 프로그램을 따로 만듭니다. 성과는 운영 전 1개월 대비 운영 중 위기행동 기록·강도·CICO 수행률로 봅니다.
          </p>
        </div>
      </AppShell>
    </AuthCheck>
  );
}
