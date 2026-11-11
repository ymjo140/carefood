import { NextRequest, NextResponse } from "next/server";
import { addDays, todayKst } from "@/lib/day";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

/**
 * GET /api/diary/report — 내 주간 리포트 (사용자는 쿠키로)
 *
 * 주간 영양 리포트 — 최근 7일 식단 기록 기반
 *
 * 반환:
 * - 일별 칼로리/단백질/탄수화물/지방/나트륨/당류/식이섬유
 * - 목표 대비 달성률
 * - 영양 갭 (부족/과다)
 * - 가장 많이 먹은 제품 Top5
 * - 끼니별 기록률
 * - 갭 기반 공구/제품 추천
 */

type DailyNutrition = {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg: number;
  sugar_g: number;
  fiber_g: number;
  meal_count: number;
};

type NutrientGrade = {
  nutrient: string;
  label: string;
  unit: string;
  avg: number;
  target: number;
  ratio: number; // avg / target
  /** low·critical = 모자람, over·high = 많음 */
  grade: "excellent" | "good" | "low" | "critical" | "over" | "high";
  emoji: string;
};

export async function GET(request: NextRequest) {
  await connection();
  const userId = await getActorId();
  if (!userId) return noActor();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  // ── 1. 최근 7일 식단 기록 ──
  const today = todayKst();
  const weekAgo = addDays(today, -7);

  const { data: entries } = await sb
    .from("meal_diary")
    .select("date, meal_type, food_name, product_id, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, fiber_g")
    .eq("user_id", userId)
    .gte("date", weekAgo)
    .lte("date", today)
    .order("date", { ascending: true });

  if (!entries || entries.length === 0) {
    return NextResponse.json({
      hasData: false,
      message: "최근 7일간 식단 기록이 없습니다. 식단을 기록하면 주간 리포트를 받을 수 있어요!",
    });
  }

  // ── 2. 일별 합산 ──
  const dailyMap: Record<string, DailyNutrition> = {};
  const foodCounts: Record<string, number> = {};
  const mealSlotCounts: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };

  for (const e of entries) {
    if (!dailyMap[e.date]) {
      dailyMap[e.date] = {
        date: e.date,
        calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
        sodium_mg: 0, sugar_g: 0, fiber_g: 0, meal_count: 0,
      };
    }
    const d = dailyMap[e.date];
    d.calories += Number(e.calories || 0);
    d.protein_g += Number(e.protein_g || 0);
    d.carbs_g += Number(e.carbs_g || 0);
    d.fat_g += Number(e.fat_g || 0);
    d.sodium_mg += Number(e.sodium_mg || 0);
    d.sugar_g += Number(e.sugar_g || 0);
    d.fiber_g += Number(e.fiber_g || 0);
    d.meal_count++;

    if (e.food_name) {
      foodCounts[e.food_name] = (foodCounts[e.food_name] || 0) + 1;
    }
    if (e.meal_type && mealSlotCounts[e.meal_type] !== undefined) {
      mealSlotCounts[e.meal_type]++;
    }
  }

  const dailyData = Object.values(dailyMap);
  const daysWithData = dailyData.length;

  // ── 3. 평균 영양 계산 ──
  // 아침·점심·저녁 중 두 끼 이상 기록한 날만 센다 — 한 끼만 적은 날까지 넣으면 '열량 매우 부족'·'나트륨 우수'처럼
  // 덜 기록한 사람이 더 건강해 보인다. 그런 날이 없으면 기록한 날 전부로 (화면에 알린다)
  const mainMeals: Record<string, Set<string>> = {};
  for (const e of entries) if (["breakfast", "lunch", "dinner"].includes(e.meal_type)) (mainMeals[e.date] ||= new Set()).add(e.meal_type);
  const fullDays = dailyData.filter((d) => (mainMeals[d.date]?.size || 0) >= 2);
  const counted = fullDays.length ? fullDays : dailyData;
  const countedSet = new Set(counted.map((d) => d.date));
  const n = counted.length;
  const avgOf = (k: keyof DailyNutrition, digits = 0) => {
    const v = counted.reduce((s, d) => s + Number(d[k] || 0), 0) / n;
    return digits ? Math.round(v * 10) / 10 : Math.round(v);
  };
  const avg = {
    calories: avgOf("calories"),
    protein_g: avgOf("protein_g", 1),
    carbs_g: avgOf("carbs_g", 1),
    fat_g: avgOf("fat_g", 1),
    sodium_mg: avgOf("sodium_mg"),
    sugar_g: avgOf("sugar_g", 1),
    fiber_g: avgOf("fiber_g", 1),
  };
  // 나트륨·당류 값이 빠진 기록(직접 입력 등)은 0 으로 세면 '적게 먹음'이 된다 — 센 날 기록의 70% 넘게 값이 있을 때만 매긴다
  const countedEntries = entries.filter((e: { date: string }) => countedSet.has(e.date));
  const known = (k: "sodium_mg" | "sugar_g") => countedEntries.filter((e: Record<string, unknown>) => e[k] !== null && e[k] !== undefined).length / Math.max(1, countedEntries.length);
  const unknownNutrients = [known("sodium_mg") < 0.7 && "나트륨", known("sugar_g") < 0.7 && "당류"].filter(Boolean) as string[];

  // ── 4. 목표 가져오기 ──
  const { data: goals } = await sb
    .from("daily_nutrition_goals")
    .select("*")
    .eq("user_id", userId)
    .single();

  const target = {
    calories: goals?.daily_calories || 2000,
    protein_g: goals?.daily_protein_g || 60,
    carbs_g: goals?.daily_carbs_g || 300,
    fat_g: goals?.daily_fat_g || 65,
    sodium_mg: goals?.max_sodium_mg || 2000,
    sugar_g: goals?.max_sugar_g || 50,
    fiber_g: 25,
  };

  // ── 5. 영양소별 등급 매기기 ──
  /**
   * kind: max(나트륨·당류 — 적을수록) · min(단백질·식이섬유 — 채울수록) · range(열량·탄수화물·지방 — 목표 가까이)
   * 전에는 열량·탄수화물·지방도 '많을수록 좋음'이라 목표의 두 배를 먹어도 '우수'였다.
   */
  function gradeNutrient(
    nutrient: string, label: string, unit: string,
    avgVal: number, targetVal: number, kind: "max" | "min" | "range",
  ): NutrientGrade {
    const ratio = avgVal / targetVal;
    let grade: NutrientGrade["grade"];
    if (kind === "max") {
      grade = ratio <= 0.7 ? "excellent" : ratio <= 1.0 ? "good" : ratio <= 1.3 ? "over" : "high";
    } else if (kind === "min") {
      grade = ratio >= 0.9 ? "excellent" : ratio >= 0.7 ? "good" : ratio >= 0.5 ? "low" : "critical";
    } else {
      grade = ratio >= 0.9 && ratio <= 1.1 ? "excellent" : ratio >= 0.8 && ratio <= 1.2 ? "good"
        : ratio < 0.8 ? (ratio >= 0.6 ? "low" : "critical") : ratio <= 1.4 ? "over" : "high";
    }
    return { nutrient, label, unit, avg: avgVal, target: targetVal, ratio: Math.round(ratio * 100) / 100, grade, emoji: "" };
  }

  const grades: NutrientGrade[] = [
    gradeNutrient("calories", "칼로리", "kcal", avg.calories, target.calories, "range"),
    gradeNutrient("protein", "단백질", "g", avg.protein_g, target.protein_g, "min"),
    gradeNutrient("carbs", "탄수화물", "g", avg.carbs_g, target.carbs_g, "range"),
    gradeNutrient("fat", "지방", "g", avg.fat_g, target.fat_g, "range"),
    // 식이섬유는 제품 DB 에 믿을 만한 값이 없어(2026-11 정리) 평가하지 않는다 — 기록에 값이 있을 때만
    ...(counted.some((d) => d.fiber_g > 0) ? [gradeNutrient("fiber", "식이섬유", "g", avg.fiber_g, target.fiber_g, "min")] : []),
    ...(unknownNutrients.includes("나트륨") ? [] : [gradeNutrient("sodium", "나트륨", "mg", avg.sodium_mg, target.sodium_mg, "max")]),
    ...(unknownNutrients.includes("당류") ? [] : [gradeNutrient("sugar", "당류", "g", avg.sugar_g, target.sugar_g, "max")]),
  ];

  // ── 6. 종합 점수 (100점 만점) ──
  const excellentCount = grades.filter(g => g.grade === "excellent").length;
  const goodCount = grades.filter(g => g.grade === "good").length;
  const overallScore = Math.round(
    (excellentCount * 14 + goodCount * 10 + grades.filter(g => g.grade === "low" || g.grade === "over").length * 5) / grades.length * 10,
  );

  // ── 7. 가장 많이 먹은 음식 Top5 ──
  const topFoods = Object.entries(foodCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // ── 8. 기록률 ──
  const totalMeals = entries.length;
  const expectedMeals = daysWithData * 3; // 하루 3끼 기준
  const recordRate = Math.round(totalMeals / expectedMeals * 100);

  // ── 9. 영양 갭 기반 추천 (상위 2개 부족 영양소) ──
  const gapNutrients = grades
    .filter(g => (g.grade === "low" || g.grade === "critical") && g.nutrient !== "calories" && g.nutrient !== "carbs" && g.nutrient !== "fat")
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 2);

  let recommendations: { product_name: string; product_id: string; health_score: number; reason: string }[] = [];

  if (gapNutrients.length > 0) {
    for (const gap of gapNutrients) {
      let query = sb
        .from("products")
        .select("id, name, health_score")
        .eq("is_purchasable", true)
        .not("health_score", "is", null)
        .order("health_score", { ascending: false })
        .limit(2);

      if (gap.nutrient === "protein") query = query.gte("protein_g", 20);
      else if (gap.nutrient === "fiber") query = query.gte("fiber_g", 3);
      else if (gap.nutrient === "calories") query = query.gte("calories", 300).lte("calories", 600);

      const { data: prods } = await query;
      for (const p of (prods || []).slice(0, 1)) {
        recommendations.push({
          product_name: p.name,
          product_id: p.id,
          health_score: p.health_score,
          reason: `${gap.label} 보충`,
        });
      }
    }
  }

  // ── 10. 관련 공구 ──
  const { data: groupBuys } = await sb
    .from("group_buys")
    .select("id, title, product_name, target_price, original_price, discount_rate, target_count, current_count")
    .eq("status", "recruiting")
    .order("current_count", { ascending: false })
    .limit(3);

  // ── 11. 한 줄 코멘트 생성 ──
  let comment = "";
  if (fullDays.length === 0) comment = "두 끼 이상 기록한 날이 아직 없어 숫자가 낮게 나올 수 있어요. 하루 두 끼 이상 기록해 보세요";
  else if (overallScore >= 80) comment = "이번 주 영양 균형이 목표에 가까워요. 이대로 이어 가 보세요";
  else if (overallScore >= 60) comment = "대체로 목표에 가까워요. 모자라거나 많은 영양소만 조금 더 살펴보세요";
  else if (overallScore >= 40) comment = "목표와 차이가 나는 영양소가 있어요. 아래 추천 제품을 참고해 보세요";
  else comment = "목표와 차이가 큰 영양소가 많아요. 모자라거나 많은 영양소부터 하나씩 맞춰 보세요";

  return NextResponse.json({
    hasData: true,
    period: {
      start: weekAgo,
      end: today,
    },
    daysWithData,
    countedDays: n,
    partial: fullDays.length === 0, // 두 끼 이상 기록한 날이 없어 기록한 날 전부로 셌다
    unknownNutrients,
    totalEntries: entries.length,
    recordRate,
    overallScore,
    comment,
    averages: avg,
    targets: target,
    grades,
    dailyData,
    topFoods,
    mealSlotCounts,
    gapNutrients,
    recommendations,
    groupBuys: groupBuys || [],
  });
}
