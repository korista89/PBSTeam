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
