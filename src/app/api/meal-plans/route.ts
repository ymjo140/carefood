import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET  /api/meal-plans?user_id=xxx[&include=grid] — 저장된 식단 목록 (+ filled_days, 요청 시 grid)
 * POST /api/meal-plans — 식단 저장/수정
 * PATCH /api/meal-plans — 이름 변경
 * DELETE /api/meal-plans?id=xxx&user_id=xxx — 식단 삭제 (soft)
 */

export async function GET(request: NextRequest) {
  await connection();
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const withGrid = request.nextUrl.searchParams.get("include") === "grid";
  const { data: plans, error } = await sb
    .from("saved_meal_plans")
    .select("id, title, tags, total_price, avg_daily_calories, avg_daily_protein, product_count, eating_out_count, source, updated_at, created_at, grid")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // filled_days: 음식이 들어 있는 요일 — 한 끼·하루짜리(따라하기 등)는 원하는 요일에 넣고, 여러 날은 통째로 불러온다
  const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = (plans || []).map(({ grid, ...p }: { grid: Record<string, Record<string, any>> | null } & Record<string, unknown>) => {
    const filled_days = DAY_KEYS.filter(d => Object.values(grid?.[d] || {}).some(c => c && (c.product_id || c.name || c.type === "eating_out")));
    return withGrid ? { ...p, filled_days, grid } : { ...p, filled_days };
  });
  return NextResponse.json({ plans: out });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, id, title, grid, tags } = body;

    if (!user_id || !grid) {
      return NextResponse.json({ error: "user_id, grid 필수" }, { status: 400 });
    }

    // 통계 계산 — 실제로 채워진 날 기준
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const meals = ["breakfast", "lunch", "dinner", "supplement"];
    let totalPrice = 0, totalCalories = 0, totalProtein = 0, productCount = 0, eatingOutCount = 0, filledDays = 0;

    for (const day of days) {
      const dayData = grid[day] || {};
      let dayHas = false;
      for (const meal of meals) {
        const cell = dayData[meal];
        if (!cell) continue;
        if (cell.type === "eating_out") {
          // 외식도 칼로리·단백질은 하루 합계에 넣는다
          eatingOutCount++; dayHas = true;
          totalCalories += cell.calories || 0; totalProtein += cell.protein_g || 0;
          continue;
        }
        if (cell.product_id || cell.name) {
          dayHas = true;
          productCount++;
          totalPrice += cell.price || 0;
          totalCalories += cell.calories || 0;
          totalProtein += cell.protein_g || 0;
        }
      }
      if (dayHas) filledDays++;
    }

    const planData = {
      user_id,
      title: title || "새 식단",
      grid,
      tags: tags || [],
      total_price: totalPrice,
      // 하루 평균 = 음식이 든 날 기준
      avg_daily_calories: Math.round(totalCalories / Math.max(filledDays, 1)),
      avg_daily_protein: Math.round(totalProtein / Math.max(filledDays, 1)),
      product_count: productCount,
      eating_out_count: eatingOutCount,
      updated_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    if (id) {
      const { error } = await sb.from("saved_meal_plans").update(planData).eq("id", id).eq("user_id", user_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id });
    } else {
      const { data: plan, error } = await sb.from("saved_meal_plans").insert(planData).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: plan.id });
    }
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

/** PATCH — 이름 변경 */
export async function PATCH(request: NextRequest) {
  try {
    const { id, user_id, title } = await request.json();
    if (!id || !user_id || !title) return NextResponse.json({ error: "id, user_id, title 필수" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;
    const { error } = await sb
      .from("saved_meal_plans")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

/** DELETE — soft delete */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!id || !userId) return NextResponse.json({ error: "id, user_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { error } = await sb
    .from("saved_meal_plans")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
