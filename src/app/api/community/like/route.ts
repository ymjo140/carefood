import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** POST /api/community/like — 좋아요 토글 */
export async function POST(request: NextRequest) {
  try {
    const { user_id, plan_id } = await request.json();
    if (!user_id || !plan_id) {
      return NextResponse.json({ error: "user_id, plan_id 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    // 이미 좋아요했는지 확인
    const { data: existing } = await sb
      .from("meal_plan_likes")
      .select("id")
      .eq("user_id", user_id)
      .eq("plan_id", plan_id)
      .maybeSingle();

    if (existing) {
      // 좋아요 취소
      await sb.from("meal_plan_likes").delete().eq("id", existing.id);
      await sb.rpc("decrement_counter", { table_name: "shared_meal_plans", column_name: "like_count", row_id: plan_id }).catch(() => {
        // rpc 없으면 직접
        sb.from("shared_meal_plans").update({ like_count: sb.raw("like_count - 1") }).eq("id", plan_id);
      });
      // 직접 업데이트
      const { data: plan } = await sb.from("shared_meal_plans").select("like_count").eq("id", plan_id).single();
      if (plan) {
        await sb.from("shared_meal_plans").update({ like_count: Math.max((plan.like_count || 1) - 1, 0) }).eq("id", plan_id);
      }
      return NextResponse.json({ liked: false });
    } else {
      // 좋아요
      await sb.from("meal_plan_likes").insert({ user_id, plan_id });
      const { data: plan } = await sb.from("shared_meal_plans").select("like_count").eq("id", plan_id).single();
      if (plan) {
        await sb.from("shared_meal_plans").update({ like_count: (plan.like_count || 0) + 1 }).eq("id", plan_id);
      }
      return NextResponse.json({ liked: true });
    }
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
