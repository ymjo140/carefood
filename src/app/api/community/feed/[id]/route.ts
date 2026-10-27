import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/community/feed/[id] — 식단 상세 + 댓글
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const userId = request.nextUrl.searchParams.get("user_id");

  // 식단
  const { data: plan, error } = await sb
    .from("shared_meal_plans")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !plan) {
    return NextResponse.json({ error: "식단을 찾을 수 없습니다" }, { status: 404 });
  }

  // 좋아요 여부
  let isLiked = false;
  if (userId) {
    const { data: like } = await sb
      .from("meal_plan_likes")
      .select("id")
      .eq("plan_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    isLiked = !!like;
  }

  // 댓글
  const { data: comments } = await sb
    .from("meal_plan_comments")
    .select("*")
    .eq("plan_id", id)
    .order("created_at", { ascending: true });

  // 관련 공구 (같은 관심사 기반)
  let relatedGroupBuys: unknown[] = [];
  if (plan.author_concerns?.length > 0) {
    const { data: gbs } = await sb
      .from("group_buys")
      .select("id, title, product_name, target_price, original_price, discount_rate, target_count, current_count, status, concern")
      .eq("status", "recruiting")
      .in("concern", plan.author_concerns)
      .limit(3);
    relatedGroupBuys = gbs || [];
  }

  return NextResponse.json({
    plan: { ...plan, is_liked: isLiked },
    comments: comments || [],
    relatedGroupBuys,
  });
}
