import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * 주간 식단 추천 API v3 — 영양사 방식
 *
 * 원칙:
 * 1. 끼니별 역할 (아침: 가벼운 것, 점심/저녁: 든든한 것)
 * 2. 카테고리 분산 (면류 max 4/주, 밥류 min 2, 국/탕 min 2)
 * 3. 같은 제품 반복 금지 (7일 중 동일 제품 1회)
 * 4. 일별 영양 균형 추적 (나트륨 초과일에는 저나트륨 우선)
 * 5. 관심사/질환/맛 개인화
 */

type WeeklyBoxRequest = {
  concerns: string[];
  conditions: string[];
  goals?: string[];       // v3: HealthGoal[] (온보딩에서 선택한 건강 목표)
  allergies: string[];
  sensitivity?: { digestive: number; additive: number };
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
  budget?: number;
  mealsPerDay?: number;
  supplementsPerDay?: number;
  user_id?: string;
  // v3: 온보딩에서 계산된 영양 목표
  nutrition_goals?: {
    dailyCalories: number;
    dailyProteinG: number;
    maxSodiumMg: number;
    maxSugarG: number;
    perMealCalMax: number;
    perMealCalMin?: number;
    perMealSodiumMax: number;
    perMealSugarMax: number;
    perMealProteinMin?: number;
    strategyTags?: string[];
  };
};

/* ════════════════════════════════════════════
   끼니별 카테고리 슬롯 정의
   ════════════════════════════════════════════ */

// 이름 기반 세부 분류 (DB의 dish_category보다 정확)
type MealType = "health_meal" | "noodle" | "rice" | "soup" | "stew" | "main" | "street" | "light" | "other_meal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classifyMeal(p: any): MealType {
  // 건강 식단 서비스 제품은 별도 타입
  if (p._is_health_meal) return "health_meal";
  const n = p.name as string;
  // 국/탕/찌개를 먼저 체크 (육개장라면 → soup으로, 설렁탕면 → soup으로)
  if (/미역국|된장국|해장국|갈비탕|곰탕|설렁탕|삼계탕|감자탕|육개장|뼈해장|소고기국|북엇국|사골|우거지/.test(n)) return "soup";
  if (/찌개|전골|부대/.test(n)) return "stew";
  // 면류
  if (/라면|짬뽕|우동|칼국수|냉면|볶음면|비빔면|국수|파스타|스파게티|쫄면/.test(n)) return "noodle";
  // 밥류
  if (/볶음밥|비빔밥|컵밥|덮밥|도시락|카레|리조또|김밥/.test(n)) return "rice";
  // 주요리
  if (/불고기|돈까스|닭가슴살|스테이크|갈비|삼겹|떡갈비|제육|치킨|닭볶음/.test(n)) return "main";
  // 간편식 (떡볶이, 만두 등)
  if (/떡볶이|만두|교자|피자|햄버거|샌드위치|핫도그|수제비|브리또/.test(n)) return "street";
  // 가벼운 식사
  if (/죽|토스트|시리얼|그래놀라|오트밀|샐러드/.test(n)) return "light";
  return "other_meal";
}

// 끼니별 적합한 카테고리 (우선순위 순)
const SLOT_PREFERENCES: Record<string, MealType[]> = {
  breakfast: ["health_meal", "light", "rice", "soup", "street", "noodle"],          // 아침: 건강식단 > 가벼운 것
  lunch:     ["health_meal", "rice", "main", "stew", "noodle", "street", "soup"],   // 점심: 건강식단 > 밥/주요리
  dinner:    ["health_meal", "soup", "stew", "main", "rice", "noodle", "street"],   // 저녁: 건강식단 > 국/찌개
};

// 주간 카테고리 제한 (7일 전체)
const WEEKLY_CATEGORY_LIMITS: Partial<Record<MealType, { min: number; max: number }>> = {
  health_meal: { min: 3, max: 14 }, // 건강식단: 최소 3회 (있으면 우선 배치)
  noodle: { min: 0, max: 4 },
  rice:   { min: 2, max: 8 },
  soup:   { min: 2, max: 7 },
  stew:   { min: 0, max: 4 },
  main:   { min: 2, max: 7 },
  street: { min: 0, max: 5 },
  light:  { min: 0, max: 4 },
};

/* ════════════════════════════════════════════
   영양 기준
   ════════════════════════════════════════════ */

const DAILY_TARGETS = {
  calories: { min: 1200, ideal: 1800, max: 2500 },
  protein_g: { min: 40, ideal: 60 },
  sodium_mg: { max: 2300 },
};

// 끼니별 칼로리 배분 비율
const MEAL_CAL_RATIO: Record<string, number> = {
  breakfast: 0.25,  // 25%
  lunch: 0.35,      // 35%
  dinner: 0.30,     // 30%
  // 보조: 나머지 10%
};

const CONCERN_WEIGHTS: Record<string, Record<string, number>> = {
  gut_health: { probiotics: 25, prebiotic: 20, fiber: 10 },
  skin: { collagen: 25, vitamin: 15 },
  weight: { protein: 15, diet: 15, sugar_free: 10 },
  energy: { vitamin: 15, protein: 10 },
  muscle: { protein: 25 },
  immunity: { vitamin: 20, omega3: 15, zinc: 10 },
  bone: { calcium: 25 },
};

/* ════════════════════════════════════════════
   스코어링
   ════════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScoredProduct = any & {
  score: number;
  bestPrice: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prices: any[];
  mealType: MealType;
};

export async function POST(request: NextRequest) {
  try {
    const body: WeeklyBoxRequest = await request.json();
    const {
      concerns = [],
      conditions = [],
      tastes,
      budget = 100000,
      mealsPerDay = 3,
      supplementsPerDay = 1,
      user_id,
    } = body;

    const supabase = createServiceRoleClient();

    // ── 1. 행동 이력 로드 ──
    let userPrefs = { category_counts: {} as Record<string, number>, tag_counts: {} as Record<string, number>, clicked_ids: new Set<string>() };
    if (user_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: interactions } = await supabase
        .from("user_interactions").select("product_id, action")
        .eq("user_id", user_id)
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false }).limit(100) as { data: { product_id: string; action: string }[] | null };

      if (interactions && interactions.length > 0) {
        const clickedIds = new Set(interactions.filter(i => i.action === "click_price").map(i => i.product_id));
        const allIds = [...new Set(interactions.map(i => i.product_id))];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: vp } = await supabase.from("products").select("id, dish_category, functional_tags").in("id", allIds) as { data: any[] | null };
        if (vp) {
          for (const p of vp) {
            const w = clickedIds.has(p.id) ? 3 : 1;
            if (p.dish_category) userPrefs.category_counts[p.dish_category] = (userPrefs.category_counts[p.dish_category] || 0) + w;
            if (p.functional_tags) for (const t of p.functional_tags) userPrefs.tag_counts[t] = (userPrefs.tag_counts[t] || 0) + w;
          }
        }
        userPrefs.clicked_ids = clickedIds;
      }
    }

    // ── 2. 관심사별 영양 제외 기준 설정 ──
    const nutritionExclusions: { sodium_max?: number; sugar_max?: number; calories_max?: number } = {};
    for (const c of concerns) {
      switch (c) {
        case "gut_health":
          // 장건강: 고나트륨(소화 부담) 제외, 고당류 제외
          nutritionExclusions.sodium_max = Math.min(nutritionExclusions.sodium_max ?? 9999, 800);
          nutritionExclusions.sugar_max = Math.min(nutritionExclusions.sugar_max ?? 9999, 15);
          break;
        case "weight":
          // 체중관리: 고칼로리 제외
          nutritionExclusions.calories_max = Math.min(nutritionExclusions.calories_max ?? 9999, 550);
          nutritionExclusions.sugar_max = Math.min(nutritionExclusions.sugar_max ?? 9999, 15);
          break;
        case "skin":
          // 피부건강: 고당류 제외
          nutritionExclusions.sugar_max = Math.min(nutritionExclusions.sugar_max ?? 9999, 15);
          break;
      }
    }
    // 질환 기반 제외
    if (conditions.includes("diabetes")) {
      nutritionExclusions.sugar_max = Math.min(nutritionExclusions.sugar_max ?? 9999, 10);
    }
    if (conditions.includes("hypertension")) {
      nutritionExclusions.sodium_max = Math.min(nutritionExclusions.sodium_max ?? 9999, 800);
    }

    // v3: 온보딩에서 계산된 영양 목표가 있으면 우선 적용
    const ng = body.nutrition_goals;
    if (ng) {
      if (ng.perMealCalMax) nutritionExclusions.calories_max = Math.min(nutritionExclusions.calories_max ?? 9999, ng.perMealCalMax);
      if (ng.perMealSodiumMax) nutritionExclusions.sodium_max = Math.min(nutritionExclusions.sodium_max ?? 9999, ng.perMealSodiumMax);
      if (ng.perMealSugarMax) nutritionExclusions.sugar_max = Math.min(nutritionExclusions.sugar_max ?? 9999, ng.perMealSugarMax);
    }

    // ── 3. 제품 로드 (health_score 포함) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mealProducts: any[] = [];
    {
      let query = supabase.from("products")
        .select("id, name, manufacturer, calories, protein_g, fat_g, sugar_g, sodium_mg, fiber_g, functional_tags, dish_category, health_score")
        .eq("is_active", true).eq("category_large", "상용제품")
        .eq("is_purchasable", true).eq("is_meal", true);

      // 관심사 기반 영양 제외 필터 적용
      if (nutritionExclusions.sodium_max) query = query.lte("sodium_mg", nutritionExclusions.sodium_max);
      if (nutritionExclusions.sugar_max) query = query.lte("sugar_g", nutritionExclusions.sugar_max);
      if (nutritionExclusions.calories_max) query = query.lte("calories", nutritionExclusions.calories_max);

      // health_score 높은 순으로 로드
      query = query.order("health_score", { ascending: false, nullsFirst: false }).limit(800);

      const { data } = await query;
      if (data) mealProducts = data;
    }

    // 건강 식단 서비스 제품 (식스밀, 그리팅 등) — 높은 우선순위로 추가
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: healthMeals } = await (supabase as any)
        .from("health_meal_products")
        .select("id, name, category, price, image_url, product_url, calories, protein_g, fat_g, sugar_g, sodium_mg, fiber_g, health_tags, dish_type, source, health_score")
        .eq("is_available", true)
        .in("dish_type", ["meal", "salad"]);

      if (healthMeals && healthMeals.length > 0) {
        // health_meal_products → mealProducts 형태로 변환
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const converted = healthMeals.map((h: any) => ({
          id: h.id,
          name: h.name,
          manufacturer: h.source,
          calories: h.calories || 400, // 영양 정보 없으면 기본값 (건강도시락 평균)
          protein_g: h.protein_g || 25,
          fat_g: h.fat_g,
          sugar_g: h.sugar_g || 3,
          sodium_mg: h.sodium_mg || 500,
          fiber_g: h.fiber_g,
          functional_tags: h.health_tags || [],
          dish_category: "meal",
          health_score: h.health_score || 80, // DB 값 우선, 없으면 기본 80점
          _is_health_meal: true, // 마킹
          _health_price: h.price,
          _health_url: h.product_url,
          _health_image: h.image_url,
          _health_source: h.source,
        }));
        mealProducts = [...converted, ...mealProducts]; // 건강식단 우선
        console.log("[weekly-box] 건강식단 제품 추가:", converted.length, "개");
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supplementProducts: any[] = [];
    {
      const { data } = await supabase.from("products")
        .select("id, name, manufacturer, calories, protein_g, fat_g, sugar_g, sodium_mg, fiber_g, functional_tags, dish_category")
        .eq("is_active", true).eq("category_large", "상용제품").eq("is_purchasable", true)
        .gt("calories", 0)
        .or("name.ilike.%유산균%,name.ilike.%프로바이오%,name.ilike.%요거트%,name.ilike.%요구르트%,name.ilike.%비타민%,name.ilike.%프로틴%,name.ilike.%단백질바%,name.ilike.%에너지바%,name.ilike.%그래놀라%,name.ilike.%오트밀%,name.ilike.%시리얼%,name.ilike.%두유%,name.ilike.%스무디%")
        .limit(200);
      if (data) supplementProducts = data;
    }

    if (mealProducts.length === 0) {
      return NextResponse.json({ box: null, message: "구매 가능한 식사 제품이 없습니다." });
    }

    // ── 3. 스코어링 + 분류 (v4: 영양 목표 기반 정밀 스코어링) ──

    // 개인별 타겟 설정 (nutrition_goals 우선, 없으면 기본값)
    const personalDailyCal = ng?.dailyCalories || DAILY_TARGETS.calories.ideal;
    const personalDailyProtein = ng?.dailyProteinG || DAILY_TARGETS.protein_g.ideal;
    const personalMealCalMax = ng?.perMealCalMax || Math.round(personalDailyCal / mealsPerDay * 1.2);
    const personalMealCalMin = ng?.perMealCalMin || Math.round(personalDailyCal / mealsPerDay * 0.6);
    const personalMealSodiumMax = ng?.perMealSodiumMax || 800;
    const personalMealSugarMax = ng?.perMealSugarMax || 15;
    const personalMealProteinMin = ng?.perMealProteinMin || Math.round(personalDailyProtein / mealsPerDay);
    const activeGoals = body.goals || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scoreProduct = (p: any): ScoredProduct => {
      let score = 0;
      const tags: string[] = p.functional_tags || [];
      const cal = p.calories || 0;
      const sodium = p.sodium_mg || 0;
      const sugar = p.sugar_g ?? 999;
      const protein = p.protein_g || 0;
      const fiber = p.fiber_g || 0;

      /* ── A. 건강 점수 기반 (0~30점) ── */
      score += Math.round((p.health_score || 50) * 0.3);

      /* ── B. 영양 적합성 점수 (0~25점) ── */
      // 칼로리: 타겟 범위(±30%) 안에 있으면 만점, 벗어나면 감점
      if (cal > 0) {
        const calTarget = Math.round(personalDailyCal / mealsPerDay);
        const calDiff = Math.abs(cal - calTarget) / calTarget;
        if (calDiff <= 0.15) score += 10;       // ±15% 이내: 10점
        else if (calDiff <= 0.3) score += 6;    // ±30% 이내: 6점
        else if (calDiff <= 0.5) score += 2;    // ±50% 이내: 2점
      }
      // 나트륨: 낮을수록 좋음 (상한 기준)
      if (sodium <= personalMealSodiumMax * 0.5) score += 8;
      else if (sodium <= personalMealSodiumMax * 0.75) score += 5;
      else if (sodium <= personalMealSodiumMax) score += 2;
      // 단백질: 높을수록 좋음 (최소 기준)
      if (protein >= personalMealProteinMin * 1.5) score += 7;
      else if (protein >= personalMealProteinMin) score += 5;
      else if (protein >= personalMealProteinMin * 0.7) score += 2;

      /* ── C. 건강 목표 매칭 (0~20점) ── */
      // 관심사 기반 (기존 concerns + 새 goals)
      const allConcerns = [...concerns, ...activeGoals];
      for (const concern of allConcerns) {
        const weights = CONCERN_WEIGHTS[concern];
        if (weights) for (const [tag, w] of Object.entries(weights)) {
          if (tag === "fiber" && fiber >= 3) score += Math.min(w, 8);
          else if (tags.includes(tag)) score += Math.min(w, 8);
        }
      }
      // 건강 목표별 세밀한 영양 가산
      if (activeGoals.includes("weight_loss") || allConcerns.includes("weight")) {
        if (cal > 0 && cal <= 400) score += 5;     // 저칼로리 보너스
        if (sugar <= 5) score += 3;                  // 저당
      }
      if (activeGoals.includes("muscle")) {
        if (protein >= 25) score += 6;               // 고단백 보너스
        if (protein >= 20) score += 3;
      }
      if (activeGoals.includes("diabetes") || conditions.includes("diabetes")) {
        if (sugar <= 3) score += 8;                  // 극저당
        else if (sugar <= 5) score += 5;
        else if (sugar <= 8) score += 2;
      }
      if (activeGoals.includes("blood_pressure") || conditions.includes("hypertension")) {
        if (sodium <= 300) score += 8;               // 극저나트륨
        else if (sodium <= 500) score += 5;
        else if (sodium <= 700) score += 2;
      }
      if (activeGoals.includes("kidney")) {
        if (protein <= 15 && sodium <= 400) score += 6; // 저단백+저나트륨
      }
      if (activeGoals.includes("gut_health") || allConcerns.includes("gut_health")) {
        if (fiber >= 5) score += 5;                  // 고식이섬유
        if (sodium <= 500) score += 3;
      }
      // 건강식단 서비스 제품 카테고리 매칭
      if (p._is_health_meal && p.functional_tags) {
        const htags = p.functional_tags as string[];
        if (activeGoals.includes("diabetes") && htags.some((t: string) => /저당|혈당/.test(t))) score += 8;
        if (activeGoals.includes("weight_loss") && htags.some((t: string) => /저칼로리|다이어트/.test(t))) score += 8;
        if (activeGoals.includes("muscle") && htags.some((t: string) => /고단백|단백질/.test(t))) score += 8;
        if (activeGoals.includes("blood_pressure") && htags.some((t: string) => /저나트륨|나트륨/.test(t))) score += 8;
      }

      /* ── D. 맛 선호 (0~8점) ── */
      if (tastes) {
        if (tastes.salty >= 7 && sodium >= 800) score += 2;
        else if (tastes.salty <= 3 && sodium <= 400) score += 4;   // 저염 선호 = 건강 시너지
        if (tastes.sweet <= 3 && sugar <= 3) score += 2;
        else if (tastes.sweet >= 7 && sugar >= 8) score += 2;
        if (tastes.spicy >= 7 && (p.spicy_score || 0) >= 6) score += 2;
        else if (tastes.spicy <= 3 && (p.spicy_score || 0) <= 2) score += 2;
      }

      /* ── E. 행동 개인화 (0~10점) ── */
      if (userPrefs.clicked_ids.has(p.id)) score += 6;
      if (p.dish_category && userPrefs.category_counts[p.dish_category])
        score += Math.min(userPrefs.category_counts[p.dish_category], 4);

      /* ── F. 랜덤 다양성 (+0~5) ── */
      score += Math.floor(Math.random() * 6);

      return { ...p, score: Math.min(score, 100), bestPrice: 0, prices: [], mealType: classifyMeal(p) };
    };

    const scored = mealProducts.map(scoreProduct);

    // 카테고리별 풀 구성
    const poolByType: Record<MealType, ScoredProduct[]> = {
      health_meal: [], noodle: [], rice: [], soup: [], stew: [], main: [], street: [], light: [], other_meal: [],
    };
    for (const p of scored) {
      poolByType[p.mealType as MealType].push(p);
    }
    // 각 풀 내 점수 내림차순 정렬
    for (const key of Object.keys(poolByType) as MealType[]) {
      poolByType[key].sort((a, b) => b.score - a.score);
    }

    // ── 4. 가격 조회 (상위 후보) ──
    const allCandidateIds = [...new Set([
      ...scored.slice(0, 150).map(p => p.id),
      ...supplementProducts.slice(0, 50).map((p: { id: string }) => p.id),
    ])];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceMap: Record<string, any[]> = {};
    for (let i = 0; i < allCandidateIds.length; i += 50) {
      const batch = allCandidateIds.slice(i, i + 50);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("v_all_prices")
        .select("product_id, platform, price, url, image_url").in("product_id", batch).gt("price", 0);
      if (data) for (const p of data) {
        if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
        priceMap[p.product_id].push(p);
      }
    }
    // 가격 붙이기
    for (const p of scored) {
      if (p._is_health_meal) {
        // 건강식단 서비스 제품은 이미 가격이 있음
        p.bestPrice = p._health_price || 10000;
        p.prices = [];
      } else {
        const prices = (priceMap[p.id] || []).sort((a: { price: number }, b: { price: number }) => a.price - b.price);
        p.bestPrice = prices[0]?.price || 99999;
        p.prices = prices;
      }
    }
    const scoredSupplements = supplementProducts.map((p: { id: string }) => {
      const prices = (priceMap[p.id] || []).sort((a: { price: number }, b: { price: number }) => a.price - b.price);
      return { ...p, bestPrice: prices[0]?.price || 99999, prices, score: 50 + Math.floor(Math.random() * 10) };
    });

    // ── 5. 영양사 방식 7일 식단 구성 ──
    const mealSlots = mealsPerDay >= 3
      ? ["breakfast", "lunch", "dinner"]
      : mealsPerDay === 2 ? ["lunch", "dinner"] : ["lunch"];

    const usedProductIds = new Set<string>();
    const weekCategoryCounts: Record<MealType, number> = {
      health_meal: 0, noodle: 0, rice: 0, soup: 0, stew: 0, main: 0, street: 0, light: 0, other_meal: 0,
    };

    // 일별 영양 추적
    type DayPlan = { meals: ScoredProduct[]; slots: string[]; calories: number; protein: number; sodium: number };
    const weekPlan: DayPlan[] = Array.from({ length: 7 }, () => ({
      meals: [], slots: [], calories: 0, protein: 0, sodium: 0,
    }));

    // 끼니별 목표 칼로리 (개인화)
    const slotTargetCal = (slot: string) => personalDailyCal * (MEAL_CAL_RATIO[slot] || 0.3);

    // 이름 유사도 체크 (같은 종류 반복 방지)
    const usedBaseNames = new Set<string>();
    const getBaseName = (name: string) => {
      // "육개장사발면", "육개장컵라면", "육개장라면" → "육개장"
      // "불닭볶음면", "큰컵 불닭볶음면" → "불닭볶음"
      return name
        .replace(/^(큰컵|컵누들|컵)\s*/g, "")
        .replace(/(사발면|컵라면|큰사발면|큰컵|컵$|용기|사발|봉지|면$|라면$).*$/g, "")
        .replace(/\s+/g, "")
        .slice(0, 4); // 앞 4글자만 비교
    };

    // 카테고리에서 최적 제품 선택 (v4: 영양 기준 필터 강화)
    const pickFromCategory = (type: MealType, targetCal: number, maxPrice: number): ScoredProduct | null => {
      const pool = poolByType[type];
      for (const p of pool) {
        if (usedProductIds.has(p.id)) continue;
        if (p.bestPrice > maxPrice) continue;
        // 칼로리 적합성: 최소 150kcal, 최대 개인 상한의 1.3배
        if (p.calories < 150) continue;
        if (p.calories > personalMealCalMax * 1.3) continue;
        // 영양 제외 기준 적용 (hard filter)
        if (nutritionExclusions.sodium_max && p.sodium_mg > nutritionExclusions.sodium_max) continue;
        if (nutritionExclusions.sugar_max && p.sugar_g != null && p.sugar_g > nutritionExclusions.sugar_max) continue;
        if (nutritionExclusions.calories_max && p.calories > nutritionExclusions.calories_max) continue;
        // 같은 이름 반복 방지
        const base = getBaseName(p.name);
        if (usedBaseNames.has(base)) continue;
        return p;
      }
      return null;
    };

    // 끼니 배정 — 요일 × 끼니 순회
    const perMealBudget = (budget * 0.75) / (7 * mealSlots.length);

    for (let d = 0; d < 7; d++) {
      for (const slot of mealSlots) {
        const targetCal = slotTargetCal(slot);
        const prefs = SLOT_PREFERENCES[slot] || ["noodle", "rice", "soup", "main", "street"];

        let picked: ScoredProduct | null = null;

        // 1차: 주간 최소 미달 카테고리 우선
        for (const [cat, limits] of Object.entries(WEEKLY_CATEGORY_LIMITS)) {
          const mType = cat as MealType;
          if (weekCategoryCounts[mType] < limits.min) {
            // 이 카테고리가 끼니 선호에 포함되면 시도
            if (prefs.includes(mType)) {
              picked = pickFromCategory(mType, targetCal, perMealBudget * 2);
              if (picked) break;
            }
          }
        }

        // 2차: 끼니 선호 카테고리 순서대로
        if (!picked) {
          for (const pref of prefs) {
            // 주간 max 초과 방지
            const limits = WEEKLY_CATEGORY_LIMITS[pref];
            if (limits && weekCategoryCounts[pref] >= limits.max) continue;

            picked = pickFromCategory(pref, targetCal, perMealBudget * 2);
            if (picked) break;
          }
        }

        // 3차: 아무 카테고리에서라도
        if (!picked) {
          for (const type of Object.keys(poolByType) as MealType[]) {
            picked = pickFromCategory(type, targetCal, perMealBudget * 3);
            if (picked) break;
          }
        }

        if (picked) {
          usedProductIds.add(picked.id);
          usedBaseNames.add(getBaseName(picked.name));
          weekCategoryCounts[picked.mealType as MealType]++;
          weekPlan[d].meals.push(picked);
          weekPlan[d].slots.push(slot);
          weekPlan[d].calories += picked.calories || 0;
          weekPlan[d].protein += picked.protein_g || 0;
          weekPlan[d].sodium += picked.sodium_mg || 0;
        }
      }
    }

    // ── 6. 보조식품 배정 ──
    // 관심사에 맞는 것 우선, 일별 1개씩
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scoredSups = scoredSupplements.sort((a: any, b: any) => b.score - a.score);
    const usedSupIds = new Set<string>();
    const perSupBudget = (budget * 0.25) / (7 * supplementsPerDay);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weekSupplements: any[][] = Array.from({ length: 7 }, () => []);

    for (let d = 0; d < 7; d++) {
      for (let s = 0; s < supplementsPerDay; s++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pick = scoredSups.find((p: any) => !usedSupIds.has(p.id) && p.bestPrice <= perSupBudget * 2);
        if (pick) {
          usedSupIds.add(pick.id);
          weekSupplements[d].push(pick);
        }
      }
    }

    // ── 7. 응답 포맷 ──
    const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatItem = (item: any, slotType: string) => ({
      product_id: item.id,
      name: item.name,
      manufacturer: item.manufacturer,
      calories: item.calories,
      protein_g: item.protein_g,
      fat_g: item.fat_g,
      sugar_g: item.sugar_g,
      sodium_mg: item.sodium_mg,
      match_score: item.score,
      best_price: item._is_health_meal ? item._health_price : item.bestPrice,
      prices: item._is_health_meal
        ? [{ platform: item._health_source, price: item._health_price, url: item._health_url, image_url: item._health_image }]
        : (item.prices || []).slice(0, 3),
      functional_tags: item.functional_tags || [],
      dish_category: item.dish_category,
      meal_type: item.mealType || null,
      slot_type: slotType,
      is_health_meal: item._is_health_meal || false,
      health_source: item._health_source || null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const days: any[] = [];
    let totalPrice = 0, totalCal = 0, totalProtein = 0;

    for (let d = 0; d < 7; d++) {
      const meals = weekPlan[d].meals.map((m, i) => formatItem(m, weekPlan[d].slots[i]));
      const supplements = weekSupplements[d].map(s => formatItem(s, "supplement"));
      const allItems = [...meals, ...supplements];
      const dayCal = allItems.reduce((sum, i) => sum + (i.calories || 0), 0);
      const dayProtein = allItems.reduce((sum, i) => sum + (i.protein_g || 0), 0);
      const dayPrice = allItems.reduce((sum, i) => sum + (i.best_price || 0), 0);
      totalPrice += dayPrice; totalCal += dayCal; totalProtein += dayProtein;

      days.push({
        day: d + 1, dayLabel: dayLabels[d],
        meals, supplements,
        summary: {
          calories: Math.round(dayCal), protein_g: Math.round(dayProtein),
          total_price: dayPrice, meal_count: meals.length, supplement_count: supplements.length,
        },
      });
    }

    const totalMeals = weekPlan.reduce((sum, d) => sum + d.meals.length, 0);
    const totalSupplements = weekSupplements.reduce((sum, d) => sum + d.length, 0);

    return NextResponse.json({
      box: {
        days,
        summary: {
          totalItems: totalMeals + totalSupplements,
          totalMeals, totalSupplements, totalPrice,
          avgDailyCalories: Math.round(totalCal / 7),
          avgDailyProtein: Math.round(totalProtein / 7),
          avgDailyPrice: Math.round(totalPrice / 7),
          concerns, mealsPerDay, supplementsPerDay,
          categoryDistribution: weekCategoryCounts,
          warnings: [
            ...(totalCal / 7 < DAILY_TARGETS.calories.min ? [`일일 평균 칼로리(${Math.round(totalCal / 7)}kcal)가 권장(${DAILY_TARGETS.calories.min}kcal)보다 낮습니다`] : []),
            ...(totalProtein / 7 < DAILY_TARGETS.protein_g.min ? [`일일 평균 단백질(${Math.round(totalProtein / 7)}g)이 권장(${DAILY_TARGETS.protein_g.min}g)보다 낮습니다`] : []),
          ],
        },
      },
    });
  } catch (err) {
    console.error("Weekly box API error:", err);
    return NextResponse.json({ error: "주간 박스 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
