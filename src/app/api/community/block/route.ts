import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

/**
 * GET    /api/community/block — 내가 차단한 사람 [{ user_id, nickname, created_at }]
 * POST   /api/community/block { user_id } — 차단 (서로 팔로우도 끊는다)
 * DELETE /api/community/block { user_id } — 차단 풀기
 */
export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return NextResponse.json({ blocked: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data, error } = await sb.from("community_blocks").select("blocked_id, created_at").eq("blocker_id", actor).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (data || []).map((r: { blocked_id: string }) => r.blocked_id);
  const names = new Map<string, string>();
  if (ids.length) {
    const [p, c] = await Promise.all([
      sb.from("community_feed").select("user_id, author_nickname").in("user_id", ids).order("created_at", { ascending: false }).limit(200),
      sb.from("community_feed_comments").select("user_id, author_nickname").in("user_id", ids).order("created_at", { ascending: false }).limit(200),
    ]);
    for (const r of [...(p.data || []), ...(c.data || [])]) if (r.author_nickname && !names.has(r.user_id)) names.set(r.user_id, r.author_nickname);
  }
  return NextResponse.json({
    blocked: (data || []).map((r: { blocked_id: string; created_at: string }) => ({ user_id: r.blocked_id, nickname: names.get(r.blocked_id) || "이름 없음", created_at: r.created_at })),
  });
}

async function handle(request: NextRequest, block: boolean) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { user_id } = await request.json().catch(() => ({}));
  if (typeof user_id !== "string" || !/^[A-Za-z0-9_-]{3,64}$/.test(user_id)) return NextResponse.json({ error: "user_id 필수" }, { status: 400 });
  if (user_id === actor) return NextResponse.json({ error: "나를 차단할 수 없어요" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  if (block) {
    const { error } = await sb.from("community_blocks").upsert({ blocker_id: actor, blocked_id: user_id }, { onConflict: "blocker_id,blocked_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: fErr } = await sb.from("community_follows").delete()
      .or(`and(follower_id.eq.${actor},following_id.eq.${user_id}),and(follower_id.eq.${user_id},following_id.eq.${actor})`);
    if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  } else {
    const { error } = await sb.from("community_blocks").delete().eq("blocker_id", actor).eq("blocked_id", user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, blocked: block });
}

export const POST = (r: NextRequest) => handle(r, true);
export const DELETE = (r: NextRequest) => handle(r, false);
