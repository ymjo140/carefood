import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ORDERING_ENABLED } from "@/lib/features";
import { sellerShipping } from "@/lib/order-status";
import { partnerOffersFor } from "@/lib/partner/orders";
import { getActorId } from "@/lib/actor-server";
import { bestCoupons } from "@/lib/partner/coupons";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/orders/quote — {product_ids[]} (같은 제품을 두 번 담았으면 두 번) →
 *   sellers: 제품마다 판매 업체와 값 (입점 업체가 지금 팔고 있는 것만)
 *   shipping: 판매 업체마다 배송비·상품 금액·무료배송 기준 — 주문할 때 서버가 같은 식으로 다시 계산한다
 *   coupons: 판매 업체마다 저절로 쓰일 쿠폰 {name, discount} — 주문할 때 다시 고른다 (그새 쓰거나 끝났을 수 있다)
 */
export async function POST(request: NextRequest) {
  if (!ORDERING_ENABLED) return NextResponse.json({ error: "한 번에 주문하기는 준비 중이에요" }, { status: 403 });
  const b = await request.json().catch(() => null);
  const list = (Array.isArray(b?.product_ids) ? b.product_ids : []).filter((x: unknown): x is string => typeof x === "string" && UUID.test(x)).slice(0, 60) as string[];
  try {
    const sb = createServiceRoleClient();
    const offers = await partnerOffersFor(sb, [...new Set(list)]);
    const lines = new Map<string, { price: number; quantity: number; shipping_fee: number | null; free_shipping_over: number | null }[]>();
    const pidOf = new Map<string, string>();
    for (const id of list) {
      const o = offers.get(id);
      if (!o) continue;
      pidOf.set(o.slug, o.partner_id);
      (lines.get(o.slug) || lines.set(o.slug, []).get(o.slug)!).push({ price: o.price, quantity: 1, shipping_fee: o.shipping_fee, free_shipping_over: o.free_shipping_over });
    }
    const shipping = Object.fromEntries([...lines].map(([slug, l]) => [slug, sellerShipping(l)]));
    const coupons: Record<string, { name: string; discount: number }> = {};
    const user = await getActorId();
    if (user) {
      const best = await bestCoupons(sb, user, new Map([...lines.keys()].map((slug) => [pidOf.get(slug)!, { subtotal: shipping[slug].subtotal, fee: shipping[slug].fee }])));
      for (const [slug, pid] of pidOf) { const c = best.get(pid); if (c) coupons[slug] = { name: c.name, discount: c.discount }; }
    }
    return NextResponse.json({
      sellers: Object.fromEntries([...offers].map(([id, o]) => [id, { seller: o.name, slug: o.slug, price: o.price }])),
      shipping, coupons,
    });
  } catch (e) {
    console.error("주문 견적을 내지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "주문할 수 있는 제품을 확인하지 못했어요" }, { status: 500 });
  }
}
