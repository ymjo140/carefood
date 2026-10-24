import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * 주간 박스 추천 API
 * 관심사 + 영양 밸런스 + 가격 기반 7일 식단 자동 구성
 */

type WeeklyBoxRequest = {
  concerns: string[];
  conditions: string[];
  allergies: string[];
  sensitivity?: { digestive: number; additive: number };
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
  budget?: number; // 주간 예산 (원)
  mealsPerDay?: number; // 하루 끼니 수 (기본 2)
};

// 영양 밸런스 목표 (1일 기준, 성인)
const DAILY_TARGETS = {
  calories: { min: 1600, max: 2200 },
  protein_g: { min: 50, max: 80 },
  fat_g: { min: 30, max: 65 },
  sugar_g: { min: 0, max: 25 },
  sodium_mg: { min: 0, max: 2000 },
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
    } = body;

    const supabase = createServiceRoleClient();

    // 1. 추천 API와 동일한 방식으로 상품 후보군 가져오기 (가격 있는 것만)
    // 구매 가능한 제품만 대상
    const { data: priceProducts } = await supabase
      .from("v_all_prices" as any)
      .select("product_id, platform, price, url, image_url")
      .gt("price", 0) as { data: any[] | null };

    if (!priceProducts || priceProducts.length === 0) {
      return NextResponse.json({
        box: null,
        message: "구매 가능한 제품이 없습니다.",
      });
    }

    // 가격 맵 구축
    const priceMap: Record<string, { platform: string; price: number; url: string; image_url: string | null }[]> = {};
    const purchasableIds: string[] = [];
    for (const p of priceProducts) {
      if (!priceMap[p.product_id]) {
        priceMap[p.product_id] = [];
        purchasableIds.push(p.product_id);
      }
      priceMap[p.product_id].push(p);
    }

    // 중복 제거
    const uniqueIds = [...new Set(purchasableIds)];

    // 2. 구매 가능한 제품의 영양 정보 로드 (batch로)
    const batchSize = 500;
    let allProducts: any[] = [];
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize);
      const { data } = await supabase
        .from("products")
        .select("id, name, calories, protein_g, fat_g, sugar_g, sodium_mg, fiber_g, functional_tags")
        .eq("is_active", true)
        .in("id", batch);
      if (data) allProducts = allProducts.concat(data);
    }

    if (allProducts.length === 0) {
      return NextResponse.json({
        box: null,
        message: "영양 정보가 있는 구매 가능 제품이 없습니다.",
      });
    }

    // 3. 관심사 기반 스코어링
    const scored = allProducts
      .filter((p) => p.calories && p.calories > 0)
      .map((p) => {
        let score = 50;
        const tags: string[] = p.functional_tags || [];

        // 관심사 매칭
        for (const concern of concerns) {
          if (concern === "gut_health") {
            if (tags.includes("probiotics")) score += 20;
            if (tags.includes("prebiotic")) score += 18;
            if (p.fiber_g && p.fiber_g >= 3) score += 10;
          }
          if (concern === "skin") {
            if (tags.includes("collagen")) score += 20;
            if (tags.includes("vitamin")) score += 12;
          }
          if (concern === "weight") {
            if (tags.includes("protein")) score += 15;
            if (tags.includes("diet")) score += 15;
            if (p.calories < 300) score += 10;
            if (p.protein_g && p.protein_g >= 15) score += 8;
          }
          if (concern === "energy") {
            if (tags.includes("vitamin")) score += 15;
            if (p.protein_g && p.protein_g >= 12) score += 10;
            if (p.calories >= 200 && p.calories <= 500) score += 8;
          }
        }

        // 질환별 보너스
        if (conditions.includes("diabetes") && p.sugar_g !== null && p.sugar_g < 5) score += 10;
        if (conditions.includes("hypertension") && p.sodium_mg !== null && p.sodium_mg < 400) score += 10;

        // 최저가
        const prices = (priceMap[p.id] || []).sort((a, b) => a.price - b.price);
        const bestPrice = prices[0]?.price || 99999;

        return {
          ...p,
          score,
          bestPrice,
          prices,
        };
      });

    // 점수순 정렬
    scored.sort((a, b) => b.score - a.score);

    // 4. 7일 × mealsPerDay 슬롯 채우기 (그리디 + 영양 밸런스)
    const totalSlots = 7 * mealsPerDay;
    const perMealBudget = budget / totalSlots;
    const selected: any[] = [];
    const usedIds = new Set<string>();

    // 영양 누적
    const totalNutrients = { calories: 0, protein_g: 0, fat_g: 0, sugar_g: 0, sodium_mg: 0 };

    for (const product of scored) {
      if (selected.length >= totalSlots) break;
      if (usedIds.has(product.id)) continue;
      if (product.bestPrice > perMealBudget * 1.5) continue; // 예산 초과 제품 스킵

      // 영양 밸런스 체크 (일평균이 목표 범위 안에 있도록)
      const daysElapsed = Math.floor(selected.length / mealsPerDay) + 1;
      const projectedDaily = {
        calories: (totalNutrients.calories + (product.calories || 0)) / daysElapsed,
        protein_g: (totalNutrients.protein_g + (product.protein_g || 0)) / daysElapsed,
      };

      // 칼로리가 일일 목표 범위를 크게 초과하면 스킵
      if (projectedDaily.calories > DAILY_TARGETS.calories.max * 1.3) continue;

      selected.push(product);
      usedIds.add(product.id);

      totalNutrients.calories += product.calories || 0;
      totalNutrients.protein_g += product.protein_g || 0;
      totalNutrients.fat_g += product.fat_g || 0;
      totalNutrients.sugar_g += product.sugar_g || 0;
      totalNutrients.sodium_mg += product.sodium_mg || 0;
    }

    // 5. 일별 배분
    const days: { day: number; dayLabel: string; items: any[] }[] = [];
    const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];

    for (let d = 0; d < 7; d++) {
      const dayItems = selected.slice(d * mealsPerDay, (d + 1) * mealsPerDay);
      days.push({
        day: d + 1,
        dayLabel: dayLabels[d],
        items: dayItems.map((item) => ({
          product_id: item.id,
          name: item.name,
          calories: item.calories,
          protein_g: item.protein_g,
          match_score: item.score,
          best_price: item.bestPrice,
          prices: item.prices.slice(0, 3), // 상위 3개 플랫폼
          functional_tags: item.functional_tags || [],
        })),
      });
    }

    // 6. 요약 통계
    const totalPrice = selected.reduce((sum, p) => sum + p.bestPrice, 0);
    const avgDailyNutrients = {
      calories: Math.round(totalNutrients.calories / 7),
      protein_g: Math.round(totalNutrients.protein_g / 7),
      fat_g: Math.round(totalNutrients.fat_g / 7),
      sugar_g: Math.round(totalNutrients.sugar_g / 7),
      sodium_mg: Math.round(totalNutrients.sodium_mg / 7),
    };

    return NextResponse.json({
      box: {
        days,
        summary: {
          totalItems: selected.length,
          totalPrice,
          avgDailyNutrients,
          concerns,
          mealsPerDay,
        },
      },
    });
  } catch (err) {
    console.error("Weekly box API error:", err);
    return NextResponse.json({ error: "주간 박스 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
