/**
 * 스코어링 엔진 — 곱연산 기반
 * score = healthBase × relevance × preference
 */

import type { UserProfile, ScoredProduct, HealthConcern } from "./types";
import {
  CONCERN_TAG_BOOSTS,
  CONCERN_RULES,
  SENSITIVITY_RULES,
  TASTE_RANGES,
  CONCERN_CATEGORY_WEIGHT,
} from "./constants";

// ── 유틸 ──

function checkRule(product: Record<string, unknown>, rule: { field: string; op: string; value: number | [number, number] }): boolean {
  const v = product[rule.field] as number | null | undefined;
  if (v === null || v === undefined) return false;
  switch (rule.op) {
    case "lt": return v < (rule.value as number);
    case "gt": return v > (rule.value as number);
    case "lte": return v <= (rule.value as number);
    case "gte": return v >= (rule.value as number);
    case "between": {
      const [min, max] = rule.value as [number, number];
      return v >= min && v <= max;
    }
    default: return false;
  }
}

function extractDishKeyword(name: string, manufacturer: string | null): string {
  let s = name;
  if (manufacturer) {
    const mfr = manufacturer.replace(/[㈜(주)주식회사]/g, "").trim();
    if (mfr.length >= 2) s = s.replace(new RegExp(mfr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").trim();
  }
  s = s.replace(/^\[.*?\]\s*/, "");
  s = s.replace(/\s*\(.*?\)\s*/g, " ");
  s = s.replace(/\s*\d+(?:\.\d+)?\s*(g|kg|ml|l|mL|리터)\b/gi, " ");
  s = s.replace(/\s*[xX×*]\s*\d+\s*(개입|입|팩|봉|ea|개)?/g, " ");
  s = s.replace(/\s*\d+\s*(개입|입|팩|봉|ea)\s*/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  const tokens = s.split(" ").filter((t) => t.length >= 1);
  return (tokens.length > 4 ? tokens.slice(-4) : tokens).join(" ") || name.slice(0, 20);
}

// ── 메인 스코어링 (곱연산) ──

export function scoreProduct(
  p: Record<string, unknown>,
  profile: UserProfile,
  isPurchasable: boolean,
): ScoredProduct {
  const reasons: string[] = [];
  const reasonDetails: string[] = [];

  // ─── 1. Health Base (0.4 ~ 1.0) ───
  const healthScore = (p.health_score as number) || 50;
  const healthBase = 0.3 + (healthScore / 100) * 0.7; // 50점→0.65, 80점→0.86, 95점→0.965

  if (healthScore >= 75) {
    reasons.push("건강 지표 우수");
    reasonDetails.push(`건강 점수 ${healthScore}점`);
  }

  // ─── 2. Relevance (관심사 매칭도, 0.5 ~ 2.0) ───
  let relevance = 1.0;

  // 기능성 태그 매칭
  const productTags: string[] = (p.functional_tags as string[]) || [];
  for (const concern of profile.concerns) {
    const boosts = CONCERN_TAG_BOOSTS[concern];
    if (!boosts) continue;
    for (const boost of boosts) {
      if (productTags.includes(boost.tag)) {
        relevance *= boost.weight;
        if (!reasons.includes(boost.reason)) {
          reasons.push(boost.reason);
          reasonDetails.push(boost.detail);
        }
      }
    }
  }

  // 관심사 영양 규칙
  for (const concern of profile.concerns) {
    const rules = CONCERN_RULES[concern];
    if (!rules) continue;
    for (const rule of rules) {
      if (checkRule(p, rule)) {
        relevance *= rule.weight;
        if (!reasons.includes(rule.reason)) {
          reasons.push(rule.reason);
          const val = p[rule.field] as number | null;
          if (val !== null && val !== undefined) reasonDetails.push(rule.detail(val));
        }
      }
    }
  }

  // 카테고리 적합도
  const dishCategory = (p.dish_category as string) || "other";
  for (const concern of profile.concerns) {
    const weights = CONCERN_CATEGORY_WEIGHT[concern];
    if (weights && dishCategory in weights) {
      relevance *= weights[dishCategory];
    }
  }

  // 건강 목표별 보너스
  const calories = (p.calories as number) || 0;
  const proteinG = (p.protein_g as number) || 0;
  const sugarG = (p.sugar_g as number) ?? 99;
  const sodiumMg = (p.sodium_mg as number) || 0;
  const fiberG = (p.fiber_g as number) || 0;

  if (profile.goals.includes("muscle") && proteinG >= 25) {
    relevance *= 1.15;
    if (!reasons.includes("고단백")) { reasons.push("고단백"); reasonDetails.push(`단백질 ${proteinG}g — 근력 강화에 적합`); }
  }
  if (profile.goals.includes("weight_loss") && calories > 0 && calories <= profile.perMeal.caloriesMax) {
    relevance *= 1.1;
    if (!reasons.includes("칼로리 적정")) { reasons.push("칼로리 적정"); reasonDetails.push(`${calories}kcal — 끼니당 ${profile.perMeal.caloriesMax}kcal 이하`); }
  }
  if (profile.goals.includes("diabetes") && sugarG <= profile.perMeal.maxSugarG) {
    relevance *= 1.1;
  }
  if (profile.goals.includes("blood_pressure") && sodiumMg <= profile.perMeal.maxSodiumMg) {
    relevance *= 1.1;
  }

  // perMeal 적합성 보너스 (개인화 핵심)
  if (proteinG >= profile.perMeal.minProteinG) {
    relevance *= 1.1;
    if (!reasons.includes("단백질 충족")) {
      reasons.push("단백질 충족");
      reasonDetails.push(`단백질 ${proteinG}g — 끼니당 ${profile.perMeal.minProteinG}g 권장 충족`);
    }
  }
  if (sodiumMg > 0 && sodiumMg <= profile.perMeal.maxSodiumMg * 0.7) {
    relevance *= 1.05;
  }

  // 매크로 균형 보너스
  if (calories >= 150 && calories <= 500 && proteinG >= 10 && (p.carbs_g as number) >= 10
      && (p.fat_g as number) >= 2 && (p.fat_g as number) <= 20) {
    relevance *= 1.1;
    if (!reasons.includes("영양 균형")) {
      reasons.push("영양 균형");
      reasonDetails.push("3대 영양소가 골고루 포함된 균형식");
    }
  }

  // ─── 3. Preference (맛 + 구매 + 민감도, 0.7 ~ 1.3) ───
  let preference = 1.0;

  // 맛 일치
  let tasteMatch = 0;
  if (profile.tastes.salty >= 1 && profile.tastes.salty <= 10) {
    const range = TASTE_RANGES.salty[profile.tastes.salty];
    if (range && sodiumMg >= range[0] && sodiumMg < range[1]) { preference *= 1.05; tasteMatch++; }
  }
  if (profile.tastes.sweet >= 1 && profile.tastes.sweet <= 10 && sugarG < 99) {
    const range = TASTE_RANGES.sweet[profile.tastes.sweet];
    if (range && sugarG >= range[0] && sugarG < range[1]) { preference *= 1.05; tasteMatch++; }
  }
  if (tasteMatch >= 2) {
    reasons.push("맛 취향 일치");
    reasonDetails.push("선호하시는 맛 프로필에 가까워요");
  }

  // 구매 가능 보너스
  if (isPurchasable) preference *= 1.15;

  // 건강식단서비스 보너스 (전환 가능)
  if ((p.category_large as string) === "건강식단서비스") preference *= 1.1;

  // 민감도
  if (profile.sensitivity.digestive === 3) {
    for (const rule of SENSITIVITY_RULES.digestive) {
      if (checkRule(p, rule)) preference *= rule.weight;
    }
  }
  if (profile.sensitivity.additive === 3) {
    for (const rule of SENSITIVITY_RULES.additive) {
      if (checkRule(p, rule)) preference *= rule.weight;
    }
  }

  // 60세 이상: 소화 쉬운 카테고리 보너스
  if (profile.body.age >= 60) {
    if (["soup", "stew", "rice"].includes(dishCategory)) preference *= 1.08;
  }

  // ─── 최종 점수 ───
  const rawScore = healthBase * relevance * preference;

  return {
    ...p,
    match_score: rawScore, // percentile로 나중에 변환
    match_reasons: reasons.slice(0, 4),
    reason_detail: reasonDetails[0] || null,
    dish_keyword: extractDishKeyword(p.name as string, p.manufacturer as string | null),
  };
}

/** 점수 배열을 percentile(0~100)로 변환 */
export function normalizeScores(products: ScoredProduct[]): ScoredProduct[] {
  if (products.length === 0) return products;

  const scores = products.map((p) => p.match_score).sort((a, b) => a - b);
  const min = scores[0];
  const max = scores[scores.length - 1];
  const range = max - min || 1;

  return products.map((p) => ({
    ...p,
    match_score: Math.round(((p.match_score - min) / range) * 80 + 20), // 20~100 범위
  }));
}

/** 제품 배열 스코어링 + 정규화 + 정렬 */
export function scoreAndRank(
  products: Record<string, unknown>[],
  profile: UserProfile,
  purchasableIds: Set<string>,
): ScoredProduct[] {
  const scored = products.map((p) =>
    scoreProduct(p, profile, purchasableIds.has(p.id as string))
  );
  const normalized = normalizeScores(scored);
  normalized.sort((a, b) => b.match_score - a.match_score);
  return normalized;
}
