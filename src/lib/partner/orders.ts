/**
 * 앱 주문 → 입점 업체 전달. 서버 전용. (주문 기능은 NEXT_PUBLIC_ORDERING_ENABLED 로 켠다 — 꺼져 있으면 주문이 생기지 않는다)
 *  · 업체에는 결제가 끝난 주문만 보인다 (orders.paid_at 이 있는 것). 주문 전체가 취소되면 업체에도 취소로 보인다.
 *  · 한 주문 안의 이 업체 상품은 한 묶음으로 움직인다: 새 주문(new) → 접수(accepted) → 발송(shipped) → 배송 완료(delivered) / 취소(canceled).
 *  · 받는 분 정보는 주문자가 제3자 제공에 동의했고, 배송이 끝나기 전일 때만 준다.
 */
import type { Partner } from "./ingest";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const FULFIL = ["new", "accepted", "shipped", "delivered", "canceled"] as const;
export type Fulfil = (typeof FULFIL)[number];
export const FULFIL_LABEL: Record<Fulfil, string> = { new: "새 주문", accepted: "접수", shipped: "발송", delivered: "배송 완료", canceled: "취소" };
/** 택배사 코드 — direct 는 업체가 직접 배송(새벽 배송 등)이라 송장 번호가 없어도 된다 */
export const CARRIERS: Record<string, string> = {
  cj: "CJ대한통운", hanjin: "한진택배", lotte: "롯데택배", epost: "우체국택배", logen: "로젠택배", direct: "직접 배송", other: "그 밖의 택배",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Shipping = { name: string; phone: string; postal_code: string | null; address1: string; address2: string | null; note: string | null };
export type PartnerOrder = {
  order_id: string; ordered_at: string; delivery_week_start: string | null; status: Fulfil; amount: number;
  lines: { partner_sku: string | null; product_name: string; quantity: number; unit_price: number; day_of_week: string | null; meal_type: string | null }[];
  carrier: string | null; tracking_number: string | null; accepted_at: string | null; shipped_at: string | null; delivered_at: string | null;
  cancel_reason: string | null;
  /** 받는 분 — 동의가 없거나 배송이 끝났으면 null */
  shipping: Shipping | null;
};

/** 주문 화면·API 가 받는 배송 정보 검증 → 저장할 모양 */
export function parseShipping(v: unknown): { shipping: Shipping } | { error: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const text = (k: string, max: number) => String(o[k] ?? "").trim().slice(0, max);
  const name = text("name", 40);
  const phone = text("phone", 20).replace(/[^\d]/g, "");
  const address1 = text("address1", 120);
  if (!name) return { error: "받는 분을 적어 주세요" };
  if (!/^0\d{8,10}$/.test(phone)) return { error: "연락처를 다시 확인해 주세요" };
  if (address1.length < 5) return { error: "주소를 적어 주세요" };
  return { shipping: { name, phone, postal_code: text("postal_code", 10) || null, address1, address2: text("address2", 80) || null, note: text("note", 100) || null } };
}

type Row = {
  order_id: string; partner_sku: string | null; product_name: string; quantity: number | null; unit_price: number | null;
  day_of_week: string | null; meal_type: string | null; fulfil_status: Fulfil; tracking_carrier: string | null; tracking_number: string | null;
  accepted_at: string | null; shipped_at: string | null; delivered_at: string | null; cancel_reason: string | null;
  orders: { created_at: string; delivery_week_start: string | null; shipping: Shipping | null; third_party_consent_at: string | null; status: string };
};
const COLS = "order_id, partner_sku, product_name, quantity, unit_price, day_of_week, meal_type, fulfil_status, tracking_carrier, tracking_number, accepted_at, shipped_at, delivered_at, cancel_reason, orders!inner(created_at, delivery_week_start, shipping, third_party_consent_at, status)";

function group(rows: Row[]): PartnerOrder[] {
  const by = new Map<string, PartnerOrder>();
  for (const r of rows) {
    let o = by.get(r.order_id);
    if (!o) {
      const status: Fulfil = r.orders.status === "cancelled" ? "canceled" : r.fulfil_status;
      const open = status === "new" || status === "accepted" || status === "shipped";
      o = {
        order_id: r.order_id, ordered_at: r.orders.created_at, delivery_week_start: r.orders.delivery_week_start, status, amount: 0, lines: [],
        carrier: r.tracking_carrier, tracking_number: r.tracking_number, accepted_at: r.accepted_at, shipped_at: r.shipped_at, delivered_at: r.delivered_at,
        cancel_reason: r.cancel_reason,
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
    const reason = String(input.reason ?? "").trim().slice(0, 200);
    if (!reason) return { ok: false, code: "invalid", message: "취소 이유(reason)를 적어 주세요" };
    patch.cancel_reason = reason;
  }

  const { error: uErr } = await sb.from("order_items").update(patch).eq("partner_id", partner.id).eq("order_id", orderId);
  if (uErr) throw new Error(uErr.message);
  await syncOrderStatus(sb, orderId);
  const { data: after, error: aErr } = await sb.from("order_items").select(COLS).eq("partner_id", partner.id).eq("order_id", orderId);
  if (aErr) throw new Error(aErr.message);
  return { ok: true, order: group((after || []) as Row[])[0], changed: true };
}

/** 업체 상품들의 진행에 맞춰 주문 전체 상태를 고친다 (업체가 맡지 않는 시판 상품은 세지 않는다) */
async function syncOrderStatus(sb: Sb, orderId: string) {
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
  const { error: uErr } = await sb.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", orderId);
  if (uErr) throw new Error(uErr.message);
}

/** 주문할 제품 → 지금 팔고 있는 입점 업체 (제품마다 가장 싼 곳) */
export async function partnerOffersFor(sb: Sb, productIds: string[]): Promise<Map<string, { partner_id: string; slug: string; name: string; partner_sku: string; price: number }>> {
  const out = new Map<string, { partner_id: string; slug: string; name: string; partner_sku: string; price: number }>();
  if (productIds.length === 0) return out;
  const { data, error } = await sb.from("partner_offers")
    .select("product_id, price, partner_id, partners!inner(slug, name, status), partner_items!inner(partner_sku, status)")
    .in("product_id", productIds.slice(0, 100)).eq("is_available", true).eq("partners.status", "active").eq("partner_items.status", "approved");
  if (error) throw new Error(error.message);
  for (const o of data || []) {
    const cur = out.get(o.product_id);
    if (!cur || o.price < cur.price) out.set(o.product_id, { partner_id: o.partner_id, slug: o.partners.slug, name: o.partners.name, partner_sku: o.partner_items.partner_sku, price: o.price });
  }
  return out;
}
