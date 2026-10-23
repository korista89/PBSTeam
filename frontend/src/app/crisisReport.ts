// 위기행동 보고서 작성 화면의 입력값 → Log_Main 열(제출·미리보기 공용).
// 시트 열 구조는 그대로 두고 기존 열(1차_경위·1차_관찰기록·1차_개별학생교육지원_* 등)을 쓴다.
// 서버 crisis_report.report_fields() 가 이 열들을 다시 양식 칸으로 바꾸며, tests/test_crisis_report.py 가 그 왕복을 검사한다.
// (node --experimental-strip-types 로 바로 실행되도록 타입 표기 외의 TS 문법은 쓰지 않는다)

export const ACTION_HEADER = "방어 및 보호를 위한 제지 / 개별학생교육지원 / 본인·타인 상해 발생 여부";
export const NO_REPORT = "X - 보고서 작성 불필요";
// 양식의 보고 사유 체크 5개(양식 순서). 1차_경위 첫머리에 [사유] 표시로 저장한다.
export const REASONS = ["방어 및 보호를 위한 제지", "본인/타인 상해 발생", "수업 중 교실 내 분리", "수업 중 교실 밖 분리", "수업시간 외 특정장소 분리"];
export const FOLLOWUPS: [string, string][] = [
  ["부상자 치료", "부상자_치료"], ["관리자 보고", "관리자_보고"], ["학부모 알림", "학부모_알림"],
  ["학생 상담", "학생_상담"], ["학부모 상담", "학부모_상담"], ["긴급회의", "긴급회의"],
];

export type Line = { t: string; s: string };
export type Report = {
  사유: string[]; 지도교사: string; 지원시간: string; 지원장소: string; 지원교사: string;
  A: string; B: string; C: string; 경위: Line[]; 관찰기록: Line[];
  조치: Record<string, { 일시: string; 내용: string }>;
};

export const emptyReport = (): Report => ({
  사유: [], 지도교사: "", 지원시간: "", 지원장소: "", 지원교사: "", A: "", B: "", C: "",
  경위: [{ t: "", s: "" }], 관찰기록: [{ t: "", s: "" }],
  조치: Object.fromEntries(FOLLOWUPS.map(([, k]) => [k, { 일시: "", 내용: "" }])),
});

// '10:20 소리를 지름' 한 줄씩 — 인쇄 칸에 쓴 그대로 나온다.
export const linesText = (rows: Line[]) =>
  rows.filter(r => r.s.trim()).map(r => `${r.t} ${r.s.trim()}`.trim()).join("\n");

// 통계·결재가 쓰는 조치유형 열(값 하나)은 체크한 사유 중 가장 무거운 것으로 둔다.
export function primaryAction(reasons: string[]): string {
  if (reasons.includes(REASONS[0])) return "방어 및 보호를 위한 제지";
  if (REASONS.slice(2).some(r => reasons.includes(r))) return "개별학생교육지원";
  if (reasons.includes(REASONS[1])) return "본인/타인상해만 발생";
  return "";
}

export function reportColumns(r: Report): Record<string, string> {
  const tags = REASONS.filter(x => r.사유.includes(x)).map(x => `[${x}]`).join("");
  const story = linesText(r.경위);
  const cols: Record<string, string> = {
    [ACTION_HEADER]: primaryAction(r.사유),
    "발생 시 지도교사": r.지도교사,
    "1차_개별학생교육지원_시간": r.지원시간, "1차_개별학생교육지원_장소": r.지원장소, "1차_개별학생교육지원_교사": r.지원교사,
    "A_배경_선행사건": r.A, "B_나타난_위기행동": r.B, "C_후속결과": r.C,
    "1차_경위": [tags, story].filter(Boolean).join("\n"),
    "1차_관찰기록": linesText(r.관찰기록),
  };
  for (const [, k] of FOLLOWUPS) {
    cols[`${k}_시간`] = r.조치[k]?.일시 || "";
    cols[`${k}_내용`] = r.조치[k]?.내용 || "";
  }
  return cols;
}

// 관찰할 수 없는 해석·감정 낱말 — 보이면 '실제로 보인 행동'으로 바꿔 쓰도록 알려 준다.
export const VAGUE = ["흥분", "화가 나", "짜증", "기분이", "통제 불능", "난동", "폭력적", "공격적", "고집", "떼를", "말을 안 들", "이상한"];
export const vagueIn = (text: string) => VAGUE.filter(w => text.includes(w));

export const STORY_EXAMPLES: { label: string; items: string[] }[] = [
  { label: "발생", items: [
    "국어 활동 중 학습지를 찢고 책상을 손바닥으로 3회 내리침",
    "활동 전환 안내 직후 바닥에 누워 소리를 지름",
    "옆 학생의 팔을 잡아당기고 손으로 2회 때림",
    "자기 머리를 주먹으로 반복해서 때림(약 5회)",
  ] },
  { label: "교사 대응·결정", items: [
    "언어 재지시 2회, 선택지(쉬기/계속하기) 제시했으나 행동이 계속됨",
    "주변 학생을 교실 뒤쪽으로 이동시켜 안전을 확보함",
    "다른 학생 안전 확보가 어려워 교실 밖 분리를 결정함",
    "교무실(지원팀)에 무전으로 지원을 요청함",
  ] },
  { label: "이동·제지", items: [
    "지원 교사 도착, 학생과 함께 걸어서 심리안정실로 이동함",
    "머리 박기가 계속되어 두 교사가 양 손목을 잡아 제지함(약 30초)",
    "제지 해제 후 학생이 바닥에 앉아 때리기를 멈춤",
  ] },
];

export const OBSERVE_EXAMPLES: { label: string; items: string[] }[] = [
  { label: "도착", items: [
    "심리안정실 도착. 바닥에 누워 소리를 지르고 발로 벽을 참",
    "도착 후 의자에 앉아 울며 손으로 얼굴을 가림",
  ] },
  { label: "진정 지원", items: [
    "감정 카드 제시, '쉬고 싶어요' 카드를 가리킴",
    "물 마시기·심호흡 3회를 교사와 함께 함",
    "말을 줄이고 2m 떨어져 기다림(약 5분)",
  ] },
  { label: "회복·복귀", items: [
    "울음을 멈추고 교사 질문에 고개를 끄덕여 응답함",
    "그림 일정표에서 다음 활동 '교실' 카드를 고름",
    "교실로 복귀해 남은 활동에 참여함",
    "복귀를 거부해 보호자에게 연락하고 조기 귀가함",
  ] },
];
