import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

/**
 * POST /api/session/claim { legacy_id } — 예전 익명 ID(브라우저 저장소)의 기록을 지금 쿠키 주인에게 옮긴다.
 * 서버 신원 확인 이전에 쓰던 anon_… ID 를 가진 기기가 처음 접속할 때 한 번만.
 * 한 ID 는 한 번만 옮길 수 있고(먼저 온 기기), CLAIM_UNTIL 이후에는 받지 않는다.
 */
const CLAIM_UNTIL = Date.parse("2027-01-31T15:00:00Z"); // 2027-02-01 00:00 KST
const LEGACY = /^anon_\d{10,14}_[a-z0-9]{1,10}$/;

export async function POST(request: NextRequest) {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  if (Date.now() > CLAIM_UNTIL) return NextResponse.json({ moved: 0, closed: true });

  const { legacy_id } = await request.json().catch(() => ({}));
  if (typeof legacy_id !== "string" || !LEGACY.test(legacy_id)) return NextResponse.json({ error: "옮길 수 없는 ID예요" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  // 공개 화면(글·댓글·리뷰·공구·팔로우)에 드러난 ID 는 남이 보고 가져갈 수 있어 옮기지 않는다
  const PUBLIC: [string, string][] = [
    ["community_feed", "user_id"], ["community_feed_comments", "user_id"], ["product_reviews", "user_id"],
    ["group_buys", "creator_id"], ["meal_plan_comments", "user_id"], ["shared_meal_plans", "user_id"], ["community_follows", "following_id"],
  ];
  const seen = await Promise.all(PUBLIC.map(([t, c]) => sb.from(t).select(c, { count: "exact", head: true }).eq(c, legacy_id)));
  if (seen.some((r: { error: unknown }) => r.error)) return NextResponse.json({ error: "확인하지 못했어요" }, { status: 500 });
  if (seen.some((r: { count: number | null }) => (r.count || 0) > 0)) return NextResponse.json({ moved: 0, public: true });

  // 먼저 기록을 남겨 같은 ID 를 두 번 옮기지 못하게 (기본 키)
  const { error: claimErr } = await sb.from("actor_claims").insert({ legacy_id, actor_id: actor });
  if (claimErr) {
    if (claimErr.code === "23505") return NextResponse.json({ moved: 0, already: true });
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  const { data: moved, error } = await sb.rpc("merge_actor", { from_id: legacy_id, to_id: actor });
  if (error) {
    await sb.from("actor_claims").delete().eq("legacy_id", legacy_id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await sb.from("actor_claims").update({ moved: moved || 0 }).eq("legacy_id", legacy_id);
  return NextResponse.json({ moved: moved || 0 });
}
