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
  사유: string[]; 담임교사: string; 지도교사: string; 지원시간: string; 지원장소: string; 지원교사: string;
  A: string; B: string; C: string; 경위: Line[]; 관찰기록: Line[];
  조치: Record<string, { 일시: string; 내용: string }>;
};

export const emptyReport = (): Report => ({
  사유: [], 담임교사: "", 지도교사: "", 지원시간: "", 지원장소: "", 지원교사: "", A: "", B: "", C: "",
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
  const homeroom = r.담임교사.replace(/[[\]\n]/g, "").trim();
  const tags = REASONS.filter(x => r.사유.includes(x)).map(x => `[${x}]`).join("") + (homeroom ? `[담임교사:${homeroom}]` : "");
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

// '위 내용 자동 반영': 통계 입력(체크·선택)으로 A·B·C와 경위 첫 줄을 채운다. 이미 쓴 칸은 건드리지 않는다.
// 칸 구분 — A·B·C는 행동 분석 요약(직전 상황 / 학생이 보인 행동 / 직후 바뀐 것),
// 경위는 교사 대응의 시간 순서(누가 언제 무엇을 결정·이동·제지했나). 학생 행동은 B에 한 번만 쓰고 경위에서는 'B 참조'로 가리킨다.
export const STORY_START = "위기행동 발생(B 참조)";
export type DataInput = { 배경: string[]; 선행: string[]; 후속: string[]; 행동유형: string; 강도: string; 특기사항: string };
const short = (v: string) => v.split(":")[0].trim();  // '물건파괴행동: 물건 던지기…' → '물건파괴행동', '3(위기행동): …' → '3(위기행동)'
export function autoFill(r: Report, d: DataInput): Report {
  const bg = d.배경.filter(x => x !== "특이사항 없음");
  const A = [bg.length ? `${bg.join(", ")}인 날` : "", d.선행.length ? `${d.선행.join(", ")} 직후 발생함` : ""].filter(Boolean).join(", ");
  const B = [d.행동유형 && `${short(d.행동유형)}${d.강도 ? ` (강도 ${short(d.강도).replace(/\(.*\)/, "")})` : ""}`, d.특기사항.trim()].filter(Boolean).join(" — ");
  const C = d.후속.length ? `${d.후속.join(", ")}` : "";
  const storyEmpty = !r.경위.some(x => x.s.trim());
  return {
    ...r,
    A: r.A.trim() ? r.A : A,
    B: r.B.trim() ? r.B : B,
    C: r.C.trim() ? r.C : C,
    경위: storyEmpty ? [{ t: r.경위[0]?.t || "", s: STORY_START }, ...r.경위.slice(1)] : r.경위,
  };
}

// 경위 줄이 B(학생 행동)를 그대로 되풀이하는지 — 겹치면 경위에는 교사 대응을 쓰도록 알려 준다.
export function duplicatesB(lines: Line[], b: string): boolean {
  const n = (v: string) => v.replace(/[\s.,·()]/g, "");
  const nb = n(b);
  return nb.length >= 6 && lines.some(l => { const s = n(l.s); return s.length >= 6 && (nb.includes(s) || s.includes(nb)); });
}

// 해당 없음으로 넘길 수 있는 조치 행(관리자 보고·학부모 알림은 법적 의무라 필수)
export const OPTIONAL_FOLLOWUPS = ["부상자_치료", "학생_상담", "학부모_상담", "긴급회의"];
export const NOT_APPLICABLE = "해당 없음";

// 관찰할 수 없는 해석·감정 낱말 — 보이면 '실제로 보인 행동'으로 바꿔 쓰도록 알려 준다.
export const VAGUE = ["흥분", "화가 나", "짜증", "기분이", "통제 불능", "난동", "폭력적", "공격적", "고집", "떼를", "말을 안 들", "이상한"];
export const vagueIn = (text: string) => VAGUE.filter(w => text.includes(w));

// 조치사항 칸 예시(고르면 들어가고 고쳐 쓴다)
export const FOLLOWUP_EXAMPLES: Record<string, string[]> = {
  부상자_치료: ["보건실에서 찰과상 소독·밴드 처치", "부상 없음 확인(보건교사)", "얼음찜질 후 경과 관찰", "보호자 동의로 병원 진료 안내"],
  관리자_보고: ["교감에게 구두 보고", "교장·교감에게 보고서 제출", "행동중재전문교사와 함께 교감에게 보고"],
  학부모_알림: ["어머니께 전화로 경위 안내", "아버지께 전화로 부상 여부와 경위 안내", "알림장으로 경위 안내 후 전화 상담 약속", "하교 때 직접 만나 경위 안내"],
  학생_상담: ["진정 후 그림 카드로 일어난 일 돌아보기", "쉬기 요청 카드 쓰는 방법 다시 연습", "다음에 할 행동을 교사와 함께 고르기"],
  학부모_상담: ["전화 상담: 가정 수면·식사·약 복용 확인", "대면 상담: 행동중재계획 안내와 가정 연계 협의", "보호자 요청으로 상담 일정 조정"],
  긴급회의: ["학교행동중재지원팀 긴급회의: 예방 전략 점검", "담임·행동중재전문교사 협의: 다음 날 등교 지원 방법 결정", "개별화교육지원팀 협의 일정 결정"],
};

export const STORY_EXAMPLES: { label: string; items: string[] }[] = [
  { label: "발생(학생 행동은 B에)", items: [
    STORY_START,
    "B 행동이 다시 나타남(2차)",
    "B 행동이 강해짐: 대상이 또래로 바뀜",
  ] },
  { label: "교사 대응·결정", items: [
    "언어 재지시 2회, 선택지(쉬기/계속하기) 제시했으나 행동이 계속됨",
    "주변 학생을 교실 뒤쪽으로 이동시켜 안전을 확보함",
    "다른 학생 안전 확보가 어려워 교실 밖 분리를 결정함",
    "교무실(지원팀)에 무전으로 지원을 요청함",
    "요구를 줄이고 쉬기 카드를 보여 주며 2m 거리에서 기다림",
    "위험 물건(가위·의자)을 치우고 출입문 쪽을 막지 않게 자리를 비움",
    "수업 중 교실 내 분리: 교실 뒤 안정 공간으로 이동하도록 안내함",
    "수업 시간 외 특정 장소 분리: 점심시간에 상담실에서 지원하기로 함",
  ] },
  { label: "이동·제지", items: [
    "지원 교사 도착, 학생과 함께 걸어서 심리안정실로 이동함",
    "머리 박기가 계속되어 두 교사가 양 손목을 잡아 제지함(약 30초)",
    "제지 해제 후 학생이 바닥에 앉아 때리기를 멈춤",
    "또래를 향해 의자를 들어 올려 한 교사가 의자를 잡고 내려놓게 함",
    "교실 밖으로 뛰어나가 지원 교사가 함께 걸으며 계단 앞에서 멈추게 함",
    "물기가 계속되어 쿠션을 팔 앞에 대어 막음",
  ] },
  { label: "부상·연락", items: [
    "보건실에서 부상 부위(○○)를 확인하고 처치함",
    "교감에게 구두로 보고함",
    "보호자에게 전화로 경위와 부상 여부를 알림",
    "행동중재전문교사와 사안을 공유하고 다음 날 협의하기로 함",
  ] },
];

export const OBSERVE_EXAMPLES: { label: string; items: string[] }[] = [
  { label: "도착", items: [
    "심리안정실 도착. 바닥에 누워 소리를 지르고 발로 벽을 참",
    "도착 후 의자에 앉아 울며 손으로 얼굴을 가림",
  ] },
  { label: "개별학생교육지원", items: [
    "심리안정실에서 그림 과제(색칠·퍼즐)로 수업을 이어 감",
    "지원 교사와 1:1로 남은 과제를 짧게 나누어 함",
    "교실 뒤 안정 공간에서 감각 교구(○○)를 쓰며 쉼",
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
    "다음 교시부터 교실로 돌아가 자기 자리에 앉음",
    "점심 후 다시 같은 행동이 나타나 지원을 이어 감",
  ] },
];

// AI 초안('A: …' 'B: …' 'C: …' '경위:' 줄들 '관찰기록:' 줄들) → 보고서 칸. 비어 있는 칸만 채운다(경위는 첫 줄 자동 문장만 있으면 빈 것으로 본다).
export function parseCrisisDraft(text: string): { A: string; B: string; C: string; 경위: Line[]; 관찰기록: Line[] } {
  const out = { A: "", B: "", C: "", 경위: [] as Line[], 관찰기록: [] as Line[] };
  let cur = "";
  for (const raw of text.replace(/\*\*/g, "").split("\n")) {
    const h = raw.match(/^\s*(A|B|C|경위|관찰기록)\s*(?:\([^)]*\))?\s*[:：]\s*(.*)$/);
    if (h) cur = h[1];
    const body = (h ? h[2] : raw).replace(/^\s*[-•·]\s*/, "").trim();
    if (!body || body === "-") continue;
    if (cur === "A" || cur === "B" || cur === "C") { out[cur] = [out[cur], body].filter(Boolean).join(" "); continue; }
    if (cur === "경위" || cur === "관찰기록") {
      const m = body.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
      out[cur].push(m ? { t: m[1], s: m[2].trim() } : { t: "", s: body });
    }
  }
  return out;
}
export function applyCrisisDraft(r: Report, d: ReturnType<typeof parseCrisisDraft>): Report {
  const blank = (rows: Line[]) => !rows.some(x => x.s.trim() && x.s.trim() !== STORY_START);
  return {
    ...r, A: r.A.trim() ? r.A : d.A, B: r.B.trim() ? r.B : d.B, C: r.C.trim() ? r.C : d.C,
    경위: blank(r.경위) && d.경위.length ? d.경위 : r.경위,
    관찰기록: blank(r.관찰기록) && d.관찰기록.length ? d.관찰기록 : r.관찰기록,
  };
}
