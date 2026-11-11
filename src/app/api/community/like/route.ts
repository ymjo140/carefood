import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { syncCount } from "@/lib/community-counts";
import { rateLimit } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/community/like — 좋아요 토글 { post_id } → { liked, like_count }
 * 숫자는 실제 좋아요 기록을 세어 맞춘다 (lib/community-counts.ts). 같은 사람 중복은 (post_id, user_id) 고유 제약이 막는다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user_id = await getActorId();
    if (!user_id) return noActor();
    const post_id = body.post_id || body.plan_id; // 호환
    if (typeof post_id !== "string" || !UUID.test(post_id)) return NextResponse.json({ error: "post_id 필수" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;
    const limited = await rateLimit(sb, request, user_id, "like");
    if (limited) return limited;

    const { data: existing, error: eErr } = await sb.from("community_feed_likes").select("id").eq("post_id", post_id).eq("user_id", user_id).maybeSingle();
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

    let liked: boolean;
    if (existing) {
      const { error } = await sb.from("community_feed_likes").delete().eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      liked = false;
    } else {
      const { error } = await sb.from("community_feed_likes").insert({ post_id, user_id });
      // 23505: 동시에 두 번 눌러 이미 들어가 있다 — 좋아요 상태 그대로
      if (error && error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });
      liked = true;
    }
    const like_count = await syncCount(sb, post_id, "like_count");
    return NextResponse.json({ liked, like_count });
  } catch {
    return NextResponse.json({ error: "좋아요를 남기지 못했어요" }, { status: 500 });
  }
}
