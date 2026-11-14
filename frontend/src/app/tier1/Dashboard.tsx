"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_BASE_URL } from "@/app/lib/api";
import { ChartCard, Kpi } from "../cico/CicoDashboard";
import { ACCENT, type ClassInfo } from "./shared";

// Tier1 대시보드: 운영계획 '라. 데이터 수집·활용'과 '마. 실행충실도'를 한 화면에. 학급 간 편차와 지원 필요 학급을 먼저 보여 준다.
interface TrendRow {
  month: number; crisis: number; tier1_only: number; tier2: number; tier3: number; tier1_only_pct: number | null;
  teach_rate: number | null; tokens_per_student: number | null; tokens_entered: number;
}
interface TokenClass extends ClassInfo { bills: number | null; per_student: number | null; stage: string; digital: number; }
interface Dash {
  year: number; students: number; trend: TrendRow[]; classes: ClassInfo[]; semester: number;
  this_month: { month: number; classes: TokenClass[]; entered: number; mean: number | null; sd: number | null };
  teach_now: { weeks: string[]; classes: { class: string; done: number; rate: number | null }[] };
  fidelity: { classes: { class: string; pct: number | null; needs_support: boolean }[]; done: number; mean: number | null; by_item: (number | null)[]; items: { area: string; text: string }[] };
}

const shortClass = (c: string) => c.replace("학년 ", "-").replace("반", "").replace("학교", "").replace("초등 ", "초").replace("중 ", "중").replace("고등 ", "고").replace("전공과 ", "전").replace("유치원 ", "유");

export default function Tier1Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/tier1/dashboard`, { timeout: 120000 }).then(r => setD(r.data)).catch(e => setErr(e?.response?.data?.detail || e.message));
  }, []);
  if (err) return <div className="card" style={{ padding: 30, color: "#ef4444" }}>⚠ 대시보드를 불러오지 못했습니다: {err}</div>;
  if (!d) return <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>보편적 지원 자료를 모으는 중...</div>;

  const last = d.trend[d.trend.length - 1];
  const total = d.trend.reduce((n, t) => n + t.crisis, 0);
  const chart = d.trend.map(t => ({
    label: `${t.month}월`, 위기행동: t.crisis, Tier1만: t.tier1_only_pct, 교수실행률: t.teach_rate, 토큰: t.tokens_per_student,
    "Tier1만 인원": t.tier1_only, Tier2: t.tier2, Tier3: t.tier3,
  }));
  const teachNow = d.teach_now.classes.map(c => c.rate).filter((x): x is number => x != null);
  const teachRate = teachNow.length ? Math.round(teachNow.reduce((a, b) => a + b, 0) / teachNow.length) : null;
  const tokenBars = d.this_month.classes.filter(c => c.per_student != null).map(c => ({ name: shortClass(c.class), full: c.class, v: c.per_student }));
  const tm = d.this_month;
  const low = tm.mean != null && tm.sd != null ? tm.classes.filter(c => c.per_student != null && c.per_student < tm.mean! - tm.sd!) : [];
  const fid = d.fidelity.classes.filter(c => c.pct != null).map(c => ({ name: shortClass(c.class), full: c.class, v: c.pct, low: c.needs_support }));
  const support = d.fidelity.classes.filter(c => c.needs_support);
  const notTaught = d.teach_now.classes.filter(c => d.teach_now.weeks.length && c.done === 0);
  const itemChart = d.fidelity.items.map((it, i) => ({ name: `${i + 1}. ${it.area}`, full: it.text, v: d.fidelity.by_item[i] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Kpi label="Tier1만 비율(이번 달)" value={last?.tier1_only_pct ?? "-"} unit="%" color={(last?.tier1_only_pct ?? 0) >= 80 ? ACCENT : "#f59e0b"} hint="재학생 중 CICO·SST·Tier3가 아닌 학생. 80% 이상이면 보편적 지원이 잘 작동" />
        <Kpi label="기대행동 교수 실행률" value={teachRate ?? "-"} unit="%" color={(teachRate ?? 0) >= 80 ? ACCENT : "#f59e0b"} hint={`이번 달 수업 주 ${d.teach_now.weeks.length}주 중 학급별 실시 주 평균(주 1회 이상)`} />
        <Kpi label="1인당 1000원 토큰(이번 달)" value={tm.mean ?? "-"} unit="장" color="#ca8a04" hint={`입력 ${tm.entered}/${d.classes.length}학급${tm.sd != null ? ` · 학급 간 편차 ±${tm.sd}` : ""}`} />
        <Kpi label={`실행충실도(${d.semester}학기)`} value={d.fidelity.mean ?? "-"} unit="%" color={(d.fidelity.mean ?? 0) >= 80 ? ACCENT : "#f59e0b"} hint={`점검 ${d.fidelity.done}/${d.classes.length}학급 · 80% 미만 학급 지원`} />
        <Kpi label={`${d.year}학년도 위기행동`} value={total} unit="건" color="#ef4444" hint={`이번 달 ${last?.crisis ?? 0}건`} />
      </div>

      {(support.length > 0 || low.length > 0 || notTaught.length > 0) && (
        <div className="card" style={{ padding: 14, border: "1.5px solid #f59e0b", display: "flex", flexDirection: "column", gap: 6, fontSize: "0.8rem" }}>
          <strong style={{ color: "#b45309" }}>🔔 지원이 필요한 학급</strong>
          {support.length > 0 && <div>실행충실도 80% 미만: {support.map(c => c.class).join(", ")}</div>}
          {low.length > 0 && <div>1000원 토큰이 학교 평균보다 1 표준편차 이상 낮음: {low.map(c => `${c.class}(${c.per_student}장)`).join(", ")}</div>}
          {notTaught.length > 0 && <div>이번 달 기대행동 교수 기록 없음: {notTaught.length}학급{notTaught.length <= 8 ? ` (${notTaught.map(c => c.class).join(", ")})` : ""}</div>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <ChartCard title="📈 월별 위기행동과 Tier1만 비율">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="c" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="p" orientation="right" domain={[50, 100]} unit="%" tick={{ fontSize: 11 }} />
              <ReferenceLine yAxisId="p" y={80} stroke={ACCENT} strokeDasharray="4 4" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="c" dataKey="위기행동" name="위기행동 기록(건)" fill="#fca5a5" radius={[4, 4, 0, 0]} />
              <Line yAxisId="p" dataKey="Tier1만" name="Tier1만 비율(%)" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="🍎 월별 기대행동 교수 실행률 · 1인당 토큰">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="p" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="t" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="p" dataKey="교수실행률" name="교수 실행률(%)" fill="#86efac" radius={[4, 4, 0, 0]} />
              <Line yAxisId="t" dataKey="토큰" name="1인당 1000원 토큰(장)" stroke="#ca8a04" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={`🪙 ${tm.month}월 학급별 1인당 1000원 토큰`}>
          {tokenBars.length === 0 ? <p style={{ color: "#94a3b8", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>이번 달 입력한 학급이 없습니다. ‘강화체계·토큰’ 탭에서 입력합니다.</p> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={tokenBars} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-40} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                {tm.mean != null && <ReferenceLine y={tm.mean} stroke="#ca8a04" strokeDasharray="4 4" label={{ value: `평균 ${tm.mean}`, fontSize: 10, fill: "#ca8a04", position: "right" }} />}
                <Tooltip formatter={(v: number) => [`${v}장`, "1인당"]} labelFormatter={(_, p) => p?.[0]?.payload?.full || ""} />
                <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                  {tokenBars.map(b => <Cell key={b.full} fill={low.some(l => l.class === b.full) ? "#f87171" : "#facc15"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title={`✅ ${d.semester}학기 학급별 실행충실도`}>
          {fid.length === 0 ? <p style={{ color: "#94a3b8", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>점검한 학급이 없습니다. ‘실행충실도’ 탭에서 점검합니다.</p> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={fid} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-40} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <ReferenceLine y={80} stroke={ACCENT} strokeDasharray="4 4" label={{ value: "80%", fontSize: 10, fill: ACCENT, position: "right" }} />
                <Tooltip formatter={(v: number) => [`${v}%`, "실행충실도"]} labelFormatter={(_, p) => p?.[0]?.payload?.full || ""} />
                <Bar dataKey="v" radius={[4, 4, 0, 0]}>{fid.map(f => <Cell key={f.full} fill={f.low ? "#f87171" : "#4ade80"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title={`🧩 ${d.semester}학기 실행충실도 문항별 (학교 평균)`}>
          {d.fidelity.done === 0 ? <p style={{ color: "#94a3b8", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>점검 자료가 없습니다.</p> : (
            <ResponsiveContainer width="100%" height={Math.max(250, itemChart.length * 22)}>
              <BarChart data={itemChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`${v}%`, "실행"]} labelFormatter={(_, p) => p?.[0]?.payload?.full || ""} />
                <Bar dataKey="v" radius={[0, 4, 4, 0]}>{itemChart.map(i => <Cell key={i.name} fill={(i.v ?? 0) < 80 ? "#fbbf24" : "#4ade80"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="🧱 월별 Tier 분포 (재학생)">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, n: string) => [`${v}명`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Tier1만 인원" stackId="t" fill="#86efac" />
              <Bar dataKey="Tier2" stackId="t" fill="#fde047" name="Tier2(CICO·SST)" />
              <Bar dataKey="Tier3" stackId="t" fill="#f87171" name="Tier3·3+" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>
        ※ 운영계획 라·마항: 1000원 토큰 수량으로 학급별 기대행동 실천 정도와 학급 간 편차를, 실행충실도로 보편적 지원 실행 정도를 봅니다. 결과는 표적집단 대상 선정·학급 피드백·교수 전략 개선의 기초자료입니다.
      </p>
    </div>
  );
}
