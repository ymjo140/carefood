/**
 * 앱 주문 → 입점 업체 전달. 서버 전용. (주문 기능은 NEXT_PUBLIC_ORDERING_ENABLED 로 켠다 — 꺼져 있으면 주문이 생기지 않는다)
 *  · 업체에는 결제가 끝난 주문만 보인다 (orders.paid_at 이 있는 것). 주문 전체가 취소되면 업체에도 취소로 보인다.
 *  · 한 주문 안의 이 업체 상품은 한 묶음으로 움직인다: 새 주문(new) → 접수(accepted) → 발송(shipped) → 배송 완료(delivered) / 취소(canceled).
 *  · 받는 분 정보는 주문자가 제3자 제공에 동의했고, 배송이 끝나기 전일 때만 준다.
 */
import type { Partner } from "./ingest";
import { CARRIERS, FULFIL, FULFIL_LABEL, deliverableAt, type Fulfil, type Shipping } from "@/lib/order-status";
import { notifyReturn, recomputeRefund, returnInfo, syncOrderStatus, type ReturnInfo } from "@/lib/orders";
import { RETURN_REASON_LABEL, returnOpen, type ReturnReason, type ReturnStatus, type ReturnType } from "@/lib/order-status";
import { loadBuyers } from "./customers";
import { putBackRows } from "./stock";
import { pushReady, sendToUser, type PushSub } from "@/lib/push";
import { asResult, selectAll, selectUpTo } from "@/lib/supabase/all";

export { CARRIERS, FULFIL, FULFIL_LABEL, deliverableAt, parseShipping, type Fulfil, type Shipping } from "@/lib/order-status";

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
  /** 이 고객이 우리 업체에서 처음 산 주문 (통째로 취소된 주문은 세지 않는다) */
  first_order: boolean;
  /** 이 묶음에 쓴 우리 쿠폰 할인 (업체 부담) */
  discount: number;
  /** 반품·교환 요청 (없으면 null) */
  return: ReturnInfo | null;
  /** 택배 조회로 마지막에 본 상태(DELIVERED 등)와 그 시각, 배송 완료를 누가 찍었나 (lib/partner/tracking.ts) */
  tracking_status: string | null; tracking_checked_at: string | null; delivered_by: "partner" | "tracking" | "buyer" | null;
};

type Row = {
  order_id: string; partner_sku: string | null; product_name: string; quantity: number | null; unit_price: number | null;
  day_of_week: string | null; meal_type: string | null; fulfil_status: Fulfil; tracking_carrier: string | null; tracking_number: string | null;
  accepted_at: string | null; shipped_at: string | null; delivered_at: string | null; cancel_reason: string | null;
  canceled_by: PartnerOrder["canceled_by"]; cancel_requested_at: string | null; cancel_request_reason: string | null; partner_id: string;
  return_status: ReturnStatus | null; return_type: ReturnType | null; return_reason: ReturnReason | null; return_note: string | null;
  return_requested_at: string | null; return_resolved_at: string | null; return_reply: string | null; return_fee: number | null;
  tracking_status: string | null; tracking_checked_at: string | null; delivered_by: PartnerOrder["delivered_by"];
  orders: { created_at: string; delivery_week_start: string | null; shipping: Shipping | null; third_party_consent_at: string | null; status: string; shipping_fees: Record<string, number> | null; discount_fees: Record<string, number> | null };
};
const COLS = "order_id, partner_id, partner_sku, product_name, quantity, unit_price, day_of_week, meal_type, fulfil_status, tracking_carrier, tracking_number, accepted_at, shipped_at, delivered_at, cancel_reason, canceled_by, cancel_requested_at, cancel_request_reason, return_status, return_type, return_reason, return_note, return_requested_at, return_resolved_at, return_reply, return_fee, tracking_status, tracking_checked_at, delivered_by, orders!inner(created_at, delivery_week_start, shipping, third_party_consent_at, status, shipping_fees, discount_fees)";

function group(rows: Row[]): PartnerOrder[] {
  const by = new Map<string, PartnerOrder>();
  for (const r of rows) {
    let o = by.get(r.order_id);
    if (!o) {
      const status: Fulfil = r.orders.status === "cancelled" ? "canceled" : r.fulfil_status;
      // 받는 분은 보내기 전, 그리고 반품·교환 회수 중(요청·받아들임)에만 — 회수에 주소가 필요하다
      const open = status === "new" || status === "accepted" || status === "shipped" || (status === "delivered" && returnOpen(r.return_status));
      o = {
        order_id: r.order_id, ordered_at: r.orders.created_at, delivery_week_start: r.orders.delivery_week_start, status, amount: 0,
        shipping_fee: r.orders.shipping_fees?.[r.partner_id] || 0, lines: [],
        carrier: r.tracking_carrier, tracking_number: r.tracking_number, accepted_at: r.accepted_at, shipped_at: r.shipped_at, delivered_at: r.delivered_at,
        cancel_reason: r.cancel_reason, canceled_by: r.canceled_by,
        cancel_requested_at: status === "accepted" ? r.cancel_requested_at : null, cancel_request_reason: status === "accepted" ? r.cancel_request_reason : null,
        shipping: open && r.orders.third_party_consent_at && r.orders.shipping ? r.orders.shipping : null,
        first_order: false, discount: Number(r.orders.discount_fees?.[r.partner_id] || 0), return: returnInfo(r),
        tracking_status: r.tracking_status, tracking_checked_at: r.tracking_checked_at, delivered_by: r.delivered_by,
      };
      by.set(r.order_id, o);
    }
    o.lines.push({ partner_sku: r.partner_sku, product_name: r.product_name, quantity: r.quantity || 1, unit_price: r.unit_price || 0, day_of_week: r.day_of_week, meal_type: r.meal_type });
    o.amount += (r.unit_price || 0) * (r.quantity || 1);
  }
  return [...by.values()].sort((a, b) => b.ordered_at.localeCompare(a.ordered_at));
}

/** 업체 화면·API 의 상태 거르기 — FULFIL 하나, done(배송 완료·취소), returns(반품·교환 요청·회수 중) */
export type OrderFilter = Fulfil | "done" | "returns";
const PAGE = 50;

/**
 * 주문 목록 — 상태로 서버에서 거른 뒤 묶는다(최근 몇 건만 불러와 화면에서 거르면 오래된 새 주문이 빠진다).
 * 끝난 주문은 page 로 50묶음씩. 줄은 묶음 단위로 함께 움직이므로 상태로 걸러도 묶음이 쪼개지지 않는다.
 */
export async function listPartnerOrders(sb: Sb, partnerId: string, opt: { status?: string | null; since?: string | null; limit?: number; page?: number; open?: boolean; cap?: number } = {}): Promise<PartnerOrder[]> {
  const status = opt.status === "done" ? "done" : opt.status === "returns" ? "returns" : opt.status && (FULFIL as readonly string[]).includes(opt.status) ? (opt.status as Fulfil) : null;
  const cap = opt.cap || 200;
  const size = Math.min(Math.max(opt.limit || (status === "done" ? PAGE : cap), 1), cap);
  const page = Math.max(0, Math.floor(opt.page || 0));
  const asc = status === "new" || status === "accepted" || status === "returns" || !!opt.open;
  const make = () => {
    let q = sb.from("order_items").select(COLS).eq("partner_id", partnerId).not("orders.paid_at", "is", null);
    if (status === "done") q = q.in("fulfil_status", ["delivered", "canceled"]);
    else if (status === "returns") q = q.eq("fulfil_status", "delivered").in("return_status", ["requested", "approved"]);
    else if (status) q = q.eq("fulfil_status", status);
    else if (opt.open) q = q.in("fulfil_status", ["new", "accepted"]);
    if (opt.since) q = q.gte("created_at", opt.since);
    return q;
  };
  // 처리할 주문(열린 상태)은 끝까지 받는다(1,000줄씩). 끝난 주문·전체는 이 쪽까지 필요한 만큼만 — 한 주문은 줄 60개까지라 (쪽+1)×크기×60줄이면 모자라지 않는다
  const order = asc ? ["created_at", "id"] : ["-created_at", "-id"];
  const openOnly = status === "new" || status === "accepted" || status === "shipped" || status === "returns" || !!opt.open;
  const data = openOnly
    ? await selectAll<Row>(make, order, 1_000_000)
    : await selectUpTo<Row>(make, order, (page + 1) * size * 60);
  let all = group(data);
  // 처리할 주문은 오래된 것부터(먼저 들어온 주문을 먼저), 끝난 주문은 최근 것부터
  if (status === "new" || status === "accepted" || status === "returns" || opt.open) all = all.reverse();
  const list = all.slice(page * size, page * size + size);
  // 첫 주문 표시 — 고객마다 처음 산 주문 (lib/partner/customers.ts 와 같은 셈)
  const firsts = new Set((await loadBuyers(sb, partnerId)).map((b) => b.live[0]?.id).filter(Boolean));
  for (const o of list) o.first_order = firsts.has(o.order_id);
  return list;
}

export type OrderCounts = { new: number; accepted: number; shipped: number; cancel_requests: number; late: number; deliver_pending: number; returns: number; return_requests: number };
const HOUR = 3600e3;
export const LATE_HOURS = 24;
export const DELIVER_PENDING_DAYS = 5;

/** 처리할 주문 건수 — 상태별 묶음 수, 취소 요청, 24시간 넘게 못 보낸 주문, 5일 넘게 배송 완료를 안 누른 발송 */
export async function countPartnerOrders(sb: Sb, partnerId: string, now = Date.now()): Promise<OrderCounts> {
  const [{ data, error }, ret] = await Promise.all([
    asResult(selectAll(() => sb.from("order_items").select("order_id, fulfil_status, cancel_requested_at, shipped_at, orders!inner(paid_at, status)")
      .eq("partner_id", partnerId).in("fulfil_status", ["new", "accepted", "shipped"]).not("orders.paid_at", "is", null), "id", 1_000_000)),
    asResult(selectAll(() => sb.from("order_items").select("order_id, return_status").eq("partner_id", partnerId).eq("fulfil_status", "delivered").in("return_status", ["requested", "approved"]), "id")),
  ]);
  if (error) throw new Error(error.message);
  if (ret.error) throw new Error(ret.error.message);
  const by = new Map<string, { s: string; req: boolean; paid: number; shipped: number | null }>();
  for (const r of (data || []) as { order_id: string; fulfil_status: string; cancel_requested_at: string | null; shipped_at: string | null; orders: { paid_at: string; status: string } }[]) {
    if (r.orders.status === "cancelled") continue;
    if (!by.has(r.order_id)) by.set(r.order_id, { s: r.fulfil_status, req: false, paid: Date.parse(r.orders.paid_at), shipped: r.shipped_at ? Date.parse(r.shipped_at) : null });
    if (r.cancel_requested_at && r.fulfil_status === "accepted") by.get(r.order_id)!.req = true;
  }
  const retBy = new Map<string, string>();
  for (const r of (ret.data || []) as { order_id: string; return_status: string }[]) retBy.set(r.order_id, r.return_status);
  const c: OrderCounts = { new: 0, accepted: 0, shipped: 0, cancel_requests: 0, late: 0, deliver_pending: 0, returns: retBy.size, return_requests: [...retBy.values()].filter((v) => v === "requested").length };
  for (const o of by.values()) {
    if (o.s === "new") c.new++; else if (o.s === "accepted") c.accepted++; else c.shipped++;
    if (o.req) c.cancel_requests++;
    if ((o.s === "new" || o.s === "accepted") && !o.req && o.paid < now - LATE_HOURS * HOUR) c.late++;
    if (o.s === "shipped" && o.shipped !== null && o.shipped < now - DELIVER_PENDING_DAYS * 24 * HOUR) c.deliver_pending++;
  }
  return c;
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
    const at = deliverableAt(current);
    if (at !== null && at > Date.now()) {
      const h = Math.ceil((at - Date.now()) / HOUR);
      return { ok: false, code: "conflict", message: `발송하고 ${current.carrier === "direct" ? 1 : 12}시간이 지나야 배송 완료로 바꿀 수 있어요 (${h}시간 남음). 구매확정 8일이 이때부터 세져요` };
    }
    patch.delivered_at = now;
    patch.delivered_by = "partner";
  } else {
    if (from === "canceled") return { ok: true, order: current, changed: false };
    if (from !== "new" && from !== "accepted") return { ok: false, code: "conflict", message: "발송한 뒤에는 취소할 수 없어요. 오늘끼록에 문의해 주세요" };
    // 주문자가 취소를 요청한 주문은 이유 없이 받아들일 수 있다
    const reason = String(input.reason ?? "").trim().slice(0, 200) || (current.cancel_requested_at ? "주문자 요청" : "");
    if (!reason) return { ok: false, code: "invalid", message: "취소 이유(reason)를 적어 주세요" };
    patch.cancel_reason = reason;
    patch.canceled_by = "partner";
    patch.canceled_at = now;
  }

  // 읽은 상태 그대로일 때만 바꾼다 — 그새 주문자가 취소했거나 다른 창에서 처리했으면 바꾸지 않는다
  const { data: moved, error: uErr } = await sb.from("order_items").update(patch).eq("partner_id", partner.id).eq("order_id", orderId)
    .eq("fulfil_status", from).select("partner_id, partner_sku, quantity");
  if (uErr) throw new Error(uErr.message);
  if (!moved?.length) return { ok: false, code: "conflict", message: "그새 주문 상태가 바뀌었어요. 새로 불러와 주세요" };
  if (to === "canceled") await putBackRows(sb, moved);
  await syncOrderStatus(sb, orderId);
  if (to === "canceled") await recomputeRefund(sb, orderId);
  if ((to === "shipped" && from !== "shipped") || to === "canceled") await notifyBuyer(sb, orderId, partner.id, to, current);
  const { data: after, error: aErr } = await sb.from("order_items").select(COLS).eq("partner_id", partner.id).eq("order_id", orderId);
  if (aErr) throw new Error(aErr.message);
  return { ok: true, order: group((after || []) as Row[])[0], changed: true };
}

export type ReturnInput = { action: unknown; reply?: unknown; fee?: unknown; carrier?: unknown; tracking_number?: unknown };

/**
 * 반품·교환 처리 — 업체 묶음 단위. 읽은 return_status 그대로일 때만 바꾼다(조건부 update).
 *  · approve: 요청 → 받아들임(회수 중)
 *  · reject: 요청 → 거절 (이유 필수). 그날부터 다시 8일 뒤 구매확정 — delivered_at 을 지금으로
 *  · returned: 요청·받아들임 → 반품 완료. 묶음을 취소로 바꿔 정산에서 빼고 환불할 금액을 다시 센다. 마음이 바뀐 반품만 반품 배송비(fee)를 뺀다. 먹을거리라 재고는 돌려놓지 않는다
 *  · exchanged: 요청·받아들임 → 교환품 발송 (택배사·송장). 발송 상태로 돌아가 배송 완료 → 구매확정을 다시 밟는다
 */
export async function updateReturn(sb: Sb, partner: Pick<Partner, "id">, orderId: string, input: ReturnInput): Promise<FulfilResult> {
  if (!UUID.test(orderId)) return { ok: false, code: "not_found", message: "이 주문이 없어요" };
  const action = String(input.action ?? "");
  if (!["approve", "reject", "returned", "exchanged"].includes(action)) return { ok: false, code: "invalid", message: "action 은 approve · reject · returned · exchanged 중 하나예요" };
  const { data, error } = await sb.from("order_items").select(COLS).eq("partner_id", partner.id).eq("order_id", orderId).not("orders.paid_at", "is", null);
  if (error) throw new Error(error.message);
  const current = group((data || []) as Row[])[0];
  if (!current) return { ok: false, code: "not_found", message: "이 주문이 없어요" };
  const ret = current.return;
  if (!ret || !returnOpen(ret.status) || current.status !== "delivered") return { ok: false, code: "conflict", message: "처리할 반품·교환 요청이 없어요. 새로 불러와 주세요" };
  const from = ret.status;
  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  if (action === "approve") {
    if (from === "approved") return { ok: true, order: current, changed: false };
    patch = { return_status: "approved" };
  } else if (action === "reject") {
    if (from !== "requested") return { ok: false, code: "conflict", message: "받아들인 요청은 거절할 수 없어요. 반품 완료나 교환품 발송으로 마쳐 주세요" };
    const reply = String(input.reply ?? "").trim().slice(0, 300);
    if (!reply) return { ok: false, code: "invalid", message: "거절 이유를 적어 주세요" };
    patch = { return_status: "rejected", return_reply: reply, return_resolved_at: now, delivered_at: now };
  } else if (action === "returned") {
    if (ret.type !== "return") return { ok: false, code: "conflict", message: "교환 요청이에요. 교환품을 보내 주세요" };
    const fee = input.fee === undefined || input.fee === null || input.fee === "" ? 0 : Math.round(Number(input.fee));
    if (!(fee >= 0 && fee <= 100000)) return { ok: false, code: "invalid", message: "반품 배송비는 0~100,000원으로 적어 주세요" };
    if (fee > 0 && ret.reason !== "change_mind") return { ok: false, code: "invalid", message: "반품 배송비는 마음이 바뀐 반품에만 받을 수 있어요" };
    patch = {
      return_status: "returned", return_fee: fee || null, return_resolved_at: now, return_reply: String(input.reply ?? "").trim().slice(0, 300) || null,
      fulfil_status: "canceled", canceled_by: "partner", canceled_at: now, cancel_reason: `반품 · ${RETURN_REASON_LABEL[ret.reason]}`,
    };
  } else {
    if (ret.type !== "exchange") return { ok: false, code: "conflict", message: "반품 요청이에요. 회수를 확인하고 반품을 마쳐 주세요" };
    const carrier = String(input.carrier ?? "").trim();
    const tracking = String(input.tracking_number ?? "").trim().replace(/[\s-]/g, "");
    if (!(carrier in CARRIERS)) return { ok: false, code: "invalid", message: `carrier 는 ${Object.keys(CARRIERS).join(" · ")} 중 하나예요` };
    if (carrier !== "direct" && !/^[A-Za-z0-9]{6,30}$/.test(tracking)) return { ok: false, code: "invalid", message: "송장 번호를 적어 주세요 (영문·숫자 6~30자)" };
    patch = {
      return_status: "exchanged", return_resolved_at: now, return_reply: String(input.reply ?? "").trim().slice(0, 300) || null,
      fulfil_status: "shipped", shipped_at: now, delivered_at: null, confirmed_at: null, confirm_by: null, tracking_carrier: carrier, tracking_number: tracking || null,
    };
  }
  const { data: moved, error: uErr } = await sb.from("order_items").update(patch).eq("partner_id", partner.id).eq("order_id", orderId)
    .eq("fulfil_status", "delivered").eq("return_status", from).select("order_id");
  if (uErr) throw new Error(uErr.message);
  if (!moved?.length) return { ok: false, code: "conflict", message: "그새 주문 상태가 바뀌었어요. 새로 불러와 주세요" };
  if (action === "returned" || action === "exchanged") await syncOrderStatus(sb, orderId);
  if (action === "returned") await recomputeRefund(sb, orderId);
  const { data: p } = await sb.from("partners").select("name").eq("id", partner.id).single();
  await notifyReturn(sb, orderId, p?.name || "판매 업체", ret.type, action === "approve" ? "approved" : action === "reject" ? "rejected" : action as "returned" | "exchanged");
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
      : { title: "주문이 취소됐어요", body: `${p?.name || "판매 업체"}가 ${first}${more} 주문을 취소했어요. 환불은 오늘끼록이 처리해요`, url: "/me/orders", tag: `order-${orderId}` });
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
