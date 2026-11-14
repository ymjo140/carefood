import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { countPartnerOrders, listPartnerOrders, updateFulfilment } from "@/lib/partner/orders";
import { trackingReady } from "@/lib/partner/tracking";

/**
 * GET /api/partner/orders?status=new|accepted|shipped|done[&page=0][&as=slug] — 앱에서 들어온 주문 (결제가 끝난 것만)
 * 상태로 서버에서 거르고(처리할 주문은 오래된 것부터), counts 는 상태별 묶음 수·취소 요청·늦은 주문. read_only: 관리자 보기
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient();
  const status = sp.get("status") || "new";
  const page = Math.max(0, Number(sp.get("page")) || 0);
  try {
    const [orders, counts] = await Promise.all([
      listPartnerOrders(sb, ctx.partner.id, { status, page }),
      countPartnerOrders(sb, ctx.partner.id),
    ]);
    return NextResponse.json({ orders, counts, page, has_more: status === "done" && orders.length === 50, read_only: !canAct(ctx), tracking_auto: trackingReady() });
  }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** POST /api/partner/orders[?as=slug] — {order_id, status: accepted|shipped|delivered|canceled, carrier?, tracking_number?, reason?} */
export async function POST(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const b = await req.json().catch(() => null);
  try {
    const r = await updateFulfilment(createServiceRoleClient(), ctx.partner, String(b?.order_id || ""), b || { status: null });
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.code === "not_found" ? 404 : r.code === "conflict" ? 409 : 400 });
    return NextResponse.json({ order: r.order });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
