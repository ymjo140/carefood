/**
 * 사용자가 만드는 챌린지의 규칙 목록 — 화면과 서버가 같이 쓴다.
 * 규칙을 글로 자유롭게 쓰게 하지 않는다: 식단 기록으로 자동 판정해야 하고, 효능·극단적 절식 규칙을 막아야 한다.
 * '…kcal 이하' 규칙은 없다(적게 먹기 경쟁이 되지 않게). 열량은 구간(±10%)으로만, 아래로 떨어진 날도 못 한 날이다.
 * 나트륨·당류는 하한을 두어 극단적으로 줄이는 경쟁을 막는다.
 * 제목·규칙 문장은 고른 값에서 자동으로 만든다(효능 말이 들어갈 자리가 없다).
 * 열량 구간은 사람마다 다르다 — 챌린지에는 '열량 구간 지키기'만 보이고, 구간 숫자는 참여한 사람마다 따로(members.target_eff), 본인만 본다.
 */
import { MACRO_TYPES, macroOf, type ChallengeMetric } from "@/lib/challenges";

export type UserMetric = Exclude<ChallengeMetric, "kcal_max">;
export type Bundle = "record" | "meal" | "fill" | "cut" | "kcal";
export const BUNDLES: { key: Bundle; label: string }[] = [
  { key: "record", label: "기록" }, { key: "meal", label: "끼니" }, { key: "fill", label: "채우기" },
  { key: "cut", label: "줄이기" }, { key: "kcal", label: "열량·탄단지" },
];

export type RuleSpec = {
  metric: UserMetric; bundle: Bundle; label: string; hint: string;
  /** 목표값이 있는 규칙 — 없으면(아침·매일 기록) 1로 고정. kind 가 있으면 슬라이더 대신 전용 고르기 */
  target?: { unit: string; min: number; max: number; step: number; default: number; kind?: "kcal" | "macro" };
  /** 참여한 사람마다 목표가 다른 규칙 (열량 구간) */
  personal?: boolean;
  title: (days: number, target: number) => string;
  rule: (target: number) => string;
};

const n = (v: number) => v.toLocaleString("ko-KR");

/** 열량 구간 — 200kcal 간격 6구간. 직접 정할 때는 하한 1,200kcal */
export const KCAL_TIERS = [1500, 1700, 1900, 2100, 2300, 2500] as const;
export const KCAL_FLOOR = 1200;
/** 내 목표에 가장 가까운 구간 (같으면 낮은 쪽) */
export function nearestTier(goal: number | null | undefined) {
  const g = Number(goal) || 2000;
  return KCAL_TIERS.reduce((best, t) => (Math.abs(t - g) < Math.abs(best - g) ? t : best), KCAL_TIERS[0] as number);
}

export const RULES: RuleSpec[] = [
  { metric: "record_any", bundle: "record", label: "매일 기록하기", hint: "한 끼라도 기록한 날",
    title: (d) => `${d}일 매일 기록하기`, rule: () => "한 끼라도 기록한 날" },
  { metric: "meals_min", bundle: "record", label: "끼니 기록하기", hint: "아침·점심·저녁 중 목표 끼니 수 이상 · 150kcal 미만 끼니는 빼고",
    target: { unit: "끼", min: 2, max: 3, step: 1, default: 3 },
    title: (d, t) => `${d}일 ${t === 3 ? "세" : "두"} 끼 기록하기`, rule: (t) => `아침·점심·저녁 중 ${t}끼 이상 기록한 날` },
  { metric: "photo_meals", bundle: "record", label: "사진과 함께 기록", hint: "사진으로 찾은 음식을 기록한 끼니 수",
    target: { unit: "끼", min: 1, max: 3, step: 1, default: 2 },
    title: (d, t) => `${d}일 사진으로 ${t === 3 ? "세" : t === 2 ? "두" : "한"} 끼 기록하기`, rule: (t) => `아침·점심·저녁 중 ${t}끼 이상을 사진으로 기록한 날` },
  { metric: "breakfast", bundle: "meal", label: "아침 챙겨 먹기", hint: "아침을 기록한 날 · 150kcal 이상",
    title: (d) => `${d}일 아침 챙겨 먹기`, rule: () => "아침을 기록한 날" },
  { metric: "protein_each", bundle: "meal", label: "끼니마다 단백질", hint: "아침·점심·저녁 모두 단백질이 목표 이상",
    target: { unit: "g", min: 10, max: 40, step: 5, default: 20 },
    title: (d, t) => `${d}일 끼니마다 단백질 ${n(t)}g`, rule: (t) => `아침·점심·저녁 모두 단백질이 ${n(t)}g 이상인 날` },
  { metric: "protein_min", bundle: "fill", label: "단백질 채우기", hint: "하루 단백질 합계가 목표 이상",
    target: { unit: "g", min: 30, max: 150, step: 5, default: 60 },
    title: (d, t) => `${d}일 단백질 ${n(t)}g 채우기`, rule: (t) => `하루에 기록한 단백질이 ${n(t)}g 이상인 날` },
  { metric: "fiber_min", bundle: "fill", label: "식이섬유 채우기", hint: "하루 식이섬유 합계가 목표 이상",
    target: { unit: "g", min: 15, max: 40, step: 1, default: 25 },
    title: (d, t) => `${d}일 식이섬유 ${n(t)}g 채우기`, rule: (t) => `하루에 기록한 식이섬유가 ${n(t)}g 이상인 날` },
  { metric: "sodium_max", bundle: "cut", label: "나트륨 줄이기", hint: "하루 나트륨 합계가 목표 이하 · 두 끼 이상 기록",
    target: { unit: "mg", min: 1500, max: 3000, step: 100, default: 2000 },
    title: (d, t) => `${d}일 나트륨 ${n(t)}mg 이하`, rule: (t) => `하루에 기록한 나트륨이 ${n(t)}mg 이하인 날` },
  { metric: "sugar_max", bundle: "cut", label: "당류 줄이기", hint: "하루 당류 합계가 목표 이하 · 두 끼 이상 기록",
    target: { unit: "g", min: 10, max: 50, step: 5, default: 25 },
    title: (d, t) => `${d}일 당류 ${n(t)}g 이하`, rule: (t) => `하루에 기록한 당류가 ${n(t)}g 이하인 날` },
  { metric: "snack_max", bundle: "cut", label: "간식 줄이기", hint: "간식 기록이 목표 횟수 이하 · 두 끼 이상 기록",
    target: { unit: "번", min: 0, max: 2, step: 1, default: 1 },
    title: (d, t) => (t === 0 ? `${d}일 간식 없이` : `${d}일 간식 하루 ${t}번 이하`), rule: (t) => `간식이 하루 ${t}번 이하이고 두 끼 이상 기록한 날` },
  { metric: "kcal_band", bundle: "kcal", label: "열량 구간 지키기", hint: "세 끼를 기록하고 하루 열량이 내 구간 ±10% 안 · 숫자는 나만 봐요",
    target: { unit: "kcal", min: KCAL_FLOOR, max: 3000, step: 50, default: 1900, kind: "kcal" }, personal: true,
    title: (d) => `${d}일 열량 구간 지키기`, rule: () => "세 끼를 기록하고 하루 열량이 내 구간 ±10% 안인 날" },
  { metric: "macro_type", bundle: "kcal", label: "탄단지 유형 지키기", hint: "두 끼 이상 기록하고 탄수화물·단백질·지방 비율이 유형 범위 안",
    target: { unit: "", min: 1, max: MACRO_TYPES.length, step: 1, default: 1, kind: "macro" },
    title: (d, t) => `${d}일 탄단지 ${macroOf(t)?.label ?? ""} 지키기`,
    rule: (t) => { const m = macroOf(t); return m ? `두 끼 이상 기록하고 탄수화물 ${m.c[0]}~${m.c[1]}%·단백질 ${m.p[0]}~${m.p[1]}%·지방 ${m.f[0]}~${m.f[1]}%인 날` : ""; } },
];

/** 템플릿 — 누르면 규칙·숫자·기간이 채워진다 (열량 구간은 내 목표에 맞는 구간으로) */
export type Template = { key: string; name: string; metric: UserMetric; target: number | "my_tier"; days: number };
export const TEMPLATES: Template[] = [
  { key: "3meals7", name: "7일 세 끼 기록", metric: "meals_min", target: 3, days: 7 },
  { key: "photo7", name: "사진으로 세 끼 인증", metric: "photo_meals", target: 3, days: 7 },
  { key: "kcal30", name: "한 달 열량 구간 지키기", metric: "kcal_band", target: "my_tier", days: 30 },
  { key: "protein14", name: "2주 끼니마다 단백질 20g", metric: "protein_each", target: 20, days: 14 },
  { key: "sugar14", name: "2주 당류 25g 이하", metric: "sugar_max", target: 25, days: 14 },
  { key: "snack14", name: "2주 간식 하루 1번", metric: "snack_max", target: 1, days: 14 },
  { key: "balance14", name: "2주 탄단지 균형", metric: "macro_type", target: 1, days: 14 },
  { key: "daily30", name: "30일 매일 기록", metric: "record_any", target: 1, days: 30 },
];

export const DAY_CHOICES = [3, 7, 14, 21, 30] as const;
export const NOTE_MAX = 30;

export function ruleOf(metric: string) {
  return RULES.find((r) => r.metric === metric) || null;
}

/** 기본 성공 기준 — 기간의 70%(올림) */
export const defaultGoal = (days: number) => Math.max(1, Math.ceil(days * 0.7));

/** 서버·화면 공통 검사 — 문제면 사용자에게 보일 이유, 아니면 정리한 값 */
export function checkSpec(raw: { metric?: unknown; target?: unknown; days?: unknown; goal?: unknown }):
  { error: string } | { spec: RuleSpec; target: number; days: number; goal: number; title: string; rule: string } {
  const spec = ruleOf(String(raw.metric || ""));
  if (!spec) return { error: "규칙을 골라 주세요" };
  const days = Number(raw.days);
  if (!(DAY_CHOICES as readonly number[]).includes(days)) return { error: "기간은 3·7·14·21·30일 중에서 골라 주세요" };
  let target = 1;
  if (spec.target) {
    target = Number(raw.target);
    const t = spec.target;
    if (t.kind === "macro") {
      if (!macroOf(target)) return { error: "탄단지 유형을 골라 주세요" };
    } else if (!Number.isFinite(target) || target < t.min || target > t.max) {
      return { error: t.kind === "kcal" ? `열량은 ${n(t.min)}~${n(t.max)}kcal 사이로 정해 주세요` : `목표는 ${n(t.min)}~${n(t.max)}${t.unit} 사이로 정해 주세요` };
    }
    target = Math.round(target / t.step) * t.step;
  }
  const goal = raw.goal == null || raw.goal === "" ? defaultGoal(days) : Math.round(Number(raw.goal));
  if (!Number.isFinite(goal) || goal < 1 || goal > days) return { error: `성공 기준은 1~${days}일 사이로 정해 주세요` };
  return { spec, target, days, goal, title: spec.title(days, target), rule: spec.rule(target) };
}

/** 열량 구간 내 숫자 검사 (참여 뒤 바꿀 때) */
export function checkPersonalKcal(v: unknown): number | null {
  const x = Number(v);
  if (!Number.isFinite(x) || x < KCAL_FLOOR || x > 3000) return null;
  return Math.round(x / 50) * 50;
}
