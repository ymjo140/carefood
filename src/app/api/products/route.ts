import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════
   상수 & 타입
   ════════════════════════════════════════════ */

type MallPrice = {
  platform: string;
  price: number;
  url: string;
  image_url: string | null;
};

// 맛 레벨 → 영양성분 범위 매핑 (10단계)
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

// 목적 → 관련 태그 매핑 (OR 조합)
const PURPOSE_TAG_MAP: Record<string, string[]> = {
  gut_health: ["probiotics", "prebiotic"],
  skin: ["collagen", "vitamin"],
  weight: ["diet", "sugar_free"],
  muscle: ["protein"],
  immunity: ["vitamin", "omega3", "zinc"],
  bone: ["calcium"],
  eye: ["lutein"],
};

/* ════════════════════════════════════════════
   추천 스코어링 (recommend 로직 포팅)
   ════════════════════════════════════════════ */

type HealthConcern = "gut_health" | "skin" | "weight" | "energy";

const CONCERN_TAG_BOOSTS: Record<HealthConcern, { tag: string; score: number; reason: string }[]> = {
  gut_health: [
    { tag: "probiotics", score: 20, reason: "유산균 함유" },
    { tag: "prebiotic", score: 18, reason: "식이섬유 함유" },
  ],
  skin: [
    { tag: "collagen", score: 20, reason: "콜라겐 함유" },
    { tag: "vitamin", score: 12, reason: "비타민 함유" },
    { tag: "zinc", score: 10, reason: "아연 함유" },
  ],
  weight: [
    { tag: "protein", score: 15, reason: "프로틴 제품" },
    { tag: "diet", score: 15, reason: "다이어트 설계" },
    { tag: "sugar_free", score: 12, reason: "무설탕" },
  ],
  energy: [
    { tag: "vitamin", score: 15, reason: "비타민 함유" },
    { tag: "iron", score: 12, reason: "철분 함유" },
    { tag: "calcium", score: 10, reason: "칼슘 함유" },
    { tag: "omega3", score: 10, reason: "오메가3 함유" },
  ],
};

type NutrientRule = {
  field: string;
  op: "lt" | "gt" | "gte" | "lte" | "between";
  value: number | [number, number];
  score: number;
  reason: string;
};

const CONCERN_RULES: Record<HealthConcern, NutrientRule[]> = {
  gut_health: [
    { field: "fiber_g", op: "gte", value: 3, score: 15, reason: "식이섬유 풍부" },
    { field: "sugar_g", op: "lt", value: 8, score: 8, reason: "당류 적정" },
    { field: "fat_g", op: "lt", value: 10, score: 5, reason: "저지방" },
  ],
  skin: [
    { field: "protein_g", op: "gte", value: 10, score: 12, reason: "단백질 풍부" },
    { field: "fat_g", op: "between", value: [3, 15], score: 8, reason: "건강한 지방" },
    { field: "sugar_g", op: "lt", value: 5, score: 10, reason: "저당" },
  ],
  weight: [
    { field: "calories", op: "lt", value: 300, score: 15, reason: "저칼로리" },
    { field: "protein_g", op: "gte", value: 15, score: 12, reason: "고단백" },
    { field: "fat_g", op: "lt", value: 8, score: 8, reason: "저지방" },
    { field: "sugar_g", op: "lt", value: 5, score: 8, reason: "저당" },
  ],
  energy: [
    { field: "calories", op: "between", value: [200, 500], score: 10, reason: "적정 열량" },
    { field: "protein_g", op: "gte", value: 12, score: 12, reason: "단백질 풍부" },
    { field: "carbs_g", op: "gte", value: 20, score: 8, reason: "탄수화물 충분" },
  ],
};

const SENSITIVITY_RULES = {
  digestive: [
    { field: "fat_g", op: "lt" as const, value: 8, score: 8, reason: "소화 편한" },
    { field: "sodium_mg", op: "lt" as const, value: 500, score: 5, reason: "자극 적은" },
  ],
  additive: [
    { field: "sodium_mg", op: "lt" as const, value: 400, score: 8, reason: "저나트륨" },
  ],
};

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

interface ProfileData {
  concerns: HealthConcern[];
  goals: string[];
  conditions: string[];
  sensitivity: { digestive: number; additive: number };
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
  nutrition_goals?: {
    perMealCalMax?: number;
    perMealSodiumMax?: number;
    perMealSugarMax?: number;
    perMealProteinMin?: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoreProduct(p: Record<string, any>, profile: ProfileData, isPurchasable: boolean): { match_score: number; taste_score: number; nutrition_score: number; match_reasons: string[] } {
  const { concerns, goals, conditions, sensitivity, tastes, nutrition_goals: ng } = profile;

  const healthScore = (p.health_score as number) || 50;
  let score = Math.round(healthScore * 0.3); // 0~30
  const reasons: string[] = [];

  if (healthScore >= 70) reasons.push("건강 지표 우수");

  // ── 기능성 태그 매칭 ──
  const productTags: string[] = (p.functional_tags as string[]) || [];
  for (const concern of concerns) {
    const tagBoosts = CONCERN_TAG_BOOSTS[concern];
    if (tagBoosts) {
      for (const boost of tagBoosts) {
        if (productTags.includes(boost.tag)) {
          score += boost.score;
          if (!reasons.includes(boost.reason)) reasons.push(boost.reason);
        }
      }
    }
  }

  // ── 관심사 영양 매칭 ──
  for (const concern of concerns) {
    const rules = CONCERN_RULES[concern];
    if (!rules) continue;
    for (const rule of rules) {
      if (checkRule(p, rule)) {
        score += rule.score;
        if (!reasons.includes(rule.reason)) reasons.push(rule.reason);
      }
    }
  }

  // ── 민감도 ──
  if (sensitivity.digestive === 3) {
    for (const rule of SENSITIVITY_RULES.digestive) {
      if (checkRule(p, rule)) { score += rule.score; if (!reasons.includes(rule.reason)) reasons.push(rule.reason); }
    }
  }
  if (sensitivity.additive === 3) {
    for (const rule of SENSITIVITY_RULES.additive) {
      if (checkRule(p, rule)) { score += rule.score; if (!reasons.includes(rule.reason)) reasons.push(rule.reason); }
    }
  }

  // ── 기본 영양 보너스 ──
  const calories = p.calories as number | null;
  const proteinG = p.protein_g as number | null;
  if (calories && calories > 0 && calories < 600) score += 3;
  if (proteinG && proteinG >= 10 && !reasons.includes("단백질 풍부") && !reasons.includes("고단백")) score += 3;

  // ── 건강 목표 기반 보너스 ──
  const sugarG = p.sugar_g as number | null;
  const sodiumMg = p.sodium_mg as number | null;
  const fiberG = p.fiber_g as number | null;
  const allGoals = [...conditions, ...goals];

  if ((allGoals.includes("diabetes") || conditions.includes("diabetes")) && sugarG !== null) {
    if (sugarG < 3) { score += 8; if (!reasons.includes("극저당")) reasons.push("극저당"); }
    else if (sugarG < 5) { score += 5; if (!reasons.includes("저당")) reasons.push("저당"); }
  }
  if ((allGoals.includes("blood_pressure") || conditions.includes("hypertension")) && sodiumMg !== null) {
    if (sodiumMg < 300) { score += 8; if (!reasons.includes("극저나트륨")) reasons.push("극저나트륨"); }
    else if (sodiumMg < 500) { score += 5; if (!reasons.includes("저나트륨")) reasons.push("저나트륨"); }
  }
  if ((allGoals.includes("kidney") || conditions.includes("kidney")) && proteinG !== null && proteinG < 10 && sodiumMg !== null && sodiumMg < 400) {
    if (!reasons.includes("저단백")) reasons.push("저단백");
    score += 6;
  }
  if (allGoals.includes("muscle") && proteinG !== null) {
    if (proteinG >= 25) { score += 6; if (!reasons.includes("고단백")) reasons.push("고단백"); }
    else if (proteinG >= 20) score += 3;
  }
  if (allGoals.includes("weight_loss") && calories !== null) {
    if (calories > 0 && calories <= 350) { score += 5; if (!reasons.includes("저칼로리")) reasons.push("저칼로리"); }
  }
  if ((allGoals.includes("gut_health") || concerns.includes("gut_health")) && fiberG !== null && fiberG >= 5) {
    if (!reasons.includes("고식이섬유")) reasons.push("고식이섬유");
    score += 5;
  }

  // ── nutrition_goals 적합성 ──
  if (ng) {
    if (ng.perMealSodiumMax && sodiumMg !== null && sodiumMg <= ng.perMealSodiumMax * 0.7) score += 3;
    if (ng.perMealSugarMax && sugarG !== null && sugarG <= ng.perMealSugarMax * 0.7) score += 3;
    if (ng.perMealProteinMin && proteinG !== null && proteinG >= ng.perMealProteinMin) score += 3;
  }

  // ── 구매 가능 보너스 ──
  if (isPurchasable) score += 10;

  // ── 맛 일치도 ──
  let tasteMatch = 0;
  if (tastes.salty >= 1 && tastes.salty <= 10 && sodiumMg) {
    const range = TASTE_RANGES.salty[tastes.salty];
    if (range && sodiumMg >= range[0] && sodiumMg < range[1]) { score += 5; tasteMatch++; }
  }
  if (tastes.sweet >= 1 && tastes.sweet <= 10 && sugarG !== null) {
    const range = TASTE_RANGES.sweet[tastes.sweet];
    if (range && sugarG >= range[0] && sugarG < range[1]) { score += 5; tasteMatch++; }
  }
  // 고소함 일치 확인
  const fatVal = (p.fat_g as number) || 0;
  if (tastes.fatty >= 1 && tastes.fatty <= 10) {
    const range = TASTE_RANGES.fatty[tastes.fatty];
    if (range && fatVal >= range[0] && fatVal < range[1]) tasteMatch++;
  }
  if (tasteMatch >= 2 && !reasons.includes("맛 취향 일치")) reasons.push("맛 취향 일치");

  // ── 맛 점수 (0~100) ──
  const taste_score = Math.round((tasteMatch / 3) * 100);

  // ── 영양 점수 (0~100) ──
  let nHits = 0, nTotal = 0;
  if (ng?.perMealProteinMin && ng.perMealProteinMin > 0) { nTotal++; if (proteinG && proteinG >= ng.perMealProteinMin) nHits++; }
  if (ng?.perMealCalMax && ng.perMealCalMax > 0 && calories && calories > 0) { nTotal++; if (calories <= ng.perMealCalMax) nHits++; }
  if (ng?.perMealSodiumMax && ng.perMealSodiumMax > 0 && sodiumMg) { nTotal++; if (sodiumMg <= ng.perMealSodiumMax) nHits++; }
  if (ng?.perMealSugarMax && ng.perMealSugarMax > 0 && sugarG !== null) { nTotal++; if (sugarG <= ng.perMealSugarMax) nHits++; }
  nTotal++; if (proteinG && proteinG >= 5 && (p.carbs_g as number) >= 5 && fatVal >= 1) nHits++;
  const nutrition_score = nTotal > 0 ? Math.round((nHits / nTotal) * 100) : 50;

  return { match_score: Math.min(score, 100), taste_score, nutrition_score, match_reasons: reasons.slice(0, 4) };
}

/* ════════════════════════════════════════════
   공통: URL 파라미터 파싱
   ════════════════════════════════════════════ */

function parseSearchParams(searchParams: URLSearchParams) {
  return {
    salty: Number(searchParams.get("salty") || 0),
    sweet: Number(searchParams.get("sweet") || 0),
    spicy: Number(searchParams.get("spicy") || 0),
    fatty: Number(searchParams.get("fatty") || 0),
    search: searchParams.get("q") || null,
    tag: searchParams.get("tag") || null,
    tags: searchParams.get("tags") || null,
    purpose: searchParams.get("purpose") || null,
    dishCategory: searchParams.get("dish_category") || null,
    hasPriceOnly: searchParams.get("hasPrice") === "1",
    priceMin: Number(searchParams.get("price_min") || 0),
    priceMax: Number(searchParams.get("price_max") || 0),
    proteinMin: Number(searchParams.get("protein_min") || 0),
    caloriesMax: Number(searchParams.get("calories_max") || 0),
    sodiumMax: Number(searchParams.get("sodium_max") || 0),
    sugarMax: Number(searchParams.get("sugar_max") || 0),
    fiberMin: Number(searchParams.get("fiber_min") || 0),
    per100gSugarMax: Number(searchParams.get("per100g_sugar_max") || 0),
    per100gSodiumMax: Number(searchParams.get("per100g_sodium_max") || 0),
    per100gProteinMin: Number(searchParams.get("per100g_protein_min") || 0),
    per100gCaloriesMax: Number(searchParams.get("per100g_calories_max") || 0),
    healthScoreMin: Number(searchParams.get("health_min") || 0),
    sort: searchParams.get("sort") || "name",
    page: Number(searchParams.get("page") || 1),
    limit: Math.min(Number(searchParams.get("limit") || 20), 50),
    source: searchParams.get("source") || null,
  };
}

/* ════════════════════════════════════════════
   공통: DB 쿼리 빌드
   ════════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProductQuery(supabase: any, params: ReturnType<typeof parseSearchParams>) {
  const {
    salty, sweet, fatty, spicy,
    search, tag, tags, purpose, dishCategory,
    hasPriceOnly,
    proteinMin, caloriesMax, sodiumMax, sugarMax, fiberMin, healthScoreMin,
    sort, page, limit,
  } = params;

  // 정렬 매핑
  type OrderCol = "name" | "protein_g" | "calories" | "health_score";
  const sortMap: Record<string, { column: OrderCol; ascending: boolean }> = {
    name: { column: "name", ascending: true },
    price_asc: { column: "name", ascending: true },
    price_desc: { column: "name", ascending: true },
    protein_desc: { column: "protein_g", ascending: false },
    calories_asc: { column: "calories", ascending: true },
    health_desc: { column: "health_score", ascending: false },
    recommend: { column: "health_score", ascending: false }, // POST에서 후처리 재정렬
  };
  const orderBy = sortMap[sort] || sortMap.name;

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .not("health_score", "is", null)
    .order(orderBy.column, { ascending: orderBy.ascending });

  // 맛 필터
  if (salty >= 1 && salty <= 10) {
    const [min, max] = TASTE_RANGES.salty[salty];
    query = query.gte("sodium_mg", min).lt("sodium_mg", max);
  }
  if (sweet >= 1 && sweet <= 10) {
    const [min, max] = TASTE_RANGES.sweet[sweet];
    query = query.gte("sugar_g", min).lt("sugar_g", max);
  }
  if (fatty >= 1 && fatty <= 10) {
    const [min, max] = TASTE_RANGES.fatty[fatty];
    query = query.gte("fat_g", min).lt("fat_g", max);
  }
  if (spicy >= 1 && spicy <= 10) {
    query = query.gte("spicy_score", Math.ceil(spicy / 2));
  }

  // 상용제품 + 건강식단서비스
  query = query.in("category_large", ["상용제품", "건강식단서비스"]);

  // 구매 가능 제품만
  if (hasPriceOnly) {
    query = query.eq("is_purchasable", true);
  }

  // 기능성 태그 필터
  if (tag) query = query.contains("functional_tags", [tag]);
  if (tags) {
    const tagList = tags.split(",").filter(Boolean);
    if (tagList.length === 1) query = query.contains("functional_tags", [tagList[0]]);
    else if (tagList.length > 1) query = query.or(tagList.map(t => `functional_tags.cs.{${t}}`).join(","));
  }

  // 목적 필터
  if (purpose) {
    const purposes = purpose.split(",").filter(Boolean);
    const allTags = new Set<string>();
    for (const p of purposes) {
      const mapped = PURPOSE_TAG_MAP[p];
      if (mapped) mapped.forEach(t => allTags.add(t));
    }
    if (allTags.size === 1) query = query.contains("functional_tags", [[...allTags][0]]);
    else if (allTags.size > 1) query = query.or([...allTags].map(t => `functional_tags.cs.{${t}}`).join(","));
  }

  // 음식 종류 필터
  if (dishCategory) {
    const cats = dishCategory.split(",").filter(Boolean);
    if (cats.length === 1) query = query.eq("dish_category", cats[0]);
    else if (cats.length > 1) query = query.in("dish_category", cats);
  }

  // 영양 조건 필터
  if (proteinMin > 0) query = query.gte("protein_g", proteinMin);
  if (caloriesMax > 0) query = query.lte("calories", caloriesMax);
  if (sodiumMax > 0) query = query.lte("sodium_mg", sodiumMax);
  if (sugarMax > 0) query = query.lte("sugar_g", sugarMax);
  if (fiberMin > 0) query = query.gte("fiber_g", fiberMin);
  if (healthScoreMin > 0) query = query.gte("health_score", healthScoreMin);

  // 검색
  if (search) query = query.ilike("name", `%${search}%`);

  // 페이지네이션
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  return query;
}

/* ════════════════════════════════════════════
   공통: 가격 조회 + 후처리
   ════════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachPricesAndFilter(supabase: any, products: any[], params: ReturnType<typeof parseSearchParams>) {
  const {
    source, priceMin, priceMax, sort,
    per100gSugarMax, per100gSodiumMax, per100gProteinMin, per100gCaloriesMax,
  } = params;

  const productIds = products.map((p: { id: string }) => p.id);

  let priceQuery = supabase
    .from("v_all_prices" as "product_prices")
    .select("product_id, platform, price, url, image_url")
    .in("product_id", productIds);

  if (source && source !== "all") {
    priceQuery = priceQuery.eq("platform", source);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prices } = await priceQuery as { data: any[] | null };

  const priceMap: Record<string, MallPrice[]> = {};
  if (prices) {
    for (const p of prices) {
      if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
      priceMap[p.product_id].push({
        platform: p.platform, price: p.price, url: p.url, image_url: p.image_url,
      });
    }
  }

  // 가격 + 100g당 환산
  let result = products.map((product: { id: string; serving_size_g?: number; sugar_g?: number; sodium_mg?: number; protein_g?: number; calories?: number }) => {
    const s = product.serving_size_g;
    const per100 = (v: number | undefined | null) => (v != null && s && s > 0) ? Math.round((v / s) * 100 * 10) / 10 : null;
    return {
      ...product,
      per100g_sugar: per100(product.sugar_g),
      per100g_sodium: per100(product.sodium_mg),
      per100g_protein: per100(product.protein_g),
      per100g_calories: per100(product.calories),
      product_prices: (priceMap[product.id] || []).sort((a: MallPrice, b: MallPrice) => a.price - b.price),
    };
  });

  // 100g당 기준 후처리
  if (per100gSugarMax > 0) result = result.filter((p: { per100g_sugar: number | null }) => p.per100g_sugar != null && p.per100g_sugar <= per100gSugarMax);
  if (per100gSodiumMax > 0) result = result.filter((p: { per100g_sodium: number | null }) => p.per100g_sodium != null && p.per100g_sodium <= per100gSodiumMax);
  if (per100gProteinMin > 0) result = result.filter((p: { per100g_protein: number | null }) => p.per100g_protein != null && p.per100g_protein >= per100gProteinMin);
  if (per100gCaloriesMax > 0) result = result.filter((p: { per100g_calories: number | null }) => p.per100g_calories != null && p.per100g_calories <= per100gCaloriesMax);

  // 가격 필터
  if (priceMin > 0 || priceMax > 0) {
    result = result.filter((p: { product_prices: MallPrice[] }) => {
      const validPrices = p.product_prices.filter((pp: MallPrice) => pp.price > 0);
      if (validPrices.length === 0) return false;
      const best = Math.min(...validPrices.map((pp: MallPrice) => pp.price));
      if (priceMin > 0 && best < priceMin) return false;
      if (priceMax > 0 && best > priceMax) return false;
      return true;
    });
  }

  // 가격 정렬
  if (sort === "price_asc" || sort === "price_desc") {
    const asc = sort === "price_asc";
    result.sort((a: { product_prices: MallPrice[] }, b: { product_prices: MallPrice[] }) => {
      const aPrice = a.product_prices.length > 0 ? a.product_prices[0].price : Infinity;
      const bPrice = b.product_prices.length > 0 ? b.product_prices[0].price : Infinity;
      return asc ? aPrice - bPrice : bPrice - aPrice;
    });
  }

  const postFiltered = priceMin > 0 || priceMax > 0 || per100gSugarMax > 0 || per100gSodiumMax > 0 || per100gProteinMin > 0 || per100gCaloriesMax > 0;
  return { result, postFiltered };
}

/* ════════════════════════════════════════════
   GET: 기존 제품 탐색 (변경 없음)
   ════════════════════════════════════════════ */

export async function GET(request: NextRequest) {
  const params = parseSearchParams(request.nextUrl.searchParams);
  const supabase = createServiceRoleClient();

  const query = buildProductQuery(supabase, params);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products, error, count } = await query as { data: any[] | null; error: any; count: number | null };

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!products || products.length === 0) {
    return NextResponse.json({ products: [], total: count, page: params.page, limit: params.limit, totalPages: Math.ceil((count || 0) / params.limit) });
  }

  const { result, postFiltered } = await attachPricesAndFilter(supabase, products, params);

  return NextResponse.json({
    products: result,
    total: postFiltered ? result.length : count,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil((postFiltered ? result.length : (count || 0)) / params.limit),
  });
}

/* ════════════════════════════════════════════
   POST: 추천순 (프로필 기반 match_score 계산)
   ════════════════════════════════════════════ */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const profile: ProfileData = {
      concerns: (body.concerns || []) as HealthConcern[],
      goals: body.goals || [],
      conditions: body.conditions || [],
      sensitivity: body.sensitivity || { digestive: 2, additive: 2 },
      tastes: body.tastes || { salty: 5, sweet: 5, spicy: 5, fatty: 5 },
      nutrition_goals: body.nutrition_goals || undefined,
    };

    // URL 쿼리 파라미터도 읽기 (필터/페이지네이션)
    const params = parseSearchParams(request.nextUrl.searchParams);
    // 추천순 정렬 강제 (health_score 기반 DB 정렬 → 후처리에서 match_score 재정렬)
    params.sort = "recommend";

    const supabase = createServiceRoleClient();
    const query = buildProductQuery(supabase, params);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: products, error, count } = await query as { data: any[] | null; error: any; count: number | null };

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!products || products.length === 0) {
      return NextResponse.json({ products: [], total: count, page: params.page, limit: params.limit, totalPages: Math.ceil((count || 0) / params.limit) });
    }

    const { result, postFiltered } = await attachPricesAndFilter(supabase, products, params);

    // 구매 가능 ID 집합
    const purchasableIds = new Set(
      result
        .filter((p: { product_prices: MallPrice[] }) => p.product_prices.some((pp: MallPrice) => pp.price > 0))
        .map((p: { id: string }) => p.id)
    );

    // match_score 계산
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scored = result.map((p: any) => {
      const { match_score, taste_score, nutrition_score, match_reasons } = scoreProduct(p, profile, purchasableIds.has(p.id));
      return { ...p, match_score, taste_score, nutrition_score, match_reasons };
    });

    // match_score 내림차순 정렬
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scored.sort((a: any, b: any) => b.match_score - a.match_score);

    return NextResponse.json({
      products: scored,
      total: postFiltered ? scored.length : count,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil((postFiltered ? scored.length : (count || 0)) / params.limit),
    });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
