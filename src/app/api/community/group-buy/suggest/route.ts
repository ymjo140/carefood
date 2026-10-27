import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/community/group-buy/suggest?user_id=xxx
 *
 * 사용자의 최근 7일 식단 기록에서 영양 갭을 분석하고,
 * 부족한 영양소를 채울 수 있는 제품으로 공구를 추천합니다.
 *
 * user_id 없이 호출하면 전체 사용자 평균 영양 갭 기반 추천 (시스템 공구용)
 */

type NutrientGap = {
  nutrient: string;
  label: string;
  current: number;
  target: number;
  ratio: number; // current/target (1.0 = 100%)
  gap: number; // target - current
  severity: "critical" | "low" | "ok";
};

type SuggestedGroupBuy = {
  nutrient_gap: string;
  gap_label: string;
  severity: string;
  product_id: string;
  product_name: string;
  manufacturer: string | null;
  nutrient_value: number;
  nutrient_unit: string;
  health_score: number | null;
  price: number | null;
  reason: string;
};

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const sb = createServiceRoleClient() as any;

  // ── 1. 영양 목표 가져오기 ──
  let goalCalories = 2000, goalProtein = 60, goalSodiumMax = 2000, goalSugarMax = 50, goalFiber = 25;

  if (userId) {
    const { data: goals } = await sb
      .from("daily_nutrition_goals")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (goals) {
      goalCalories = goals.daily_calories || 2000;
      goalProtein = goals.daily_protein_g || 60;
      goalSodiumMax = goals.max_sodium_mg || 2000;
      goalSugarMax = goals.max_sugar_g || 50;
    }
  }

  // ── 2. 최근 7일 식단 기록 분석 ──
  let avgCalories = 0, avgProtein = 0, avgSodium = 0, avgSugar = 0, avgFiber = 0;
  let daysWithData = 0;

  if (userId) {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: entries } = await sb
      .from("meal_diary")
      .select("date, calories, protein_g, sodium_mg, sugar_g, fiber_g")
      .eq("user_id", userId)
      .gte("date", weekAgo.toISOString().slice(0, 10))
      .lte("date", today.toISOString().slice(0, 10));

    if (entries && entries.length > 0) {
      // 일별 합계
      const dailyTotals: Record<string, { cal: number; protein: number; sodium: number; sugar: number; fiber: number }> = {};
      for (const e of entries) {
        if (!dailyTotals[e.date]) dailyTotals[e.date] = { cal: 0, protein: 0, sodium: 0, sugar: 0, fiber: 0 };
        const d = dailyTotals[e.date];
        d.cal += Number(e.calories || 0);
        d.protein += Number(e.protein_g || 0);
        d.sodium += Number(e.sodium_mg || 0);
        d.sugar += Number(e.sugar_g || 0);
        d.fiber += Number(e.fiber_g || 0);
      }

      daysWithData = Object.keys(dailyTotals).length;
      const totals = Object.values(dailyTotals);
      avgCalories = Math.round(totals.reduce((a, d) => a + d.cal, 0) / daysWithData);
      avgProtein = Math.round(totals.reduce((a, d) => a + d.protein, 0) / daysWithData * 10) / 10;
      avgSodium = Math.round(totals.reduce((a, d) => a + d.sodium, 0) / daysWithData);
      avgSugar = Math.round(totals.reduce((a, d) => a + d.sugar, 0) / daysWithData * 10) / 10;
      avgFiber = Math.round(totals.reduce((a, d) => a + d.fiber, 0) / daysWithData * 10) / 10;
    }
  }

  // ── 3. 영양 갭 계산 ──
  const gaps: NutrientGap[] = [];

  if (daysWithData >= 2) {
    // 단백질 부족
    const proteinRatio = avgProtein / goalProtein;
    if (proteinRatio < 0.8) {
      gaps.push({
        nutrient: "protein", label: "단백질",
        current: avgProtein, target: goalProtein,
        ratio: proteinRatio, gap: goalProtein - avgProtein,
        severity: proteinRatio < 0.5 ? "critical" : "low",
      });
    }

    // 식이섬유 부족
    const fiberRatio = avgFiber / goalFiber;
    if (fiberRatio < 0.6) {
      gaps.push({
        nutrient: "fiber", label: "식이섬유",
        current: avgFiber, target: goalFiber,
        ratio: fiberRatio, gap: goalFiber - avgFiber,
        severity: fiberRatio < 0.3 ? "critical" : "low",
      });
    }

    // 나트륨 과다
    const sodiumRatio = avgSodium / goalSodiumMax;
    if (sodiumRatio > 1.2) {
      gaps.push({
        nutrient: "sodium_over", label: "나트륨 과다",
        current: avgSodium, target: goalSodiumMax,
        ratio: sodiumRatio, gap: avgSodium - goalSodiumMax,
        severity: sodiumRatio > 1.5 ? "critical" : "low",
      });
    }

    // 당류 과다
    const sugarRatio = avgSugar / goalSugarMax;
    if (sugarRatio > 1.2) {
      gaps.push({
        nutrient: "sugar_over", label: "당류 과다",
        current: avgSugar, target: goalSugarMax,
        ratio: sugarRatio, gap: avgSugar - goalSugarMax,
        severity: sugarRatio > 1.5 ? "critical" : "low",
      });
    }

    // 칼로리 부족
    const calRatio = avgCalories / goalCalories;
    if (calRatio < 0.7) {
      gaps.push({
        nutrient: "calories", label: "칼로리 부족",
        current: avgCalories, target: goalCalories,
        ratio: calRatio, gap: goalCalories - avgCalories,
        severity: calRatio < 0.5 ? "critical" : "low",
      });
    }
  }

  // 데이터가 부족하면 일반 추천 (고단백 + 고식이섬유)
  if (gaps.length === 0) {
    gaps.push(
      { nutrient: "protein", label: "단백질", current: 0, target: goalProtein, ratio: 0, gap: goalProtein, severity: "low" },
      { nutrient: "fiber", label: "식이섬유", current: 0, target: goalFiber, ratio: 0, gap: goalFiber, severity: "low" },
    );
  }

  // ── 4. 갭에 맞는 제품 추천 ──
  const suggestions: SuggestedGroupBuy[] = [];

  for (const gap of gaps.slice(0, 3)) {
    let query = sb
      .from("products")
      .select("id, name, manufacturer, health_score, calories, protein_g, fiber_g, sodium_mg, sugar_g")
      .eq("is_purchasable", true)
      .not("health_score", "is", null)
      .order("health_score", { ascending: false })
      .limit(3);

    let nutrientField = "";
    let nutrientUnit = "";

    switch (gap.nutrient) {
      case "protein":
        query = query.gte("protein_g", 20);
        nutrientField = "protein_g";
        nutrientUnit = "g";
        break;
      case "fiber":
        query = query.gte("fiber_g", 3);
        nutrientField = "fiber_g";
        nutrientUnit = "g";
        break;
      case "sodium_over":
        query = query.lt("sodium_mg", 300);
        nutrientField = "sodium_mg";
        nutrientUnit = "mg";
        break;
      case "sugar_over":
        query = query.lt("sugar_g", 3);
        nutrientField = "sugar_g";
        nutrientUnit = "g";
        break;
      case "calories":
        query = query.gte("calories", 300).lte("calories", 600);
        nutrientField = "calories";
        nutrientUnit = "kcal";
        break;
    }

    const { data: products } = await query;

    for (const p of (products || []).slice(0, 2)) {
      // 가격 조회
      const { data: prices } = await sb
        .from("product_prices")
        .select("price")
        .eq("product_id", p.id)
        .order("price", { ascending: true })
        .limit(1);

      const reason = gap.nutrient === "sodium_over"
        ? `나트륨 ${p.sodium_mg || 0}${nutrientUnit} — 저나트륨 식품`
        : gap.nutrient === "sugar_over"
        ? `당류 ${p.sugar_g || 0}${nutrientUnit} — 저당 식품`
        : `${gap.label} ${p[nutrientField] || 0}${nutrientUnit} — ${gap.label} 보충`;

      suggestions.push({
        nutrient_gap: gap.nutrient,
        gap_label: gap.label,
        severity: gap.severity,
        product_id: p.id,
        product_name: p.name,
        manufacturer: p.manufacturer,
        nutrient_value: p[nutrientField] || 0,
        nutrient_unit: nutrientUnit,
        health_score: p.health_score,
        price: prices?.[0]?.price || null,
        reason,
      });
    }
  }

  return NextResponse.json({
    gaps,
    suggestions,
    daysWithData,
    averages: daysWithData >= 2 ? {
      calories: avgCalories,
      protein_g: avgProtein,
      sodium_mg: avgSodium,
      sugar_g: avgSugar,
      fiber_g: avgFiber,
    } : null,
    goals: { goalCalories, goalProtein, goalSodiumMax, goalSugarMax, goalFiber },
  });
}
