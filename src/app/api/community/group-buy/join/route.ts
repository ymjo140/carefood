import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { GROUP_BUY_ENABLED } from "@/lib/features";

/** POST /api/community/group-buy/join — 공구 참여 */
export async function POST(request: NextRequest) {
  try {
    const { group_buy_id } = await request.json();
    const user_id = await getActorId();
    if (!user_id) return noActor();
    if (!group_buy_id) {
      return NextResponse.json({ error: "group_buy_id 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    // 공구 상태 확인
    const { data: groupBuy } = await sb
      .from("group_buys")
      .select("status, current_count, target_count, expires_at")
      .eq("id", group_buy_id)
      .single();

    if (!groupBuy) return NextResponse.json({ error: "공구를 찾을 수 없습니다" }, { status: 404 });
    if (groupBuy.status !== "recruiting") return NextResponse.json({ error: "모집 중이 아니에요" }, { status: 400 });
    if (groupBuy.expires_at && new Date(groupBuy.expires_at) < new Date()) return NextResponse.json({ error: "마감된 공구예요" }, { status: 400 });

    // 이미 참여했는지
    const { data: existing } = await sb
      .from("group_buy_participants")
      .select("id")
      .eq("group_buy_id", group_buy_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing) return NextResponse.json({ error: GROUP_BUY_ENABLED ? "이미 참여했어요" : "이미 관심 표시했어요", already: true }, { status: 400 });

    // 참여
    const { error: insErr } = await sb.from("group_buy_participants").insert({ group_buy_id, user_id });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // 카운트 증가
    const newCount = (groupBuy.current_count || 0) + 1;
    const updates: Record<string, unknown> = { current_count: newCount, updated_at: new Date().toISOString() };

    // 목표 달성 체크 — 판매(결제·배송)를 열기 전엔 관심 수만 센다 (src/lib/features.ts)
    if (GROUP_BUY_ENABLED && newCount >= groupBuy.target_count) {
      updates.status = "achieved";
      updates.achieved_at = new Date().toISOString();
    }

    await sb.from("group_buys").update(updates).eq("id", group_buy_id);

    return NextResponse.json({
      ok: true,
      current_count: newCount,
      achieved: GROUP_BUY_ENABLED && newCount >= groupBuy.target_count,
    });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

/** DELETE /api/community/group-buy/join — 관심 거두기 (판매가 열린 뒤 달성된 공구는 거둘 수 없음) */
export async function DELETE(request: NextRequest) {
  try {
    const { group_buy_id } = await request.json();
    const user_id = await getActorId();
    if (!user_id) return noActor();
    if (!group_buy_id) return NextResponse.json({ error: "group_buy_id 필수" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;
    const { data: groupBuy } = await sb.from("group_buys").select("status, current_count").eq("id", group_buy_id).single();
    if (!groupBuy) return NextResponse.json({ error: "공구를 찾을 수 없어요" }, { status: 404 });
    if (groupBuy.status !== "recruiting") return NextResponse.json({ error: "모집이 끝나 거둘 수 없어요" }, { status: 400 });

    const { data: removed, error } = await sb.from("group_buy_participants").delete()
      .eq("group_buy_id", group_buy_id).eq("user_id", user_id).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!removed?.length) return NextResponse.json({ ok: true, current_count: groupBuy.current_count });

    const newCount = Math.max(0, (groupBuy.current_count || 0) - 1);
    const { error: uErr } = await sb.from("group_buys").update({ current_count: newCount, updated_at: new Date().toISOString() }).eq("id", group_buy_id);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, current_count: newCount });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
