import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { ORDERING_ENABLED } from "@/lib/features";
import { buyerAsk } from "@/lib/partner/inquiries";
import { limitRequest } from "@/lib/rate-limit";

/**
 * POST /api/orders/{id}/inquiry — {partner_id, kind: shipping|product|return|other, body}
 * 주문자가 판매 업체 묶음에 묻는다 (결제한 주문만, 답을 기다리는 문의는 묶음마다 3개까지). 업체는 업체 화면 주문 > 문의에서 답한다
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!ORDERING_ENABLED) return NextResponse.json({ error: "한 번에 주문하기는 준비 중이에요" }, { status: 403 });
  const limited = await limitRequest(req, "report");
  if (limited) return limited;
  const userId = await getActorId();
  if (!userId) return noActor();
  const b = await req.json().catch(() => ({}));
  try {
    const r = await buyerAsk(createServiceRoleClient(), userId, (await params).id, typeof b?.partner_id === "string" ? b.partner_id : "", { kind: b?.kind, body: b?.body });
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.code === "not_found" ? 404 : r.code === "invalid" ? 400 : 409 });
    return NextResponse.json({ inquiry: r.inquiry });
  } catch (e) {
    console.error("문의를 남기지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "문의를 남기지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
