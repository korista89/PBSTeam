"use client";

// 늘봄 참여 학생 — 늘봄실장(·관리자)이 교내 방과후에 참여하는 학생을 고른다.
// 고른 학생만 위기행동기록에서 보이고, 늘봄 시간 기록은 시간대 '11구간: 늘봄(교내 방과후)'으로 남긴다.
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import AppShell from "../components/AppShell";
import { AuthCheck } from "../components/AuthProvider";

type Row = { code: string; name: string; class: string };

export default function AfterschoolPage() {
  const [roster, setRoster] = useState<Row[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => axios.get(`${API_BASE_URL}/api/v1/afterschool/participants`).then(r => {
    setRoster(r.data.roster || []);
    const s = new Set<string>((r.data.participants || []).map((p: Row) => p.code));
    setPicked(new Set(s)); setSaved(s);
  }).catch(e => setMsg({ ok: false, text: e.response?.data?.detail || "명단을 불러오지 못했습니다." }));
  useEffect(() => { void load(); }, []);

  // 학급별로 묶어 보여 준다(검색어가 있으면 이름·코드·학급으로 거른다)
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    roster.filter(r => !q || `${r.name}${r.code}${r.class}`.includes(q)).forEach(r => {
      m.set(r.class || "학급 없음", [...(m.get(r.class || "학급 없음") || []), r]);
    });
    return Array.from(m.entries());
  }, [roster, q]);

  const toggle = (code: string) => setPicked(prev => {
    const n = new Set(prev);
    if (n.has(code)) n.delete(code); else n.add(code);
    return n;
  });
  const changed = picked.size !== saved.size || Array.from(picked).some(c => !saved.has(c));

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await axios.put(`${API_BASE_URL}/api/v1/afterschool/participants`, { codes: Array.from(picked) });
      setMsg({ ok: true, text: `늘봄 참여 학생 ${r.data.count}명을 저장했습니다.` });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.response?.data?.detail || "저장하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCheck>
      <AppShell currentPage="afterschool" title="🌙 늘봄 참여 학생" subtitle="교내 방과후(늘봄)에 참여하는 학생을 고릅니다 · 고른 학생만 위기행동기록에 나옵니다" hideDateFilter={true}
        headerActions={<button className="btn btn-primary" disabled={!changed || busy} onClick={save}>{busy ? "저장 중…" : `저장 (${picked.size}명)`}</button>}>
        <div className="card" style={{ padding: 16, marginBottom: 16, lineHeight: 1.7 }}>
          <b>늘봄 시간 기록 방법</b>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            <li>위기행동기록에서 학생을 고른 뒤 시간대를 <b>11구간: 늘봄(교내 방과후)</b>로 고릅니다.</li>
            <li>장소는 실제 장소(교실·강당 등)를 고릅니다.</li>
            <li>제지·상해가 있었으면 <b>보고서 작성</b>으로 제출합니다.</li>
          </ul>
        </div>
        {msg && <div className="card" style={{ padding: 12, marginBottom: 12, color: msg.ok ? "#047857" : "#b91c1c", fontWeight: 700 }}>{msg.text}</div>}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·학생코드·학급 검색" aria-label="학생 검색"
          style={{ width: "100%", maxWidth: 360, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 12, boxSizing: "border-box" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {groups.map(([cls, rows]) => (
            <div key={cls} className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{cls} <span style={{ color: "#64748b", fontWeight: 500 }}>({rows.filter(r => picked.has(r.code)).length}/{rows.length})</span></div>
              {rows.map(r => (
                <label key={r.code} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", minHeight: 32, cursor: "pointer" }}>
                  <input type="checkbox" checked={picked.has(r.code)} onChange={() => toggle(r.code)} style={{ width: 18, height: 18 }} />
                  <span>{r.name}</span><span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>{r.code}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </AppShell>
    </AuthCheck>
  );
}
