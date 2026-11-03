import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/community/like — 좋아요 토글 (atomic increment)
 * 새 community_feed 테이블 + 레거시 shared_meal_plans 호환
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user_id = body.user_id;
    const post_id = body.post_id || body.plan_id; // 호환
    if (!user_id || !post_id) return NextResponse.json({ error: "user_id, post_id 필수" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    // 새 테이블 우선 시도
    const { data: existing } = await sb
      .from("community_feed_likes")
      .select("id")
      .eq("post_id", post_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing) {
      await sb.from("community_feed_likes").delete().eq("id", existing.id);
      await sb.rpc("decrement_feed_count", { p_column: "like_count", p_id: post_id });
      return NextResponse.json({ liked: false });
    } else {
      await sb.from("community_feed_likes").insert({ post_id, user_id });
      await sb.rpc("increment_feed_count", { p_column: "like_count", p_id: post_id });
      return NextResponse.json({ liked: true });
    }
  } catch {
    return NextResponse.json({ error: "좋아요 처리 실패" }, { status: 500 });
  }
}
