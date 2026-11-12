import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ORDERING_ENABLED } from "@/lib/features";
import { partnerOffersFor } from "@/lib/partner/orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/orders/quote — {product_ids[]} → 한 번에 주문할 수 있는 제품의 판매 업체와 값 (입점 업체가 지금 팔고 있는 것만) */
export async function POST(request: NextRequest) {
  if (!ORDERING_ENABLED) return NextResponse.json({ error: "한 번에 주문하기는 준비 중이에요" }, { status: 403 });
  const b = await request.json().catch(() => null);
  const ids = [...new Set((Array.isArray(b?.product_ids) ? b.product_ids : []).filter((x: unknown): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 100) as string[];
  try {
    const offers = await partnerOffersFor(createServiceRoleClient(), ids);
    return NextResponse.json({ sellers: Object.fromEntries([...offers].map(([id, o]) => [id, { seller: o.name, slug: o.slug, price: o.price }])) });
  } catch (e) {
    console.error("주문 견적을 내지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "주문할 수 있는 제품을 확인하지 못했어요" }, { status: 500 });
  }
}
