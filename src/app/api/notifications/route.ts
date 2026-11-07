import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { viewerFilters } from "@/lib/community-safety";

/**
 * GET /api/notifications — 내 소식 (따로 저장하지 않고 커뮤니티 기록에서 만든다)
 *   - 내 글에 남긴 답글 (다른 사람)
 *   - 내 답글에 달린 답글
 *   - 내 글의 좋아요 (글마다 묶어서)
 *   - 나를 팔로우함
 *   차단한 사람의 소식은 뺀다.
 * ?latest=1 이면 가장 최근 소식 시각 + 마지막으로 본 시각만 (머리 줄의 새 소식 점)
 * 응답의 seen_at = 마지막으로 알림 화면을 연 시각 (사람 기준 — 로그인하면 기기가 달라도 같다)
 * POST /api/notifications — 지금 다 봤다고 적는다
 */
type Item = { id: string; type: "comment" | "reply" | "like" | "follow"; at: string; who: string; count?: number; text?: string; post_id?: string; post_excerpt?: string };

export async function GET(request: NextRequest) {
  await connection();
  const actor = await getActorId();
  const latestOnly = request.nextUrl.searchParams.get("latest") === "1";
  if (!actor) return NextResponse.json(latestOnly ? { latest_at: null, seen_at: null } : { items: [], seen_at: null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: read, error: rErr } = await sb.from("notification_reads").select("seen_at").eq("user_id", actor).maybeSingle();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  const seen_at: string | null = read?.seen_at ?? null;
  let blocked = new Set<string>();
  try { blocked = (await viewerFilters(sb, actor)).blocked; } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }

  const { data: posts, error: pErr } = await sb.from("community_feed").select("id, content, meal_type, post_type")
    .eq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(200);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  const postIds = (posts || []).map((p: { id: string }) => p.id);
  const excerpt = new Map<string, string>(
    (posts || []).map((p: { id: string; content: string | null; post_type: string }) => [p.id, (p.content || (p.post_type === "meal" ? "식단 공유" : "글")).slice(0, 30)]),
  );

  // 내 답글 (그 아래 달린 답글을 찾으려고)
  const { data: myComments, error: mcErr } = await sb.from("community_feed_comments").select("id")
    .eq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(200);
  if (mcErr) return NextResponse.json({ error: mcErr.message }, { status: 500 });
  const myCommentIds = (myComments || []).map((c: { id: string }) => c.id);

  const [cRes, rRes, lRes, fRes] = await Promise.all([
    postIds.length
      ? sb.from("community_feed_comments").select("id, post_id, user_id, author_nickname, content, created_at")
          .in("post_id", postIds).neq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(30)
      : { data: [] },
    myCommentIds.length
      ? sb.from("community_feed_comments").select("id, post_id, user_id, author_nickname, content, created_at")
          .in("parent_id", myCommentIds).neq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(30)
      : { data: [] },
    postIds.length
      ? sb.from("community_feed_likes").select("post_id, user_id, created_at")
          .in("post_id", postIds).neq("user_id", actor).order("created_at", { ascending: false }).limit(200)
      : { data: [] },
    sb.from("community_follows").select("id, follower_id, created_at").eq("following_id", actor).order("created_at", { ascending: false }).limit(20),
  ]);
  for (const r of [cRes, rRes, lRes, fRes]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });

  const items: Item[] = [];
  const seenComment = new Set<string>();
  for (const c of rRes.data || []) {
    if (blocked.has(c.user_id)) continue;
    seenComment.add(c.id);
    items.push({ id: `r-${c.id}`, type: "reply", at: c.created_at, who: c.author_nickname || "누군가", text: String(c.content || "").slice(0, 60), post_id: c.post_id });
  }
  for (const c of cRes.data || []) {
    if (blocked.has(c.user_id) || seenComment.has(c.id)) continue;
    items.push({ id: `c-${c.id}`, type: "comment", at: c.created_at, who: c.author_nickname || "누군가", text: String(c.content || "").slice(0, 60), post_id: c.post_id, post_excerpt: excerpt.get(c.post_id) });
  }
  // 좋아요는 글마다 하나로 묶는다 (가장 최근 시각 + 사람 수)
  const likeBy = new Map<string, { at: string; count: number }>();
  for (const l of lRes.data || []) {
    if (blocked.has(l.user_id)) continue;
    const cur = likeBy.get(l.post_id);
    if (cur) cur.count += 1; else likeBy.set(l.post_id, { at: l.created_at, count: 1 });
  }
  for (const [post_id, v] of likeBy) items.push({ id: `l-${post_id}-${v.count}`, type: "like", at: v.at, who: "", count: v.count, post_id, post_excerpt: excerpt.get(post_id) });

  // 팔로우한 사람 이름 — 그 사람이 마지막으로 쓴 글·댓글의 이름
  const followers = (fRes.data || []) as { id: string; follower_id: string; created_at: string }[];
  const names = new Map<string, string>();
  if (followers.length) {
    const ids = followers.map((f) => f.follower_id);
    const [fp, fc] = await Promise.all([
      sb.from("community_feed").select("user_id, author_nickname, created_at").in("user_id", ids).order("created_at", { ascending: false }).limit(100),
      sb.from("community_feed_comments").select("user_id, author_nickname, created_at").in("user_id", ids).order("created_at", { ascending: false }).limit(100),
    ]);
    for (const r of [...(fp.data || []), ...(fc.data || [])]) if (r.author_nickname && !names.has(r.user_id)) names.set(r.user_id, r.author_nickname);
  }
  for (const f of followers.filter((x) => !blocked.has(x.follower_id))) items.push({ id: `f-${f.id}`, type: "follow", at: f.created_at, who: names.get(f.follower_id) || "누군가" });

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (latestOnly) return NextResponse.json({ latest_at: items[0]?.at ?? null, seen_at });
  return NextResponse.json({ items: items.slice(0, 40), seen_at });
}

export async function POST() {
  const actor = await getActorId();
  if (!actor) return noActor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const seen_at = new Date().toISOString();
  const { error } = await sb.from("notification_reads").upsert({ user_id: actor, seen_at }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, seen_at });
}
