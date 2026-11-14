/**
 * 앱 주문 — 주문자·관리자 쪽과, 업체 처리 뒤에 같이 도는 상태 맞추기·환불 계산. 서버 전용.
 * (업체 쪽 목록·처리는 lib/partner/orders.ts, 상태 이름·배송비 계산은 lib/order-status.ts)
 *
 * 환불: 결제가 끝난 주문에서 한 판매 업체 묶음이 취소되면 그 묶음의 상품 금액 + 그 업체 배송비를 돌려줘야 한다.
 *       refund_amount(돌려줘야 할 누적) 과 refunded_amount(돌려준 누적) 를 둔다. PG 를 붙이기 전에는 관리자가 직접 환불하고 표시한다.
 */
import { type Fulfil, type Shipping } from "./order-status";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ItemRow = {
  order_id: string; partner_id: string | null; product_id: string | null; product_name: string; quantity: number | null; unit_price: number | null;
  day_of_week: string | null; meal_type: string | null; fulfil_status: Fulfil; tracking_carrier: string | null; tracking_number: string | null;
  shipped_at: string | null; delivered_at: string | null; cancel_reason: string | null; cancel_requested_at: string | null;
  cancel_request_reason: string | null; canceled_by: string | null; partners: { name: string } | null;
};
const ITEM_COLS = "order_id, partner_id, product_id, product_name, quantity, unit_price, day_of_week, meal_type, fulfil_status, tracking_carrier, tracking_number, shipped_at, delivered_at, cancel_reason, cancel_requested_at, cancel_request_reason, canceled_by, partners(name)";

export type OrderGroup = {
  partner_id: string | null; seller: string; status: Fulfil; subtotal: number; shipping_fee: number;
  carrier: string | null; tracking_number: string | null; shipped_at: string | null; delivered_at: string | null;
  cancel_reason: string | null; canceled_by: string | null; cancel_requested_at: string | null; cancel_request_reason: string | null;
  lines: { product_id: string | null; product_name: string; quantity: number; unit_price: number; day_of_week: string | null; meal_type: string | null }[];
};
export type BuyerOrder = {
  id: string; created_at: string; status: string; paid_at: string | null; total_price: number; shipping_fee: number; final_price: number;
  refund_amount: number; refunded_amount: number; refunded_at: string | null; groups: OrderGroup[];
};
export type AdminOrder = BuyerOrder & { user_id: string; shipping: Shipping | null; refund_note: string | null };

function groupItems(rows: ItemRow[], fees: Record<string, number>): OrderGroup[] {
  const by = new Map<string, OrderGroup>();
  for (const r of rows) {
    const key = r.partner_id || "none";
    let g = by.get(key);
    if (!g) {
      g = {
        partner_id: r.partner_id, seller: r.partners?.name || "판매 업체", status: r.fulfil_status, subtotal: 0, shipping_fee: r.partner_id ? fees[r.partner_id] || 0 : 0,
        carrier: r.tracking_carrier, tracking_number: r.tracking_number, shipped_at: r.shipped_at, delivered_at: r.delivered_at,
        cancel_reason: r.cancel_reason, canceled_by: r.canceled_by, cancel_requested_at: r.cancel_requested_at, cancel_request_reason: r.cancel_request_reason, lines: [],
      };
      by.set(key, g);
    }
    g.lines.push({ product_id: r.product_id, product_name: r.product_name, quantity: r.quantity || 1, unit_price: r.unit_price || 0, day_of_week: r.day_of_week, meal_type: r.meal_type });
    g.subtotal += (r.unit_price || 0) * (r.quantity || 1);
  }
  return [...by.values()];
}

const ORDER_COLS = "id, created_at, status, paid_at, total_price, shipping_fee, shipping_fees, final_price, refund_amount, refunded_amount, refunded_at";

async function withGroups<T extends { id: string; shipping_fees: Record<string, number> | null }>(sb: Sb, orders: T[]) {
  if (orders.length === 0) return [];
  const { data, error } = await sb.from("order_items").select(ITEM_COLS).in("order_id", orders.map((o) => o.id)).order("created_at");
  if (error) throw new Error(error.message);
  const rows = (data || []) as ItemRow[];
  return orders.map(({ shipping_fees, ...o }) => ({ ...o, groups: groupItems(rows.filter((r) => r.order_id === o.id), shipping_fees || {}) }));
}

/** 내 주문 — 최근 30건 */
export async function listMyOrders(sb: Sb, userId: string): Promise<BuyerOrder[]> {
  const { data, error } = await sb.from("orders").select(ORDER_COLS).eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (await withGroups(sb, data || [])) as BuyerOrder[];
}

/** 관리자 — filter: all · refund(환불할 것 남음) · cancel_request(업체가 아직 답하지 않은 취소 요청) */
export async function listAdminOrders(sb: Sb, filter: string): Promise<AdminOrder[]> {
  // 테스트 업체의 예시 주문(is_demo)은 실제 환불·취소 처리 대상이 아니다
  let q = sb.from("orders").select(`${ORDER_COLS}, user_id, shipping, refund_note`).eq("is_demo", false).order("created_at", { ascending: false }).limit(100);
  if (filter === "refund") q = q.gt("refund_amount", 0);
  if (filter === "cancel_request") {
    const { data: req, error: rErr } = await sb.from("order_items").select("order_id").not("cancel_requested_at", "is", null).eq("fulfil_status", "accepted").limit(500);
    if (rErr) throw new Error(rErr.message);
    const ids = [...new Set((req || []).map((r: { order_id: string }) => r.order_id))];
    if (ids.length === 0) return [];
    q = q.in("id", ids);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let list = (await withGroups(sb, data || [])) as AdminOrder[];
  if (filter === "refund") list = list.filter((o) => o.refund_amount > o.refunded_amount);
  return list;
}

/** 업체 묶음들의 진행에 맞춰 주문 전체 상태를 고친다 (결제한 주문만) */
export async function syncOrderStatus(sb: Sb, orderId: string) {
  const { data, error } = await sb.from("order_items").select("fulfil_status").eq("order_id", orderId).not("partner_id", "is", null);
  if (error) throw new Error(error.message);
  const all = ((data || []) as { fulfil_status: Fulfil }[]).map((r) => r.fulfil_status);
  if (all.length === 0) return;
  const live = all.filter((s) => s !== "canceled");
  const status = live.length === 0 ? "cancelled"
    : live.every((s) => s === "delivered") ? "delivered"
    : live.every((s) => s === "shipped" || s === "delivered") ? "dispatched"
    : live.some((s) => s !== "new") ? "processing" : null;
  if (!status) return;
  const { error: uErr } = await sb.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", orderId).not("paid_at", "is", null);
  if (uErr) throw new Error(uErr.message);
}

/** 돌려줘야 할 금액을 다시 센다 — 결제한 주문에서 취소된 업체 묶음의 상품 금액 + 그 업체 배송비. 줄지 않는다(취소는 되돌리지 않는다) */
export async function recomputeRefund(sb: Sb, orderId: string) {
  const { data: o, error } = await sb.from("orders").select("paid_at, shipping_fees, refund_amount").eq("id", orderId).single();
  if (error) throw new Error(error.message);
  if (!o.paid_at) return;
  const { data: items, error: iErr } = await sb.from("order_items").select("partner_id, unit_price, quantity, fulfil_status").eq("order_id", orderId);
  if (iErr) throw new Error(iErr.message);
  const groups = new Map<string, { sum: number; canceled: boolean }>();
  for (const it of (items || []) as { partner_id: string | null; unit_price: number | null; quantity: number | null; fulfil_status: Fulfil }[]) {
    const k = it.partner_id || "none";
    const g = groups.get(k) || groups.set(k, { sum: 0, canceled: true }).get(k)!;
    g.sum += (it.unit_price || 0) * (it.quantity || 1);
    if (it.fulfil_status !== "canceled") g.canceled = false;
  }
  const fees = (o.shipping_fees || {}) as Record<string, number>;
  let due = 0;
  for (const [k, g] of groups) if (g.canceled) due += g.sum + (fees[k] || 0);
  if (due > (o.refund_amount || 0)) {
    const { error: uErr } = await sb.from("orders").update({ refund_amount: due, updated_at: new Date().toISOString() }).eq("id", orderId);
    if (uErr) throw new Error(uErr.message);
  }
}

export type CancelResult = { ok: true; result: "canceled" | "requested" } | { ok: false; code: "not_found" | "conflict" | "invalid"; message: string };

/**
 * 주문자 취소
 *  · 결제 전 주문 → 주문 전체를 취소한다
 *  · 결제 뒤, 그 업체가 아직 접수하지 않았으면 → 바로 취소 (환불할 금액이 생긴다)
 *  · 접수한 뒤 → 취소 요청만 남긴다. 업체가 취소하거나 그대로 발송한다
 *  · 발송한 뒤 → 할 수 없다 (반품은 문의)
 */
export async function buyerCancel(sb: Sb, userId: string, orderId: string, partnerId: string | null, reason: string): Promise<CancelResult> {
  if (!UUID.test(orderId)) return { ok: false, code: "not_found", message: "이 주문이 없어요" };
  const { data: o, error } = await sb.from("orders").select("id, status, paid_at").eq("id", orderId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) return { ok: false, code: "not_found", message: "이 주문이 없어요" };
  const now = new Date().toISOString();
  const why = reason.trim().slice(0, 200);

  if (!o.paid_at) {
    if (o.status === "cancelled") return { ok: true, result: "canceled" };
    const { error: iErr } = await sb.from("order_items").update({ fulfil_status: "canceled", canceled_by: "buyer", canceled_at: now, cancel_reason: why || "결제 전 취소" }).eq("order_id", orderId);
    if (iErr) throw new Error(iErr.message);
    const { error: oErr } = await sb.from("orders").update({ status: "cancelled", updated_at: now }).eq("id", orderId);
    if (oErr) throw new Error(oErr.message);
    return { ok: true, result: "canceled" };
  }

  if (!partnerId || !UUID.test(partnerId)) return { ok: false, code: "invalid", message: "취소할 판매 업체를 골라 주세요" };
  const { data: rows, error: rErr } = await sb.from("order_items").select("fulfil_status, cancel_requested_at").eq("order_id", orderId).eq("partner_id", partnerId);
  if (rErr) throw new Error(rErr.message);
  const status = (rows?.[0]?.fulfil_status || null) as Fulfil | null;
  if (!status) return { ok: false, code: "not_found", message: "이 주문에 그 판매 업체 상품이 없어요" };
  if (status === "canceled") return { ok: true, result: "canceled" };
  if (status === "shipped" || status === "delivered") return { ok: false, code: "conflict", message: "이미 발송해서 취소할 수 없어요. 반품은 케어푸드에 문의해 주세요" };

  if (status === "new") {
    const { error: uErr } = await sb.from("order_items").update({ fulfil_status: "canceled", canceled_by: "buyer", canceled_at: now, cancel_reason: why || "주문자 취소" })
      .eq("order_id", orderId).eq("partner_id", partnerId).eq("fulfil_status", "new");
    if (uErr) throw new Error(uErr.message);
    await syncOrderStatus(sb, orderId);
    await recomputeRefund(sb, orderId);
    return { ok: true, result: "canceled" };
  }
  if (rows?.[0]?.cancel_requested_at) return { ok: true, result: "requested" };
  const { error: uErr } = await sb.from("order_items").update({ cancel_requested_at: now, cancel_request_reason: why || null })
    .eq("order_id", orderId).eq("partner_id", partnerId);
  if (uErr) throw new Error(uErr.message);
  return { ok: true, result: "requested" };
}

/** 관리자가 직접 환불하고 표시 — 돌려줘야 할 금액까지 */
export async function markRefunded(sb: Sb, orderId: string, note: string | null): Promise<void> {
  if (!UUID.test(orderId)) throw new Error("이 주문이 없어요");
  const { data: o, error } = await sb.from("orders").select("refund_amount, refunded_amount").eq("id", orderId).single();
  if (error) throw new Error(error.message);
  if (o.refund_amount <= o.refunded_amount) throw new Error("돌려줄 금액이 없어요");
  const { error: uErr } = await sb.from("orders").update({
    refunded_amount: o.refund_amount, refunded_at: new Date().toISOString(), refund_note: note?.trim().slice(0, 200) || null, updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("refunded_amount", o.refunded_amount); // 두 번 눌러도 한 번만
  if (uErr) throw new Error(uErr.message);
}
