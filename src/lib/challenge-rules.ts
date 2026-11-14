/**
 * 사용자가 만드는 챌린지의 규칙 목록 — 화면과 서버가 같이 쓴다.
 * 규칙을 글로 자유롭게 쓰게 하지 않는다: 식단 기록으로 자동 판정해야 하고, 효능·극단적 절식 규칙을 막아야 한다.
 * 열량 규칙은 없다(적게 먹기 경쟁이 되지 않게). 나트륨·당류는 하한을 두어 극단적으로 줄이는 경쟁을 막는다.
 * 제목·규칙 문장은 고른 값에서 자동으로 만든다(효능 말이 들어갈 자리가 없다).
 */
import type { ChallengeMetric } from "@/lib/challenges";

export type UserMetric = Exclude<ChallengeMetric, "kcal_max">;
export type RuleSpec = {
  metric: UserMetric; label: string; hint: string;
  /** 목표값이 있는 규칙 — 없으면(아침·매일 기록) 1로 고정 */
  target?: { unit: string; min: number; max: number; step: number; default: number };
  title: (days: number, target: number) => string;
  rule: (target: number) => string;
};

const n = (v: number) => v.toLocaleString("ko-KR");

export const RULES: RuleSpec[] = [
  { metric: "protein_min", label: "단백질 채우기", hint: "하루 단백질 합계가 목표 이상",
    target: { unit: "g", min: 30, max: 150, step: 5, default: 60 },
    title: (d, t) => `${d}일 단백질 ${n(t)}g 채우기`, rule: (t) => `하루에 기록한 단백질이 ${n(t)}g 이상인 날` },
  { metric: "fiber_min", label: "식이섬유 채우기", hint: "하루 식이섬유 합계가 목표 이상",
    target: { unit: "g", min: 15, max: 40, step: 1, default: 25 },
    title: (d, t) => `${d}일 식이섬유 ${n(t)}g 채우기`, rule: (t) => `하루에 기록한 식이섬유가 ${n(t)}g 이상인 날` },
  { metric: "sodium_max", label: "나트륨 줄이기", hint: "하루 나트륨 합계가 목표 이하 · 두 끼 이상 기록",
    target: { unit: "mg", min: 1500, max: 3000, step: 100, default: 2000 },
    title: (d, t) => `${d}일 나트륨 ${n(t)}mg 이하`, rule: (t) => `하루에 기록한 나트륨이 ${n(t)}mg 이하인 날` },
  { metric: "sugar_max", label: "당류 줄이기", hint: "하루 당류 합계가 목표 이하 · 두 끼 이상 기록",
    target: { unit: "g", min: 10, max: 50, step: 5, default: 25 },
    title: (d, t) => `${d}일 당류 ${n(t)}g 이하`, rule: (t) => `하루에 기록한 당류가 ${n(t)}g 이하인 날` },
  { metric: "meals_min", label: "끼니 기록하기", hint: "아침·점심·저녁 중 목표 끼니 수 이상 기록",
    target: { unit: "끼", min: 2, max: 3, step: 1, default: 3 },
    title: (d, t) => `${d}일 ${t === 3 ? "세" : "두"} 끼 기록하기`, rule: (t) => `아침·점심·저녁 중 ${t}끼 이상 기록한 날` },
  { metric: "breakfast", label: "아침 챙겨 먹기", hint: "아침을 기록한 날",
    title: (d) => `${d}일 아침 챙겨 먹기`, rule: () => "아침을 기록한 날" },
  { metric: "record_any", label: "매일 기록하기", hint: "한 끼라도 기록한 날",
    title: (d) => `${d}일 매일 기록하기`, rule: () => "한 끼라도 기록한 날" },
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
    if (!Number.isFinite(target) || target < t.min || target > t.max) return { error: `목표는 ${n(t.min)}~${n(t.max)}${t.unit} 사이로 정해 주세요` };
    target = Math.round(target / t.step) * t.step;
  }
  const goal = raw.goal == null || raw.goal === "" ? defaultGoal(days) : Math.round(Number(raw.goal));
  if (!Number.isFinite(goal) || goal < 1 || goal > days) return { error: `성공 기준은 1~${days}일 사이로 정해 주세요` };
  return { spec, target, days, goal, title: spec.title(days, target), rule: spec.rule(target) };
}
