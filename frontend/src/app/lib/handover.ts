// 인수인계 자료(비식별 JSON) 읽기·요약. 파일은 브라우저에서만 읽고 서버로 보내지 않는다.
export type HRec = Record<string, string>;
export type Handover = { 학년도: number[]; 기록: HRec[] };
export type HSummary = {
  id: string; total: number; byYear: Record<string, number>; avgIntensity: number | null;
  topTypes: string[]; last: string; byYearMonth: Record<string, number>;
};

export function parseHandover(text: string): Handover {
  const d = JSON.parse(text);
  if (d?.형식 !== "경은PBS-인수인계" || !Array.isArray(d.기록)) throw new Error("경은PBS 인수인계 파일이 아닙니다.");
  return d as Handover;
}

const intensity = (s: string) => { const m = /^\s*(\d)/.exec(s || ""); return m ? +m[1] : null; };

export function summarize(recs: HRec[]): HSummary {
  const byYear: Record<string, number> = {}, types: Record<string, number> = {}, byYearMonth: Record<string, number> = {};
  const ints: number[] = [];
  let last = "";
  for (const r of recs) {
    byYear[r.학년도] = (byYear[r.학년도] || 0) + 1;
    byYearMonth[r.연월] = (byYearMonth[r.연월] || 0) + 1;
    (r.행동유형 || "").split(" | ").filter(Boolean).forEach(t => { types[t] = (types[t] || 0) + 1; });
    const v = intensity(r.강도); if (v !== null) ints.push(v);
    if (r.연월 > last) last = r.연월;
  }
  return {
    id: recs[0]?.학생ID || "", total: recs.length, byYear, byYearMonth, last,
    avgIntensity: ints.length ? Math.round((ints.reduce((a, b) => a + b, 0) / ints.length) * 10) / 10 : null,
    topTypes: Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t),
  };
}

export function summariesById(h: Handover): HSummary[] {
  const g: Record<string, HRec[]> = {};
  h.기록.forEach(r => { (g[r.학생ID] = g[r.학생ID] || []).push(r); });
  return Object.values(g).map(summarize).sort((a, b) => b.last.localeCompare(a.last) || b.total - a.total);
}

export const labelOf = (s: HSummary) =>
  `${s.id} · ${Object.entries(s.byYear).sort().map(([y, n]) => `${y}:${n}건`).join(" ")} · ${s.topTypes.join("/") || "-"} · 강도 ${s.avgIntensity ?? "-"} · 마지막 ${s.last}`;

export function selfTest() {
  const h = parseHandover(JSON.stringify({ 형식: "경은PBS-인수인계", 기록: [
    { 학년도: "2025", 연월: "2025-04", 학생ID: "PAAAAAA", 행동유형: "방해행동 | 자해행동", 강도: "3(위기행동): x" },
    { 학년도: "2026", 연월: "2026-05", 학생ID: "PAAAAAA", 행동유형: "방해행동", 강도: "5(위기행동): y" },
    { 학년도: "2026", 연월: "2026-06", 학생ID: "PBBBBBB", 행동유형: "", 강도: "" }] }));
  const s = summariesById(h);
  const a = s.find(x => x.id === "PAAAAAA")!;
  if (a.total !== 2 || a.avgIntensity !== 4 || a.topTypes[0] !== "방해행동" || a.byYear["2025"] !== 1) throw new Error("summarize 오류");
  if (s[0].id !== "PBBBBBB") throw new Error("정렬 오류");
  let bad = false; try { parseHandover("{}"); } catch { bad = true; }
  if (!bad) throw new Error("형식 검사 오류");
  return "ok";
}
