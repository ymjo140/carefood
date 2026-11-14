import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { updateReturn } from "@/lib/partner/orders";

/**
 * POST /api/partner/orders/return[?as=slug] — {order_id, action: approve|reject|returned|exchanged, reply?, fee?, carrier?, tracking_number?}
 * 반품·교환 처리 (lib/partner/orders.ts updateReturn). 관리자 보기는 읽기 전용
 */
export async function POST(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const b = await req.json().catch(() => null);
  try {
    const r = await updateReturn(createServiceRoleClient(), ctx.partner, String(b?.order_id || ""), b || { action: null });
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.code === "not_found" ? 404 : r.code === "conflict" ? 409 : 400 });
    return NextResponse.json({ order: r.order });
  } catch (e) {
    console.error("반품·교환을 처리하지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "처리하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
