import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { ORDERING_ENABLED } from "@/lib/features";
import { buyerCancel } from "@/lib/orders";

/**
 * POST /api/orders/{id}/cancel — {partner_id?, reason?} 주문자 취소 (lib/orders.ts buyerCancel)
 *   결제 전: 주문 전체 취소 · 업체 접수 전: 그 업체 묶음 바로 취소 · 접수 뒤: 취소 요청 · 발송 뒤: 409
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!ORDERING_ENABLED) return NextResponse.json({ error: "한 번에 주문하기는 준비 중이에요" }, { status: 403 });
  const userId = await getActorId();
  if (!userId) return noActor();
  const b = await req.json().catch(() => ({}));
  try {
    const r = await buyerCancel(createServiceRoleClient(), userId, (await params).id, typeof b?.partner_id === "string" ? b.partner_id : null, String(b?.reason ?? ""));
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.code === "not_found" ? 404 : r.code === "conflict" ? 409 : 400 });
    return NextResponse.json({ result: r.result });
  } catch (e) {
    console.error("주문을 취소하지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "취소하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
