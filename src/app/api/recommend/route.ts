import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import {
  parseProfile,
  getProfileLabels,
  scoreAndRank,
  fetchRecommendPool,
  loadPurchasableIds as loadPurchasableIdsV4,
  loadPrices as loadPricesV4,
  loadUserInteractions,
  loadProductReviewStats,
  diversifyResults,
  insertExplorationSlots,
  getCFBoosts,
  CONCERN_RULES,
} from "@/lib/recommend";
import type {
  UserProfile,
  ScoredProduct,
  HealthConcern,
  UserInteractions,
  ProductReviewStats,
  CFBoost,
} from "@/lib/recommend";

/**
 * 이너케어 추천 API v5 — 통합 스코어링 엔진
 * GET: 그룹핑 + 필터 + 페이지네이션 (탐색 UI)
 * POST: 5축 복합 프로필 기반 추천 (홈)
 *
 * 공통 스코어링: lib/recommend/scoring.ts (곱연산)
 * 피드백 루프: 조회/클릭/즐겨찾기 → 스코어링 반영
 */

// ── checkRule: CONCERN_RULES의 규칙을 제품에 적용 (buildCurationGroups에서 사용) ──
function checkRule(product: Record<string, unknown>, rule: { field: string; op: string; value: number | [number, number] }): boolean {
  const v = product[rule.field] as number | null | undefined;
  if (v === null || v === undefined) return false;
  switch (rule.op) {
    case "lt": return v < (rule.value as number);
    case "gt": return v > (rule.value as number);
    case "lte": return v <= (rule.value as number);
    case "gte": return v >= (rule.value as number);
    case "between": { const [min, max] = rule.value as [number, number]; return v >= min && v <= max; }
    default: return false;
  }
}

// ── TASTE_RANGES: GET 핸들러의 DB 쿼리 필터에서 사용 ──
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

// ═══════════════════════════════════════════════════════
// 공통: DB 쿼리 + 안전 필터 + 가격·리뷰 로드
// ═══════════════════════════════════════════════════════

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
// GET — 그룹핑 + 필터 + 페이지네이션 (탐색 UI)
// 스코어링: lib/recommend/scoring.ts 통합 엔진 사용
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
    const goals = (sp.get("goals") || "").split(",").filter(Boolean);
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
    const userId = (await getActorId()) || "";

    const supabase = createServiceRoleClient();

    // 안전 필터 + 구매 가능 셋 + 인터랙션 (병렬 로드)
    const loadInteractions = userId
      ? loadUserInteractions(supabase, userId)
      : Promise.resolve(undefined);

    const [{ safetyFilters, safetyMinFilters }, purchasableSet, interactions] = await Promise.all([
      loadSafetyFilters(supabase, conditions),
      loadPurchasableSet(supabase),
      loadInteractions,
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

    // 영양 조건 필터
    if (proteinMin > 0) query = query.gte("protein_g", proteinMin);
    if (caloriesMax > 0) query = query.lte("calories", caloriesMax);
    if (sodiumMax > 0) query = query.lte("sodium_mg", sodiumMax);
    if (sugarMax > 0) query = query.lte("sugar_g", sugarMax);
    if (fiberMin > 0) query = query.gte("fiber_g", fiberMin);

    // health_score 있는 제품만
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

    // ── 통합 스코어링 (lib/recommend 엔진) ──
    // GET 파라미터 → UserProfile 변환
    const userProfile: UserProfile = {
      goals: [...concerns, ...goals] as UserProfile["goals"],
      dietType: "normal",
      concerns,
      healthRisks: { glucose: "normal", bloodPressure: "normal", cholesterol: "normal", kidney: false },
      conditions,
      body: { gender: "other", birthYear: 1994, heightCm: 170, weightKg: 65, bmi: 22.5, bmiCategory: "normal", age: 30 },
      perMeal: { caloriesMin: 300, caloriesMax: 600, maxSodiumMg: 800, maxSugarG: 15, minProteinG: 15 },
      eatingOutFreq: "1_2",
      mealsPerDay: 3,
      sensitivity,
      tastes: {
        salty: tastes.salty || 5,
        sweet: tastes.sweet || 5,
        spicy: tastes.spicy || 3,
        fatty: tastes.fatty || 5,
      },
      allergies: [],
    };

    // 리뷰 통계 + 협업 필터링 로드 (병렬)
    const productIds = products.map((p) => p.id as string);
    const [reviewStats, cfBoosts] = await Promise.all([
      loadProductReviewStats(supabase, productIds),
      userId ? getCFBoosts(supabase, userId) : Promise.resolve([] as CFBoost[]),
    ]);

    // 시간대별 부스트 (KST)
    const kstHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();

    const scored = scoreAndRank(products, userProfile, purchasableSet, interactions, reviewStats, kstHour, cfBoosts.length > 0 ? cfBoosts : undefined);

    // 다양성 보장 + 탐색 슬롯
    const diversified = diversifyResults(scored);
    const withExploration = insertExplorationSlots(diversified, interactions);

    // 가격 필터
    let filtered = withExploration;
    if (priceMin > 0 || priceMax > 0 || platformFilter) {
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
      default:
        filtered.sort((a, b) => b.match_score - a.match_score);
    }

    // 그룹핑 (dish_keyword 기준)
    const groupMap = new Map<string, ScoredProduct[]>();
    for (const p of filtered) {
      const key = p.dish_keyword || "기타";
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(p);
    }

    const sortedGroups = Array.from(groupMap.entries())
      .map(([dishName, groupProducts]) => ({
        dish_name: dishName,
        dish_category: (groupProducts[0].dish_category as string) || "other",
        representative: groupProducts[0],
        total_in_group: groupProducts.length,
        products: groupProducts.slice(0, 3),
      }));

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

    // 가격 + 리뷰 로드
    const allProductIds = pageGroups.flatMap((g) => g.products.map((p) => p.id as string));
    const [priceMap, reviewMap] = await Promise.all([
      loadPrices(supabase, allProductIds, platformFilter || undefined),
      loadReviews(supabase, allProductIds),
    ]);

    // 가격 병합 + 필터
    const responseGroups = pageGroups.map((group) => {
      const enrichedProducts = group.products.map((p) => {
        const prices = (priceMap[p.id as string] || []).sort((a, b) => a.price - b.price);
        return {
          ...p,
          product_prices: prices,
          review_stats: reviewMap[p.id as string] || null,
        };
      });

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
// POST — v5: 5축 복합 프로필 기반 추천 + 피드백 루프
// ═══════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // v2 호환: concerns/tastes 직접 전달 → v4 프로필로 변환
    const profileRaw = body.profile || body;
    const healthRaw = body.health || null;
    const userId = (await getActorId()) || "";

    const profile = parseProfile(profileRaw, healthRaw);

    const supabase = createServiceRoleClient();

    // 3계층 필터 + Graceful Degradation + 인터랙션 (병렬)
    const loadInteractions = userId
      ? loadUserInteractions(supabase, userId)
      : Promise.resolve(undefined);

    const [{ products, degraded, degradeMessage }, purchasableIds, interactions] = await Promise.all([
      fetchRecommendPool(supabase, profile, 500),
      loadPurchasableIdsV4(supabase),
      loadInteractions,
    ]);

    if (products.length === 0) {
      return NextResponse.json({
        recommendations: [],
        profileLabels: getProfileLabels(profile),
        total: 0,
        message: "조건에 맞는 제품이 없습니다.",
      });
    }

    // 리뷰 통계 + 협업 필터링 로드 (병렬) + 시간대별 부스트
    const allProductIds = products.map((p) => p.id as string);
    const [reviewStats, cfBoosts] = await Promise.all([
      loadProductReviewStats(supabase, allProductIds),
      userId ? getCFBoosts(supabase, userId, {
        goals: profile.goals,
        concerns: profile.concerns,
        age: profile.body.age,
        bmi: profile.body.bmi,
        tastes: profile.tastes,
      }) : Promise.resolve([] as CFBoost[]),
    ]);
    const kstHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
    const scored = scoreAndRank(products, profile, purchasableIds, interactions, reviewStats, kstHour, cfBoosts.length > 0 ? cfBoosts : undefined);

    // 다양성 보장 + 탐색 슬롯
    const diversified = diversifyResults(scored);
    const withExploration = insertExplorationSlots(diversified, interactions);
    const top = withExploration.slice(0, 30);
    const productIds = top.map((p) => p.id as string);

    // 가격 + 리뷰
    const [priceMap, reviewMap] = await Promise.all([
      loadPricesV4(supabase, productIds),
      loadReviews(supabase, productIds),
    ]);

    const recommendations = top.map((p) => ({
      ...p,
      product_prices: (priceMap[p.id as string] || []).sort((a, b) => a.price - b.price),
      review_stats: reviewMap[p.id as string] || null,
    }));

    // 큐레이션 그룹
    const curationGroups = buildCurationGroups(
      recommendations as unknown as RecommendationWithPrices[],
      profile.concerns,
      profile.conditions,
    );

    return NextResponse.json({
      recommendations,
      curationGroups,
      profileLabels: getProfileLabels(profile),
      total: products.length,
      degraded,
      degradeMessage,
      filters_applied: {
        concerns: profile.concerns,
        conditions: profile.conditions,
        perMeal: profile.perMeal,
        healthRisks: profile.healthRisks,
        bmi: profile.body.bmi,
      },
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

  // 관심사별 매칭: CONCERN_RULES로 직접 체크
  if (concerns.includes("gut_health")) {
    const rules = CONCERN_RULES.gut_health;
    const items = rules ? products.filter((p) => rules.some((rule) => checkRule(p, rule))).slice(0, 6) : [];
    if (items.length > 0) groups.push({ title: "장건강 맞춤", description: "식이섬유가 풍부하고 소화에 부담 적은 식품", emoji: "🌿", productIds: items.map((p) => p.id as string) });
  }
  if (concerns.includes("skin")) {
    const rules = CONCERN_RULES.skin;
    const items = rules ? products.filter((p) => rules.some((rule) => checkRule(p, rule))).slice(0, 6) : [];
    if (items.length > 0) groups.push({ title: "피부건강 맞춤", description: "단백질과 건강한 지방이 풍부한 저당 식품", emoji: "✨", productIds: items.map((p) => p.id as string) });
  }
  if (concerns.includes("weight")) {
    const rules = CONCERN_RULES.weight;
    const items = rules ? products.filter((p) => rules.some((rule) => checkRule(p, rule))).slice(0, 6) : [];
    if (items.length > 0) groups.push({ title: "체중관리 맞춤", description: "저칼로리 고단백으로 든든하면서 가벼운 식품", emoji: "🏃", productIds: items.map((p) => p.id as string) });
  }
  if (concerns.includes("energy")) {
    const rules = CONCERN_RULES.energy;
    const items = rules ? products.filter((p) => rules.some((rule) => checkRule(p, rule))).slice(0, 6) : [];
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
