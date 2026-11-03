import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/community/copy — "따라하기": 식단을 내 meal_diary에 복사
 */
export async function POST(request: NextRequest) {
  try {
    const { post_id, user_id } = await request.json();
    if (!post_id || !user_id) return NextResponse.json({ error: "post_id, user_id 필수" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    // 게시글의 meal_data 로드
    const { data: post } = await sb
      .from("community_feed")
      .select("meal_data, meal_type")
      .eq("id", post_id)
      .single();

    if (!post?.meal_data?.foods) {
      return NextResponse.json({ error: "식단 데이터 없음" }, { status: 400 });
    }

    // meal_diary에 각 음식 추가
    const today = new Date().toISOString().split("T")[0];
    const mealType = post.meal_type || "lunch";
    const entries = post.meal_data.foods.map((food: { name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }) => ({
      user_id,
      date: today,
      meal_type: mealType,
      food_name: food.name,
      calories: food.calories || 0,
      protein_g: food.protein_g || 0,
      carbs_g: food.carbs_g || 0,
      fat_g: food.fat_g || 0,
      source: "community_copy",
    }));

    if (entries.length > 0) {
      await sb.from("meal_diary").insert(entries);
    }

    // Atomic increment copy_count
    await sb.rpc("increment_feed_count", { p_column: "copy_count", p_id: post_id });

    return NextResponse.json({ ok: true, copied: entries.length });
  } catch {
    return NextResponse.json({ error: "따라하기 실패" }, { status: 500 });
  }
}
