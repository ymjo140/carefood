/**
 * 앱 주문 → 입점 업체 전달. 서버 전용. (주문 기능은 NEXT_PUBLIC_ORDERING_ENABLED 로 켠다 — 꺼져 있으면 주문이 생기지 않는다)
 *  · 업체에는 결제가 끝난 주문만 보인다 (orders.paid_at 이 있는 것). 주문 전체가 취소되면 업체에도 취소로 보인다.
 *  · 한 주문 안의 이 업체 상품은 한 묶음으로 움직인다: 새 주문(new) → 접수(accepted) → 발송(shipped) → 배송 완료(delivered) / 취소(canceled).
 *  · 받는 분 정보는 주문자가 제3자 제공에 동의했고, 배송이 끝나기 전일 때만 준다.
 */
import type { Partner } from "./ingest";
import { CARRIERS, FULFIL, FULFIL_LABEL, type Fulfil, type Shipping } from "@/lib/order-status";
import { recomputeRefund, syncOrderStatus } from "@/lib/orders";
import { pushReady, sendToUser, type PushSub } from "@/lib/push";

export { CARRIERS, FULFIL, FULFIL_LABEL, parseShipping, type Fulfil, type Shipping } from "@/lib/order-status";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PartnerOrder = {
  order_id: string; ordered_at: string; delivery_week_start: string | null; status: Fulfil;
  /** 상품 금액 · 이 업체 배송비 (주문할 때 계산해 둔 값) */
  amount: number; shipping_fee: number;
  lines: { partner_sku: string | null; product_name: string; quantity: number; unit_price: number; day_of_week: string | null; meal_type: string | null }[];
  carrier: string | null; tracking_number: string | null; accepted_at: string | null; shipped_at: string | null; delivered_at: string | null;
  cancel_reason: string | null; canceled_by: "buyer" | "partner" | "admin" | null;
  /** 주문자가 접수 뒤에 취소를 요청했으면 그 시각과 이유 */
  cancel_requested_at: string | null; cancel_request_reason: string | null;
  /** 받는 분 — 동의가 없거나 배송이 끝났으면 null */
  shipping: Shipping | null;
};

type Row = {
  order_id: string; partner_sku: string | null; product_name: string; quantity: number | null; unit_price: number | null;
  day_of_week: string | null; meal_type: string | null; fulfil_status: Fulfil; tracking_carrier: string | null; tracking_number: string | null;
  accepted_at: string | null; shipped_at: string | null; delivered_at: string | null; cancel_reason: string | null;
  canceled_by: PartnerOrder["canceled_by"]; cancel_requested_at: string | null; cancel_request_reason: string | null; partner_id: string;
  orders: { created_at: string; delivery_week_start: string | null; shipping: Shipping | null; third_party_consent_at: string | null; status: string; shipping_fees: Record<string, number> | null };
};
const COLS = "order_id, partner_id, partner_sku, product_name, quantity, unit_price, day_of_week, meal_type, fulfil_status, tracking_carrier, tracking_number, accepted_at, shipped_at, delivered_at, cancel_reason, canceled_by, cancel_requested_at, cancel_request_reason, orders!inner(created_at, delivery_week_start, shipping, third_party_consent_at, status, shipping_fees)";

function group(rows: Row[]): PartnerOrder[] {
  const by = new Map<string, PartnerOrder>();
  for (const r of rows) {
    let o = by.get(r.order_id);
    if (!o) {
      const status: Fulfil = r.orders.status === "cancelled" ? "canceled" : r.fulfil_status;
      const open = status === "new" || status === "accepted" || status === "shipped";
      o = {
        order_id: r.order_id, ordered_at: r.orders.created_at, delivery_week_start: r.orders.delivery_week_start, status, amount: 0,
        shipping_fee: r.orders.shipping_fees?.[r.partner_id] || 0, lines: [],
        carrier: r.tracking_carrier, tracking_number: r.tracking_number, accepted_at: r.accepted_at, shipped_at: r.shipped_at, delivered_at: r.delivered_at,
        cancel_reason: r.cancel_reason, canceled_by: r.canceled_by,
        cancel_requested_at: status === "accepted" ? r.cancel_requested_at : null, cancel_request_reason: status === "accepted" ? r.cancel_request_reason : null,
        shipping: open && r.orders.third_party_consent_at && r.orders.shipping ? r.orders.shipping : null,
      };
      by.set(r.order_id, o);
    }
    o.lines.push({ partner_sku: r.partner_sku, product_name: r.product_name, quantity: r.quantity || 1, unit_price: r.unit_price || 0, day_of_week: r.day_of_week, meal_type: r.meal_type });
    o.amount += (r.unit_price || 0) * (r.quantity || 1);
  }
  return [...by.values()].sort((a, b) => b.ordered_at.localeCompare(a.ordered_at));
}

export async function listPartnerOrders(sb: Sb, partnerId: string, opt: { status?: string | null; since?: string | null; limit?: number } = {}): Promise<PartnerOrder[]> {
  let q = sb.from("order_items").select(COLS).eq("partner_id", partnerId).not("orders.paid_at", "is", null).order("created_at", { ascending: false }).limit(2000);
  if (opt.status && (FULFIL as readonly string[]).includes(opt.status)) q = q.eq("fulfil_status", opt.status);
  if (opt.since) q = q.gte("created_at", opt.since);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return group((data || []) as Row[]).slice(0, Math.min(Math.max(opt.limit || 100, 1), 200));
}

export type FulfilInput = { status: unknown; carrier?: unknown; tracking_number?: unknown; reason?: unknown };
export type FulfilResult = { ok: true; order: PartnerOrder; changed: boolean } | { ok: false; code: "not_found" | "invalid" | "conflict"; message: string };

/** 접수·발송·배송 완료·취소 — 같은 상태를 다시 보내면 바뀐 것 없이 그대로 돌려준다 (다시 보내기 안전) */
export async function updateFulfilment(sb: Sb, partner: Pick<Partner, "id">, orderId: string, input: FulfilInput): Promise<FulfilResult> {
  if (!UUID.test(orderId)) return { ok: false, code: "not_found", message: "이 주문이 없어요" };
  const to = String(input.status ?? "") as Fulfil;
  if (!["accepted", "shipped", "delivered", "canceled"].includes(to)) return { ok: false, code: "invalid", message: "status 는 accepted · shipped · delivered · canceled 중 하나예요" };
  const { data, error } = await sb.from("order_items").select(COLS).eq("partner_id", partner.id).eq("order_id", orderId).not("orders.paid_at", "is", null);
  if (error) throw new Error(error.message);
  const current = group((data || []) as Row[])[0];
  if (!current) return { ok: false, code: "not_found", message: "이 주문이 없어요" };
  const from = current.status;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { fulfil_status: to };

  if (to === "accepted") {
    if (from === "accepted") return { ok: true, order: current, changed: false };
    if (from !== "new") return { ok: false, code: "conflict", message: `${FULFIL_LABEL[from]} 상태의 주문은 접수로 되돌릴 수 없어요` };
    patch.accepted_at = now;
  } else if (to === "shipped") {
    if (from !== "new" && from !== "accepted" && from !== "shipped") return { ok: false, code: "conflict", message: `${FULFIL_LABEL[from]} 상태의 주문은 발송 처리할 수 없어요` };
    const carrier = String(input.carrier ?? "").trim();
    const tracking = String(input.tracking_number ?? "").trim().replace(/[\s-]/g, "");
    if (!(carrier in CARRIERS)) return { ok: false, code: "invalid", message: `carrier 는 ${Object.keys(CARRIERS).join(" · ")} 중 하나예요` };
    if (carrier !== "direct" && !/^[A-Za-z0-9]{6,30}$/.test(tracking)) return { ok: false, code: "invalid", message: "송장 번호를 적어 주세요 (영문·숫자 6~30자)" };
    if (from === "shipped" && current.carrier === carrier && (current.tracking_number || "") === tracking) return { ok: true, order: current, changed: false };
    patch.tracking_carrier = carrier;
    patch.tracking_number = tracking || null;
    if (from !== "shipped") patch.shipped_at = now;
    if (from === "new") patch.accepted_at = now;
  } else if (to === "delivered") {
    if (from === "delivered") return { ok: true, order: current, changed: false };
    if (from !== "shipped") return { ok: false, code: "conflict", message: "발송한 주문만 배송 완료로 바꿀 수 있어요" };
    patch.delivered_at = now;
  } else {
    if (from === "canceled") return { ok: true, order: current, changed: false };
    if (from !== "new" && from !== "accepted") return { ok: false, code: "conflict", message: "발송한 뒤에는 취소할 수 없어요. 케어푸드에 문의해 주세요" };
    // 주문자가 취소를 요청한 주문은 이유 없이 받아들일 수 있다
    const reason = String(input.reason ?? "").trim().slice(0, 200) || (current.cancel_requested_at ? "주문자 요청" : "");
    if (!reason) return { ok: false, code: "invalid", message: "취소 이유(reason)를 적어 주세요" };
    patch.cancel_reason = reason;
    patch.canceled_by = "partner";
    patch.canceled_at = now;
  }

  const { error: uErr } = await sb.from("order_items").update(patch).eq("partner_id", partner.id).eq("order_id", orderId);
  if (uErr) throw new Error(uErr.message);
  await syncOrderStatus(sb, orderId);
  if (to === "canceled") await recomputeRefund(sb, orderId);
  if ((to === "shipped" && from !== "shipped") || to === "canceled") await notifyBuyer(sb, orderId, partner.id, to, current);
  const { data: after, error: aErr } = await sb.from("order_items").select(COLS).eq("partner_id", partner.id).eq("order_id", orderId);
  if (aErr) throw new Error(aErr.message);
  return { ok: true, order: group((after || []) as Row[])[0], changed: true };
}

/** 주문자에게 알림 — 발송·취소. 켜 둔 기기가 없으면 보내지 않는다. 알림이 안 가도 처리는 그대로 (기록만) */
async function notifyBuyer(sb: Sb, orderId: string, partnerId: string, to: Fulfil, current: PartnerOrder) {
  if (!pushReady()) return;
  try {
    const { data: o } = await sb.from("orders").select("user_id").eq("id", orderId).single();
    const { data: subs } = await sb.from("push_subscriptions").select("endpoint, user_id, p256dh, auth").eq("user_id", o?.user_id || "");
    if (!subs?.length) return;
    const { data: p } = await sb.from("partners").select("name").eq("id", partnerId).single();
    const first = current.lines[0]?.product_name || "주문한 상품";
    const more = current.lines.length > 1 ? ` 외 ${current.lines.length - 1}개` : "";
    await sendToUser(sb, subs as PushSub[], to === "shipped"
      ? { title: "주문한 상품을 보냈어요", body: `${p?.name || "판매 업체"}에서 ${first}${more}을(를) 보냈어요`, url: "/me/orders", tag: `order-${orderId}` }
      : { title: "주문이 취소됐어요", body: `${p?.name || "판매 업체"}가 ${first}${more} 주문을 취소했어요. 환불은 케어푸드가 처리해요`, url: "/me/orders", tag: `order-${orderId}` });
  } catch (e) { console.error("주문 알림을 보내지 못했어요:", (e as Error).message); }
}

export type Offer = { partner_id: string; slug: string; name: string; partner_sku: string; price: number; shipping_fee: number | null; free_shipping_over: number | null };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** 주문할 제품 → 지금 팔고 있는 입점 업체 (제품마다 가장 싼 곳) + 그 업체가 적은 배송비·무료배송 기준 */
export async function partnerOffersFor(sb: Sb, productIds: string[]): Promise<Map<string, Offer>> {
  const out = new Map<string, Offer>();
  if (productIds.length === 0) return out;
  const { data, error } = await sb.from("partner_offers")
    .select("product_id, price, partner_id, partners!inner(slug, name, status), partner_items!inner(partner_sku, status, approved_data)")
    .in("product_id", productIds.slice(0, 100)).eq("is_available", true).eq("partners.status", "active").eq("partner_items.status", "approved");
  if (error) throw new Error(error.message);
  for (const o of data || []) {
    const cur = out.get(o.product_id);
    const ad = (o.partner_items.approved_data || {}) as Record<string, unknown>;
    if (!cur || o.price < cur.price) out.set(o.product_id, {
      partner_id: o.partner_id, slug: o.partners.slug, name: o.partners.name, partner_sku: o.partner_items.partner_sku, price: o.price,
      shipping_fee: num(ad.shipping_fee), free_shipping_over: num(ad.free_shipping_over),
    });
  }
  return out;
}
