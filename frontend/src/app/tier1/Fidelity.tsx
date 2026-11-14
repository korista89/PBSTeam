"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/app/lib/api";
import { inputStyle } from "../components/ProgramKit";
import { ACCENT, type Plan } from "./shared";

// 운영계획 마) 핵심 실행 항목별 실행충실도 체크리스트, 학기별 1회 이상 점검, 80% 미만 학급 지원
interface Row { class: string; scores: (number | null)[]; pct: number | null; checker: string; date: string; memo: string; needs_support: boolean; }
interface Data { semester: number; items: { area: string; text: string }[]; classes: Row[]; done: number; mean: number | null; by_item: (number | null)[]; }

const SCORE_COLOR = ["#fecaca", "#fef08a", "#bbf7d0"];

export default function Tier1Fidelity({ plan, onStatus }: { plan: Plan; onStatus: (s: string) => void }) {
  const [semester, setSemester] = useState(() => { const m = new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1; return m >= 3 && m <= 8 ? 1 : 2; });
  const [data, setData] = useState<Data | null>(null);
  const [edit, setEdit] = useState<{ cls: string; scores: (number | null)[]; memo: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setData(null);
    axios.get(`${API_BASE_URL}/api/v1/tier1/fidelity`, { params: { semester } }).then(r => setData(r.data))
      .catch(e => onStatus(`⚠ 불러오기 실패 — ${e?.response?.data?.detail || e.message}`));
  }, [semester, onStatus]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    if (edit.scores.some(s => s == null)) { onStatus("⚠ 모든 문항을 점검해 주세요."); return; }
    setBusy(true);
    try {
      const r = await axios.post(`${API_BASE_URL}/api/v1/tier1/fidelity`, { semester, class_name: edit.cls, scores: edit.scores, memo: edit.memo });
      onStatus(`✓ ${edit.cls} ${r.data.message}`);
      setEdit(null);
      load();
    } catch (e: any) {
      onStatus(`⚠ 저장 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const items = plan.fidelity_items;
  const editPct = edit && edit.scores.every(s => s != null) ? Math.round((edit.scores as number[]).reduce((a, b) => a + b, 0) / (2 * items.length) * 1000) / 10 : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={semester} onChange={e => setSemester(Number(e.target.value))} style={{ ...inputStyle, width: 100 }}>
          <option value={1}>1학기</option><option value={2}>2학기</option>
        </select>
        <span style={{ fontSize: "0.85rem" }}>점검 <strong>{data?.done ?? "-"}/{data?.classes.length ?? "-"}</strong>학급 · 학교 평균 <strong style={{ color: (data?.mean ?? 0) >= plan.fidelity_threshold ? ACCENT : "#f59e0b" }}>{data?.mean ?? "-"}%</strong> · 지원 필요 <strong style={{ color: "#dc2626" }}>{data?.classes.filter(c => c.needs_support).length ?? "-"}</strong>학급</span>
        <span style={{ fontSize: "0.72rem", color: "#64748b" }}>학기마다 1회 이상 담임 자체점검 또는 행동중재지원팀 점검. 0 미실행 · 1 부분 실행 · 2 실행, {plan.fidelity_threshold}% 미만이면 지원 필요.</span>
      </div>

      {edit && (
        <div className="card" style={{ padding: 16, border: `2px solid ${ACCENT}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong>{edit.cls} · {semester}학기 실행충실도 점검</strong>
            <span style={{ fontWeight: 900, color: (editPct ?? 0) >= plan.fidelity_threshold ? ACCENT : "#dc2626" }}>{editPct ?? "-"}%</span>
          </div>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.7rem", color: "#64748b", width: 80 }}>{i + 1}. {it.area}</span>
              <span style={{ flex: "1 1 260px", fontSize: "0.82rem" }}>{it.text}</span>
              <span style={{ display: "flex", gap: 4 }}>
                {plan.fidelity_scale.map(([v, label]) => (
                  <button key={v} type="button" onClick={() => { const s = [...edit.scores]; s[i] = v; setEdit({ ...edit, scores: s }); }}
                    style={{ padding: "4px 10px", borderRadius: 8, cursor: "pointer", fontSize: "0.75rem", fontWeight: edit.scores[i] === v ? 800 : 400,
                      border: edit.scores[i] === v ? "1.5px solid #334155" : "1px solid #e2e8f0", background: edit.scores[i] === v ? SCORE_COLOR[v] : "#fff" }}>
                    {v} {label}
                  </button>
                ))}
              </span>
            </div>
          ))}
          <input value={edit.memo} onChange={e => setEdit({ ...edit, memo: e.target.value })} placeholder="피드백·지원 계획 메모" style={{ ...inputStyle, marginTop: 10 }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn btn-secondary" onClick={() => setEdit(null)} disabled={busy}>취소</button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>저장</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12, overflowX: "auto" }}>
        {!data ? <p style={{ color: "#94a3b8", textAlign: "center" }}>불러오는 중...</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", color: "#475569" }}>
                <th style={th}>학급</th>
                {items.map((it, i) => <th key={i} style={{ ...th, textAlign: "center" }} title={it.text}>{i + 1}</th>)}
                <th style={th}>충실도</th><th style={th}>점검</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {data.classes.map(r => (
                <tr key={r.class} style={{ borderTop: "1px solid #f1f5f9", background: r.needs_support ? "#fef2f2" : undefined }}>
                  <td style={{ ...th, fontWeight: 700 }}>{r.class}</td>
                  {r.scores.map((s, i) => <td key={i} style={{ ...th, textAlign: "center", background: s == null ? undefined : SCORE_COLOR[s] }}>{s ?? ""}</td>)}
                  <td style={{ ...th, fontWeight: 900, color: r.pct == null ? "#cbd5e1" : r.needs_support ? "#dc2626" : ACCENT }}>{r.pct ?? "미점검"}{r.pct != null ? "%" : ""}</td>
                  <td style={{ ...th, color: "#94a3b8", fontSize: "0.7rem" }}>{r.date ? `${r.date} ${r.checker}` : ""}</td>
                  <td style={th}>
                    <button className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.72rem" }} disabled={busy}
                      onClick={() => setEdit({ cls: r.class, scores: r.pct == null ? items.map(() => null) : r.scores, memo: r.memo })}>{r.pct == null ? "점검" : "다시 점검"}</button>
                  </td>
                </tr>
              ))}
              {data.done > 0 && (
                <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                  <td style={{ ...th, fontWeight: 800 }}>문항 평균</td>
                  {data.by_item.map((v, i) => <td key={i} style={{ ...th, textAlign: "center", fontWeight: 700, color: (v ?? 0) < 80 ? "#b45309" : ACCENT }}>{v != null ? Math.round(v) : ""}</td>)}
                  <td style={{ ...th, fontWeight: 900 }}>{data.mean}%</td><td /><td />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <ol style={{ fontSize: "0.72rem", color: "#64748b", margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        {items.map((it, i) => <li key={i}><strong>{it.area}</strong> — {it.text}</li>)}
      </ol>
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" };
