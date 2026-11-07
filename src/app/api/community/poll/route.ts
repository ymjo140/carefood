import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { withPolls } from "@/lib/community-poll";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/community/poll { post_id, choice } — 투표하기 (마감 전에는 다른 선택지로 바꿀 수 있다)
 * DELETE /api/community/poll { post_id } — 투표 취소
 * 응답: { poll } — 바뀐 결과
 */
async function handle(request: NextRequest, vote: boolean) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  const post_id = typeof body.post_id === "string" && UUID.test(body.post_id) ? body.post_id : null;
  if (!post_id) return NextResponse.json({ error: "post_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: post, error: pErr } = await sb.from("community_feed").select("id, poll, is_active, hidden_by_reports").eq("id", post_id).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!post || !post.is_active || !post.poll?.options) return NextResponse.json({ error: "투표가 없는 글이에요" }, { status: 404 });
  if (post.poll.closes_at && Date.parse(post.poll.closes_at) <= Date.now()) return NextResponse.json({ error: "마감한 투표예요" }, { status: 409 });

  if (vote) {
    const choice = Number(body.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= post.poll.options.length) return NextResponse.json({ error: "선택지를 골라 주세요" }, { status: 400 });
    const { error } = await sb.from("community_poll_votes")
      .upsert({ post_id, user_id: actor, choice, updated_at: new Date().toISOString() }, { onConflict: "post_id,user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await sb.from("community_poll_votes").delete().eq("post_id", post_id).eq("user_id", actor);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const [res] = await withPolls(sb, [{ id: post.id, poll: post.poll }], actor);
    return NextResponse.json({ poll: res.poll });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const POST = (r: NextRequest) => handle(r, true);
export const DELETE = (r: NextRequest) => handle(r, false);
