"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import { maskName } from "../utils";
import { API_BASE_URL } from "@/app/lib/api";
import {
  MonitorPanel, ProgramForm, SummaryCompare, VerdictBadge, chip, smallBtn, statusOf,
  type Monitor, type Program, type ProgramDraft, type Student, type Summary,
} from "../components/ProgramKit";

// SST 관리: 학년도 최대 6개 프로그램(월 단위 기간·대상 학생) + 운영 기간 성과(위기행동·CICO, 운영 전 대비)
const EMPTY: ProgramDraft = { name: "", type: "의사소통", start: 3, end: 5, targets: [], skills: "", staff: "", memo: "" };

export default function SstPage() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [max, setMax] = useState(6);
  const [types, setTypes] = useState<string[]>(["의사소통", "사회적 기술", "정서·자기조절", "기타"]);
  const [roster, setRoster] = useState<Student[]>([]);
  const [editing, setEditing] = useState<ProgramDraft | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPrograms = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/sst/programs`);
      setPrograms(data.programs || []);
      axios.get(`${API_BASE_URL}/api/v1/sst/summary`, { timeout: 120000 }).then(r => setSummaries(r.data.programs || [])).catch(() => setSummaries([]));
      setMax(data.max || 6);
      if (data.types) setTypes(data.types);
    } catch (e: any) {
      setStatus(`⚠ 불러오기 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPrograms(); }, [loadPrograms]);
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/tier/status`)
      .then(r => setRoster((r.data.students || []).filter((s: Student) => s.학생코드 && String(s.재학여부 ?? "O").trim() !== "X")))
      .catch(() => setRoster([]));
  }, []);
  useEffect(() => {
    if (selected == null) { setMonitor(null); return; }
    setMonitor(null);
    axios.get(`${API_BASE_URL}/api/v1/sst/programs/${selected}/monitor`)
      .then(r => setMonitor(r.data))
      .catch(e => setStatus(`⚠ 효과 자료 실패 — ${e?.response?.data?.detail || e.message}`));
  }, [selected, programs]);

  const run = async (label: string, fn: () => Promise<any>, after?: () => void) => {
    setBusy(true);
    setStatus(`${label} 중...`);
    try {
      const res = await fn();
      setStatus(`✓ ${res?.data?.message || label + " 완료"}`);
      after?.();
      await loadPrograms();
    } catch (e: any) {
      setStatus(`⚠ ${label} 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = () => editing && run("저장", () => {
    const { id, ...body } = editing;
    return id ? axios.put(`${API_BASE_URL}/api/v1/sst/programs/${id}`, body) : axios.post(`${API_BASE_URL}/api/v1/sst/programs`, body);
  }, () => setEditing(null));
  const remove = (p: Program) => {
    if (!window.confirm(`'${p.name}' 프로그램을 삭제할까요? (시트에는 '삭제' 표시로 남습니다)`)) return;
    void run("삭제", () => axios.delete(`${API_BASE_URL}/api/v1/sst/programs/${p.id}`), () => { if (selected === p.id) setSelected(null); });
  };

  const nameOf = useMemo(() => {
    const m = new Map(roster.map(s => [s.학생코드, s]));
    return (code: string) => maskName(m.get(code)?.학생이름 || "") || code;
  }, [roster]);

  return (
    <AuthCheck>
      <AppShell
        currentPage="sst"
        title="🤝 SST 관리"
        subtitle="의사소통·사회적 기술 프로그램을 월 단위로 운영하고, 위기행동·CICO 자료로 효과를 확인합니다"
        headerActions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {status && <span className={`badge ${status.startsWith("⚠") ? "badge-tier3" : "badge-tier1"}`} style={{ fontSize: "0.78rem" }}>{status}</span>}
            {admin && (
              <button className="btn btn-primary" disabled={busy || programs.length >= max} onClick={() => setEditing({ ...EMPTY })}
                title={programs.length >= max ? `학년도마다 ${max}개까지` : ""}>
                ➕ 새 프로그램 ({programs.length}/{max})
              </button>
            )}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {editing && (
            <ProgramForm value={editing} types={types} roster={roster} busy={busy} title="새 SST 프로그램"
              namePlaceholder="예: 의사소통 교육 프로그램" skillsPlaceholder="예: 도움 요청하기, 차례 기다리기"
              onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />
          )}

          {loading ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>불러오는 중...</div>
          ) : programs.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              이 학년도 SST 프로그램이 없습니다.{admin && " 오른쪽 위 ‘새 프로그램’으로 만드세요."}
            </div>
          ) : (
            <>
            <SummaryCompare items={summaries} title="📊 프로그램별 운영 기간 성과 (운영 전 대비 위기행동 변화)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {programs.map(p => {
                const st = statusOf(p);
                const active = selected === p.id;
                return (
                  <div key={p.id} className="card" style={{ padding: 14, border: active ? "2px solid #3b82f6" : undefined, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{p.name}</div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{p.type} · {p.start}월 ~ {p.end}월{p.staff && ` · ${p.staff}`}</div>
                      </div>
                      <span style={{ alignSelf: "flex-start", fontSize: "0.7rem", fontWeight: 700, color: st.color, background: `${st.color}18`, padding: "2px 8px", borderRadius: 6 }}>{st.label}</span>
                    </div>
                    {p.skills && <div style={{ fontSize: "0.75rem", color: "#334155" }}>🎯 {p.skills}</div>}
                    <div><VerdictBadge s={summaries.find(x => x.id === p.id)} /></div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {p.targets.map(c => <span key={c} style={chip("#8b5cf6")}>{nameOf(c)}</span>)}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                      <button className="btn btn-primary" style={smallBtn} onClick={() => setSelected(active ? null : p.id)}>{active ? "닫기" : "📈 효과 보기"}</button>
                      {admin && <button className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={() => setEditing({ ...p })}>수정</button>}
                      {admin && <button className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={() => remove(p)}>삭제</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}

          {selected != null && <MonitorPanel data={monitor} nameOf={nameOf} />}

          <p style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
            ※ 그 달 운영 중인 프로그램의 대상 학생이 그 달의 SST 대상입니다. 프로그램을 저장·삭제하면 이번 달 Tier현황의 SST 칸이 그 학생들만 자동으로 맞춰집니다. 월별 현황은 Tier현황 탭에서 봅니다.
          </p>
        </div>
      </AppShell>
    </AuthCheck>
  );
}

