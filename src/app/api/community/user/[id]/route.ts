import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";

/**
 * GET /api/community/user/[id] — 작성자 프로필 머리
 * { nickname, post_count, plan_count, follower_count, following_count, copied_count, credit_count, pending_tags?, is_me, is_following, blocked }
 * credit_count: 이 사람 글을 따라 한 글 + 이 사람을 태그한 글(보이는 것) — 프로필 '따라 한 인증'. pending_tags 는 내 프로필일 때만(승인 기다림)
 * 글 수에 리그램(스토리에 올린 남의 글)은 넣지 않는다
 * 건강 관심사·나이대는 내보내지 않는다 (글에 붙이지도 않음). 공개 글에서 나온 숫자만.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return NextResponse.json({ error: "사람을 찾을 수 없어요" }, { status: 404 });
  const viewer = await getActorId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const [posts, plans, followers, following, last, lastC, myFollow, myBlock, closed] = await Promise.all([
    sb.from("community_feed").select("id, copy_count", { count: "exact" }).eq("user_id", id).eq("is_active", true).eq("hidden_by_reports", false).is("regram_of", null).limit(1000),
    sb.from("community_feed").select("id", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true).eq("hidden_by_reports", false).is("regram_of", null).not("meal_data->plan", "is", null),
    sb.from("community_follows").select("id", { count: "exact", head: true }).eq("following_id", id),
    sb.from("community_follows").select("id", { count: "exact", head: true }).eq("follower_id", id),
    sb.from("community_feed").select("author_nickname, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(1),
    sb.from("community_feed_comments").select("author_nickname, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(1),
    viewer ? sb.from("community_follows").select("id").eq("follower_id", viewer).eq("following_id", id).maybeSingle() : { data: null },
    viewer ? sb.from("community_blocks").select("blocked_id").eq("blocker_id", viewer).eq("blocked_id", id).maybeSingle() : { data: null },
    // 팔로워만 글 수 — 팔로워가 아닌 사람에게는 빼고 센다 (목록과 같은 수)
    sb.from("community_feed").select("id", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true).eq("hidden_by_reports", false).is("regram_of", null).eq("visibility", "followers"),
  ]);
  for (const r of [posts, plans, followers, following, last, lastC, closed]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  const seesAll = !!viewer && (viewer === id || !!myFollow.data);

  // 따라 한 인증 — 원본으로 단 글 + 태그한 글 (같은 글은 한 번)
  const ownIds = ((posts.data || []) as { id: string }[]).map((p) => p.id).slice(0, 300);
  const [src, tagged, pend] = await Promise.all([
    ownIds.length
      ? sb.from("community_feed").select("id").in("source_post_id", ownIds).neq("user_id", id).eq("is_active", true).eq("hidden_by_reports", false).limit(1000)
      : { data: [], error: null },
    sb.from("community_post_people").select("post_id, community_feed!inner(is_active, hidden_by_reports)").eq("tagged_id", id).eq("status", "shown")
      .eq("community_feed.is_active", true).eq("community_feed.hidden_by_reports", false).limit(1000),
    viewer === id ? sb.from("community_post_people").select("id", { count: "exact", head: true }).eq("tagged_id", id).eq("status", "pending") : { count: null, error: null },
  ]);
  for (const r of [src, tagged, pend]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  const credits = new Set<string>([...((src.data || []) as { id: string }[]).map((r) => r.id), ...((tagged.data || []) as { post_id: string }[]).map((r) => r.post_id)]);

  // 이름 — 서버에 둔 이름, 없으면 가장 최근 글·답글의 이름
  const { data: prof } = await sb.from("community_profiles").select("nickname").eq("actor_id", id).maybeSingle();
  const cands = [...(last.data || []), ...(lastC.data || [])] as { author_nickname: string; created_at: string }[];
  cands.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (!cands.length) return NextResponse.json({ error: "아직 글이나 답글이 없는 사람이에요" }, { status: 404 });

  return NextResponse.json({
    user_id: id,
    nickname: prof?.nickname || cands[0].author_nickname || "이름 없음",
    post_count: Math.max(0, (posts.count || 0) - (seesAll ? 0 : closed.count || 0)),
    plan_count: plans.count || 0,
    follower_count: followers.count || 0,
    following_count: following.count || 0,
    copied_count: (posts.data || []).reduce((s: number, p: { copy_count: number | null }) => s + (p.copy_count || 0), 0),
    credit_count: credits.size,
    ...(viewer === id ? { pending_tags: pend.count || 0 } : {}),
    is_me: !!viewer && viewer === id,
    is_following: !!myFollow.data,
    blocked: !!myBlock.data,
  });
}
