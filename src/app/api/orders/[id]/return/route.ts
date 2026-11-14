import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { ORDERING_ENABLED } from "@/lib/features";
import { buyerReturnRequest } from "@/lib/orders";
import { limitRequest } from "@/lib/rate-limit";

/**
 * POST /api/orders/{id}/return — {partner_id, type: "return"|"exchange", reason: defect|damaged|wrong|change_mind, note}
 * 주문자 반품·교환 요청 (그 판매 업체 묶음). 배송 완료 뒤 구매확정 전에만. 업체가 답할 때까지 구매확정을 멈춘다
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!ORDERING_ENABLED) return NextResponse.json({ error: "한 번에 주문하기는 준비 중이에요" }, { status: 403 });
  const limited = await limitRequest(req, "report");
  if (limited) return limited;
  const userId = await getActorId();
  if (!userId) return noActor();
  const b = await req.json().catch(() => ({}));
  try {
    const r = await buyerReturnRequest(createServiceRoleClient(), userId, (await params).id, typeof b?.partner_id === "string" ? b.partner_id : "", { type: b?.type, reason: b?.reason, note: b?.note });
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.code === "not_found" ? 404 : r.code === "invalid" ? 400 : 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("반품·교환 요청을 남기지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "요청하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
