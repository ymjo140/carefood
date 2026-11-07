import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

/**
 * POST /api/community/copy — "따라하기": 커뮤니티 식단을 내 식단 리스트(saved_meal_plans)에 저장
 */
export async function POST(request: NextRequest) {
  try {
    const { post_id } = await request.json();
    const user_id = await getActorId();
    if (!user_id) return noActor();
    if (!post_id) return NextResponse.json({ error: "post_id 필수" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    // 게시글의 meal_data + 작성자 정보 로드
    const { data: post } = await sb
      .from("community_feed")
      .select("meal_data, meal_type, author_nickname, content")
      .eq("id", post_id)
      .single();

    // 저장한 식단(일주일)을 공유한 글 — 7일 그리드를 통째로 담는다
    const sharedPlan = post?.meal_data?.plan as { title?: string; grid?: Record<string, unknown>; avg_kcal?: number; avg_protein?: number; days?: number } | undefined;
    if (sharedPlan?.grid && typeof sharedPlan.grid === "object") {
      const { data: saved, error: pErr } = await sb.from("saved_meal_plans").insert({
        user_id,
        title: `${post.author_nickname || "커뮤니티"}의 ${sharedPlan.title || "식단"}`.slice(0, 60),
        grid: sharedPlan.grid,
        tags: ["따라하기"],
        total_price: 0,
        avg_daily_calories: Math.round(sharedPlan.avg_kcal || 0),
        avg_daily_protein: Math.round(sharedPlan.avg_protein || 0),
        product_count: 0,
        eating_out_count: 0,
        source: "community_copy",
      }).select("id, title").single();
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      await sb.rpc("increment_feed_count", { p_column: "copy_count", p_id: post_id });
      return NextResponse.json({ ok: true, plan_id: saved.id, title: saved.title });
    }

    if (!post?.meal_data?.foods || post.meal_data.foods.length === 0) {
      return NextResponse.json({ error: "식단 데이터 없음" }, { status: 400 });
    }

    const foods = post.meal_data.foods as { name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; product_id?: string; price?: number; platform?: string; url?: string }[];
    const mealType = post.meal_type || "lunch";

    // 7일 그리드 생성 — 월요일 해당 끼니에만 채움
    const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const MEALS = ["breakfast", "lunch", "dinner", "supplement"];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grid: Record<string, Record<string, any>> = {};
    for (const d of DAYS) {
      grid[d] = {};
      for (const m of MEALS) grid[d][m] = null;
    }

    // 첫 번째 음식만 해당 끼니에 넣고, 나머지는 보조 데이터로 함께 저장
    // 식단 리스트에서는 대표 음식을 보여주고, 전체 foods는 grid 안에 보존
    const primaryFood = foods[0];
    grid["mon"][mealType] = {
      product_id: primaryFood.product_id || null,
      name: primaryFood.name,
      calories: foods.reduce((s, f) => s + (f.calories || 0), 0),
      protein_g: foods.reduce((s, f) => s + (f.protein_g || 0), 0),
      carbs_g: foods.reduce((s, f) => s + (f.carbs_g || 0), 0),
      fat_g: foods.reduce((s, f) => s + (f.fat_g || 0), 0),
      price: foods.reduce((s, f) => s + (f.price || 0), 0),
      platform: primaryFood.platform || null,
      url: primaryFood.url || null,
      type: "product",
      // 전체 음식 목록 보존 (나중에 식단 기록에 개별 추가 시 사용)
      _foods: foods,
    };

    // 통계
    const totalCalories = foods.reduce((s, f) => s + (f.calories || 0), 0);
    const totalProtein = foods.reduce((s, f) => s + (f.protein_g || 0), 0);
    const totalPrice = foods.reduce((s, f) => s + (f.price || 0), 0);

    const MEAL_LABELS: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식", supplement: "간식" };
    const mealLabel = MEAL_LABELS[mealType] || mealType;
    const authorName = post.author_nickname || "커뮤니티";
    const title = `${authorName}의 ${mealLabel}`;

    const { data: plan, error } = await sb.from("saved_meal_plans").insert({
      user_id,
      title,
      grid,
      tags: ["따라하기"],
      total_price: totalPrice,
      avg_daily_calories: totalCalories, // 1끼 기준이므로 그대로
      avg_daily_protein: Math.round(totalProtein),
      product_count: foods.length,
      eating_out_count: 0,
      source: "community_copy",
    }).select("id").single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Atomic increment copy_count
    await sb.rpc("increment_feed_count", { p_column: "copy_count", p_id: post_id });

    return NextResponse.json({ ok: true, plan_id: plan.id, copied: foods.length, title });
  } catch {
    return NextResponse.json({ error: "따라하기 실패" }, { status: 500 });
  }
}
