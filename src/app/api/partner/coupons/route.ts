import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { COUPON_COLS, couponStats, couponText, parseCoupon, type Coupon } from "@/lib/partner/coupons";
import { notReady } from "@/lib/partner/crm";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** GET /api/partner/coupons[?as=slug] — 내 쿠폰과 준 수·쓴 수·할인한 금액 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient() as Sb;
  const { data, error } = await sb.from("partner_coupons").select(COUPON_COLS).eq("partner_id", ctx.partner.id).order("created_at", { ascending: false }).limit(50);
  if (error) {
    if (notReady(error)) return NextResponse.json({ ready: false, coupons: [], read_only: !canAct(ctx) });
    return NextResponse.json({ error: "쿠폰을 불러오지 못했어요" }, { status: 500 });
  }
  try {
    const stats = await couponStats(sb, ctx.partner.id);
    return NextResponse.json({
      ready: true, read_only: !canAct(ctx),
      coupons: ((data || []) as Coupon[]).map((c) => ({ ...c, text: couponText(c), ...(stats.get(c.id) || { granted: 0, used: 0, discount: 0 }) })),
    });
  } catch (e) {
    console.error("쿠폰 숫자를 세지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "쿠폰을 불러오지 못했어요" }, { status: 500 });
  }
}

/** POST /api/partner/coupons[?as=slug] — {name, kind, value, max_discount?, min_order, valid_days} 새 쿠폰 */
export async function POST(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const p = parseCoupon((await req.json().catch(() => ({}))) || {});
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
  const { data, error } = await (createServiceRoleClient() as Sb).from("partner_coupons")
    .insert({ ...p.coupon, partner_id: ctx.partner.id, created_by: ctx.userId }).select(COUPON_COLS).single();
  if (error) {
    console.error("쿠폰을 만들지 못했어요:", error.message);
    return NextResponse.json({ error: "쿠폰을 만들지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
  return NextResponse.json({ coupon: { ...data, text: couponText(data), granted: 0, used: 0, discount: 0 } });
}
