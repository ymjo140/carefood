import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * 이너케어 추천 API v3
 * GET: 그룹핑 + 필터 + 페이지네이션 (신규 탐색 UI)
 * POST: 기존 v2 호환 (추천 결과 평탄)
 *
 * 관심사(concern) × 민감도 × 영양성분 매칭 × 안전 규칙
 * 팜킷 특허 회피: 온톨로지 음식유사도 방식이 아닌,
 * 전문가 설계 분기형 규칙 기반 매칭 사용
 */

type HealthConcern = "gut_health" | "skin" | "weight" | "energy";

// ─── 관심사별 기능성 성분 태그 매핑 ───
const CONCERN_TAG_BOOSTS: Record<HealthConcern, { tag: string; score: number; reason: string; detail: string }[]> = {
  gut_health: [
    { tag: "probiotics", score: 20, reason: "유산균 함유", detail: "유산균이 포함된 제품이에요" },
    { tag: "prebiotic", score: 18, reason: "식이섬유 함유", detail: "프리바이오틱스(식이섬유)가 포함돼 있어요" },
  ],
  skin: [
    { tag: "collagen", score: 20, reason: "콜라겐 함유", detail: "콜라겐이 포함된 제품이에요" },
    { tag: "vitamin", score: 12, reason: "비타민 함유", detail: "비타민이 포함돼 있어요" },
    { tag: "zinc", score: 10, reason: "아연 함유", detail: "아연이 포함된 제품이에요" },
  ],
  weight: [
    { tag: "protein", score: 15, reason: "프로틴 제품", detail: "단백질 보충용으로 설계된 제품이에요" },
    { tag: "diet", score: 15, reason: "다이어트 설계", detail: "저칼로리/다이어트용으로 설계됐어요" },
    { tag: "sugar_free", score: 12, reason: "무설탕", detail: "설탕 없이 만든 제품이에요" },
  ],
  energy: [
    { tag: "vitamin", score: 15, reason: "비타민 함유", detail: "비타민이 포함돼 있어요" },
    { tag: "iron", score: 12, reason: "철분 함유", detail: "철분이 포함된 제품이에요" },
    { tag: "calcium", score: 10, reason: "칼슘 함유", detail: "칼슘이 포함돼 있어요" },
    { tag: "omega3", score: 10, reason: "오메가3 함유", detail: "오메가3가 포함된 제품이에요" },
  ],
};

// ─── 관심사별 영양 스코어링 규칙 ───
type NutrientRule = {
  field: string;
  op: "lt" | "gt" | "gte" | "lte" | "between";
  value: number | [number, number];
  score: number;
  reason: string;
  detail: (v: number) => string;
};

const CONCERN_RULES: Record<HealthConcern, NutrientRule[]> = {
  gut_health: [
    { field: "fiber_g", op: "gte", value: 3, score: 15, reason: "식이섬유 풍부", detail: (v) => `식이섬유 ${v}g — 고식이섬유 식품` },
    { field: "sugar_g", op: "lt", value: 8, score: 8, reason: "당류 적정", detail: (v) => `당류 ${v}g — 저당 식품` },
    { field: "fat_g", op: "lt", value: 10, score: 5, reason: "저지방", detail: (v) => `지방 ${v}g — 저지방 식품` },
  ],
  skin: [
    { field: "protein_g", op: "gte", value: 10, score: 12, reason: "단백질 풍부", detail: (v) => `단백질 ${v}g — 고단백 식품` },
    { field: "fat_g", op: "between", value: [3, 15], score: 8, reason: "건강한 지방", detail: (v) => `지방 ${v}g — 적정 지방 함유` },
    { field: "sugar_g", op: "lt", value: 5, score: 10, reason: "저당", detail: (v) => `당류 ${v}g — 저당 식품` },
  ],
  weight: [
    { field: "calories", op: "lt", value: 300, score: 15, reason: "저칼로리", detail: (v) => `${v}kcal — 저칼로리 식품` },
    { field: "protein_g", op: "gte", value: 15, score: 12, reason: "고단백", detail: (v) => `단백질 ${v}g — 고단백 식품` },
    { field: "fat_g", op: "lt", value: 8, score: 8, reason: "저지방", detail: (v) => `지방 ${v}g — 저지방 식품` },
    { field: "sugar_g", op: "lt", value: 5, score: 8, reason: "저당", detail: (v) => `당류 ${v}g — 저당 식품` },
  ],
  energy: [
    { field: "calories", op: "between", value: [200, 500], score: 10, reason: "적정 열량", detail: (v) => `${v}kcal — 적정 열량 식품` },
    { field: "protein_g", op: "gte", value: 12, score: 12, reason: "단백질 풍부", detail: (v) => `단백질 ${v}g — 고단백 식품` },
    { field: "carbs_g", op: "gte", value: 20, score: 8, reason: "탄수화물 충분", detail: (v) => `탄수화물 ${v}g — 탄수화물 충분` },
  ],
};

const SENSITIVITY_RULES = {
  digestive: [
    { sensitivityLevel: 3, field: "fat_g", op: "lt" as const, value: 8, score: 8, reason: "소화 편한" },
    { sensitivityLevel: 3, field: "sodium_mg", op: "lt" as const, value: 500, score: 5, reason: "자극 적은" },
  ],
  additive: [
    { sensitivityLevel: 3, field: "sodium_mg", op: "lt" as const, value: 400, score: 8, reason: "저나트륨" },
  ],
};

// ─── 맛 레벨 → 영양성분 범위 (10단계) ───
const TASTE_RANGES: Record<string, Record<number, [number, number]>> = {
  salty: {
    1: [0, 100], 2: [100, 200], 3: [200, 350], 4: [350, 500], 5: [500, 650],
    6: [650, 800], 7: [800, 1000], 8: [1000, 1200], 9: [1200, 1500], 10: [1500, 9999],
  },
  sweet: {
    1: [0, 1], 2: [1, 2], 3: [2, 4], 4: [4, 6], 5: [6, 9],
    6: [9, 12], 7: [12, 16], 8: [16, 20], 9: [20, 25], 10: [25, 99],
  },
  fatty: {
    1: [0, 1], 2: [1, 3], 3: [3, 5], 4: [5, 7], 5: [7, 10],
    6: [10, 15], 7: [15, 20], 8: [20, 25], 9: [25, 30], 10: [30, 99],
  },
};

// v1 5단계 → 10단계 변환 (하위호환)
function tasteLevel5to10(level: number): number {
  if (level <= 0 || level > 5) return level;
  return level * 2; // 1→2, 2→4, 3→6, 4→8, 5→10
}

// ─── 유틸 ───

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

// ─── 요리 키워드 추출 ───

function extractDishKeyword(name: string, manufacturer: string | null): string {
  let s = name;
  // 제조사명 제거
  if (manufacturer) {
    const mfr = manufacturer.replace(/[㈜(주)주식회사]/g, "").trim();
    if (mfr.length >= 2) {
      s = s.replace(new RegExp(escapeRegex(mfr), "gi"), "").trim();
    }
  }
  // [브랜드] 제거
  s = s.replace(/^\[.*?\]\s*/, "");
  // (부가정보) 제거
  s = s.replace(/\s*\(.*?\)\s*/g, " ");
  // 수량·중량 제거
  s = s.replace(/\s*\d+(?:\.\d+)?\s*(g|kg|ml|l|mL|리터)\b/gi, " ");
  s = s.replace(/\s*[xX×*]\s*\d+\s*(개입|입|팩|봉|ea|개)?/g, " ");
  s = s.replace(/\s*\d+\s*(개입|입|팩|봉|ea)\s*/g, " ");
  s = s.replace(/\s*\d+종\s*/g, " ");
  s = s.replace(/\s*(택1|택\d+)\s*/g, "");
  // 숫자만 남은 토큰 제거
  s = s.replace(/\b\d+\b/g, "");
  s = s.replace(/\s+/g, " ").trim();

  // 남은 텍스트가 너무 길면 마지막 핵심 단어들만 (최대 4단어)
  const tokens = s.split(" ").filter((t) => t.length >= 1);
  if (tokens.length > 4) {
    return tokens.slice(-4).join(" ");
  }
  return tokens.join(" ") || name.slice(0, 20);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── 관심사별 dish_category 적합도 가중치 ───
// 양수: 보너스, 음수: 감점 (해당 관심사에 부적합한 카테고리)
const CONCERN_CATEGORY_WEIGHT: Record<HealthConcern, Record<string, number>> = {
  gut_health: {
    rice: 8, soup: 10, stew: 8, salad: 10, side: 5, grill: 5, seafood: 5,
    snack: -15, beverage: -5, bread: -8, sauce: -20, ingredient: -20,
  },
  skin: {
    grill: 8, seafood: 10, salad: 10, dairy: 8, soup: 5, side: 5,
    snack: -12, sauce: -20, ingredient: -20, bread: -5,
  },
  weight: {
    salad: 12, grill: 10, seafood: 10, soup: 8, side: 8, rice: 3,
    snack: -15, bread: -10, sauce: -20, ingredient: -20, beverage: -5,
  },
  energy: {
    grill: 12, rice: 10, stew: 8, noodle: 5, seafood: 8, dairy: 8, soup: 5,
    snack: -15, sauce: -20, ingredient: -20, beverage: -8,
  },
};

// ─── 공통 스코어링 ───

type ScoredProduct = Record<string, unknown> & {
  match_score: number;
  matched_concerns: HealthConcern[];
  reasons: string[];
  reason_detail: string | null;
  dish_keyword: string;
};

interface ScoreParams {
  concerns: HealthConcern[];
  sensitivity: { digestive: number; additive: number };
  conditions: string[];
  purchasableSet: Set<string>;
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
  goals?: string[];           // v3: HealthGoal[]
  nutritionGoals?: {          // v3: 온보딩 계산 결과
    perMealCalMax?: number;
    perMealSodiumMax?: number;
    perMealSugarMax?: number;
    perMealProteinMin?: number;
  };
}

function scoreProducts(products: Record<string, unknown>[], params: ScoreParams): ScoredProduct[] {
  const { concerns, sensitivity, conditions, purchasableSet, tastes, goals = [], nutritionGoals } = params;

  return products.map((p) => {
    // 건강 점수 기반 시작점 (0~100 → 15~45 스케일, 더 넓은 범위)
    const healthScore = (p.health_score as number) || 50;
    let score = 15 + Math.round(healthScore * 0.3); // health_score 70 → 36, 80 → 39, 90 → 42
    const reasons: string[] = [];
    const reasonDetails: string[] = [];

    // 건강 점수 높으면 reason 추가
    if (healthScore >= 70) {
      reasons.push("건강 지표 우수");
      reasonDetails.push(`건강 점수 ${healthScore}점 — 영양 균형이 좋아요`);
    }

    // dish_category 적합도 가중치 (관심사별로 식사류 보너스, 간식류 감점)
    const dishCategory = (p.dish_category as string) || "other";
    for (const concern of concerns) {
      const categoryWeights = CONCERN_CATEGORY_WEIGHT[concern];
      if (categoryWeights && dishCategory in categoryWeights) {
        score += categoryWeights[dishCategory];
      }
    }

    // 영양 균형 보너스 (3대 영양소 모두 적정 범위면 추가 점수)
    const cal = (p.calories as number) || 0;
    const pro = (p.protein_g as number) || 0;
    const carb = (p.carbs_g as number) || 0;
    const fat = (p.fat_g as number) || 0;
    if (cal >= 150 && cal <= 500 && pro >= 10 && carb >= 10 && fat >= 2 && fat <= 20) {
      score += 8;
      if (!reasons.includes("영양 균형")) {
        reasons.push("영양 균형");
        reasonDetails.push("3대 영양소가 골고루 포함된 균형식");
      }
    }

    // 기능성 태그 매칭
    const productTags: string[] = (p.functional_tags as string[]) || [];
    for (const concern of concerns) {
      const tagBoosts = CONCERN_TAG_BOOSTS[concern];
      if (tagBoosts) {
        for (const boost of tagBoosts) {
          if (productTags.includes(boost.tag)) {
            score += boost.score;
            if (!reasons.includes(boost.reason)) {
              reasons.push(boost.reason);
              reasonDetails.push(boost.detail);
            }
          }
        }
      }
    }

    // 관심사 영양 매칭
    for (const concern of concerns) {
      const rules = CONCERN_RULES[concern];
      if (!rules) continue;
      for (const rule of rules) {
        if (checkRule(p, rule)) {
          score += rule.score;
          if (!reasons.includes(rule.reason)) {
            reasons.push(rule.reason);
            const val = p[rule.field] as number | null;
            if (val !== null && val !== undefined) {
              reasonDetails.push(rule.detail(val));
            }
          }
        }
      }
    }

    // 민감도
    if (sensitivity.digestive === 3) {
      for (const rule of SENSITIVITY_RULES.digestive) {
        if (checkRule(p, rule)) {
          score += rule.score;
          if (!reasons.includes(rule.reason)) reasons.push(rule.reason);
        }
      }
    }
    if (sensitivity.additive === 3) {
      for (const rule of SENSITIVITY_RULES.additive) {
        if (checkRule(p, rule)) {
          score += rule.score;
          if (!reasons.includes(rule.reason)) reasons.push(rule.reason);
        }
      }
    }

    // 영양 기본 보너스
    const calories = p.calories as number | null;
    const proteinG = p.protein_g as number | null;
    if (calories && calories > 0 && calories < 600) score += 3;
    if (proteinG && proteinG >= 10 && !reasons.includes("단백질 풍부") && !reasons.includes("고단백")) score += 3;

    // 질환/목표 기반 영양 보너스 (concerns + goals + conditions 통합)
    const sugarG = p.sugar_g as number | null;
    const sodiumMg = p.sodium_mg as number | null;
    const fiberG = p.fiber_g as number | null;
    const allGoals = [...conditions, ...goals];

    if ((allGoals.includes("diabetes") || conditions.includes("diabetes")) && sugarG !== null) {
      if (sugarG < 3) { score += 8; if (!reasons.includes("극저당")) { reasons.push("극저당"); reasonDetails.push(`당류 ${sugarG}g — 극저당 식품`); } }
      else if (sugarG < 5) { score += 5; if (!reasons.includes("저당")) { reasons.push("저당"); reasonDetails.push(`당류 ${sugarG}g — 저당 식품`); } }
    }
    if ((allGoals.includes("blood_pressure") || conditions.includes("hypertension")) && sodiumMg !== null) {
      if (sodiumMg < 300) { score += 8; if (!reasons.includes("극저나트륨")) { reasons.push("극저나트륨"); reasonDetails.push(`나트륨 ${Math.round(sodiumMg)}mg — 극저나트륨 식품`); } }
      else if (sodiumMg < 500) { score += 5; if (!reasons.includes("저나트륨")) { reasons.push("저나트륨"); reasonDetails.push(`나트륨 ${Math.round(sodiumMg)}mg — 저나트륨 식품`); } }
    }
    if ((allGoals.includes("kidney") || conditions.includes("kidney")) && proteinG !== null && proteinG < 10 && sodiumMg !== null && sodiumMg < 400) {
      if (!reasons.includes("저단백")) { reasons.push("저단백"); reasonDetails.push(`단백질 ${proteinG}g, 나트륨 ${Math.round(sodiumMg)}mg — 저단백·저염 식품`); }
      score += 6;
    }
    if (allGoals.includes("muscle") && proteinG !== null) {
      if (proteinG >= 25) { score += 6; if (!reasons.includes("고단백")) { reasons.push("고단백"); reasonDetails.push(`단백질 ${proteinG}g — 고단백 식품`); } }
      else if (proteinG >= 20) score += 3;
    }
    if (allGoals.includes("weight_loss") && calories !== null) {
      if (calories > 0 && calories <= 350) { score += 5; if (!reasons.includes("저칼로리")) { reasons.push("저칼로리"); reasonDetails.push(`${calories}kcal — 저칼로리 식품`); } }
    }
    if (allGoals.includes("gut_health") && fiberG !== null && fiberG >= 5) {
      if (!reasons.includes("고식이섬유")) { reasons.push("고식이섬유"); reasonDetails.push(`식이섬유 ${fiberG}g — 고식이섬유 식품`); }
      score += 5;
    }

    // v3: nutrition_goals 기반 영양 적합성 보너스
    if (nutritionGoals) {
      if (nutritionGoals.perMealSodiumMax && sodiumMg !== null && sodiumMg <= nutritionGoals.perMealSodiumMax * 0.7) score += 3;
      if (nutritionGoals.perMealSugarMax && sugarG !== null && sugarG <= nutritionGoals.perMealSugarMax * 0.7) score += 3;
      if (nutritionGoals.perMealProteinMin && proteinG !== null && proteinG >= nutritionGoals.perMealProteinMin) score += 3;
    }

    // 구매 가능 보너스
    if (purchasableSet.has(p.id as string)) score += 10;

    // 맛 일치도 보너스
    let tasteMatch = 0;
    if (tastes.salty >= 1 && tastes.salty <= 10 && sodiumMg) {
      const [idealMin, idealMax] = TASTE_RANGES.salty[tastes.salty];
      if (sodiumMg >= idealMin && sodiumMg < idealMax) { score += 5; tasteMatch++; }
    }
    if (tastes.sweet >= 1 && tastes.sweet <= 10 && sugarG !== null) {
      const [idealMin, idealMax] = TASTE_RANGES.sweet[tastes.sweet];
      if (sugarG >= idealMin && sugarG < idealMax) { score += 5; tasteMatch++; }
    }
    if (tasteMatch >= 2) {
      reasons.push("맛 취향 일치");
      reasonDetails.push("선호하시는 맛 프로필에 가까워요");
    }

    return {
      ...p,
      match_score: Math.min(score, 100),
      matched_concerns: concerns.filter((c) => {
        const rules = CONCERN_RULES[c];
        return rules?.some((rule) => checkRule(p, rule));
      }),
      reasons: reasons.slice(0, 4),
      reason_detail: reasonDetails[0] || null,
      dish_keyword: extractDishKeyword(p.name as string, p.manufacturer as string | null),
    };
  });
}

// ─── 공통: DB 쿼리 + 안전 필터 ───

async function loadSafetyFilters(supabase: ReturnType<typeof createServiceRoleClient>, conditions: string[]) {
  const safetyFilters: Record<string, number> = {};
  const safetyMinFilters: Record<string, number> = {};

  if (conditions.length > 0) {
    const { data: rules } = await supabase
      .from("safety_rules" as "product_prices")
      .select("*")
      .in("condition", conditions) as { data: { condition: string; nutrient: string; max_per_serving: number }[] | null };

    if (rules) {
      for (const rule of rules) {
        if (rule.max_per_serving < 0) {
          const absVal = Math.abs(rule.max_per_serving);
          safetyMinFilters[rule.nutrient] = Math.max(safetyMinFilters[rule.nutrient] || 0, absVal);
        } else {
          if (!(rule.nutrient in safetyFilters) || rule.max_per_serving < safetyFilters[rule.nutrient]) {
            safetyFilters[rule.nutrient] = rule.max_per_serving;
          }
        }
      }
    }
  }
  return { safetyFilters, safetyMinFilters };
}

async function loadPurchasableSet(supabase: ReturnType<typeof createServiceRoleClient>): Promise<Set<string>> {
  const { data: priceIds } = await supabase
    .from("v_all_prices" as "product_prices")
    .select("product_id") as { data: { product_id: string }[] | null };
  return new Set<string>((priceIds || []).map((p) => p.product_id));
}

// ─── 가격·리뷰 로드 ───

type PriceInfo = { platform: string; price: number; url: string; image_url: string | null };

async function loadPrices(supabase: ReturnType<typeof createServiceRoleClient>, productIds: string[], platformFilter?: string): Promise<Record<string, PriceInfo[]>> {
  let priceQuery = supabase
    .from("v_all_prices" as "product_prices")
    .select("product_id, platform, price, url, image_url")
    .in("product_id", productIds);

  if (platformFilter) {
    priceQuery = priceQuery.eq("platform", platformFilter);
  }

  const { data: prices } = await priceQuery as { data: { product_id: string; platform: string; price: number; url: string; image_url: string | null }[] | null };

  const priceMap: Record<string, PriceInfo[]> = {};
  if (prices) {
    for (const p of prices) {
      if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
      priceMap[p.product_id].push({ platform: p.platform, price: p.price, url: p.url, image_url: p.image_url });
    }
  }
  return priceMap;
}

async function loadReviews(supabase: ReturnType<typeof createServiceRoleClient>, productIds: string[]) {
  const { data: reviewStats } = await ((supabase.from("taste_reviews") as ReturnType<typeof supabase.from>)
    .select("product_id, star_rating, consumption_pct")
    .in("product_id", productIds)) as { data: { product_id: string; star_rating: number; consumption_pct: number }[] | null };

  const reviewMap: Record<string, { avgRating: number; avgConsumption: number; count: number }> = {};
  if (reviewStats && reviewStats.length > 0) {
    const grouped: Record<string, { stars: number[]; consumption: number[] }> = {};
    for (const r of reviewStats) {
      if (!grouped[r.product_id]) grouped[r.product_id] = { stars: [], consumption: [] };
      grouped[r.product_id].stars.push(r.star_rating);
      grouped[r.product_id].consumption.push(r.consumption_pct);
    }
    for (const [pid, data] of Object.entries(grouped)) {
      reviewMap[pid] = {
        avgRating: Math.round((data.stars.reduce((a, b) => a + b, 0) / data.stars.length) * 10) / 10,
        avgConsumption: Math.round(data.consumption.reduce((a, b) => a + b, 0) / data.consumption.length),
        count: data.stars.length,
      };
    }
  }
  return reviewMap;
}

// ═══════════════════════════════════════════════════════
// GET — 그룹핑 + 필터 + 페이지네이션 (신규 탐색 UI)
// ═══════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    // 파라미터 파싱
    const concerns = (sp.get("concerns") || "").split(",").filter(Boolean) as HealthConcern[];
    const sensitivity = {
      digestive: Number(sp.get("sensitivity_digestive") || 2),
      additive: Number(sp.get("sensitivity_additive") || 2),
    };
    const tastes = {
      salty: Number(sp.get("tastes_salty") || 0),
      sweet: Number(sp.get("tastes_sweet") || 0),
      spicy: Number(sp.get("tastes_spicy") || 0),
      fatty: Number(sp.get("tastes_fatty") || 0),
    };
    const conditions = (sp.get("conditions") || "").split(",").filter(Boolean);
    const dishCategoryParam = sp.get("dish_category") || "";
    const priceMin = Number(sp.get("price_min") || 0);
    const priceMax = Number(sp.get("price_max") || 0);
    const proteinMin = Number(sp.get("protein_min") || 0);
    const caloriesMax = Number(sp.get("calories_max") || 0);
    const sodiumMax = Number(sp.get("sodium_max") || 0);
    const sugarMax = Number(sp.get("sugar_max") || 0);
    const fiberMin = Number(sp.get("fiber_min") || 0);
    const sortBy = sp.get("sort") || "score";
    const page = Math.max(1, Number(sp.get("page") || 1));
    const limit = Math.min(50, Math.max(1, Number(sp.get("limit") || 20)));
    const platformFilter = sp.get("platform") || "";

    const supabase = createServiceRoleClient();

    // 안전 필터 + 구매 가능 셋
    const [{ safetyFilters, safetyMinFilters }, purchasableSet] = await Promise.all([
      loadSafetyFilters(supabase, conditions),
      loadPurchasableSet(supabase),
    ]);

    // DB 쿼리 구성
    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .eq("category_large", "상용제품");

    // 안전 필터
    for (const [nutrient, maxVal] of Object.entries(safetyFilters)) {
      query = query.lte(nutrient, maxVal);
    }
    for (const [nutrient, minVal] of Object.entries(safetyMinFilters)) {
      query = query.gte(nutrient, minVal);
    }

    // dish_category 필터 (기본: sauce 제외)
    const includedCategories: string[] = [];
    const excludedCategories: string[] = [];
    if (dishCategoryParam) {
      for (const cat of dishCategoryParam.split(",")) {
        const trimmed = cat.trim();
        if (trimmed.startsWith("-")) {
          excludedCategories.push(trimmed.slice(1));
        } else {
          includedCategories.push(trimmed);
        }
      }
    } else {
      // 기본: sauce, ingredient 제외
      excludedCategories.push("sauce", "ingredient");
    }
    if (includedCategories.length > 0) {
      query = query.in("dish_category", includedCategories);
    }
    for (const cat of excludedCategories) {
      query = query.neq("dish_category", cat);
    }

    // 맛 필터 (±1단계 범위)
    const maxTaste = 10;
    if (tastes.salty >= 1 && tastes.salty <= maxTaste) {
      const low = Math.max(1, tastes.salty - 1);
      const high = Math.min(maxTaste, tastes.salty + 1);
      query = query.gte("sodium_mg", TASTE_RANGES.salty[low][0]).lt("sodium_mg", TASTE_RANGES.salty[high][1]);
    }
    if (tastes.sweet >= 1 && tastes.sweet <= maxTaste) {
      const low = Math.max(1, tastes.sweet - 1);
      const high = Math.min(maxTaste, tastes.sweet + 1);
      query = query.gte("sugar_g", TASTE_RANGES.sweet[low][0]).lt("sugar_g", TASTE_RANGES.sweet[high][1]);
    }
    if (tastes.fatty >= 1 && tastes.fatty <= maxTaste) {
      const low = Math.max(1, tastes.fatty - 1);
      const high = Math.min(maxTaste, tastes.fatty + 1);
      query = query.gte("fat_g", TASTE_RANGES.fatty[low][0]).lt("fat_g", TASTE_RANGES.fatty[high][1]);
    }
    if (tastes.spicy >= 1 && tastes.spicy <= maxTaste) {
      const minSpicy = Math.max(0, Math.round(tastes.spicy / 2) - 1);
      const maxSpicy = Math.min(5, Math.round(tastes.spicy / 2) + 1);
      query = query.gte("spicy_score", minSpicy).lte("spicy_score", maxSpicy);
    }

    // 영양 조건 필터 (직접 g 수 지정)
    if (proteinMin > 0) query = query.gte("protein_g", proteinMin);
    if (caloriesMax > 0) query = query.lte("calories", caloriesMax);
    if (sodiumMax > 0) query = query.lte("sodium_mg", sodiumMax);
    if (sugarMax > 0) query = query.lte("sugar_g", sugarMax);
    if (fiberMin > 0) query = query.gte("fiber_g", fiberMin);

    // health_score 있는 제품만 + 높은 순 (75%가 NULL이라 필터 필수)
    query = query.not("health_score", "is", null).order("health_score", { ascending: false }).limit(1000);

    const { data: products, error } = await query as { data: Record<string, unknown>[] | null; error: { message: string } | null };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!products || products.length === 0) {
      return NextResponse.json({
        groups: [],
        total_groups: 0,
        total_products: 0,
        page,
        has_more: false,
        filters_applied: { concerns, conditions, dish_category: dishCategoryParam, sort: sortBy },
      });
    }

    // 스코어링
    const scored = scoreProducts(products, { concerns, sensitivity, conditions, purchasableSet, tastes });

    // 가격 필터 (가격 범위가 지정된 경우 구매 가능한 제품만 + 범위 필터)
    let filtered = scored;
    if (priceMin > 0 || priceMax > 0 || platformFilter) {
      // 가격 필터 필요 → 구매 가능 제품만
      filtered = scored.filter((p) => purchasableSet.has(p.id as string));
    }

    // 정렬
    switch (sortBy) {
      case "price_asc":
      case "price_desc":
        filtered.sort((a, b) => b.match_score - a.match_score);
        break;
      case "protein_desc":
        filtered.sort((a, b) => ((b.protein_g as number) || 0) - ((a.protein_g as number) || 0));
        break;
      case "calories_asc":
        filtered.sort((a, b) => ((a.calories as number) || 9999) - ((b.calories as number) || 9999));
        break;
      case "health_desc":
        filtered.sort((a, b) => ((b.health_score as number) || 0) - ((a.health_score as number) || 0));
        break;
      default: // score
        filtered.sort((a, b) => b.match_score - a.match_score);
    }

    // 그룹핑 (dish_keyword 기준)
    const groupMap = new Map<string, ScoredProduct[]>();
    for (const p of filtered) {
      const key = p.dish_keyword || "기타";
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(p);
    }

    // 그룹을 대표 제품 점수순 정렬
    const sortedGroups = Array.from(groupMap.entries())
      .map(([dishName, groupProducts]) => ({
        dish_name: dishName,
        dish_category: (groupProducts[0].dish_category as string) || "other",
        representative: groupProducts[0], // 이미 정렬됨
        total_in_group: groupProducts.length,
        products: groupProducts.slice(0, 3), // 상위 3개만 포함
      }));

    // 그룹 정렬 (대표 제품의 점수/영양 기준)
    if (sortBy === "protein_desc") {
      sortedGroups.sort((a, b) => ((b.representative.protein_g as number) || 0) - ((a.representative.protein_g as number) || 0));
    } else if (sortBy === "calories_asc") {
      sortedGroups.sort((a, b) => ((a.representative.calories as number) || 9999) - ((b.representative.calories as number) || 9999));
    } else {
      sortedGroups.sort((a, b) => b.representative.match_score - a.representative.match_score);
    }

    // 페이지네이션
    const totalGroups = sortedGroups.length;
    const startIdx = (page - 1) * limit;
    const pageGroups = sortedGroups.slice(startIdx, startIdx + limit);

    // 페이지 내 모든 제품의 가격 로드
    const allProductIds = pageGroups.flatMap((g) => g.products.map((p) => p.id as string));
    const [priceMap, reviewMap] = await Promise.all([
      loadPrices(supabase, allProductIds, platformFilter || undefined),
      loadReviews(supabase, allProductIds),
    ]);

    // 가격 정보 병합 + 가격 필터 적용
    const responseGroups = pageGroups.map((group) => {
      const enrichedProducts = group.products.map((p) => {
        const prices = (priceMap[p.id as string] || []).sort((a, b) => a.price - b.price);
        return {
          ...p,
          product_prices: prices,
          review_stats: reviewMap[p.id as string] || null,
        };
      });

      // 가격 필터
      let filteredProducts = enrichedProducts;
      if (priceMin > 0 || priceMax > 0) {
        filteredProducts = enrichedProducts.filter((p) => {
          if (p.product_prices.length === 0) return false;
          const bestPrice = p.product_prices[0].price;
          if (priceMin > 0 && bestPrice < priceMin) return false;
          if (priceMax > 0 && bestPrice > priceMax) return false;
          return true;
        });
      }

      // 가격 정렬 (가격 로드 후 정렬 가능)
      if (sortBy === "price_asc") {
        filteredProducts.sort((a, b) => (a.product_prices[0]?.price || 999999) - (b.product_prices[0]?.price || 999999));
      } else if (sortBy === "price_desc") {
        filteredProducts.sort((a, b) => (b.product_prices[0]?.price || 0) - (a.product_prices[0]?.price || 0));
      }

      return {
        dish_name: group.dish_name,
        dish_category: group.dish_category,
        total_in_group: group.total_in_group,
        representative: filteredProducts[0] || enrichedProducts[0],
        products: filteredProducts.length > 0 ? filteredProducts : enrichedProducts.slice(0, 1),
      };
    }).filter((g) => g.products.length > 0);

    return NextResponse.json({
      groups: responseGroups,
      total_groups: totalGroups,
      total_products: filtered.length,
      page,
      has_more: startIdx + limit < totalGroups,
      filters_applied: {
        concerns,
        conditions,
        sensitivity,
        dish_category: dishCategoryParam || "-sauce",
        tastes,
        nutrition: { proteinMin, caloriesMax, sodiumMax, sugarMax, fiberMin },
        price: { min: priceMin, max: priceMax },
        sort: sortBy,
        platform: platformFilter,
      },
    });
  } catch (err) {
    console.error("Recommend GET error:", err);
    return NextResponse.json({ error: "추천 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════
// POST — 기존 v2 호환 (평탄 목록 반환)
// ═══════════════════════════════════════════════════════

type RecommendRequest = {
  concerns: HealthConcern[];
  sensitivity?: { digestive: number; additive: number };
  persona?: string;
  conditions?: string[];
  allergies?: string[];
  pregnancyStage?: string;
  healthGoal?: string;
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
};

export async function POST(request: NextRequest) {
  try {
    const body: RecommendRequest = await request.json();
    const {
      concerns = [],
      sensitivity = { digestive: 2, additive: 2 },
      conditions = [],
      tastes: rawTastes,
    } = body;

    // 5단계 → 10단계 변환 (하위호환)
    const tastes = {
      salty: rawTastes.salty <= 5 ? tasteLevel5to10(rawTastes.salty) : rawTastes.salty,
      sweet: rawTastes.sweet <= 5 ? tasteLevel5to10(rawTastes.sweet) : rawTastes.sweet,
      spicy: rawTastes.spicy, // spicy는 별도 (spicy_score 사용)
      fatty: rawTastes.fatty <= 5 ? tasteLevel5to10(rawTastes.fatty) : rawTastes.fatty,
    };

    const supabase = createServiceRoleClient();

    const [{ safetyFilters, safetyMinFilters }, purchasableSet] = await Promise.all([
      loadSafetyFilters(supabase, conditions),
      loadPurchasableSet(supabase),
    ]);

    // DB 쿼리
    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .eq("category_large", "상용제품");

    // 소스·원재료 제외 (v2에서도 기본 제외)
    query = query.neq("dish_category", "sauce").neq("dish_category", "ingredient");

    for (const [nutrient, maxVal] of Object.entries(safetyFilters)) {
      query = query.lte(nutrient, maxVal);
    }
    for (const [nutrient, minVal] of Object.entries(safetyMinFilters)) {
      query = query.gte(nutrient, minVal);
    }

    // 맛 필터 (±1단계)
    const maxTaste = 10;
    if (tastes.salty >= 1 && tastes.salty <= maxTaste) {
      const low = Math.max(1, tastes.salty - 1);
      const high = Math.min(maxTaste, tastes.salty + 1);
      query = query.gte("sodium_mg", TASTE_RANGES.salty[low][0]).lt("sodium_mg", TASTE_RANGES.salty[high][1]);
    }
    if (tastes.sweet >= 1 && tastes.sweet <= maxTaste) {
      const low = Math.max(1, tastes.sweet - 1);
      const high = Math.min(maxTaste, tastes.sweet + 1);
      query = query.gte("sugar_g", TASTE_RANGES.sweet[low][0]).lt("sugar_g", TASTE_RANGES.sweet[high][1]);
    }
    if (tastes.fatty >= 1 && tastes.fatty <= maxTaste) {
      const low = Math.max(1, tastes.fatty - 1);
      const high = Math.min(maxTaste, tastes.fatty + 1);
      query = query.gte("fat_g", TASTE_RANGES.fatty[low][0]).lt("fat_g", TASTE_RANGES.fatty[high][1]);
    }
    if (tastes.spicy >= 1 && tastes.spicy <= 5) {
      const minSpicy = Math.max(0, tastes.spicy - 1);
      const maxSpicy = Math.min(5, tastes.spicy + 1);
      query = query.gte("spicy_score", minSpicy).lte("spicy_score", maxSpicy);
    }

    // health_score 있는 제품만 + 높은 순 정렬 (75%가 NULL이라 필터 필수)
    query = query.not("health_score", "is", null).order("health_score", { ascending: false }).limit(500);

    const { data: products, error, count } = await query as { data: Record<string, unknown>[] | null; error: { message: string } | null; count: number | null };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!products || products.length === 0) {
      return NextResponse.json({
        recommendations: [],
        total: 0,
        filters_applied: { concerns, safetyFilters, safetyMinFilters },
        message: "조건에 맞는 제품이 없습니다. 필터를 조정해보세요.",
      });
    }

    // 스코어링
    const scored = scoreProducts(products, { concerns, sensitivity, conditions, purchasableSet, tastes });
    scored.sort((a, b) => b.match_score - a.match_score);
    const top = scored.slice(0, 30);
    const productIds = top.map((p) => p.id as string);

    // 가격 + 리뷰
    const [priceMap, reviewMap] = await Promise.all([
      loadPrices(supabase, productIds),
      loadReviews(supabase, productIds),
    ]);

    const recommendations = top.map((p) => ({
      ...p,
      product_prices: (priceMap[p.id as string] || []).sort((a, b) => a.price - b.price),
      review_stats: reviewMap[p.id as string] || null,
    }));

    // 큐레이션 그룹
    const curationGroups = buildCurationGroups(recommendations, concerns, conditions);

    return NextResponse.json({
      recommendations,
      curationGroups,
      total: count,
      filters_applied: { concerns, conditions, sensitivity, safetyFilters, safetyMinFilters },
    });
  } catch (err) {
    console.error("Recommend POST error:", err);
    return NextResponse.json({ error: "추천 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ─── 관심사 기반 큐레이션 그룹 (POST 하위호환) ───

interface RecommendationWithPrices extends ScoredProduct {
  product_prices: PriceInfo[];
}

function buildCurationGroups(
  products: RecommendationWithPrices[],
  concerns: HealthConcern[],
  conditions: string[]
) {
  const groups: { title: string; description: string; emoji: string; productIds: string[] }[] = [];

  if (concerns.includes("gut_health")) {
    const items = products.filter((p) => p.matched_concerns?.includes("gut_health")).slice(0, 6);
    if (items.length > 0) groups.push({ title: "장건강 맞춤", description: "식이섬유가 풍부하고 소화에 부담 적은 식품", emoji: "🌿", productIds: items.map((p) => p.id as string) });
  }
  if (concerns.includes("skin")) {
    const items = products.filter((p) => p.matched_concerns?.includes("skin")).slice(0, 6);
    if (items.length > 0) groups.push({ title: "피부건강 맞춤", description: "단백질과 건강한 지방이 풍부한 저당 식품", emoji: "✨", productIds: items.map((p) => p.id as string) });
  }
  if (concerns.includes("weight")) {
    const items = products.filter((p) => p.matched_concerns?.includes("weight")).slice(0, 6);
    if (items.length > 0) groups.push({ title: "체중관리 맞춤", description: "저칼로리 고단백으로 든든하면서 가벼운 식품", emoji: "🏃", productIds: items.map((p) => p.id as string) });
  }
  if (concerns.includes("energy")) {
    const items = products.filter((p) => p.matched_concerns?.includes("energy")).slice(0, 6);
    if (items.length > 0) groups.push({ title: "활력충전 맞춤", description: "적정 열량과 단백질로 에너지를 채워줄 식품", emoji: "⚡", productIds: items.map((p) => p.id as string) });
  }

  if (conditions.includes("diabetes")) {
    const lowSugar = products.filter((p) => (p.sugar_g as number | null) !== null && (p.sugar_g as number) < 5).slice(0, 6);
    if (lowSugar.length > 0) groups.push({ title: "당류 5g 이하", description: "당류 5g 이하로 설계된 식품 모음", emoji: "🩸", productIds: lowSugar.map((p) => p.id as string) });
  }
  if (conditions.includes("hypertension")) {
    const lowSodium = products.filter((p) => (p.sodium_mg as number | null) !== null && (p.sodium_mg as number) < 400).slice(0, 6);
    if (lowSodium.length > 0) groups.push({ title: "나트륨 400mg 이하", description: "나트륨 400mg 이하로 설계된 식품 모음", emoji: "❤️", productIds: lowSodium.map((p) => p.id as string) });
  }

  const withPrices = products.filter((p) => p.product_prices?.length > 0);
  const affordable = withPrices.sort((a, b) => (a.product_prices[0]?.price || 999999) - (b.product_prices[0]?.price || 999999)).slice(0, 6);
  if (affordable.length > 0) groups.push({ title: "가성비 추천", description: "조건에 맞으면서 합리적인 가격의 식품", emoji: "💰", productIds: affordable.map((p) => p.id as string) });

  const topMatches = products.slice(0, 6);
  if (topMatches.length > 0) groups.push({ title: "종합 추천 TOP", description: "맛·영양·관심사를 종합한 최적 매칭", emoji: "⭐", productIds: topMatches.map((p) => p.id as string) });

  return groups;
}
