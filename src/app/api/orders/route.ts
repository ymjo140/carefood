import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { ORDERING_ENABLED } from "@/lib/features";
import { isDay } from "@/lib/day";
import { parseShipping, sellerShipping } from "@/lib/order-status";
import { partnerOffersFor } from "@/lib/partner/orders";
import { listMyOrders, releaseOrderCoupons } from "@/lib/orders";
import { bestCoupons, spendCoupon } from "@/lib/partner/coupons";

/**
 * POST /api/orders — 식단 리스트 → 한 번에 주문
 *
 * 주문할 수 있는 것은 입점 업체가 지금 팔고 있는 제품뿐이다 (lib/partner/orders.ts). 값은 그 업체의 판매가를 서버에서 다시 읽는다.
 * 그 밖의 제품(시판·크롤링 가격)은 주문에 넣지 않고 건너뛴 수만 돌려준다 — 장보기 목록에서 몰마다 따로 산다.
 * 받는 분 정보와 제3자 제공 동의 시각을 주문에 적고, 결제가 끝나면(paid_at) 업체 화면·API 에 보인다.
 * 업체 쿠폰: 업체 묶음마다 쓸 수 있는 것 중 할인이 가장 큰 하나를 저절로 쓴다 (lib/partner/coupons.ts). 업체 부담이라 discount_fees 에 업체별로 적는다.
 * 결제하지 않고 30분이 지난 내 주문에 묶인 쿠폰은 새 주문 전에 돌려준다.
 *
 * GET /api/orders — 내 주문 내역 (판매 업체별 묶음·배송 상태·환불, lib/orders.ts)
 *
 * 통합 주문은 사업자 등록·PG 연결 후 NEXT_PUBLIC_ORDERING_ENABLED=1 로 연다 (그 전엔 POST 403)
 */
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MEALS = ["breakfast", "lunch", "dinner", "snack"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  await connection();
  if (!ORDERING_ENABLED) return NextResponse.json({ error: "한 번에 주문하기는 준비 중이에요" }, { status: 403 });
  const user_id = await getActorId();
  if (!user_id) return noActor();
  const body = await request.json().catch(() => null);
  const items = (Array.isArray(body?.items) ? body.items.slice(0, 60) : []) as { product_id?: unknown; day_of_week?: unknown; meal_type?: unknown; quantity?: unknown }[];
  if (items.length === 0) return NextResponse.json({ error: "주문할 식단이 없어요" }, { status: 400 });
  const parsed = parseShipping(body?.shipping);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (body?.third_party_consent !== true) return NextResponse.json({ error: "배송을 위해 판매 업체에 받는 분 정보를 전달하는 데 동의해야 주문할 수 있어요" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const ids = [...new Set(items.map((it) => it.product_id).filter((x): x is string => typeof x === "string" && UUID.test(x)))];
    const offers = await partnerOffersFor(sb, ids);
    const { data: products, error: pErr } = await sb.from("products").select("id, name, calories, protein_g").in("id", [...offers.keys()]);
    if (pErr) throw new Error(pErr.message);
    const nameOf = new Map<string, { name: string; calories: number | null; protein_g: number | null }>((products || []).map((p: { id: string }) => [p.id, p]));

    const rows = items.flatMap((it) => {
      const offer = typeof it.product_id === "string" ? offers.get(it.product_id) : undefined;
      if (!offer || !DAYS.includes(String(it.day_of_week)) || !MEALS.includes(String(it.meal_type))) return [];
      const prod = nameOf.get(it.product_id as string);
      return [{
        product_id: it.product_id as string, day_of_week: String(it.day_of_week), meal_type: String(it.meal_type),
        product_name: prod?.name || "제품", service: offer.slug, quantity: Math.min(Math.max(Math.floor(Number(it.quantity)) || 1, 1), 20),
        unit_price: offer.price, calories: prod?.calories ?? null, protein_g: prod?.protein_g ?? null,
        partner_id: offer.partner_id, partner_sku: offer.partner_sku,
      }];
    });
    if (rows.length === 0) return NextResponse.json({ error: "지금 한 번에 주문할 수 있는 제품이 없어요" }, { status: 400 });
    const total = rows.reduce((s, r) => s + r.unit_price * r.quantity, 0);
    // 판매 업체마다 배송비 한 번 (lib/order-status.ts sellerShipping)
    const shipping_fees: Record<string, number> = {};
    for (const pid of new Set(rows.map((r) => r.partner_id))) {
      shipping_fees[pid] = sellerShipping(rows.filter((r) => r.partner_id === pid).map((r) => {
        const o = offers.get(r.product_id)!;
        return { price: r.unit_price, quantity: r.quantity, shipping_fee: o.shipping_fee, free_shipping_over: o.free_shipping_over };
      })).fee;
    }
    const shipping_fee = Object.values(shipping_fees).reduce((s, v) => s + v, 0);

    // 결제하지 않은 채 30분이 지난 내 주문에 묶인 쿠폰을 먼저 돌려준다
    // 그 주문의 할인도 같이 지운다 — 나중에 그 주문을 결제하더라도 쿠폰 없이 할인받지 않게
    const { data: stale, error: sErr } = await sb.from("orders").select("id, total_price, shipping_fee, discount_amount").eq("user_id", user_id).is("paid_at", null).neq("status", "cancelled")
      .gt("discount_amount", 0).lt("created_at", new Date(Date.now() - 30 * 60e3).toISOString()).limit(20);
    if (sErr) throw new Error(sErr.message);
    for (const o of (stale || []) as { id: string; total_price: number; shipping_fee: number }[]) {
      const { error: zErr } = await sb.from("orders").update({ discount_amount: 0, discount_fees: {}, final_price: (o.total_price || 0) + (o.shipping_fee || 0) })
        .eq("id", o.id).is("paid_at", null);
      if (zErr) throw new Error(zErr.message);
      await releaseOrderCoupons(sb, o.id);
    }
    const bundles = new Map<string, { subtotal: number; fee: number }>();
    for (const pid of Object.keys(shipping_fees)) bundles.set(pid, { subtotal: rows.filter((r) => r.partner_id === pid).reduce((s, r) => s + r.unit_price * r.quantity, 0), fee: shipping_fees[pid] });
    const best = await bestCoupons(sb, user_id, bundles);
    const discount_fees: Record<string, number> = Object.fromEntries([...best].map(([pid, c]) => [pid, c.discount]));
    const discount = Object.values(discount_fees).reduce((s, v) => s + v, 0);

    const { data: order, error: oErr } = await sb.from("orders").insert({
      user_id, status: "pending", total_items: rows.length, total_price: total, shipping_fee, shipping_fees,
      discount_amount: discount, discount_fees, final_price: total + shipping_fee - discount,
      delivery_week_start: isDay(body.delivery_week_start) ? body.delivery_week_start : null,
      delivery_preference: { note: parsed.shipping.note }, weekly_box_snapshot: items,
      shipping: parsed.shipping, third_party_consent_at: new Date().toISOString(),
    }).select("id, status, total_items").single();
    if (oErr) throw new Error(oErr.message);

    const { error: iErr } = await sb.from("order_items").insert(rows.map((r) => ({ order_id: order.id, ...r })));
    if (iErr) {
      // 상품 없는 주문이 남지 않게 지운다
      const { error: undoErr } = await sb.from("orders").delete().eq("id", order.id);
      if (undoErr) console.error("상품을 넣지 못한 주문을 지우지 못했어요:", order.id, undoErr.message);
      throw new Error(iErr.message);
    }
    // 쿠폰을 쓴다 — 그새 다른 주문에서 썼거나 끝났으면 이 주문 할인에서 뺀다 (결제 전이라 금액을 고칠 수 있다)
    let lost = 0;
    for (const [pid, c] of best) {
      if (await spendCoupon(sb, c.grant_id, user_id, order.id, c.discount)) continue;
      lost += c.discount;
      delete discount_fees[pid];
    }
    if (lost > 0) {
      const { error: dErr } = await sb.from("orders").update({ discount_amount: discount - lost, discount_fees, final_price: total + shipping_fee - (discount - lost) }).eq("id", order.id);
      if (dErr) throw new Error(dErr.message);
    }
    const applied = discount - lost;
    return NextResponse.json({
      order: { id: order.id, status: order.status, total_items: order.total_items, total_price: total, shipping_fee, discount: applied, final_price: total + shipping_fee - applied },
      partner_items: rows.length, skipped: items.length - rows.length,
    });
  } catch (e) {
    console.error("주문을 만들지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "주문을 접수하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}

export async function GET() {
  await connection();
  const userId = await getActorId();
  if (!userId) return noActor();
  try { return NextResponse.json({ orders: await listMyOrders(createServiceRoleClient(), userId) }); }
  catch (e) {
    console.error("주문 내역을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "주문 내역을 불러오지 못했어요" }, { status: 500 });
  }
}
