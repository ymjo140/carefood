import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** POST /api/community/group-buy/join — 공구 참여 */
export async function POST(request: NextRequest) {
  try {
    const { user_id, group_buy_id } = await request.json();
    if (!user_id || !group_buy_id) {
      return NextResponse.json({ error: "user_id, group_buy_id 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    // 공구 상태 확인
    const { data: groupBuy } = await sb
      .from("group_buys")
      .select("status, current_count, target_count")
      .eq("id", group_buy_id)
      .single();

    if (!groupBuy) return NextResponse.json({ error: "공구를 찾을 수 없습니다" }, { status: 404 });
    if (groupBuy.status !== "recruiting") return NextResponse.json({ error: "모집 중이 아닙니다" }, { status: 400 });

    // 이미 참여했는지
    const { data: existing } = await sb
      .from("group_buy_participants")
      .select("id")
      .eq("group_buy_id", group_buy_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing) return NextResponse.json({ error: "이미 참여 중입니다" }, { status: 400 });

    // 참여
    await sb.from("group_buy_participants").insert({ group_buy_id, user_id });

    // 카운트 증가
    const newCount = (groupBuy.current_count || 0) + 1;
    const updates: Record<string, unknown> = { current_count: newCount, updated_at: new Date().toISOString() };

    // 목표 달성 체크
    if (newCount >= groupBuy.target_count) {
      updates.status = "achieved";
      updates.achieved_at = new Date().toISOString();
    }

    await sb.from("group_buys").update(updates).eq("id", group_buy_id);

    return NextResponse.json({
      ok: true,
      current_count: newCount,
      achieved: newCount >= groupBuy.target_count,
    });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
