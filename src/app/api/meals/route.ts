import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * 식사 기록 API
 * POST: 식사 기록 추가
 * GET: 기간별 식사 기록 조회 + 영양 통계
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, productId, mealType = "snack" } = body;

    if (!userId || !productId) {
      return NextResponse.json({ error: "userId와 productId가 필요합니다." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // 제품 영양 정보 가져오기 (스냅샷 저장)
    const { data: product } = await supabase
      .from("products")
      .select("calories, protein_g, fat_g, sugar_g, sodium_mg, fiber_g")
      .eq("id", productId)
      .single() as { data: Record<string, number | null> | null };

    const { data: log, error } = await (supabase
      .from("meal_logs") as any)
      .insert({
        user_id: userId,
        product_id: productId,
        meal_type: mealType,
        calories: product?.calories ?? null,
        protein_g: product?.protein_g ?? null,
        fat_g: product?.fat_g ?? null,
        sugar_g: product?.sugar_g ?? null,
        sodium_mg: product?.sodium_mg ?? null,
        fiber_g: product?.fiber_g ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ log });
  } catch (err) {
    console.error("Meal log POST error:", err);
    return NextResponse.json({ error: "식사 기록 저장 실패" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const days = parseInt(searchParams.get("days") || "7");

    if (!userId) {
      return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data: logs, error } = await (supabase
      .from("meal_logs") as any)
      .select(`
        id, product_id, eaten_at, meal_type,
        calories, protein_g, fat_g, sugar_g, sodium_mg, fiber_g,
        products!meal_logs_product_id_fkey(name, functional_tags)
      `)
      .eq("user_id", userId)
      .gte("eaten_at", since.toISOString())
      .order("eaten_at", { ascending: false }) as { data: any[] | null; error: any };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const entries = logs || [];

    // 일별 통계 계산
    const dailyMap: Record<string, {
      date: string;
      count: number;
      calories: number;
      protein_g: number;
      fat_g: number;
      sugar_g: number;
      sodium_mg: number;
      fiber_g: number;
    }> = {};

    for (const log of entries) {
      const date = new Date(log.eaten_at).toISOString().slice(0, 10);
      if (!dailyMap[date]) {
        dailyMap[date] = { date, count: 0, calories: 0, protein_g: 0, fat_g: 0, sugar_g: 0, sodium_mg: 0, fiber_g: 0 };
      }
      dailyMap[date].count++;
      dailyMap[date].calories += log.calories || 0;
      dailyMap[date].protein_g += log.protein_g || 0;
      dailyMap[date].fat_g += log.fat_g || 0;
      dailyMap[date].sugar_g += log.sugar_g || 0;
      dailyMap[date].sodium_mg += log.sodium_mg || 0;
      dailyMap[date].fiber_g += log.fiber_g || 0;
    }

    const dailyStats = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // 주간 평균
    const activeDays = dailyStats.length || 1;
    const weeklyAvg = {
      calories: Math.round(dailyStats.reduce((s, d) => s + d.calories, 0) / activeDays),
      protein_g: Math.round(dailyStats.reduce((s, d) => s + d.protein_g, 0) / activeDays),
      fat_g: Math.round(dailyStats.reduce((s, d) => s + d.fat_g, 0) / activeDays),
      sugar_g: Math.round(dailyStats.reduce((s, d) => s + d.sugar_g, 0) / activeDays),
      sodium_mg: Math.round(dailyStats.reduce((s, d) => s + d.sodium_mg, 0) / activeDays),
      fiber_g: Math.round(dailyStats.reduce((s, d) => s + d.fiber_g, 0) / activeDays),
    };

    // 부족 영양소 분석
    const deficits: { nutrient: string; label: string; current: number; target: number; unit: string }[] = [];
    if (weeklyAvg.protein_g < 50) {
      deficits.push({ nutrient: "protein_g", label: "단백질", current: weeklyAvg.protein_g, target: 55, unit: "g" });
    }
    if (weeklyAvg.fiber_g < 20) {
      deficits.push({ nutrient: "fiber_g", label: "식이섬유", current: weeklyAvg.fiber_g, target: 25, unit: "g" });
    }
    if (weeklyAvg.calories < 1400) {
      deficits.push({ nutrient: "calories", label: "열량", current: weeklyAvg.calories, target: 1800, unit: "kcal" });
    }

    // 초과 영양소 분석
    const excesses: { nutrient: string; label: string; current: number; limit: number; unit: string }[] = [];
    if (weeklyAvg.sodium_mg > 2000) {
      excesses.push({ nutrient: "sodium_mg", label: "나트륨", current: weeklyAvg.sodium_mg, limit: 2000, unit: "mg" });
    }
    if (weeklyAvg.sugar_g > 25) {
      excesses.push({ nutrient: "sugar_g", label: "당류", current: weeklyAvg.sugar_g, limit: 25, unit: "g" });
    }

    return NextResponse.json({
      logs: entries.map((l: any) => ({
        ...l,
        product_name: l.products?.name || null,
        functional_tags: l.products?.functional_tags || [],
      })),
      dailyStats,
      weeklyAvg,
      deficits,
      excesses,
      totalEntries: entries.length,
    });
  } catch (err) {
    console.error("Meal log GET error:", err);
    return NextResponse.json({ error: "식사 기록 조회 실패" }, { status: 500 });
  }
}
