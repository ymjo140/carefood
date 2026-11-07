import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";

/**
 * GET /api/notifications — 내 소식 (따로 저장하지 않고 커뮤니티 기록에서 만든다)
 *   - 내 글에 남긴 댓글 (다른 사람)
 *   - 내 글의 좋아요 (글마다 묶어서)
 *   - 나를 팔로우함
 * ?latest=1 이면 가장 최근 소식 시각만 (머리 줄의 새 소식 점)
 * 읽음 표시는 기기마다 따로 둔다 (마지막으로 알림 화면을 연 시각)
 */
type Item = { id: string; type: "comment" | "like" | "follow"; at: string; who: string; count?: number; text?: string; post_id?: string; post_excerpt?: string };

export async function GET(request: NextRequest) {
  await connection();
  const actor = await getActorId();
  const latestOnly = request.nextUrl.searchParams.get("latest") === "1";
  if (!actor) return NextResponse.json(latestOnly ? { latest_at: null } : { items: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const { data: posts, error: pErr } = await sb.from("community_feed").select("id, content, meal_type, post_type")
    .eq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(200);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  const postIds = (posts || []).map((p: { id: string }) => p.id);
  const excerpt = new Map<string, string>(
    (posts || []).map((p: { id: string; content: string | null; post_type: string }) => [p.id, (p.content || (p.post_type === "meal" ? "식단 공유" : "글")).slice(0, 30)]),
  );

  const [cRes, lRes, fRes] = await Promise.all([
    postIds.length
      ? sb.from("community_feed_comments").select("id, post_id, user_id, author_nickname, content, created_at")
          .in("post_id", postIds).neq("user_id", actor).order("created_at", { ascending: false }).limit(30)
      : { data: [] },
    postIds.length
      ? sb.from("community_feed_likes").select("post_id, user_id, created_at")
          .in("post_id", postIds).neq("user_id", actor).order("created_at", { ascending: false }).limit(200)
      : { data: [] },
    sb.from("community_follows").select("id, follower_id, created_at").eq("following_id", actor).order("created_at", { ascending: false }).limit(20),
  ]);
  for (const r of [cRes, lRes, fRes]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });

  const items: Item[] = [];
  for (const c of cRes.data || []) {
    items.push({ id: `c-${c.id}`, type: "comment", at: c.created_at, who: c.author_nickname || "누군가", text: String(c.content || "").slice(0, 60), post_id: c.post_id, post_excerpt: excerpt.get(c.post_id) });
  }
  // 좋아요는 글마다 하나로 묶는다 (가장 최근 시각 + 사람 수)
  const likeBy = new Map<string, { at: string; count: number }>();
  for (const l of lRes.data || []) {
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
  for (const f of followers) items.push({ id: `f-${f.id}`, type: "follow", at: f.created_at, who: names.get(f.follower_id) || "누군가" });

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (latestOnly) return NextResponse.json({ latest_at: items[0]?.at ?? null });
  return NextResponse.json({ items: items.slice(0, 40) });
}
