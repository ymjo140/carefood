import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** POST /api/community/follow — 팔로우 토글 */
export async function POST(request: NextRequest) {
  try {
    const { follower_id, following_id } = await request.json();
    if (!follower_id || !following_id) return NextResponse.json({ error: "follower_id, following_id 필수" }, { status: 400 });
    if (follower_id === following_id) return NextResponse.json({ error: "자기 자신은 팔로우 불가" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    const { data: existing } = await sb
      .from("community_follows")
      .select("id")
      .eq("follower_id", follower_id)
      .eq("following_id", following_id)
      .maybeSingle();

    if (existing) {
      await sb.from("community_follows").delete().eq("id", existing.id);
      return NextResponse.json({ following: false });
    } else {
      await sb.from("community_follows").insert({ follower_id, following_id });
      return NextResponse.json({ following: true });
    }
  } catch {
    return NextResponse.json({ error: "팔로우 처리 실패" }, { status: 500 });
  }
}
