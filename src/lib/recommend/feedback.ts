/**
 * 평가에서 배우기 — 내가 남긴 맛 평가(product_reviews: 별점 1~5, 맛 체감 1~5)로
 *   1) 입맛을 조금씩 맞춘다: 좋아한 제품(4~5점)의 맛 단계 쪽으로, 싫어한 제품(1~2점) 중 '그 맛이 세다'(체감 4~5)고 한 축은 그보다 2단계 낮은 쪽으로
 *      평가 하나에 10%씩, 최대 50%까지만 움직인다 — 처음 고른 입맛을 뒤집지 않는다
 *   2) 싫어한 제품은 다시 추천하지 않고, 같은 묶음(맛만 다른 같은 제품)은 ×0.85
 *   3) 좋아한 제품과 같은 묶음의 다른 맛은 ×1.08
 * 다른 사람의 평가는 쓰지 않는다 (제품 평균은 reviews.ts).
 */
import { familyKey } from "./family";
import { productTaste, type TasteAxis } from "./taste";

export type Feedback = {
  dislikedIds: Set<string>;
  dislikedFamilies: Set<string>;
  likedFamilies: Set<string>;
  /** 평가로 맞춘 입맛 (바뀐 축만) */
  learned: Partial<Record<TasteAxis, number>>;
  /** 입맛 보정에 쓴 평가 수 */
  samples: number;
};

export const EMPTY_FEEDBACK: Feedback = { dislikedIds: new Set(), dislikedFamilies: new Set(), likedFamilies: new Set(), learned: {}, samples: 0 };

const FEEL: Record<Exclude<TasteAxis, never>, string> = { salty: "taste_salty_feel", sweet: "taste_sweet_feel", spicy: "taste_spicy_feel", fatty: "taste_fatty_feel" };

type Review = { product_id: string; rating: number; taste_salty_feel: number | null; taste_sweet_feel: number | null; taste_spicy_feel: number | null; taste_fatty_feel: number | null };

/** 순수 계산 — base 는 사용자가 고른 입맛(1~10, 0 이면 모름) */
export function learnFromReviews(base: Record<TasteAxis, number>, reviews: Review[], products: Map<string, Record<string, unknown>>): Feedback {
  const fb: Feedback = { dislikedIds: new Set(), dislikedFamilies: new Set(), likedFamilies: new Set(), learned: {}, samples: 0 };
  const targets: Record<TasteAxis, number[]> = { salty: [], sweet: [], spicy: [], fatty: [] };
  for (const r of reviews) {
    const p = products.get(r.product_id);
    if (!p) continue;
    const fam = familyKey(p);
    const liked = r.rating >= 4, disliked = r.rating <= 2;
    if (disliked) { fb.dislikedIds.add(r.product_id); fb.dislikedFamilies.add(fam); }
    if (liked) fb.likedFamilies.add(fam);
    if (!liked && !disliked) continue;
    const lv = productTaste(p);
    let used = false;
    for (const axis of ["salty", "sweet", "spicy", "fatty"] as const) {
      const v = lv[axis];
      if (v === undefined) continue;
      const feel = r[FEEL[axis] as keyof Review] as number | null;
      if (liked) { targets[axis].push(v); used = true; }
      else if (feel !== null && feel >= 4) { targets[axis].push(Math.max(1, v - 2)); used = true; } // 세다고 한 축만
    }
    if (used) fb.samples++;
  }
  for (const axis of ["salty", "sweet", "spicy", "fatty"] as const) {
    const t = targets[axis];
    if (!t.length) continue;
    const mean = t.reduce((a, b) => a + b, 0) / t.length;
    const b = base[axis];
    const next = b >= 1 ? b + Math.min(0.5, t.length * 0.1) * (mean - b) : t.length >= 2 ? mean : NaN;
    if (Number.isFinite(next)) {
      const r = Math.max(1, Math.min(10, Math.round(next)));
      if (r !== b) fb.learned[axis] = r;
    }
  }
  return fb;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadFeedback(sb: any, userId: string, base: Record<TasteAxis, number>): Promise<Feedback> {
  if (!userId) return EMPTY_FEEDBACK;
  const { data: reviews, error } = await sb.from("product_reviews")
    .select("product_id, rating, taste_salty_feel, taste_sweet_feel, taste_spicy_feel, taste_fatty_feel")
    .eq("user_id", userId).order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  if (!reviews?.length) return EMPTY_FEEDBACK;
  const ids = [...new Set((reviews as Review[]).map((r) => r.product_id))];
  const products = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error: pErr } = await sb.from("products")
      .select("id, name, manufacturer, sodium_mg, sugar_g, fat_g, spicy_score, taste_salty, taste_sweet, taste_fatty, taste_spicy")
      .in("id", ids.slice(i, i + 150));
    if (pErr) throw new Error(pErr.message);
    for (const p of data || []) products.set(p.id, p);
  }
  return learnFromReviews(base, reviews as Review[], products);
}

/** 순위에 곱하는 값 — 싫어한 제품은 -1(빼기) */
export function feedbackMultiplier(p: Record<string, unknown>, fb: Feedback | undefined): number {
  if (!fb) return 1;
  if (fb.dislikedIds.has(p.id as string)) return -1;
  const fam = familyKey(p);
  if (fb.dislikedFamilies.has(fam)) return 0.85;
  if (fb.likedFamilies.has(fam)) return 1.08;
  return 1;
}
