import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * 이너케어 추천 API v2
 * 관심사(concern) × 민감도 × 영양성분 매칭 × 안전 규칙
 *
 * 팜킷 특허 회피: 온톨로지 음식유사도 방식이 아닌,
 * 전문가 설계 분기형 규칙 기반 매칭 사용
 */

type HealthConcern = "gut_health" | "skin" | "weight" | "energy";

type RecommendRequest = {
  // v2 이너케어 (primary)
  concerns: HealthConcern[];
  sensitivity?: {
    digestive: number; // 1=둔감, 2=보통, 3=예민
    additive: number;
  };
  // v1 레거시 하위호환
  persona?: string;
  conditions?: string[];
  allergies?: string[];
  pregnancyStage?: string;
  healthGoal?: string;
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
};

// ─── 관심사별 영양 스코어링 규칙 ───
// 각 관심사는 "어떤 영양성분이 높으면/낮으면 좋은가"를 정의
// boost: 해당 범위면 점수 추가, reason도 생성
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
    {
      field: "fiber_g", op: "gte", value: 3, score: 15,
      reason: "식이섬유 풍부",
      detail: (v) => `식이섬유 ${v}g — 장 환경에 도움이 되는 수준이에요`,
    },
    {
      field: "sugar_g", op: "lt", value: 8, score: 8,
      reason: "당류 적정",
      detail: (v) => `당류 ${v}g — 장에 부담이 적어요`,
    },
    {
      field: "fat_g", op: "lt", value: 10, score: 5,
      reason: "저지방",
      detail: (v) => `지방 ${v}g — 소화 부담이 적어요`,
    },
  ],
  skin: [
    {
      field: "protein_g", op: "gte", value: 10, score: 12,
      reason: "단백질 풍부",
      detail: (v) => `단백질 ${v}g — 피부 구성에 필요한 영양소예요`,
    },
    {
      field: "fat_g", op: "between", value: [3, 15], score: 8,
      reason: "건강한 지방",
      detail: (v) => `지방 ${v}g — 피부 보습에 적정한 수준이에요`,
    },
    {
      field: "sugar_g", op: "lt", value: 5, score: 10,
      reason: "저당",
      detail: (v) => `당류 ${v}g — 당류가 적어요`,
    },
  ],
  weight: [
    {
      field: "calories", op: "lt", value: 300, score: 15,
      reason: "저칼로리",
      detail: (v) => `${v}kcal로 가벼워요`,
    },
    {
      field: "protein_g", op: "gte", value: 15, score: 12,
      reason: "고단백",
      detail: (v) => `단백질 ${v}g — 포만감을 오래 유지해요`,
    },
    {
      field: "fat_g", op: "lt", value: 8, score: 8,
      reason: "저지방",
      detail: (v) => `지방 ${v}g으로 가벼워요`,
    },
    {
      field: "sugar_g", op: "lt", value: 5, score: 8,
      reason: "저당",
      detail: (v) => `당류 ${v}g — 당류 걱정 없어요`,
    },
  ],
  energy: [
    {
      field: "calories", op: "between", value: [200, 500], score: 10,
      reason: "적정 열량",
      detail: (v) => `${v}kcal — 든든한 에너지를 채워줘요`,
    },
    {
      field: "protein_g", op: "gte", value: 12, score: 12,
      reason: "단백질 풍부",
      detail: (v) => `단백질 ${v}g — 활력 유지에 도움이 돼요`,
    },
    {
      field: "carbs_g", op: "gte", value: 20, score: 8,
      reason: "탄수화물 충분",
      detail: (v) => `탄수화물 ${v}g — 빠른 에너지원이에요`,
    },
  ],
};

// 민감도별 추가 스코어링
const SENSITIVITY_RULES = {
  digestive: [
    // 소화 예민(3): 저지방·저섬유 선호
    { sensitivityLevel: 3, field: "fat_g", op: "lt" as const, value: 8, score: 8, reason: "소화 편한" },
    { sensitivityLevel: 3, field: "sodium_mg", op: "lt" as const, value: 500, score: 5, reason: "자극 적은" },
  ],
  additive: [
    // 첨가물 예민(3): 단순 성분 식품 선호 (낮은 나트륨 = 덜 가공)
    { sensitivityLevel: 3, field: "sodium_mg", op: "lt" as const, value: 400, score: 8, reason: "저나트륨" },
  ],
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

function checkRule(product: Record<string, any>, rule: { field: string; op: string; value: number | [number, number] }): boolean {
  const v = product[rule.field];
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

export async function POST(request: NextRequest) {
  try {
    const body: RecommendRequest = await request.json();
    const {
      concerns = [],
      sensitivity = { digestive: 2, additive: 2 },
      conditions = [],
      allergies = [],
      tastes,
    } = body;

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
            const absVal = Math.abs(rule.max_per_serving);
            safetyMinFilters[rule.nutrient] = Math.max(
              safetyMinFilters[rule.nutrient] || 0,
              absVal
            );
          } else {
            if (!(rule.nutrient in safetyFilters) || rule.max_per_serving < safetyFilters[rule.nutrient]) {
              safetyFilters[rule.nutrient] = rule.max_per_serving;
            }
          }
        }
      }
    }

    // 2. 상품 쿼리
    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .eq("category_large", "상용제품");

    // 안전 필터 적용
    for (const [nutrient, maxVal] of Object.entries(safetyFilters)) {
      query = query.lte(nutrient, maxVal);
    }
    for (const [nutrient, minVal] of Object.entries(safetyMinFilters)) {
      query = query.gte(nutrient, minVal);
    }

    // 맛 필터 적용 (넓은 범위 ±1단계)
    if (tastes.salty >= 1 && tastes.salty <= 5) {
      const low = Math.max(1, tastes.salty - 1);
      const high = Math.min(5, tastes.salty + 1);
      query = query.gte("sodium_mg", TASTE_RANGES.salty[low][0]).lt("sodium_mg", TASTE_RANGES.salty[high][1]);
    }
    if (tastes.sweet >= 1 && tastes.sweet <= 5) {
      const low = Math.max(1, tastes.sweet - 1);
      const high = Math.min(5, tastes.sweet + 1);
      query = query.gte("sugar_g", TASTE_RANGES.sweet[low][0]).lt("sugar_g", TASTE_RANGES.sweet[high][1]);
    }
    if (tastes.fatty >= 1 && tastes.fatty <= 5) {
      const low = Math.max(1, tastes.fatty - 1);
      const high = Math.min(5, tastes.fatty + 1);
      query = query.gte("fat_g", TASTE_RANGES.fatty[low][0]).lt("fat_g", TASTE_RANGES.fatty[high][1]);
    }
    if (tastes.spicy >= 1 && tastes.spicy <= 5) {
      const minSpicy = Math.max(0, tastes.spicy - 1);
      const maxSpicy = Math.min(5, tastes.spicy + 1);
      query = query.gte("spicy_score", minSpicy).lte("spicy_score", maxSpicy);
    }

    query = query.limit(300);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: products, error, count } = await query as { data: any[] | null; error: any; count: number | null };

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

    // 3. 관심사 기반 스코어링
    const scored = products.map((p) => {
      let score = 40; // 기본 점수
      const reasons: string[] = [];
      const reasonDetails: string[] = [];

      // ── 관심사별 영양 매칭 ──
      for (const concern of concerns) {
        const rules = CONCERN_RULES[concern];
        if (!rules) continue;

        for (const rule of rules) {
          if (checkRule(p, rule)) {
            score += rule.score;
            if (!reasons.includes(rule.reason)) {
              reasons.push(rule.reason);
              const val = p[rule.field];
              if (val !== null && val !== undefined) {
                reasonDetails.push(rule.detail(val));
              }
            }
          }
        }
      }

      // ── 민감도 스코어링 ──
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

      // ── 영양 기본 보너스 ──
      if (p.calories && p.calories > 0 && p.calories < 600) score += 3;
      if (p.protein_g && p.protein_g >= 10 && !reasons.includes("단백질 풍부") && !reasons.includes("고단백")) {
        score += 3;
      }

      // ── 질환별 안전 보너스 ──
      if (conditions.includes("diabetes") && p.sugar_g !== null && p.sugar_g < 5) {
        if (!reasons.includes("저당")) {
          reasons.push("저당");
          reasonDetails.push(`당류 ${p.sugar_g}g — 당류 조절에 적합해요`);
        }
        score += 5;
      }
      if (conditions.includes("hypertension") && p.sodium_mg !== null && p.sodium_mg < 400) {
        if (!reasons.includes("저나트륨")) {
          reasons.push("저나트륨");
          reasonDetails.push(`나트륨 ${Math.round(p.sodium_mg)}mg — 저나트륨 설계`);
        }
        score += 5;
      }
      if (conditions.includes("kidney") && p.protein_g !== null && p.protein_g < 10) {
        reasons.push("저단백");
        reasonDetails.push(`단백질 ${p.protein_g}g — 저단백 설계`);
        score += 5;
      }

      // ── 맛 일치도 보너스 ──
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
        matched_concerns: concerns.filter((c) => {
          const rules = CONCERN_RULES[c];
          return rules?.some((rule) => checkRule(p, rule));
        }),
        reasons: reasons.slice(0, 4),
        reason_detail: reasonDetails[0] || null,
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

    // 5. 맛평가 통계 가져오기
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

    // 6. 관심사 기반 큐레이션 그룹 생성
    const curationGroups = buildCurationGroups(recommendations, concerns, conditions);

    return NextResponse.json({
      recommendations,
      curationGroups,
      total: count,
      filters_applied: {
        concerns,
        conditions,
        sensitivity,
        safetyFilters,
        safetyMinFilters,
      },
    });
  } catch (err) {
    console.error("Recommend API error:", err);
    return NextResponse.json({ error: "추천 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ─── 관심사 기반 큐레이션 그룹 ───
function buildCurationGroups(
  products: any[],
  concerns: HealthConcern[],
  conditions: string[]
) {
  const groups: { title: string; description: string; emoji: string; productIds: string[] }[] = [];

  // 관심사별 큐레이션
  if (concerns.includes("gut_health")) {
    const gutProducts = products
      .filter((p) => p.matched_concerns?.includes("gut_health"))
      .slice(0, 6);
    if (gutProducts.length > 0) {
      groups.push({
        title: "장건강 맞춤",
        description: "식이섬유가 풍부하고 소화에 부담 적은 식품",
        emoji: "🌿",
        productIds: gutProducts.map((p) => p.id),
      });
    }
  }

  if (concerns.includes("skin")) {
    const skinProducts = products
      .filter((p) => p.matched_concerns?.includes("skin"))
      .slice(0, 6);
    if (skinProducts.length > 0) {
      groups.push({
        title: "피부건강 맞춤",
        description: "단백질과 건강한 지방이 풍부한 저당 식품",
        emoji: "✨",
        productIds: skinProducts.map((p) => p.id),
      });
    }
  }

  if (concerns.includes("weight")) {
    const weightProducts = products
      .filter((p) => p.matched_concerns?.includes("weight"))
      .slice(0, 6);
    if (weightProducts.length > 0) {
      groups.push({
        title: "체중관리 맞춤",
        description: "저칼로리 고단백으로 든든하면서 가벼운 식품",
        emoji: "🏃",
        productIds: weightProducts.map((p) => p.id),
      });
    }
  }

  if (concerns.includes("energy")) {
    const energyProducts = products
      .filter((p) => p.matched_concerns?.includes("energy"))
      .slice(0, 6);
    if (energyProducts.length > 0) {
      groups.push({
        title: "활력충전 맞춤",
        description: "적정 열량과 단백질로 에너지를 채워줄 식품",
        emoji: "⚡",
        productIds: energyProducts.map((p) => p.id),
      });
    }
  }

  // 질환별 큐레이션 (있을 경우)
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
      description: "맛·영양·관심사를 종합한 최적 매칭",
      emoji: "⭐",
      productIds: topMatches.map((p) => p.id),
    });
  }

  return groups;
}
