// Tier1관리 하위 탭이 같이 쓰는 자료형(운영계획 Ⅰ 보편적 행동지원)
export interface Behavior { id: number; place: string; category: string; label: string; text: string; image?: string; }
export interface Plan {
  source: string;
  iep_goals: Record<string, string[]>;
  goal_note: string;
  strategies: string[];
  token_stages: { stage: number; name: string; rule: string }[];
  mart: { place: string; hours: string[][]; note: string };
  fidelity_items: { area: string; text: string }[];
  fidelity_scale: [number, string][];
  fidelity_threshold: number;
  behaviors: Behavior[];
  places: string[];
  categories: string[];
}
export interface ClassInfo { class: string; students: number; }
export const ACCENT = "#16a34a";
export const ruleText = (b: Behavior) => `${b.place} · ${b.category} ${b.text}`;
