"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/app/lib/api";
import { SCHOOL_MONTHS, chip, inputStyle, nowMonth } from "../components/ProgramKit";
import { ACCENT, ruleText, type Plan } from "./shared";

// 운영계획 다-3)-가) 매주 1회 이상 학급별 기대행동·장소별 규칙 직접 교수, 누가기록으로 실행 여부 점검
interface Cell { week: string; done: boolean; rule: string; strategies: string[]; memo: string; }
interface Row { class: string; weeks: Cell[]; done: number; rate: number | null; }
interface Data { month: number; weeks: string[]; classes: Row[]; }

const wk = (w: string) => { const [, m, d] = w.split("-"); return `${+m}/${+d}주`; };

export default function Tier1Teaching({ plan, onStatus }: { plan: Plan; onStatus: (s: string) => void }) {
  const [month, setMonth] = useState(nowMonth);
  const [data, setData] = useState<Data | null>(null);
  const [edit, setEdit] = useState<{ cls: string; cell: Cell } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setData(null);
    axios.get(`${API_BASE_URL}/api/v1/tier1/teaching`, { params: { month } }).then(r => setData(r.data))
      .catch(e => onStatus(`⚠ 불러오기 실패 — ${e?.response?.data?.detail || e.message}`));
  }, [month, onStatus]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const r = await axios.post(`${API_BASE_URL}/api/v1/tier1/teaching`, {
        week: edit.cell.week, class_name: edit.cls, done: edit.cell.done, rule: edit.cell.rule, strategies: edit.cell.strategies, memo: edit.cell.memo,
      });
      onStatus(`✓ ${r.data.message}`);
      setEdit(null);
      load();
    } catch (e: any) {
      onStatus(`⚠ 저장 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const quick = async (cls: string, cell: Cell) => {
    setBusy(true);
    try {
      await axios.post(`${API_BASE_URL}/api/v1/tier1/teaching`, { week: cell.week, class_name: cls, done: !cell.done, rule: cell.rule, strategies: cell.strategies, memo: cell.memo });
      load();
    } catch (e: any) {
      onStatus(`⚠ 저장 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const rates = (data?.classes || []).map(c => c.rate).filter((x): x is number => x != null);
  const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ ...inputStyle, width: 110 }}>
          {SCHOOL_MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <span style={{ fontSize: "0.85rem" }}>수업 주 <strong>{data?.weeks.length ?? "-"}</strong>주 · 학교 실행률 <strong style={{ color: (avg ?? 0) >= 80 ? ACCENT : "#f59e0b" }}>{avg ?? "-"}%</strong></span>
        <span style={{ fontSize: "0.72rem", color: "#64748b" }}>칸을 누르면 실시 ✓/해제, ✏️로 지도한 규칙·교수 전략·메모를 적습니다. 매주 1회 이상이 기준입니다.</span>
      </div>

      {edit && (
        <div className="card" style={{ padding: 16, border: `2px solid ${ACCENT}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <strong>{edit.cls} · {wk(edit.cell.week)} 기대행동 교수</strong>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.85rem" }}>
            <input type="checkbox" checked={edit.cell.done} onChange={e => setEdit({ ...edit, cell: { ...edit.cell, done: e.target.checked } })} /> 이번 주 직접 교수함
          </label>
          <select value={edit.cell.rule} onChange={e => setEdit({ ...edit, cell: { ...edit.cell, rule: e.target.value } })} style={inputStyle}>
            <option value="">지도한 장소별 규칙 고르기</option>
            {plan.behaviors.map(b => <option key={b.id} value={ruleText(b)}>{ruleText(b)}</option>)}
          </select>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {plan.strategies.map(s => {
              const on = edit.cell.strategies.includes(s);
              return <button key={s} type="button" onClick={() => setEdit({ ...edit, cell: { ...edit.cell, strategies: on ? edit.cell.strategies.filter(x => x !== s) : [...edit.cell.strategies, s] } })}
                style={{ ...chip(on ? ACCENT : "#94a3b8"), border: on ? `1.5px solid ${ACCENT}` : "1px solid #e2e8f0", cursor: "pointer", fontWeight: on ? 700 : 400 }}>{on ? "✓ " : ""}{s}</button>;
            })}
          </div>
          <input value={edit.cell.memo} onChange={e => setEdit({ ...edit, cell: { ...edit.cell, memo: e.target.value } })} placeholder="메모(예: 월 2교시 창체, 급식실 현장 연습)" style={inputStyle} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" onClick={() => setEdit(null)} disabled={busy}>취소</button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>저장</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12, overflowX: "auto" }}>
        {!data ? <p style={{ color: "#94a3b8", textAlign: "center" }}>불러오는 중...</p> : data.weeks.length === 0 ? <p style={{ color: "#94a3b8" }}>이 달은 수업 주가 없습니다.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", color: "#475569" }}>
                <th style={th}>학급</th>
                {data.weeks.map(w => <th key={w} style={{ ...th, textAlign: "center" }}>{wk(w)}</th>)}
                <th style={th}>실행률</th>
              </tr>
            </thead>
            <tbody>
              {data.classes.map(r => (
                <tr key={r.class} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ ...th, fontWeight: 700 }}>{r.class}</td>
                  {r.weeks.map(c => (
                    <td key={c.week} style={{ ...th, textAlign: "center", background: c.done ? "#dcfce7" : undefined }} title={[c.rule, c.strategies.join(", "), c.memo].filter(Boolean).join(" / ")}>
                      <button disabled={busy} onClick={() => void quick(r.class, c)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: "1rem" }}>{c.done ? "✅" : "⬜"}</button>
                      <button disabled={busy} onClick={() => setEdit({ cls: r.class, cell: c })} style={{ border: "none", background: "none", cursor: "pointer", fontSize: "0.75rem" }} title="규칙·전략·메모">✏️</button>
                      {c.rule && <div style={{ fontSize: "0.62rem", color: "#166534", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "0 auto" }}>{c.rule.split(" · ")[1]}</div>}
                    </td>
                  ))}
                  <td style={{ ...th, fontWeight: 800, color: (r.rate ?? 0) >= 80 ? ACCENT : (r.rate ?? 0) > 0 ? "#ca8a04" : "#ef4444" }}>{r.rate ?? "-"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>※ 주는 그 달 수업일이 하루라도 있는 주(월요일 기준)입니다. 담임은 우리 반만, 관리자는 전 학급을 입력할 수 있습니다.</p>
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" };
