import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/meal-plans?user_id=xxx — 저장된 식단 목록
 * POST /api/meal-plans — 식단 저장/수정
 */

export async function GET(request: NextRequest) {
  await connection();
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const { data: plans, error } = await sb
    .from("saved_meal_plans")
    .select("id, title, tags, total_price, avg_daily_calories, avg_daily_protein, product_count, eating_out_count, updated_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: plans || [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, id, title, grid, tags } = body;

    if (!user_id || !grid) {
      return NextResponse.json({ error: "user_id, grid 필수" }, { status: 400 });
    }

    // 통계 계산
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const meals = ["breakfast", "lunch", "dinner", "supplement"];
    let totalPrice = 0, totalCalories = 0, totalProtein = 0, productCount = 0, eatingOutCount = 0;

    for (const day of days) {
      const dayData = grid[day] || {};
      for (const meal of meals) {
        const cell = dayData[meal];
        if (!cell) continue;
        if (cell.type === "eating_out") { eatingOutCount++; continue; }
        if (cell.product_id) {
          productCount++;
          totalPrice += cell.price || 0;
          totalCalories += cell.calories || 0;
          totalProtein += cell.protein_g || 0;
        }
      }
    }

    const planData = {
      user_id,
      title: title || "새 식단",
      grid,
      tags: tags || [],
      total_price: totalPrice,
      avg_daily_calories: Math.round(totalCalories / 7),
      avg_daily_protein: Math.round(totalProtein / 7),
      product_count: productCount,
      eating_out_count: eatingOutCount,
      updated_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    if (id) {
      // 기존 식단 수정
      const { error } = await sb.from("saved_meal_plans").update(planData).eq("id", id).eq("user_id", user_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id });
    } else {
      // 새 식단 생성
      const { data: plan, error } = await sb.from("saved_meal_plans").insert(planData).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: plan.id });
    }
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
