import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** GET /api/community/comment?plan_id=xxx — 댓글 목록 */
export async function GET(request: NextRequest) {
  await connection();
  const planId = request.nextUrl.searchParams.get("plan_id");
  if (!planId) return NextResponse.json({ error: "plan_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const { data: comments, error } = await sb
    .from("meal_plan_comments")
    .select("*")
    .eq("plan_id", planId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: comments || [] });
}

/** POST /api/community/comment — 댓글 작성 */
export async function POST(request: NextRequest) {
  try {
    const { user_id, plan_id, content, display_name } = await request.json();
    if (!user_id || !plan_id || !content?.trim()) {
      return NextResponse.json({ error: "user_id, plan_id, content 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    // 작성자 프로필
    const { data: profile } = await sb
      .from("user_profiles")
      .select("age_group, concerns")
      .eq("user_id", user_id)
      .maybeSingle();

    const displayName = display_name || "익명 사용자";
    const { data: comment, error } = await sb.from("meal_plan_comments").insert({
      user_id,
      plan_id,
      content: content.trim(),
      author_display_name: displayName,
      author_age_group: profile?.age_group || null,
      author_concerns: profile?.concerns || [],
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // comment_count 증가
    const { data: plan } = await sb.from("shared_meal_plans").select("comment_count").eq("id", plan_id).single();
    if (plan) {
      await sb.from("shared_meal_plans").update({ comment_count: (plan.comment_count || 0) + 1 }).eq("id", plan_id);
    }

    return NextResponse.json({ comment, ok: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
