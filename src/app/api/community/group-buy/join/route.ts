import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { GROUP_BUY_ENABLED } from "@/lib/features";

/**
 * POST   /api/community/group-buy/join — 관심 표시(판매가 열리면 참여) { group_buy_id }
 * DELETE /api/community/group-buy/join — 거두기
 * 수 세기·목표 도달(reached_at)은 DB 함수 group_buy_mark 가 공구 줄을 잠그고 한 번에 한다 (동시에 눌러도 어긋나지 않게).
 * 응답: { ok, current_count, reached }
 */
const ERR: Record<string, [string, number]> = {
  missing: ["공구를 찾지 못했어요", 404],
  closed: ["모집이 끝난 공구예요", 400],
  expired: ["마감된 공구예요", 400],
  already: [GROUP_BUY_ENABLED ? "이미 참여했어요" : "이미 알림을 받고 있어요", 400],
};

async function mark(request: NextRequest, on: boolean) {
  const user = await getActorId();
  if (!user) return noActor();
  const body = await request.json().catch(() => ({}));
  const id = typeof body.group_buy_id === "string" && /^[0-9a-f-]{36}$/i.test(body.group_buy_id) ? body.group_buy_id : null;
  if (!id) return NextResponse.json({ error: "공구를 골라 주세요" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data, error } = await sb.rpc("group_buy_mark", { p_id: id, p_user: user, p_on: on, p_sales_open: GROUP_BUY_ENABLED });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data.ok) {
    const [msg, status] = ERR[data.error] || ["처리하지 못했어요", 400];
    return NextResponse.json({ error: msg, already: data.error === "already", current_count: data.current_count }, { status });
  }
  return NextResponse.json({ ok: true, current_count: data.current_count, reached: !!data.reached });
}

export const POST = (request: NextRequest) => mark(request, true);
export const DELETE = (request: NextRequest) => mark(request, false);
