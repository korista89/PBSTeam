"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/app/lib/api";
import { SCHOOL_MONTHS, inputStyle, nowMonth } from "../components/ProgramKit";
import { ACCENT, type Plan } from "./shared";

// 운영계획 다-4) 단계별 토큰 경제, 다-5) 경은마트, 라) 매월 말 학급 1000원 토큰 수량 입력 → 실천률·학급 간 편차
interface Row { class: string; students: number; bills: number | null; per_student: number | null; stage: string; memo: string; digital: number; }
interface Data { month: number; classes: Row[]; entered: number; mean: number | null; sd: number | null; }

export default function Tier1Tokens({ plan, onStatus }: { plan: Plan; onStatus: (s: string) => void }) {
  const [month, setMonth] = useState(nowMonth);
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, { bills: string; stage: string; memo: string }>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    setData(null);
    axios.get(`${API_BASE_URL}/api/v1/tier1/tokens`, { params: { month } }).then(r => {
      setData(r.data);
      setDraft(Object.fromEntries((r.data.classes as Row[]).map(c => [c.class, { bills: c.bills == null ? "" : String(c.bills), stage: c.stage, memo: c.memo }])));
    }).catch(e => onStatus(`⚠ 불러오기 실패 — ${e?.response?.data?.detail || e.message}`));
  }, [month, onStatus]);
  useEffect(() => { load(); }, [load]);

  const save = async (cls: string) => {
    const d = draft[cls];
    if (!d || d.bills === "" || Number(d.bills) < 0) { onStatus("⚠ 1000원 토큰 수량을 0 이상으로 적어 주세요."); return; }
    setBusy(cls);
    try {
      const r = await axios.post(`${API_BASE_URL}/api/v1/tier1/tokens`, { month, class_name: cls, bills: Number(d.bills), stage: d.stage, memo: d.memo });
      onStatus(`✓ ${cls} ${r.data.message}`);
      load();
    } catch (e: any) {
      onStatus(`⚠ 저장 실패 — ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy("");
    }
  };
  const low = (r: Row) => data?.mean != null && data.sd != null && r.per_student != null && r.per_student < data.mean - data.sd;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {plan.token_stages.map(s => (
          <div key={s.stage} className="card" style={{ padding: 12, borderTop: `3px solid ${["#60a5fa", "#facc15", "#4ade80"][s.stage - 1]}` }}>
            <div style={{ fontWeight: 800 }}>{s.stage}단계 · {s.name}</div>
            <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: 4 }}>{s.rule}</div>
          </div>
        ))}
        <div className="card" style={{ padding: 12, borderTop: "3px solid #f97316" }}>
          <div style={{ fontWeight: 800 }}>🛒 경은마트 · {plan.mart.place}</div>
          <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: 4, lineHeight: 1.6 }}>
            {plan.mart.hours.map(([d, p, t]) => <span key={d} style={{ marginRight: 8 }}><strong>{d}</strong> {p} {t}</span>)}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ ...inputStyle, width: 110 }}>
          {SCHOOL_MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <span style={{ fontSize: "0.85rem" }}>
          입력 <strong>{data?.entered ?? "-"}/{data?.classes.length ?? "-"}</strong>학급 · 학교 1인당 <strong style={{ color: "#ca8a04" }}>{data?.mean ?? "-"}장</strong>
          {data?.sd != null && <> · 학급 간 편차 ±{data.sd}</>}
        </span>
        <span style={{ fontSize: "0.72rem", color: "#64748b" }}>매월 말 그 달 학급에서 쓴(교사가 이름을 써 준) 1000원 토큰 수량을 적습니다.</span>
      </div>

      <div className="card" style={{ padding: 12, overflowX: "auto" }}>
        {!data ? <p style={{ color: "#94a3b8", textAlign: "center" }}>불러오는 중...</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", color: "#475569" }}>
                {["학급", "재학생", "1000원 토큰(장)", "1인당", "주 적용 단계", "메모", "디지털 토큰판 참고", ""].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.classes.map(r => {
                const d = draft[r.class] || { bills: "", stage: "", memo: "" };
                const set = (patch: Partial<typeof d>) => setDraft({ ...draft, [r.class]: { ...d, ...patch } });
                const changed = d.bills !== (r.bills == null ? "" : String(r.bills)) || d.stage !== r.stage || d.memo !== r.memo;
                return (
                  <tr key={r.class} style={{ borderTop: "1px solid #f1f5f9", background: low(r) ? "#fef2f2" : undefined }}>
                    <td style={{ ...th, fontWeight: 700 }}>{r.class}</td>
                    <td style={th}>{r.students}명</td>
                    <td style={th}><input type="number" min={0} value={d.bills} onChange={e => set({ bills: e.target.value })} style={{ ...inputStyle, width: 80, padding: "4px 6px" }} /></td>
                    <td style={{ ...th, fontWeight: 800, color: low(r) ? "#dc2626" : "#ca8a04" }}>{r.per_student ?? "-"}{low(r) ? " ↓" : ""}</td>
                    <td style={th}>
                      <select value={d.stage} onChange={e => set({ stage: e.target.value })} style={{ ...inputStyle, width: 120, padding: "4px 6px" }}>
                        <option value="">-</option>
                        {plan.token_stages.map(s => <option key={s.stage} value={`${s.stage}단계`}>{s.stage}단계 {s.name}</option>)}
                        <option value="혼합">단계 혼합</option>
                      </select>
                    </td>
                    <td style={th}><input value={d.memo} onChange={e => set({ memo: e.target.value })} style={{ ...inputStyle, minWidth: 120, padding: "4px 6px" }} /></td>
                    <td style={{ ...th, color: "#94a3b8" }}>{r.digital ? `${r.digital}장 환산` : "-"}</td>
                    <td style={th}><button className="btn btn-primary" style={{ padding: "3px 10px", fontSize: "0.72rem" }} disabled={!!busy || !changed} onClick={() => void save(r.class)}>{busy === r.class ? "..." : "저장"}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>
        ※ 빨간 줄(↓)은 1인당 토큰이 학교 평균보다 1 표준편차 이상 낮은 학급입니다. ‘디지털 토큰판 참고’는 학급규칙/토큰 화면의 100원 지급 기록을 10개=1장으로 바꾼 값입니다. 긍정:교정 피드백은 4:1 이상을 유지합니다.
      </p>
      <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
        {plan.mart.note} <span style={{ color: ACCENT }}>개별 학생 토큰판은 <a href="/class-rules">학급규칙/토큰</a>에서 씁니다.</span>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" };
