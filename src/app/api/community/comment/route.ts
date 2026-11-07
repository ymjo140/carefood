import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { viewerFilters } from "@/lib/community-safety";

/**
 * GET    /api/community/comment?post_id= — 답글 목록 (지운 것·신고로 가려진 것·차단한 사람 것 빼고). parent_id 로 한 단계 답글
 * POST   /api/community/comment { post_id, content, parent_id?, author_nickname } — 답글 쓰기
 * DELETE /api/community/comment?id= — 내 답글 지우기
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  await connection();
  const postId = request.nextUrl.searchParams.get("post_id") || request.nextUrl.searchParams.get("plan_id");
  if (!postId) return NextResponse.json({ error: "post_id 필수" }, { status: 400 });
  const viewer = await getActorId();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const { data: comments, error } = await sb
    .from("community_feed_comments")
    .select("id, post_id, user_id, parent_id, author_nickname, content, created_at, hidden_by_reports")
    .eq("post_id", postId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let blocked = new Set<string>();
  try { blocked = (await viewerFilters(sb, viewer)).blocked; } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }

  const visible = (comments || []).filter((c: { user_id: string; hidden_by_reports: boolean }) =>
    !blocked.has(c.user_id) && (!c.hidden_by_reports || c.user_id === viewer));
  return NextResponse.json({
    comments: visible.map(({ hidden_by_reports, ...c }: { hidden_by_reports: boolean; user_id: string }) => ({ ...c, is_mine: !!viewer && c.user_id === viewer, hidden: hidden_by_reports })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user_id = await getActorId();
    if (!user_id) return noActor();
    const post_id = body.post_id || body.plan_id;
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 500) : "";
    const author_nickname = typeof body.author_nickname === "string" && body.author_nickname.trim() ? body.author_nickname.trim().slice(0, 20) : "익명";
    if (!post_id || !content) return NextResponse.json({ error: "post_id, content 필수" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    // 글쓴이가 나를 차단했으면 답글을 달 수 없다
    const { data: post } = await sb.from("community_feed").select("user_id, is_active").eq("id", post_id).maybeSingle();
    if (!post || !post.is_active) return NextResponse.json({ error: "글을 찾을 수 없어요" }, { status: 404 });
    const { data: blockedMe } = await sb.from("community_blocks").select("blocker_id").eq("blocker_id", post.user_id).eq("blocked_id", user_id).maybeSingle();
    if (blockedMe) return NextResponse.json({ error: "답글을 달 수 없는 글이에요" }, { status: 403 });

    // 답글에 답글은 한 단계까지 — 답글의 답글에 다시 달면 맨 위 답글 아래로 모은다
    let parent_id: string | null = null;
    if (typeof body.parent_id === "string" && UUID.test(body.parent_id)) {
      const { data: parent } = await sb.from("community_feed_comments").select("id, post_id, parent_id").eq("id", body.parent_id).maybeSingle();
      if (!parent || parent.post_id !== post_id) return NextResponse.json({ error: "답글을 찾을 수 없어요" }, { status: 400 });
      parent_id = parent.parent_id || parent.id;
    }

    const { data: comment, error } = await sb
      .from("community_feed_comments")
      .insert({ user_id, post_id, parent_id, content, author_nickname })
      .select("id, post_id, user_id, parent_id, author_nickname, content, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.rpc("increment_feed_count", { p_column: "comment_count", p_id: post_id });
    return NextResponse.json({ comment: { ...comment, is_mine: true }, ok: true });
  } catch {
    return NextResponse.json({ error: "답글을 남기지 못했어요" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data, error } = await sb.from("community_feed_comments").update({ is_active: false })
    .eq("id", id).eq("user_id", actor).eq("is_active", true).select("post_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "내 답글만 지울 수 있어요" }, { status: 403 });
  await sb.rpc("decrement_feed_count", { p_column: "comment_count", p_id: data[0].post_id });
  return NextResponse.json({ ok: true });
}
