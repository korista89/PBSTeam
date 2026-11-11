// 성과 계산(순수 함수). 원자료는 바꾸지 않고, 같은 자료를 '변화가 읽히는' 방식으로 가공한다.
// 원칙: ① 축은 0부터 ② 기준선은 '처음 기록 4주'처럼 미리 정한 규칙 하나만 쓴다 ③ 늘어난 때도 그대로 보여준다.

export const BASE_WEEKS = 4;

export type WeekPoint = { week: string; count: number };

/** 값 배열의 k개 이동평균(앞쪽은 있는 만큼만 평균). 주별 들쭉날쭉함을 줄여 흐름을 보여준다. */
export function movingAvg(values: number[], k = 4): number[] {
  return values.map((_, i) => {
    const s = values.slice(Math.max(0, i - k + 1), i + 1);
    return +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2);
  });
}

export function cumulative(values: number[]): number[] {
  let t = 0;
  return values.map(v => (t += v));
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** 처음 BASE_WEEKS주 평균(기준선)과 최근 BASE_WEEKS주 평균. 주가 8개 미만이면 겹치지 않게 반으로 나눈다. */
export function baselineVsRecent(values: number[], k = BASE_WEEKS) {
  const n = values.length;
  if (n < 4) return null;
  const w = Math.min(k, Math.floor(n / 2));
  const base = mean(values.slice(0, w)) as number;
  const recent = mean(values.slice(n - w)) as number;
  // 기준선이 0이면 비율을 만들 수 없으므로 null(화면에서는 평균값만 보여준다)
  const pct = base > 0 ? Math.round(((recent - base) / base) * 100) : null;
  return { base: +base.toFixed(1), recent: +recent.toFixed(1), pct, weeks: w };
}

/** 오늘이 속한 학년도의 시작일(3월 1일). 1~2월이면 전년도 3월 1일. */
export function schoolYearStart(today: string) {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  return `${m >= 3 ? y : y - 1}-03-01`;
}

/** 위기행동이 0건이었던 주의 비율: 전체 / 앞쪽 절반 / 최근 절반. 주가 6개 미만이면 null. */
export function calmWeeks(values: number[]) {
  const n = values.length;
  if (n < 6) return null;
  const pct = (a: number[]) => Math.round((a.filter(v => v === 0).length / a.length) * 100);
  const h = Math.floor(n / 2);
  return { zero: values.filter(v => v === 0).length, total: n, firstPct: pct(values.slice(0, h)), recentPct: pct(values.slice(n - h)) };
}

const DAY = 86400000;
const t = (iso: string) => Date.parse(iso + "T00:00:00Z");

/** 발생일 목록 → 마지막 발생 후 경과일, 기록 사이 가장 길었던 무발생 기간. */
export function quietStreaks(dates: string[], today: string) {
  const ds = [...new Set(dates.filter(Boolean))].sort();
  if (!ds.length) return null;
  const since = Math.round((t(today) - t(ds[ds.length - 1])) / DAY);
  let longest = since, from = ds[ds.length - 1], to = today;
  for (let i = 1; i < ds.length; i++) {
    const gap = Math.round((t(ds[i]) - t(ds[i - 1])) / DAY) - 1; // 발생 없는 날 수
    if (gap > longest) { longest = gap; from = ds[i - 1]; to = ds[i]; }
  }
  return { since: Math.max(0, since), longest: Math.max(0, longest), from, to, isCurrent: from === ds[ds.length - 1] && to === today };
}

/** 'YYYY-MM' 별 강도 구성(저 1-2 / 중 3 / 고 4-5, 강도 미기재는 제외). */
export function intensityByMonth(rows: { date: string; intensity: number | null }[]) {
  const m = new Map<string, { low: number; mid: number; high: number }>();
  rows.forEach(r => {
    if (r.intensity === null || !r.date) return;
    const k = r.date.slice(0, 7);
    const e = m.get(k) || { low: 0, mid: 0, high: 0 };
    if (r.intensity >= 4) e.high++; else if (r.intensity === 3) e.mid++; else e.low++;
    m.set(k, e);
  });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, e]) => {
    const n = e.low + e.mid + e.high;
    return { month, ...e, n, highPct: Math.round((e.high / n) * 100), lowPct: Math.round((e.low / n) * 100), midPct: Math.round((e.mid / n) * 100) };
  });
}

/**
 * 단일대상연구식 국면 비교. lowerIsBetter=true(문제행동)이면 줄어든 것이 개선.
 * PND = 개선 방향으로 기초선 최선값을 넘어선 중재 자료점의 비율(비중첩 비율).
 */
export function phaseEffect(baseline: number[], treatment: number[], lowerIsBetter: boolean) {
  if (!baseline.length || !treatment.length) return null;
  const bm = mean(baseline) as number, tm = mean(treatment) as number;
  const best = lowerIsBetter ? Math.min(...baseline) : Math.max(...baseline);
  const beyond = treatment.filter(v => (lowerIsBetter ? v < best : v > best)).length;
  const last = treatment.slice(-3);
  const lm = mean(last) as number;
  const pct = (x: number) => (bm !== 0 ? Math.round(((x - bm) / Math.abs(bm)) * 100) : null);
  const improved = lowerIsBetter ? tm < bm : tm > bm;
  const lastImproved = lowerIsBetter ? lm < bm : lm > bm;
  return {
    baseMean: +bm.toFixed(1), treatMean: +tm.toFixed(1), lastMean: +lm.toFixed(1),
    pct: pct(tm), lastPct: pct(lm), improved, lastImproved,
    pnd: Math.round((beyond / treatment.length) * 100), nBase: baseline.length, nTreat: treatment.length,
  };
}

/** 변화율을 사람이 읽는 문장으로(감소/증가 모두 있는 그대로). */
export function changeText(pct: number | null) {
  if (pct === null) return "";
  return pct === 0 ? "변화 없음" : `${Math.abs(pct)}% ${pct < 0 ? "감소" : "증가"}`;
}

// ── 선생님께 드리는 메시지 판단 ──
export type CoachState = "good" | "building" | "effort" | "nudge" | "stable" | "none";
export type CoachInput = {
  rec8: number;            // 최근 8주 위기행동 기록 건수
  eff28: number;           // 최근 28일 표적행동 측정·실행 입력 건수(수동 입력만)
  histBefore8: number;     // 최근 8주 이전 위기행동 기록 건수(올해 3월~)
  tier3: boolean;          // 현재 Tier 3 지정
  shift: ReturnType<typeof baselineVsRecent>;
  calm: ReturnType<typeof calmWeeks>;
  targetImproved: boolean | null; // 표적행동 자료 기준 개선 여부(자료가 부족하면 null)
};

/**
 * 기록 근거가 있으면 효과 여부로 격려/지지(good·effort·building), 기록 근거가 없는데 과거 위기행동이 많고
 * Tier 3이 유지되면 기록 독려(nudge), 그 외 과거 기록만 있으면 안정 추정(stable). 기록이 줄어든 것은 '효과'일 수 있어
 * 기록이 없다는 이유만으로 질책하지 않는다(독려 문구도 비난하지 않는다).
 */
export function coachState(i: CoachInput): CoachState {
  const recording = i.rec8 > 0 || i.eff28 > 0;
  if (recording) {
    const improving = (!!i.shift && i.shift.recent < i.shift.base) || (!!i.calm && i.calm.recentPct > i.calm.firstPct) || i.targetImproved === true;
    if (improving) return "good";
    if (!i.shift && i.targetImproved === null) return "building";
    return "effort";
  }
  if (i.histBefore8 > 0 && (i.tier3 || i.histBefore8 >= 5)) return "nudge";
  if (i.histBefore8 > 0) return "stable";
  return "none";
}

// ── 자체 점검(개발용): node --experimental-strip-types lib/progress.ts ──
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("progress.ts")) {
  const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
  eq(movingAvg([4, 2, 0, 0], 2), [4, 3, 1, 0], "movingAvg");
  eq(cumulative([1, 0, 2]), [1, 1, 3], "cumulative");
  eq(baselineVsRecent([4, 4, 4, 4, 1, 1, 1, 1]), { base: 4, recent: 1, pct: -75, weeks: 4 }, "baselineVsRecent");
  eq(baselineVsRecent([1, 2, 3]), null, "short");
  eq(baselineVsRecent([0, 0, 0, 0, 2, 2, 2, 2])?.pct, null, "zero base");
  const q = quietStreaks(["2026-03-02", "2026-03-04", "2026-04-04"], "2026-04-14")!;
  eq([q.since, q.longest, q.from, q.to, q.isCurrent], [10, 30, "2026-03-04", "2026-04-04", false], "streak");
  const e = phaseEffect([5, 6, 4], [3, 2, 4, 1], true)!;
  eq([e.baseMean, e.treatMean, e.pct, e.pnd, e.improved], [5, 2.5, -50, 75, true], "phase");
  eq(schoolYearStart("2026-11-11"), "2026-03-01", "sy1");
  eq(schoolYearStart("2027-02-10"), "2026-03-01", "sy2");
  eq(calmWeeks([3, 2, 1, 0, 0, 0, 0, 1]), { zero: 4, total: 8, firstPct: 25, recentPct: 75 }, "calm");
  eq(intensityByMonth([{ date: "2026-03-01", intensity: 5 }, { date: "2026-03-02", intensity: 1 }, { date: "2026-04-01", intensity: null }])[0].highPct, 50, "intensity");
  const base: CoachInput = { rec8: 0, eff28: 0, histBefore8: 0, tier3: false, shift: null, calm: null, targetImproved: null };
  const dn = { base: 4, recent: 1, pct: -75, weeks: 4 }, up = { base: 1, recent: 3, pct: 200, weeks: 4 };
  eq(coachState({ ...base, rec8: 3, shift: dn }), "good", "good");
  eq(coachState({ ...base, rec8: 3, shift: up }), "effort", "effort");
  eq(coachState({ ...base, rec8: 1 }), "building", "building");
  eq(coachState({ ...base, eff28: 5, shift: up, targetImproved: true }), "good", "target improved");
  eq(coachState({ ...base, eff28: 5, shift: up, targetImproved: false }), "effort", "target not improved");
  eq(coachState({ ...base, histBefore8: 8, tier3: true }), "nudge", "nudge tier3");
  eq(coachState({ ...base, histBefore8: 6 }), "nudge", "nudge many");
  eq(coachState({ ...base, histBefore8: 2 }), "stable", "stable");
  eq(coachState(base), "none", "none");
  console.log("progress.ts OK");
}
