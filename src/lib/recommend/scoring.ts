/**
 * 스코어링 엔진 — 곱연산 기반
 * score = healthBase × relevance × preference
 */

import type { UserProfile, ScoredProduct, HealthConcern } from "./types";
import type { UserInteractions } from "./interactions";
import type { ProductReviewStats } from "./reviews";
import type { CFBoost } from "./collaborative";
import {
  CONCERN_TAG_BOOSTS,
  CONCERN_RULES,
  SENSITIVITY_RULES,
  CONCERN_CATEGORY_WEIGHT,
} from "./constants";
import { tasteFit, tasteMultiplier, tasteReason } from "./taste";
import { isAllergenic } from "./allergy";
import { feedbackMultiplier, type Feedback } from "./feedback";

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
  interactions?: UserInteractions,
  reviewStats?: Record<string, ProductReviewStats>,
  timeOfDay?: number, // KST 시간 (0~23)
  cfBoosts?: CFBoost[],
  feedback?: Feedback, // 내 맛 평가 (feedback.ts)
): ScoredProduct {
  const reasons: string[] = [];
  const reasonDetails: string[] = [];

  // ─── 알레르기 제외 (이름 + 원재료) ───
  if (isAllergenic(p, profile.allergies)) {
    return {
      ...p,
      match_score: -1,
      rank_score: -1,
      taste_score: 0,
      nutrition_score: 0,
      match_reasons: [],
      reason_detail: null,
      dish_keyword: "",
      is_excluded_allergy: true,
    } as ScoredProduct;
  }

  // ─── 0. per-serving 보정 ───
  // DB 값은 모두 nutrient_base_g(보통 100g) 기준
  // perMeal 비교 시 per-serving 값으로 변환
  const baseG = (p.nutrient_base_g as number) || 100;
  const servingG = (p.serving_size_g as number) || 100;
  const servingRatio = baseG > 0 ? servingG / baseG : 1;

  // ─── 1. Health Base (0.4 ~ 1.0) ───
  const healthScore = p.health_score == null ? 50 : Number(p.health_score); // 0점은 0점으로
  const healthBase = 0.3 + (healthScore / 100) * 0.7;

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

  // ─── 시간대별 카테고리 부스트 ───
  if (timeOfDay !== undefined) {
    const cat = dishCategory;
    let timeMul = 1.0;
    // 분류 이름은 DishCategory (types/database.ts) 그대로
    if (timeOfDay >= 6 && timeOfDay < 10) {
      // 아침: 가벼운 식사, 유제품, 빵, 음료·선식
      if (["dairy", "bread", "beverage", "powder", "snack"].includes(cat)) timeMul = 1.08;
      if (["soup", "stew", "grill"].includes(cat)) timeMul = 0.95;
    } else if (timeOfDay >= 11 && timeOfDay < 14) {
      // 점심: 한 끼 식사
      if (["rice", "noodle", "soup", "stew", "set"].includes(cat)) timeMul = 1.06;
    } else if (timeOfDay >= 17 && timeOfDay < 21) {
      // 저녁: 든든한 식사
      if (["rice", "soup", "stew", "grill", "seafood", "side", "set"].includes(cat)) timeMul = 1.06;
      if (["snack", "beverage"].includes(cat)) timeMul = 0.95;
    } else if ((timeOfDay >= 14 && timeOfDay < 17) || timeOfDay >= 21) {
      // 간식 시간
      if (["snack", "beverage", "dairy", "bread"].includes(cat)) timeMul = 1.08;
      if (["rice", "noodle", "set"].includes(cat)) timeMul = 0.95;
    }
    relevance *= timeMul;
  }

  // 건강 목표별 보너스
  // per-100g 값 (식품 특성 비교용)
  const cal100 = (p.calories as number) || 0;
  const pro100 = (p.protein_g as number) || 0;
  const sug100 = (p.sugar_g as number) ?? 99;
  // 나트륨을 모르면 null — 0 으로 치면 '저나트륨' 보너스를 받아 버린다
  const sod100: number | null = p.sodium_mg == null ? null : Number(p.sodium_mg);
  const fib100 = (p.fiber_g as number) || 0;
  // per-serving 값 (식사 충족 비교용)
  const calories = Math.round(cal100 * servingRatio * 10) / 10;
  const proteinG = Math.round(pro100 * servingRatio * 10) / 10;
  const sugarG = sug100 < 99 ? Math.round(sug100 * servingRatio * 10) / 10 : 99;
  const sodiumMg: number | null = sod100 === null ? null : Math.round(sod100 * servingRatio * 10) / 10;
  const fiberG = Math.round(fib100 * servingRatio * 10) / 10;

  // 식품 특성 기반 보너스 (per-100g: "이 식품이 고단백인가?")
  if (profile.goals.includes("muscle") && pro100 >= 20) {
    relevance *= 1.15;
    if (!reasons.includes("고단백")) { reasons.push("고단백"); reasonDetails.push(`단백질 ${proteinG}g/1회 — 근력 강화에 적합`); }
  }
  // perMeal 비교 (per-serving: "이 한끼가 칼로리 예산에 맞는가?")
  if (profile.goals.includes("weight_loss") && calories > 0 && calories <= profile.perMeal.caloriesMax) {
    relevance *= 1.1;
    if (!reasons.includes("칼로리 적정")) { reasons.push("칼로리 적정"); reasonDetails.push(`${calories}kcal/1회 — 끼니당 ${profile.perMeal.caloriesMax}kcal 이하`); }
  }
  if (profile.goals.includes("diabetes") && sugarG <= profile.perMeal.maxSugarG) {
    relevance *= 1.1;
  }
  if (profile.goals.includes("blood_pressure") && sodiumMg !== null && sodiumMg <= profile.perMeal.maxSodiumMg) {
    relevance *= 1.1;
  }

  // perMeal 적합성 보너스 (per-serving 기준)
  if (proteinG >= profile.perMeal.minProteinG) {
    relevance *= 1.1;
    if (!reasons.includes("단백질 충족")) {
      reasons.push("단백질 충족");
      reasonDetails.push(`단백질 ${proteinG}g/1회 — 끼니당 ${profile.perMeal.minProteinG}g 권장 충족`);
    }
  }
  if (sodiumMg !== null && sodiumMg > 0 && sodiumMg <= profile.perMeal.maxSodiumMg * 0.7) {
    relevance *= 1.05;
  }

  // 매크로 균형 보너스 (per-serving: 실제 식사로서 균형 잡혀 있는가?)
  if (calories >= 150 && calories <= 500 && proteinG >= 10
      && (p.carbs_g as number) * servingRatio >= 10
      && (p.fat_g as number) * servingRatio >= 2
      && (p.fat_g as number) * servingRatio <= 20) {
    relevance *= 1.1;
    if (!reasons.includes("영양 균형")) {
      reasons.push("영양 균형");
      reasonDetails.push("3대 영양소가 골고루 포함된 균형식");
    }
  }

  // ─── 3. Preference (맛 + 구매 + 민감도, 0.7 ~ 1.3) ───
  let preference = 1.0;

  // 맛 — 짠·단·고소·매운 4축을 1~10 단계로 비교해 순위에 ×0.85~1.15 (lib/recommend/taste.ts)
  const fit = tasteFit(profile.tastes, p);
  preference *= tasteMultiplier(fit);
  const tasteLine = tasteReason(fit);
  if (tasteLine) {
    reasons.push("맛 취향 일치");
    reasonDetails.push(tasteLine);
  }

  // 끼니 역할 (products.meal_role — scripts/build_taste_profile.py) — 한 끼·반찬을 간식·음료보다 앞에
  const ROLE_MUL: Record<string, number> = { meal: 1.1, side: 1.0, snack: 0.9, drink: 0.88, condiment: 0.6, ingredient: 0.6, supplement: 0.5 };
  const role = p.meal_role as string | null | undefined;
  if (role && role in ROLE_MUL) preference *= ROLE_MUL[role];

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

  // ─── 맛 점수 (0~100): 같은 tasteFit ───
  const fatVal = (p.fat_g as number) || 0;
  const tasteAxes = fit.axes;
  const tasteScoreRaw = fit.score ?? 50;

  // ─── 영양 점수 (0~100): perMeal 기준 충족도 ───
  let nutritionHits = 0;
  let nutritionTotal = 0;
  if (profile.perMeal.minProteinG > 0) {
    nutritionTotal++;
    if (proteinG >= profile.perMeal.minProteinG) nutritionHits++;
  }
  if (profile.perMeal.caloriesMax > 0 && calories > 0) {
    nutritionTotal++;
    if (calories <= profile.perMeal.caloriesMax) nutritionHits++;
  }
  if (profile.perMeal.maxSodiumMg > 0 && sodiumMg !== null && sodiumMg > 0) {
    nutritionTotal++;
    if (sodiumMg <= profile.perMeal.maxSodiumMg) nutritionHits++;
  }
  if (profile.perMeal.maxSugarG > 0 && sugarG < 99) {
    nutritionTotal++;
    if (sugarG <= profile.perMeal.maxSugarG) nutritionHits++;
  }
  // 기본 영양 균형 (매크로 3종 존재 여부)
  nutritionTotal++;
  if (proteinG >= 5 && (p.carbs_g as number) >= 5 && fatVal >= 1) nutritionHits++;

  const nutritionScoreRaw = nutritionTotal > 0
    ? Math.round((nutritionHits / nutritionTotal) * 100)
    : 50;

  // ─── 4. Interaction (피드백 루프, 0.8 ~ 1.2) ───
  let interactionMul = 1.0;
  if (interactions) {
    const pid = p.id as string;
    // 이미 본 제품 감점 (재방문 시 새로운 제품 노출)
    if (interactions.viewedIds.has(pid)) interactionMul *= 0.85;
    // 클릭한 적 있으면 약간 복원 (관심 있었던 제품)
    if (interactions.clickedIds.has(pid)) interactionMul *= 1.05;
    // 즐겨찾기한 제품은 부스트
    if (interactions.favoritedIds.has(pid)) interactionMul *= 1.1;
    // 선호 카테고리 부스트
    const cat = (p.dish_category as string) || "other";
    const catCount = interactions.preferredCategories[cat] || 0;
    if (catCount >= 3) interactionMul *= 1.08;
    else if (catCount >= 1) interactionMul *= 1.03;
  }

  // ─── 5. Review Signal (리뷰 기반 품질 시그널) ───
  let reviewMul = 1.0;
  if (reviewStats) {
    const stats = reviewStats[p.id as string];
    if (stats && stats.reviewCount >= 2) {
      // 평점 반영
      if (stats.avgRating >= 4.0) { reviewMul *= 1.08; }
      else if (stats.avgRating >= 3.5) { reviewMul *= 1.03; }
      else if (stats.avgRating <= 2.5) { reviewMul *= 0.85; }

      // 재구매율 반영
      if (stats.rebuyRate >= 0.8) reviewMul *= 1.05;

      // 리뷰 수 자체가 인기 시그널
      if (stats.reviewCount >= 5) reviewMul *= 1.03;

      if (stats.avgRating >= 4.0) {
        reasons.push("높은 평점");
        reasonDetails.push(`평균 ${stats.avgRating.toFixed(1)}점 (${stats.reviewCount}건)`);
      }
    }
  }

  // ─── 6. Collaborative Filtering (비슷한 사용자 추천, 0~15% 부스트) ───
  let cfMul = 1.0;
  if (cfBoosts && cfBoosts.length > 0) {
    const pid = p.id as string;
    const boost = cfBoosts.find(b => b.productId === pid);
    if (boost) {
      cfMul = 1 + boost.cfScore * 0.15; // 최대 ~15% 부스트
      reasons.push("비슷한 사용자 추천");
      reasonDetails.push("나와 비슷한 관심사를 가진 사용자들이 선호한 제품");
    }
  }

  // ─── 7. 내 평가 — 싫어한 제품은 빼고, 같은 묶음은 낮추고, 좋아한 묶음은 올린다 ───
  const fbMul = feedbackMultiplier(p, feedback);
  if (fbMul < 0) {
    return { ...p, match_score: -1, rank_score: -1, taste_score: 0, nutrition_score: 0, match_reasons: [], reason_detail: null, dish_keyword: "", is_excluded_allergy: true } as ScoredProduct;
  }
  if (fbMul > 1) { reasons.push("좋아한 제품과 비슷"); reasonDetails.push("좋다고 평가한 제품의 다른 맛이에요"); }

  // ─── 종합 매칭 점수 ───
  const rawScore = healthBase * relevance * preference * interactionMul * reviewMul * cfMul * fbMul;

  return {
    ...p,
    match_score: displayMatch(tasteScoreRaw, nutritionScoreRaw, tasteAxes > 0),
    rank_score: rawScore,
    taste_score: tasteScoreRaw,
    taste_known: tasteAxes > 0,
    nutrition_score: nutritionScoreRaw,
    match_reasons: reasons.slice(0, 4),
    reason_detail: reasonDetails[0] || null,
    dish_keyword: extractDishKeyword(p.name as string, p.manufacturer as string | null),
  };
}

/**
 * 화면에 보이는 매칭 점수 (0~100, 절대 기준) — 기획서: 맛 40% + 영양 60%
 * 같은 제품·같은 프로필이면 어느 목록에서 봐도 같은 점수다. 맛 취향을 모르면 영양 점수만.
 */
export function displayMatch(taste: number, nutrition: number, tasteKnown: boolean) {
  const v = tasteKnown ? 0.4 * taste + 0.6 * nutrition : nutrition;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** 정렬용 점수 비교 (rank_score 가 없으면 match_score) */
export const byRank = (a: ScoredProduct, b: ScoredProduct) => (b.rank_score ?? b.match_score) - (a.rank_score ?? a.match_score);

/** 제품 배열 스코어링 + 정규화 + 정렬 */
export function scoreAndRank(
  products: Record<string, unknown>[],
  profile: UserProfile,
  purchasableIds: Set<string>,
  interactions?: UserInteractions,
  reviewStats?: Record<string, ProductReviewStats>,
  timeOfDay?: number,
  cfBoosts?: CFBoost[],
  feedback?: Feedback,
): ScoredProduct[] {
  const scored = products.map((p) =>
    scoreProduct(p, profile, purchasableIds.has(p.id as string), interactions, reviewStats, timeOfDay, cfBoosts, feedback)
  );
  // 알레르기·싫어한 제품 빼기
  const filtered = scored.filter((p) => !p.is_excluded_allergy);
  filtered.sort(byRank);
  return filtered;
}
