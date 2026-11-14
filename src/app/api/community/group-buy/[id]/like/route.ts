import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";

/** POST /api/community/group-buy/[id]/like — 좋아요 켜고 끄기 → { liked, like_count } (DB 함수 group_buy_like) */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getActorId();
  if (!user) return noActor();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const limited = await rateLimit(sb, request, user, "like");
    if (limited) return limited;
    const { data: gb, error: gErr } = await sb.from("group_buys").select("id").eq("id", id).maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!gb) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });
    const { data, error } = await sb.rpc("group_buy_like", { p_id: id, p_user: user });
    if (error) throw new Error(error.message);
    return NextResponse.json({ liked: !!data.liked, like_count: data.like_count || 0 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
