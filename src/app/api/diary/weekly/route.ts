import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// 최근 7일 영양 추이
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const sb = supabase as any;

  // 최근 7일
  const today = new Date();
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const { data: entries } = await sb
    .from("meal_diary")
    .select("date, calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g, product_id")
    .eq("user_id", userId)
    .gte("date", days[0])
    .lte("date", days[6])
    .order("date", { ascending: true });

  // 일별 집계
  const dailyMap: Record<string, {
    calories: number; protein_g: number; fat_g: number; carbs_g: number;
    sugar_g: number; sodium_mg: number; fiber_g: number; count: number;
    sources: Record<string, number>;
  }> = {};

  for (const d of days) {
    dailyMap[d] = { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, sugar_g: 0, sodium_mg: 0, fiber_g: 0, count: 0, sources: {} };
  }

  for (const e of entries || []) {
    const d = dailyMap[e.date];
    if (!d) continue;
    d.count++;
    if (e.calories) d.calories += Number(e.calories);
    if (e.protein_g) d.protein_g += Number(e.protein_g);
    if (e.fat_g) d.fat_g += Number(e.fat_g);
    if (e.carbs_g) d.carbs_g += Number(e.carbs_g);
    if (e.sugar_g) d.sugar_g += Number(e.sugar_g);
    if (e.sodium_mg) d.sodium_mg += Number(e.sodium_mg);
    if (e.fiber_g) d.fiber_g += Number(e.fiber_g);
  }

  // 영양 목표
  const { data: goals } = await sb
    .from("daily_nutrition_goals")
    .select("*")
    .eq("user_id", userId)
    .single();

  const dailyGoalCal = goals?.daily_calories || 2000;

  // 주간 평균
  const daysWithData = Object.values(dailyMap).filter(d => d.count > 0);
  const weeklyAvg = daysWithData.length > 0 ? {
    calories: Math.round(daysWithData.reduce((a, d) => a + d.calories, 0) / daysWithData.length),
    protein_g: Math.round(daysWithData.reduce((a, d) => a + d.protein_g, 0) / daysWithData.length * 10) / 10,
    sodium_mg: Math.round(daysWithData.reduce((a, d) => a + d.sodium_mg, 0) / daysWithData.length),
    goalAchievement: Math.round(
      (daysWithData.reduce((a, d) => a + Math.min(d.calories / dailyGoalCal, 1.2), 0) / daysWithData.length) * 100
    ),
  } : null;

  return NextResponse.json({
    days: days.map(d => {
      const dd = dailyMap[d];
      const dayLabel = new Date(d + "T00:00:00");
      return {
        date: d,
        label: `${dayLabel.getMonth() + 1}/${dayLabel.getDate()}`,
        dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][dayLabel.getDay()],
        calories: Math.round(dd.calories),
        protein_g: Math.round(dd.protein_g * 10) / 10,
        sodium_mg: Math.round(dd.sodium_mg),
        count: dd.count,
      };
    }),
    weeklyAvg,
    goalCalories: dailyGoalCal,
    totalEntries: (entries || []).length,
  });
}
