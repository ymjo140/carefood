import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { ORDERING_ENABLED } from "@/lib/features";
import { buyerConfirm } from "@/lib/orders";

/**
 * POST /api/orders/{id}/confirm — {partner_id} 주문자 구매확정 (그 판매 업체 묶음). 배송 완료 뒤, 8일이 지나기 전까지.
 * 8일이 지나면 저절로 확정된다. 확정일이 업체 정산 달이 된다 (lib/partner/payout.ts)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!ORDERING_ENABLED) return NextResponse.json({ error: "한 번에 주문하기는 준비 중이에요" }, { status: 403 });
  const userId = await getActorId();
  if (!userId) return noActor();
  const b = await req.json().catch(() => ({}));
  try {
    const r = await buyerConfirm(createServiceRoleClient(), userId, (await params).id, typeof b?.partner_id === "string" ? b.partner_id : "");
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.code === "not_found" ? 404 : 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("구매확정하지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "구매확정하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
