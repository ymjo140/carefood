import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import { enrichGroupBuys, type GroupBuyRow } from "@/lib/group-buy-server";

/**
 * GET /api/community/group-buy/[id] — 공구 하나 (숏폼 보기 화면)
 *   응답: group_buy (+ 지금 최저가·대표 사진·진행자 이름·진행자 기록 횟수·단백질·열량·좋아요·질문 수), marked(알림 받는지), liked, is_host
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const actor = await getActorId();

  const { data: row, error } = await sb.from("group_buys").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });

  let marked = false, liked = false;
  if (actor) {
    const [m, l] = await Promise.all([
      sb.from("group_buy_participants").select("id").eq("group_buy_id", id).eq("user_id", actor).maybeSingle(),
      sb.from("group_buy_likes").select("user_id").eq("group_buy_id", id).eq("user_id", actor).maybeSingle(),
    ]);
    if (m.error || l.error) return NextResponse.json({ error: (m.error || l.error).message }, { status: 500 });
    marked = !!m.data; liked = !!l.data;
  }

  let gb;
  try { [gb] = await enrichGroupBuys(sb, [row as GroupBuyRow]); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const { creator_id, ...rest } = gb;
  return NextResponse.json({ group_buy: { ...rest, is_host: !!actor && creator_id === actor }, marked, liked });
}
