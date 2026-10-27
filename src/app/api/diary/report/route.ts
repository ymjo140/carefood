import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/diary/report?user_id=xxx
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
  grade: "excellent" | "good" | "low" | "critical" | "over";
  emoji: string;
};

export async function GET(request: NextRequest) {
  await connection();
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  // ── 1. 최근 7일 식단 기록 ──
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: entries } = await sb
    .from("meal_diary")
    .select("date, meal_type, food_name, product_id, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, fiber_g")
    .eq("user_id", userId)
    .gte("date", weekAgo.toISOString().slice(0, 10))
    .lte("date", today.toISOString().slice(0, 10))
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
  const avg = {
    calories: Math.round(dailyData.reduce((s, d) => s + d.calories, 0) / daysWithData),
    protein_g: Math.round(dailyData.reduce((s, d) => s + d.protein_g, 0) / daysWithData * 10) / 10,
    carbs_g: Math.round(dailyData.reduce((s, d) => s + d.carbs_g, 0) / daysWithData * 10) / 10,
    fat_g: Math.round(dailyData.reduce((s, d) => s + d.fat_g, 0) / daysWithData * 10) / 10,
    sodium_mg: Math.round(dailyData.reduce((s, d) => s + d.sodium_mg, 0) / daysWithData),
    sugar_g: Math.round(dailyData.reduce((s, d) => s + d.sugar_g, 0) / daysWithData * 10) / 10,
    fiber_g: Math.round(dailyData.reduce((s, d) => s + d.fiber_g, 0) / daysWithData * 10) / 10,
  };

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
  function gradeNutrient(
    nutrient: string, label: string, unit: string,
    avgVal: number, targetVal: number, isMaxTarget: boolean,
  ): NutrientGrade {
    const ratio = avgVal / targetVal;
    let grade: NutrientGrade["grade"];
    let emoji: string;

    if (isMaxTarget) {
      // 나트륨, 당류: 낮을수록 좋음
      if (ratio <= 0.7) { grade = "excellent"; emoji = "🟢"; }
      else if (ratio <= 1.0) { grade = "good"; emoji = "🟡"; }
      else if (ratio <= 1.3) { grade = "over"; emoji = "🟠"; }
      else { grade = "critical"; emoji = "🔴"; }
    } else {
      // 단백질, 식이섬유 등: 높을수록 좋음
      if (ratio >= 0.9) { grade = "excellent"; emoji = "🟢"; }
      else if (ratio >= 0.7) { grade = "good"; emoji = "🟡"; }
      else if (ratio >= 0.5) { grade = "low"; emoji = "🟠"; }
      else { grade = "critical"; emoji = "🔴"; }
    }

    return { nutrient, label, unit, avg: avgVal, target: targetVal, ratio: Math.round(ratio * 100) / 100, grade, emoji };
  }

  const grades: NutrientGrade[] = [
    gradeNutrient("calories", "칼로리", "kcal", avg.calories, target.calories, false),
    gradeNutrient("protein", "단백질", "g", avg.protein_g, target.protein_g, false),
    gradeNutrient("carbs", "탄수화물", "g", avg.carbs_g, target.carbs_g, false),
    gradeNutrient("fat", "지방", "g", avg.fat_g, target.fat_g, false),
    gradeNutrient("fiber", "식이섬유", "g", avg.fiber_g, target.fiber_g, false),
    gradeNutrient("sodium", "나트륨", "mg", avg.sodium_mg, target.sodium_mg, true),
    gradeNutrient("sugar", "당류", "g", avg.sugar_g, target.sugar_g, true),
  ];

  // ── 6. 종합 점수 (100점 만점) ──
  const excellentCount = grades.filter(g => g.grade === "excellent").length;
  const goodCount = grades.filter(g => g.grade === "good").length;
  const overallScore = Math.round(
    (excellentCount * 14 + goodCount * 10 + grades.filter(g => g.grade === "low").length * 5) / grades.length * 10,
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
    .filter(g => g.grade === "low" || g.grade === "critical")
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
  if (overallScore >= 80) comment = "이번 주 영양 밸런스가 훌륭해요! 이 페이스를 유지하세요 💪";
  else if (overallScore >= 60) comment = "대체로 잘하고 있어요. 부족한 영양소만 조금 더 챙기면 완벽!";
  else if (overallScore >= 40) comment = "영양 밸런스를 개선할 여지가 있어요. 추천 제품을 참고해보세요.";
  else comment = "식단 기록을 더 채우고, 부족 영양소 위주로 식단을 보완해보세요.";

  return NextResponse.json({
    hasData: true,
    period: {
      start: weekAgo.toISOString().slice(0, 10),
      end: today.toISOString().slice(0, 10),
    },
    daysWithData,
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
