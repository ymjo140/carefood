import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * 규칙 기반 추천 API
 * 상황(페르소나) × 성분 × 안전 매칭
 *
 * 팜킷 특허 회피: 온톨로지 음식유사도 방식이 아닌,
 * 전문가 설계 분기형 규칙 기반 매칭 사용
 */

type RecommendRequest = {
  persona: string;
  conditions: string[];
  allergies: string[];
  pregnancyStage?: string;
  healthGoal?: string;
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
};

// 맛 레벨 → 영양성분 범위 매핑
const TASTE_RANGES: Record<string, Record<number, [number, number]>> = {
  salty: {
    1: [0, 300], 2: [300, 500], 3: [500, 800], 4: [800, 1200], 5: [1200, 9999],
  },
  sweet: {
    1: [0, 3], 2: [3, 6], 3: [6, 12], 4: [12, 20], 5: [20, 99],
  },
  fatty: {
    1: [0, 3], 2: [3, 7], 3: [7, 15], 4: [15, 25], 5: [25, 99],
  },
};

// 건강 목표별 영양 기준
const GOAL_FILTERS: Record<string, Record<string, [number, number]>> = {
  weight_loss: { calories: [0, 400], fat_g: [0, 10] },
  muscle_gain: { protein_g: [15, 999] },
  balanced: {},
  recovery: { protein_g: [10, 999] },
};

// 페르소나별 기본 추천 카테고리/키워드
const PERSONA_KEYWORDS: Record<string, string[]> = {
  elderly: ["죽", "미음", "연식", "부드러운", "닭가슴살", "두부", "계란", "우유", "요거트"],
  patient: ["저당", "무설탕", "저나트륨", "저칼로리", "저지방", "두부", "닭가슴살"],
  pregnant: ["엽산", "철분", "칼슘", "단백질", "유제품", "견과류", "닭가슴살"],
  general: [],
};

export async function POST(request: NextRequest) {
  try {
    const body: RecommendRequest = await request.json();
    const { persona, conditions, allergies, tastes, pregnancyStage, healthGoal } = body;

    const supabase = createServiceRoleClient();

    // 1. 안전 규칙 로드 (질환별 금기 필터)
    const safetyFilters: Record<string, number> = {};
    const safetyMinFilters: Record<string, number> = {};

    if (conditions.length > 0) {
      const { data: rules } = await supabase
        .from("safety_rules" as any)
        .select("*")
        .in("condition", conditions) as { data: { condition: string; nutrient: string; max_per_serving: number }[] | null };

      if (rules) {
        for (const rule of rules) {
          if (rule.max_per_serving < 0) {
            // 음수 = 최소값 (예: 임산부 단백질 최소 15g)
            const absVal = Math.abs(rule.max_per_serving);
            safetyMinFilters[rule.nutrient] = Math.max(
              safetyMinFilters[rule.nutrient] || 0,
              absVal
            );
          } else {
            // 양수 = 최대값 (가장 엄격한 값 적용)
            if (!(rule.nutrient in safetyFilters) || rule.max_per_serving < safetyFilters[rule.nutrient]) {
              safetyFilters[rule.nutrient] = rule.max_per_serving;
            }
          }
        }
      }
    }

    // 임산부 안전 규칙
    if (persona === "pregnant" && pregnancyStage) {
      const { data: pregnantRules } = await supabase
        .from("safety_rules" as any)
        .select("*")
        .eq("condition", "pregnant") as { data: { condition: string; nutrient: string; max_per_serving: number }[] | null };

      if (pregnantRules) {
        for (const rule of pregnantRules) {
          if (rule.max_per_serving < 0) {
            const absVal = Math.abs(rule.max_per_serving);
            safetyMinFilters[rule.nutrient] = Math.max(
              safetyMinFilters[rule.nutrient] || 0,
              absVal
            );
          }
        }
      }
    }

    // 2. 구매 가능 상품 중에서 필터링
    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .eq("category_large", "상용제품");

    // 안전 필터 적용 (질환별 상한)
    for (const [nutrient, maxVal] of Object.entries(safetyFilters)) {
      query = query.lte(nutrient, maxVal);
    }
    // 최소값 필터 적용
    for (const [nutrient, minVal] of Object.entries(safetyMinFilters)) {
      query = query.gte(nutrient, minVal);
    }

    // 건강 목표별 필터
    if (healthGoal && GOAL_FILTERS[healthGoal]) {
      for (const [field, [min, max]] of Object.entries(GOAL_FILTERS[healthGoal])) {
        query = query.gte(field, min).lte(field, max);
      }
    }

    // 맛 필터 적용 (넓은 범위 ±1단계)
    if (tastes.salty >= 1 && tastes.salty <= 5) {
      const level = tastes.salty;
      const lowLevel = Math.max(1, level - 1);
      const highLevel = Math.min(5, level + 1);
      const min = TASTE_RANGES.salty[lowLevel][0];
      const max = TASTE_RANGES.salty[highLevel][1];
      query = query.gte("sodium_mg", min).lt("sodium_mg", max);
    }
    if (tastes.sweet >= 1 && tastes.sweet <= 5) {
      const level = tastes.sweet;
      const lowLevel = Math.max(1, level - 1);
      const highLevel = Math.min(5, level + 1);
      const min = TASTE_RANGES.sweet[lowLevel][0];
      const max = TASTE_RANGES.sweet[highLevel][1];
      query = query.gte("sugar_g", min).lt("sugar_g", max);
    }
    if (tastes.fatty >= 1 && tastes.fatty <= 5) {
      const level = tastes.fatty;
      const lowLevel = Math.max(1, level - 1);
      const highLevel = Math.min(5, level + 1);
      const min = TASTE_RANGES.fatty[lowLevel][0];
      const max = TASTE_RANGES.fatty[highLevel][1];
      query = query.gte("fat_g", min).lt("fat_g", max);
    }
    if (tastes.spicy >= 1 && tastes.spicy <= 5) {
      // 매운맛은 ±1 범위
      const minSpicy = Math.max(0, tastes.spicy - 1);
      const maxSpicy = Math.min(5, tastes.spicy + 1);
      query = query.gte("spicy_score", minSpicy).lte("spicy_score", maxSpicy);
    }

    // 랜덤성을 위해 넉넉하게 가져옴
    query = query.limit(200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: products, error, count } = await query as { data: any[] | null; error: any; count: number | null };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({
        recommendations: [],
        total: 0,
        filters_applied: { safetyFilters, safetyMinFilters },
        message: "조건에 맞는 제품이 없습니다. 필터를 조정해보세요.",
      });
    }

    // 3. 스코어링 + 개인화 이유 생성
    // 로드맵: "왜 이 제품인가" — 쉬운 말, 사실 중심, 효능 주장 금지
    const scored = products.map((p) => {
      let score = 50;
      const reasons: string[] = [];
      const reasonDetails: string[] = []; // 상세 설명 (1줄)

      // 영양 균형
      if (p.calories && p.calories > 0 && p.calories < 600) score += 5;
      if (p.protein_g && p.protein_g >= 10) {
        score += 5;
        reasons.push("단백질 풍부");
      }

      // 페르소나별 보너스 — 이유를 사람이 읽는 말로
      if (persona === "elderly") {
        if (p.sodium_mg !== null && p.sodium_mg < 400) {
          score += 10;
          reasons.push("저나트륨");
          reasonDetails.push(`나트륨 ${Math.round(p.sodium_mg)}mg — 싱거운 맛 선호에 맞춰요`);
        }
        if (p.fiber_g !== null && p.fiber_g < 3) {
          score += 5;
          reasons.push("부드러운 식감");
          reasonDetails.push("식이섬유가 적어 소화 부담이 적어요");
        }
        if (p.spicy_score <= 1) {
          score += 3;
          reasons.push("자극 적음");
        }
      }
      if (persona === "patient") {
        if (p.sugar_g !== null && p.sugar_g < 5) {
          score += 10;
          reasons.push("저당");
          reasonDetails.push(`당류 ${p.sugar_g}g — 당류 조절 식단에 적합해요`);
        }
        if (p.sodium_mg !== null && p.sodium_mg < 300) {
          score += 10;
          reasons.push("저나트륨");
          reasonDetails.push(`나트륨 ${Math.round(p.sodium_mg)}mg으로 낮아요`);
        }
        if (p.protein_g && p.protein_g >= 15) {
          score += 5;
          reasons.push("고단백");
          reasonDetails.push(`단백질 ${p.protein_g}g 포함 — 고단백 설계`);
        }
      }
      if (persona === "pregnant") {
        if (p.protein_g && p.protein_g >= 15) {
          score += 10;
          reasons.push("고단백");
          reasonDetails.push(`단백질 ${p.protein_g}g — 1일 권장량의 ${Math.round(p.protein_g / 55 * 100)}%`);
        }
        if (p.calories && p.calories >= 200 && p.calories <= 500) {
          score += 5;
          reasons.push("적정 칼로리");
          reasonDetails.push(`${p.calories}kcal — 균형 잡힌 열량이에요`);
        }
      }
      if (persona === "general") {
        if (healthGoal === "weight_loss") {
          if (p.calories && p.calories < 300) {
            score += 10;
            reasons.push("저칼로리");
            reasonDetails.push(`${p.calories}kcal로 가벼워요`);
          }
          if (p.protein_g && p.protein_g >= 15) {
            score += 5;
            reasons.push("고단백");
            reasonDetails.push(`단백질 ${p.protein_g}g 고단백 설계`);
          }
        }
        if (healthGoal === "muscle_gain" && p.protein_g && p.protein_g >= 20) {
          score += 10;
          reasons.push("고단백");
          reasonDetails.push(`단백질 ${p.protein_g}g — 1일 권장량의 ${Math.round(p.protein_g / 55 * 100)}%`);
        }
      }

      // 건강 조건별 안전 메시지
      if (conditions.includes("diabetes") && p.sugar_g !== null && p.sugar_g < 5) {
        if (!reasons.includes("저당")) {
          reasons.push("저당");
          reasonDetails.push(`당류 ${p.sugar_g}g — 저당 설계`);
        }
        score += 3;
      }
      if (conditions.includes("hypertension") && p.sodium_mg !== null && p.sodium_mg < 400) {
        if (!reasons.includes("저나트륨")) {
          reasons.push("저나트륨");
          reasonDetails.push(`나트륨 ${Math.round(p.sodium_mg)}mg — 저나트륨 설계`);
        }
        score += 3;
      }
      if (conditions.includes("kidney") && p.protein_g !== null && p.protein_g < 10) {
        reasons.push("저단백");
        reasonDetails.push(`단백질 ${p.protein_g}g — 저단백 설계`);
        score += 5;
      }

      // 맛 일치도 (완벽 일치 보너스)
      let tasteMatch = 0;
      if (tastes.salty >= 1 && tastes.salty <= 5 && p.sodium_mg) {
        const [idealMin, idealMax] = TASTE_RANGES.salty[tastes.salty];
        if (p.sodium_mg >= idealMin && p.sodium_mg < idealMax) { score += 5; tasteMatch++; }
      }
      if (tastes.sweet >= 1 && tastes.sweet <= 5 && p.sugar_g !== null) {
        const [idealMin, idealMax] = TASTE_RANGES.sweet[tastes.sweet];
        if (p.sugar_g >= idealMin && p.sugar_g < idealMax) { score += 5; tasteMatch++; }
      }
      if (tasteMatch >= 2) {
        reasons.push("맛 취향 일치");
        reasonDetails.push("선호하시는 맛 프로필에 가까워요");
      }

      return {
        ...p,
        match_score: Math.min(score, 100),
        reasons: reasons.slice(0, 4),
        reason_detail: reasonDetails[0] || null, // 대표 이유 1줄
      };
    });

    // 점수순 정렬 후 상위 30개
    scored.sort((a, b) => b.match_score - a.match_score);
    const top = scored.slice(0, 30);
    const productIds = top.map((p) => p.id);

    // 4. 가격 정보 가져오기
    const { data: prices } = await supabase
      .from("v_all_prices" as any)
      .select("product_id, platform, price, url, image_url")
      .in("product_id", productIds) as { data: { product_id: string; platform: string; price: number; url: string; image_url: string | null }[] | null };

    const priceMap: Record<string, { platform: string; price: number; url: string; image_url: string | null }[]> = {};
    if (prices) {
      for (const p of prices) {
        if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
        priceMap[p.product_id].push({
          platform: p.platform,
          price: p.price,
          url: p.url,
          image_url: p.image_url,
        });
      }
    }

    // 5. 맛평가 통계 가져오기 (리뷰 있는 제품만)
    const { data: reviewStats } = await ((supabase
      .from("taste_reviews") as any)
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

    const recommendations = top.map((p) => ({
      ...p,
      product_prices: (priceMap[p.id] || []).sort((a, b) => a.price - b.price),
      review_stats: reviewMap[p.id] || null,
    }));

    // 6. 큐레이션 그룹 생성
    const curationGroups = buildCurationGroups(recommendations, persona, conditions);

    return NextResponse.json({
      recommendations,
      curationGroups,
      total: count,
      filters_applied: {
        persona,
        conditions,
        safetyFilters,
        safetyMinFilters,
      },
    });
  } catch (err) {
    console.error("Recommend API error:", err);
    return NextResponse.json({ error: "추천 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// 큐레이션 그룹 생성
function buildCurationGroups(
  products: any[],
  persona: string,
  conditions: string[]
) {
  const groups: { title: string; description: string; emoji: string; productIds: string[] }[] = [];

  // 페르소나별 큐레이션
  if (persona === "elderly") {
    const soft = products.filter((p) => p.fiber_g !== null && p.fiber_g < 3).slice(0, 6);
    if (soft.length > 0) {
      groups.push({
        title: "부드럽고 소화 잘 되는",
        description: "어르신께서 편하게 드실 수 있는 부드러운 식품",
        emoji: "🥄",
        productIds: soft.map((p) => p.id),
      });
    }
  }

  if (persona === "patient" || persona === "elderly") {
    if (conditions.includes("diabetes")) {
      const lowSugar = products.filter((p) => p.sugar_g !== null && p.sugar_g < 5).slice(0, 6);
      if (lowSugar.length > 0) {
        groups.push({
          title: "당류 5g 이하",
          description: "당류 5g 이하로 설계된 식품 모음",
          emoji: "🩸",
          productIds: lowSugar.map((p) => p.id),
        });
      }
    }
    if (conditions.includes("hypertension")) {
      const lowSodium = products.filter((p) => p.sodium_mg !== null && p.sodium_mg < 400).slice(0, 6);
      if (lowSodium.length > 0) {
        groups.push({
          title: "나트륨 400mg 이하",
          description: "나트륨 400mg 이하로 설계된 식품 모음",
          emoji: "❤️",
          productIds: lowSodium.map((p) => p.id),
        });
      }
    }
  }

  if (persona === "pregnant") {
    const highProtein = products.filter((p) => p.protein_g !== null && p.protein_g >= 15).slice(0, 6);
    if (highProtein.length > 0) {
      groups.push({
        title: "고단백 추천",
        description: "태아 발달과 산모 건강을 위한 단백질 풍부한 식품",
        emoji: "💪",
        productIds: highProtein.map((p) => p.id),
      });
    }
  }

  // 공통: 가성비 추천
  const withPrices = products.filter((p) => p.product_prices?.length > 0);
  const affordable = withPrices
    .sort((a, b) => (a.product_prices[0]?.price || 999999) - (b.product_prices[0]?.price || 999999))
    .slice(0, 6);
  if (affordable.length > 0) {
    groups.push({
      title: "가성비 추천",
      description: "조건에 맞으면서 합리적인 가격의 식품",
      emoji: "💰",
      productIds: affordable.map((p) => p.id),
    });
  }

  // 공통: 전체 매칭 상위
  const topMatches = products.slice(0, 6);
  if (topMatches.length > 0) {
    groups.push({
      title: "종합 추천 TOP",
      description: "맛 선호도와 건강 조건을 종합한 최적 매칭",
      emoji: "⭐",
      productIds: topMatches.map((p) => p.id),
    });
  }

  return groups;
}
