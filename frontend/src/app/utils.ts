/**
 * 대시보드 상단 "분석기간" 선택값의 localStorage 저장/복원 공통 로직.
 *
 * 예전에는 pbis_start_date/pbis_end_date만 저장해서, 관리자가 어느 날 조회한
 * 뒤로 며칠이 지나도 종료일이 그날에 멈춰 있었다(예: 9/18에 조회 → 9/28에
 * 들어가도 여전히 9/18까지만 보여, 그 사이 새로 입력된 로그가 전체
 * 로그·대시보드에 전혀 반영되지 않는 것처럼 보임). 저장 당시 날짜도 함께
 * 기록해두고, 오늘 저장된 값이 아니면 stale로 간주해 "최근 28일" 기본값으로
 * 다시 계산한다 - 같은 날 안에서 페이지를 옮겨다닐 때 고른 기간은 유지되고,
 * 날짜가 바뀌면 자동으로 최신 기준으로 리셋된다.
 */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function computeDefaultDateRange(): { start: string; end: string } {
  const today = new Date();
  const prev = new Date();
  prev.setDate(today.getDate() - 28);
  return { start: prev.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
}

export function persistDateRange(start: string, end: string) {
  localStorage.setItem('pbis_start_date', start);
  localStorage.setItem('pbis_end_date', end);
  localStorage.setItem('pbis_date_saved_on', todayStr());
}

export function loadInitialDateRange(): { start: string; end: string } {
  const searchParams = new URLSearchParams(window.location.search);
  const urlStart = searchParams.get('startDate');
  const urlEnd = searchParams.get('endDate');
  if (urlStart && urlEnd) {
    persistDateRange(urlStart, urlEnd);
    return { start: urlStart, end: urlEnd };
  }

  const savedStart = localStorage.getItem('pbis_start_date');
  const savedEnd = localStorage.getItem('pbis_end_date');
  const savedOn = localStorage.getItem('pbis_date_saved_on');
  if (savedStart && savedEnd && savedOn === todayStr()) {
    return { start: savedStart, end: savedEnd };
  }

  const { start, end } = computeDefaultDateRange();
  persistDateRange(start, end);
  return { start, end };
}

/**
 * Masks a student name for privacy:
 * - 3+ characters: replace middle char(s) with 'O' → 김O준
 * - 2 characters: replace second char with 'O' → 이O
 * - 1 character or empty: return as-is
 */
export function maskName(name: string | undefined | null): string {
  if (!name) return '';
  const len = name.length;
  if (len === 2) return name[0] + 'O';
  if (len >= 3) return name[0] + 'O' + name.slice(2);
  return name;
}

/**
 * ISO 주차 문자열(YYYY-WNN 또는 YYYY-WN)을 한국어 표기로 변환합니다.
 * 예) '2026-W11' → '26년3월1주차'
 */
export function formatWeek(weekStr: string): string {
  if (!weekStr) return weekStr;
  const match = weekStr.match(/^(\d{4})-W(\d{1,2})$/);
  if (!match) return weekStr;

  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // ISO 주 1의 목요일이 있는 주의 월요일을 구함
  const jan4 = new Date(year, 0, 4);
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));

  // 해당 주의 월요일 날짜
  const monday = new Date(mondayOfWeek1);
  monday.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);

  const m = monday.getMonth() + 1; // 1~12
  const yy = monday.getFullYear() % 100; // 두 자리 연도

  // 해당 월의 첫 번째 날
  const firstOfMonth = new Date(monday.getFullYear(), monday.getMonth(), 1);
  // 첫 번째 날의 요일(0=일,1=월,...,6=토), ISO 기준 월=0
  const firstDow = (firstOfMonth.getDay() + 6) % 7; // 0=월
  // 해당 날짜가 그 달의 몇 주차인지
  const weekOfMonth = Math.ceil((monday.getDate() + firstDow) / 7);

  return `${yy}년${m}월${weekOfMonth}주차`;
}

/**
 * AI BIP 전문(생성 텍스트, 1~11번 형식)을 BIPData 11개 필드로 파싱합니다.
 * `/student/[id]/bip`와 `/report/tier3`(FBA/BIP관리) 양쪽에서 공유합니다.
 */
export function parseBIPAIResult(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const cleanText = text.split(/\n\s*---\s*\n\s*>/)[0].trim();
  const fields: { key: string; num: number }[] = [
    { key: "TargetBehavior", num: 1 },
    { key: "Hypothesis", num: 2 },
    { key: "Goals", num: 3 },
    { key: "PreventionStrategies", num: 4 },
    { key: "TeachingStrategies", num: 5 },
    { key: "ReinforcementStrategies", num: 6 },
    { key: "CrisisPlan", num: 7 },
    { key: "EvaluationPlan", num: 8 },
    { key: "MedicationStatus", num: 9 },
    { key: "ReinforcerInfo", num: 10 },
    { key: "OtherConsiderations", num: 11 },
  ];

  for (const { key, num } of fields) {
    const current = `(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\*{0,2})?\\[?${num}\\s*[.)]`;
    const next = num < 11
      ? `(?=\\n\\s*(?:#{1,6}\\s*)?(?:\\*{0,2})?\\[?${num + 1}\\s*[.)])`
      : `(?=$)`;
    const pattern = new RegExp(`${current}[^\\n]*\\n([\\s\\S]*?)${next}`, "i");
    const match = cleanText.match(pattern);
    if (match) sections[key] = match[1].trim();
  }
  return sections;
}
