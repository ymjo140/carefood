import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { listPartnerOrders, updateFulfilment } from "@/lib/partner/orders";

/** GET /api/partner/orders[?as=slug&status=new] — 앱에서 들어온 주문 (결제가 끝난 것만) */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  try { return NextResponse.json({ orders: await listPartnerOrders(createServiceRoleClient(), ctx.partner.id, { status: sp.get("status") }) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** POST /api/partner/orders[?as=slug] — {order_id, status: accepted|shipped|delivered|canceled, carrier?, tracking_number?, reason?} */
export async function POST(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const b = await req.json().catch(() => null);
  try {
    const r = await updateFulfilment(createServiceRoleClient(), ctx.partner, String(b?.order_id || ""), b || { status: null });
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.code === "not_found" ? 404 : r.code === "conflict" ? 409 : 400 });
    return NextResponse.json({ order: r.order });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
