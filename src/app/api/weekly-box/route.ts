import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * 주간 박스 추천 API v2
 * 식사 + 보조 분리, 최소 칼로리 보장, 다양성 강제, 행동 기반 개인화
 */

type WeeklyBoxRequest = {
  concerns: string[];
  conditions: string[];
  allergies: string[];
  sensitivity?: { digestive: number; additive: number };
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
  budget?: number;
  mealsPerDay?: number; // 식사 끼니 수 (기본 2)
  supplementsPerDay?: number; // 보조 개수 (기본 1)
  user_id?: string; // 행동 기반 개인화용
};

// 식사 카테고리 (실제 음식)
const MEAL_CATEGORIES = new Set(["soup", "noodle", "rice", "grill", "stew", "side", "seafood", "salad"]);
// 보조 카테고리 (음료, 보충제, 간식 등)
const SUPPLEMENT_CATEGORIES = new Set(["beverage", "supplement", "powder", "snack"]);

// 1끼 식사 기준
const MEAL_CRITERIA = {
  minCalories: 250,   // 최소 250kcal (식사로 인정)
  idealMin: 350,      // 이상적 최소
  idealMax: 700,      // 이상적 최대
  maxCalories: 900,   // 절대 최대
};

// 1일 영양 목표
const DAILY_TARGETS = {
  calories: { min: 1200, ideal: 1800, max: 2500 },
  protein_g: { min: 40, ideal: 60 },
  sodium_mg: { max: 2300 },
};

// 관심사별 태그 가중치
const CONCERN_WEIGHTS: Record<string, Record<string, number>> = {
  gut_health: { probiotics: 25, prebiotic: 20, fiber: 10 },
  skin: { collagen: 25, vitamin: 15 },
  weight: { protein: 15, diet: 15, sugar_free: 10 },
  energy: { vitamin: 15, protein: 10 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScoredProduct = any & {
  score: number;
  bestPrice: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prices: any[];
  isMeal: boolean;
  isSupplement: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body: WeeklyBoxRequest = await request.json();
    const {
      concerns = [],
      conditions = [],
      tastes,
      budget = 100000,
      mealsPerDay = 2,
      supplementsPerDay = 1,
      user_id,
    } = body;

    const supabase = createServiceRoleClient();

    // ── 1. 행동 이력 기반 선호도 로드 ──
    let userPrefs: { category_counts: Record<string, number>; tag_counts: Record<string, number>; clicked_ids: Set<string> } = {
      category_counts: {},
      tag_counts: {},
      clicked_ids: new Set(),
    };

    if (user_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: interactions } = await supabase
        .from("user_interactions")
        .select("product_id, action")
        .eq("user_id", user_id)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(100) as { data: { product_id: string; action: string }[] | null };

      if (interactions && interactions.length > 0) {
        const clickedIds = new Set(interactions.filter(i => i.action === "click_price").map(i => i.product_id));
        const allIds = [...new Set(interactions.map(i => i.product_id))];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: viewedProducts } = await supabase
          .from("products")
          .select("id, dish_category, functional_tags")
          .in("id", allIds) as { data: { id: string; dish_category: string | null; functional_tags: string[] | null }[] | null };

        if (viewedProducts) {
          for (const p of viewedProducts) {
            const w = clickedIds.has(p.id) ? 3 : 1;
            if (p.dish_category) {
              userPrefs.category_counts[p.dish_category] = (userPrefs.category_counts[p.dish_category] || 0) + w;
            }
            if (p.functional_tags) {
              for (const t of p.functional_tags) {
                userPrefs.tag_counts[t] = (userPrefs.tag_counts[t] || 0) + w;
              }
            }
          }
        }
        userPrefs.clicked_ids = clickedIds;
      }
    }

    // ── 2. 구매 가능 제품 직접 로드 (is_purchasable 플래그 활용) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allProducts: any[] = [];
    const prodPageSize = 1000;
    let prodOffset = 0;
    let prodHasMore = true;

    while (prodHasMore) {
      const { data: prodBatch, error: prodError } = await supabase
        .from("products")
        .select("id, name, manufacturer, calories, protein_g, fat_g, sugar_g, sodium_mg, fiber_g, functional_tags, dish_category")
        .eq("is_active", true)
        .eq("category_large", "상용제품")
        .eq("is_purchasable", true)
        .gt("calories", 0)
        .range(prodOffset, prodOffset + prodPageSize - 1);

      if (prodError) {
        console.error("[weekly-box] products load error:", prodError.message);
        break;
      }
      if (!prodBatch || prodBatch.length === 0) {
        if (prodOffset === 0) {
          return NextResponse.json({ box: null, message: "구매 가능한 제품이 없습니다." });
        }
        break;
      }
      allProducts = allProducts.concat(prodBatch);
      prodHasMore = prodBatch.length === prodPageSize;
      prodOffset += prodPageSize;
    }
    console.log("[weekly-box] loaded products:", allProducts.length);

    // ── 3. 스코어링 (가격 제외 — 가격은 선택 후 조회) ──
    const scored: ScoredProduct[] = allProducts
      .map(p => {
        const cat = p.dish_category || "other";
        const isMeal = MEAL_CATEGORIES.has(cat) && p.calories >= MEAL_CRITERIA.minCalories;
        const isSupplement = SUPPLEMENT_CATEGORIES.has(cat) || (p.calories < MEAL_CRITERIA.minCalories);

        let score = 40;
        const tags: string[] = p.functional_tags || [];

        // ▸ 관심사 매칭 (최대 +50)
        for (const concern of concerns) {
          const weights = CONCERN_WEIGHTS[concern];
          if (weights) {
            for (const [tag, w] of Object.entries(weights)) {
              if (tag === "fiber" && p.fiber_g && p.fiber_g >= 3) score += w;
              else if (tags.includes(tag)) score += w;
            }
          }
        }

        // ▸ 질환 안전성 (+10 each)
        if (conditions.includes("diabetes") && p.sugar_g != null && p.sugar_g < 5) score += 10;
        if (conditions.includes("hypertension") && p.sodium_mg != null && p.sodium_mg < 400) score += 10;
        if (conditions.includes("kidney") && p.protein_g != null && p.protein_g < 15) score += 8;

        // ▸ 식사 칼로리 적정성 보너스 (식사 제품만)
        if (isMeal) {
          if (p.calories >= MEAL_CRITERIA.idealMin && p.calories <= MEAL_CRITERIA.idealMax) {
            score += 15;
          } else if (p.calories >= MEAL_CRITERIA.minCalories) {
            score += 5;
          }
          if (p.protein_g && p.protein_g >= 15) score += 10;
          if (p.protein_g && p.protein_g >= 25) score += 5;
        }

        // ▸ 맛 선호 매칭 (+5 each)
        if (tastes) {
          if (tastes.salty > 0 && p.sodium_mg != null) {
            if (tastes.salty >= 7 && p.sodium_mg >= 800) score += 5;
            else if (tastes.salty <= 3 && p.sodium_mg <= 300) score += 5;
          }
          if (tastes.sweet > 0 && p.sugar_g != null) {
            if (tastes.sweet <= 3 && p.sugar_g <= 3) score += 5;
            else if (tastes.sweet >= 7 && p.sugar_g >= 10) score += 5;
          }
        }

        // ▸ 행동 기반 개인화 (최대 +15)
        if (userPrefs.clicked_ids.has(p.id)) score += 10;
        if (p.dish_category && userPrefs.category_counts[p.dish_category]) {
          score += Math.min(userPrefs.category_counts[p.dish_category] * 2, 10);
        }
        for (const tag of tags) {
          if (userPrefs.tag_counts[tag]) score += Math.min(userPrefs.tag_counts[tag], 5);
        }

        return { ...p, score: Math.min(score, 100), bestPrice: 0, prices: [], isMeal, isSupplement };
      });

    // ── 4. 식사/보조 풀 분리 → 상위 후보 선택 ──
    const mealPool = scored.filter(p => p.isMeal).sort((a, b) => b.score - a.score);
    const supplementPool = scored.filter(p => p.isSupplement).sort((a, b) => b.score - a.score);

    // 상위 후보만 추려서 가격 조회 (상위 100개면 충분)
    const topMealCandidates = mealPool.slice(0, 100);
    const topSupplementCandidates = supplementPool.slice(0, 50);
    const candidateIds = [...new Set([...topMealCandidates, ...topSupplementCandidates].map(p => p.id))];

    // ── 5. 후보 제품 가격 조회 ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceMap: Record<string, any[]> = {};
    const priceBatchSize = 50;
    for (let i = 0; i < candidateIds.length; i += priceBatchSize) {
      const batch = candidateIds.slice(i, i + priceBatchSize);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: priceBatch } = await (supabase as any)
        .from("v_all_prices")
        .select("product_id, platform, price, url, image_url")
        .in("product_id", batch)
        .gt("price", 0);
      if (priceBatch) {
        for (const p of priceBatch) {
          if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
          priceMap[p.product_id].push(p);
        }
      }
    }

    // 가격 정보 붙이기
    const withPrices = (items: ScoredProduct[]) =>
      items.map(p => {
        const prices = (priceMap[p.id] || []).sort((a: { price: number }, b: { price: number }) => a.price - b.price);
        return { ...p, bestPrice: prices[0]?.price || 99999, prices };
      });

    const mealCandidatesWithPrice = withPrices(topMealCandidates);
    const supplementCandidatesWithPrice = withPrices(topSupplementCandidates);

    // ── 6. 7일 식단 구성 ──
    const totalMealSlots = 7 * mealsPerDay;
    const totalSupplementSlots = 7 * supplementsPerDay;
    const mealBudget = budget * 0.75;
    const supplementBudget = budget * 0.25;
    const perMealBudget = mealBudget / totalMealSlots;
    const perSupplementBudget = supplementBudget / totalSupplementSlots;

    // 식사 선택 (다양성: dish_keyword 중복 방지, 카테고리 분산)
    const selectedMeals: ScoredProduct[] = [];
    const usedKeywords = new Map<string, number>();
    const usedCategories = new Map<string, number>();

    for (const product of mealCandidatesWithPrice) {
      if (selectedMeals.length >= totalMealSlots) break;
      if (product.bestPrice > perMealBudget * 1.8) continue;

      const kw = product.name;
      if ((usedKeywords.get(kw) || 0) >= 2) continue;

      const cat = product.dish_category || "other";
      if ((usedCategories.get(cat) || 0) >= 5) continue;

      selectedMeals.push(product);
      usedKeywords.set(kw, (usedKeywords.get(kw) || 0) + 1);
      usedCategories.set(cat, (usedCategories.get(cat) || 0) + 1);
    }

    // 보조 선택 (다양성: 같은 제품 1번)
    const selectedSupplements: ScoredProduct[] = [];
    const usedSupIds = new Set<string>();

    for (const product of supplementCandidatesWithPrice) {
      if (selectedSupplements.length >= totalSupplementSlots) break;
      if (usedSupIds.has(product.id)) continue;
      if (product.bestPrice > perSupplementBudget * 2) continue;

      selectedSupplements.push(product);
      usedSupIds.add(product.id);
    }

    // ── 7. 일별 배분 (영양 밸런스) ──
    const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const days: any[] = [];

    // 식사를 각 요일에 분배 (칼로리 밸런스)
    // 먼저 칼로리 내림차순으로 정렬 후 라운드 로빈
    const sortedMeals = [...selectedMeals].sort((a, b) => b.calories - a.calories);
    const dayMeals: ScoredProduct[][] = Array.from({ length: 7 }, () => []);
    const dayCalories: number[] = Array(7).fill(0);

    for (const meal of sortedMeals) {
      // 가장 칼로리 낮은 날에 배정
      let minDay = 0;
      for (let d = 1; d < 7; d++) {
        if (dayCalories[d] < dayCalories[minDay] && dayMeals[d].length < mealsPerDay) {
          minDay = d;
        }
      }
      if (dayMeals[minDay].length < mealsPerDay) {
        dayMeals[minDay].push(meal);
        dayCalories[minDay] += meal.calories || 0;
      }
    }

    // 보조를 라운드 로빈 배정
    const daySupplements: ScoredProduct[][] = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < selectedSupplements.length; i++) {
      const d = i % 7;
      if (daySupplements[d].length < supplementsPerDay) {
        daySupplements[d].push(selectedSupplements[i]);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatItem = (item: ScoredProduct, slotType: "meal" | "supplement") => ({
      product_id: item.id,
      name: item.name,
      manufacturer: item.manufacturer,
      calories: item.calories,
      protein_g: item.protein_g,
      fat_g: item.fat_g,
      sugar_g: item.sugar_g,
      sodium_mg: item.sodium_mg,
      match_score: item.score,
      best_price: item.bestPrice,
      prices: item.prices.slice(0, 3),
      functional_tags: item.functional_tags || [],
      dish_category: item.dish_category,
      slot_type: slotType,
    });

    for (let d = 0; d < 7; d++) {
      const meals = dayMeals[d].map(m => formatItem(m, "meal"));
      const supplements = daySupplements[d].map(s => formatItem(s, "supplement"));
      const allItems = [...meals, ...supplements];

      const dayCal = allItems.reduce((sum, i) => sum + (i.calories || 0), 0);
      const dayProtein = allItems.reduce((sum, i) => sum + (i.protein_g || 0), 0);
      const dayPrice = allItems.reduce((sum, i) => sum + (i.best_price || 0), 0);

      days.push({
        day: d + 1,
        dayLabel: dayLabels[d],
        meals,
        supplements,
        summary: {
          calories: Math.round(dayCal),
          protein_g: Math.round(dayProtein),
          total_price: dayPrice,
          meal_count: meals.length,
          supplement_count: supplements.length,
        },
      });
    }

    // ── 8. 전체 요약 ──
    const allSelected = [...selectedMeals, ...selectedSupplements];
    const totalPrice = allSelected.reduce((sum, p) => sum + p.bestPrice, 0);
    const totalCalories = allSelected.reduce((sum, p) => sum + (p.calories || 0), 0);
    const totalProtein = allSelected.reduce((sum, p) => sum + (p.protein_g || 0), 0);

    return NextResponse.json({
      box: {
        days,
        summary: {
          totalItems: allSelected.length,
          totalMeals: selectedMeals.length,
          totalSupplements: selectedSupplements.length,
          totalPrice,
          avgDailyCalories: Math.round(totalCalories / 7),
          avgDailyProtein: Math.round(totalProtein / 7),
          avgDailyPrice: Math.round(totalPrice / 7),
          concerns,
          mealsPerDay,
          supplementsPerDay,
          // 영양 적정성 경고
          warnings: [
            ...(totalCalories / 7 < DAILY_TARGETS.calories.min ? [`일일 평균 칼로리(${Math.round(totalCalories / 7)}kcal)가 권장 최소(${DAILY_TARGETS.calories.min}kcal)보다 낮습니다`] : []),
            ...(totalProtein / 7 < DAILY_TARGETS.protein_g.min ? [`일일 평균 단백질(${Math.round(totalProtein / 7)}g)이 권장 최소(${DAILY_TARGETS.protein_g.min}g)보다 낮습니다`] : []),
          ],
        },
      },
    });
  } catch (err) {
    console.error("Weekly box API error:", err);
    return NextResponse.json({ error: "주간 박스 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
