import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** GET /api/community/comment?post_id=xxx — 댓글 목록 */
export async function GET(request: NextRequest) {
  await connection();
  const postId = request.nextUrl.searchParams.get("post_id") || request.nextUrl.searchParams.get("plan_id");
  if (!postId) return NextResponse.json({ error: "post_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const { data: comments, error } = await sb
    .from("community_feed_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: comments || [] });
}

/** POST /api/community/comment — 댓글 작성 (atomic increment) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user_id = body.user_id;
    const post_id = body.post_id || body.plan_id;
    const content = body.content;
    const author_nickname = body.author_nickname || body.display_name || "익명";

    if (!user_id || !post_id || !content?.trim()) {
      return NextResponse.json({ error: "user_id, post_id, content 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    const { data: comment, error } = await sb
      .from("community_feed_comments")
      .insert({
        user_id,
        post_id,
        content: content.trim(),
        author_nickname,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Atomic increment
    await sb.rpc("increment_feed_count", { p_column: "comment_count", p_id: post_id });

    return NextResponse.json({ comment, ok: true });
  } catch {
    return NextResponse.json({ error: "댓글 작성 실패" }, { status: 400 });
  }
}
