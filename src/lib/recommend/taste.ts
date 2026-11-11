/**
 * 입맛 — 사용자 입맛(1~10)과 제품 맛 단계(1~10)를 같은 자로 잰다.
 * 홈 추천·탐색 추천순·제품 상세가 모두 이 파일을 쓴다 (서버·브라우저 어디서나 돌아가는 순수 함수).
 *
 * 제품 맛 단계
 *   짠맛 = 나트륨(100g당) · 단맛 = 당류 · 고소한맛 = 지방 → TASTE_RANGES 구간
 *   매운맛 = spicy_score(0~5, 원재료·이름 키워드) × 2  (0 이면 1단계)
 *   값이 없으면 그 축은 모른다 — 0 으로 치지 않는다.
 *
 * 가까움 (0~100)
 *   짠·단·고소: 고른 단계보다 '센' 쪽은 그대로, '약한' 쪽은 35%만 벌점 — 건강 앱이라 덜 짠 것은 크게 탓하지 않는다
 *   매운맛: 양쪽 모두 그대로 — 매운 걸 좋아하면 안 매운 것도, 못 먹으면 매운 것도 멀다
 */
import { TASTE_RANGES } from "./constants";

export type TasteAxis = "salty" | "sweet" | "fatty" | "spicy";
export type Tastes = Record<TasteAxis, number>;

export const TASTE_LABEL: Record<TasteAxis, string> = { salty: "짠맛", sweet: "단맛", fatty: "고소한맛", spicy: "매운맛" };

const FIELD: Record<Exclude<TasteAxis, "spicy">, string> = { salty: "sodium_mg", sweet: "sugar_g", fatty: "fat_g" };
const UNDER_WEIGHT = 0.35;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 영양 수치 → 1~10 단계 */
export function levelOf(axis: Exclude<TasteAxis, "spicy">, value: number): number {
  const ranges = TASTE_RANGES[axis];
  for (let lv = 1; lv <= 10; lv++) {
    const [lo, hi] = ranges[lv];
    if (value >= lo && value < hi) return lv;
  }
  return value < ranges[1][0] ? 1 : 10;
}

/** 제품 맛 단계 — 모르는 축은 빠진다 */
export function productTaste(p: Record<string, unknown>): Partial<Tastes> {
  const out: Partial<Tastes> = {};
  for (const axis of ["salty", "sweet", "fatty"] as const) {
    const v = num(p[FIELD[axis]]);
    if (v !== null && v >= 0) out[axis] = levelOf(axis, v);
  }
  const sp = num(p.spicy_score);
  if (sp !== null) out.spicy = Math.max(1, Math.min(10, Math.round(sp * 2)));
  return out;
}

/** 사용자 입맛 정리 — 1~10 밖이거나 없으면 그 축은 모르는 것으로 */
export function cleanTastes(raw: unknown): Partial<Tastes> {
  const out: Partial<Tastes> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const axis of ["salty", "sweet", "fatty", "spicy"] as const) {
    const v = num((raw as Record<string, unknown>)[axis]);
    if (v !== null && v >= 1 && v <= 10) out[axis] = Math.round(v);
  }
  return out;
}

export type TasteFit = {
  /** 0~100, 아는 축이 없으면 null */
  score: number | null;
  /** 비교한 축 수 */
  axes: number;
  /** 가까운 축 (차이 1단계 이하) */
  close: TasteAxis[];
  /** 고른 것보다 2단계 이상 센 축 */
  stronger: TasteAxis[];
};

export function tasteFit(userRaw: Partial<Tastes>, p: Record<string, unknown>): TasteFit {
  const user = cleanTastes(userRaw); // 0·범위 밖은 모르는 축
  const prod = productTaste(p);
  let dist = 0, axes = 0;
  const close: TasteAxis[] = [], stronger: TasteAxis[] = [];
  for (const axis of ["salty", "sweet", "fatty", "spicy"] as const) {
    const u = user[axis], v = prod[axis];
    if (u === undefined || v === undefined) continue;
    const diff = v - u; // + 면 제품이 더 세다
    const w = axis === "spicy" || diff > 0 ? 1 : UNDER_WEIGHT;
    dist += Math.min(1, (Math.abs(diff) * w) / 6); // 6단계 이상 차이면 그 축은 0점
    axes++;
    if (Math.abs(diff) <= 1) close.push(axis);
    else if (diff >= 2) stronger.push(axis);
  }
  return { score: axes ? Math.round((1 - dist / axes) * 100) : null, axes, close, stronger };
}

/** 순위에 곱하는 값 — 맛 점수 0 이면 ×0.85, 100 이면 ×1.15, 모르면 ×1 */
export function tasteMultiplier(fit: TasteFit): number {
  return fit.score === null ? 1 : 0.85 + 0.3 * (fit.score / 100);
}

/** 이유 한 줄 — "짠맛·매운맛이 고른 입맛과 가까워요" (가까운 축이 2개 이상일 때만) */
export function tasteReason(fit: TasteFit): string | null {
  if (fit.score === null || fit.score < 75 || fit.close.length < 2) return null;
  return `${fit.close.slice(0, 2).map((a) => TASTE_LABEL[a]).join("·")}이 고른 입맛과 가까워요`;
}
