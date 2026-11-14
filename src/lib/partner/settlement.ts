/**
 * 월별 정산 — 지난 달을 마감하면 그때의 숫자를 partner_settlements 에 적어 둔다. 서버 전용.
 *  · 구매 링크 수수료: 그 달에 주문되어 구매확정된 금액 × 받은 때의 수수료율 (업체 → 케어푸드)
 *  · 앱 주문: 그 달에 배송 완료된 업체 묶음의 판매액·배송비·업체 쿠폰 할인, (판매액 − 쿠폰 할인) × 앱 주문 수수료율.
 *    케어푸드가 받아 둔 돈에서 업체에 줄 돈 = 판매액 − 쿠폰 할인 + 배송비 − 수수료
 * 마감 뒤에 주문 상태가 바뀌면 지금 숫자와 마감 숫자가 달라진다 — 정산을 끝내기 전에는 다시 마감할 수 있다.
 */
import { monthlySummary, type MonthSummary } from "./conversions";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Settlement = {
  month: string; clicks: number; orders: number; confirmed_amount: number; commission: number;
  order_sales: number; order_shipping: number; order_discount: number; order_fee: number; status: "closed" | "paid"; closed_at: string; paid_at: string | null; note: string | null;
};
export type SettlementMonth = MonthSummary & {
  order_sales: number; order_shipping: number; order_discount: number; order_fee: number; open: boolean; settlement: Settlement | null;
};
const SETTLE_COLS = "month, clicks, orders, confirmed_amount, commission, order_sales, order_shipping, order_discount, order_fee, status, closed_at, paid_at, note";

const kstMonth = (iso: string | number) => new Date((typeof iso === "number" ? iso : Date.parse(iso)) + 9 * 3600e3).toISOString().slice(0, 7);
export const currentMonth = () => kstMonth(Date.now());
/** 'YYYY-MM' → 그 달의 한국 시간 시작·끝 (ISO) */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: new Date(`${month}-01T00:00:00+09:00`).toISOString(), end: new Date(`${next}-01T00:00:00+09:00`).toISOString() };
}
const fee = (sales: number, rate: number | null) => (rate === null ? 0 : Math.round((sales * rate) / 100));
const rateOf = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/** 업체에 줄 앱 주문 대금 */
export const orderPayout = (m: { order_sales: number; order_shipping: number; order_discount?: number; order_fee: number }) => m.order_sales - (m.order_discount || 0) + m.order_shipping - m.order_fee;

async function partnerRates(sb: Sb, partnerId: string): Promise<{ link: number | null; order: number | null }> {
  const { data, error } = await sb.from("partners").select("commission_rate, order_commission_rate").eq("id", partnerId).single();
  if (error) throw new Error(error.message);
  return { link: rateOf(data.commission_rate), order: rateOf(data.order_commission_rate) };
}

type Delivered = { order_id: string; unit_price: number | null; quantity: number | null; delivered_at: string; orders: { shipping_fees: Record<string, number> | null; discount_fees: Record<string, number> | null } };

/** 배송 완료된 앱 주문 → 달별 판매액·배송비·쿠폰 할인 (배송비·할인은 주문마다 한 번) */
function deliveredByMonth(rows: Delivered[], partnerId: string) {
  const out = new Map<string, { sales: number; shipping: number; discount: number }>();
  const seen = new Set<string>();
  for (const r of rows) {
    const m = kstMonth(r.delivered_at);
    const v = out.get(m) || out.set(m, { sales: 0, shipping: 0, discount: 0 }).get(m)!;
    v.sales += (r.unit_price || 0) * (r.quantity || 1);
    if (!seen.has(r.order_id)) {
      seen.add(r.order_id);
      v.shipping += r.orders?.shipping_fees?.[partnerId] || 0;
      v.discount += Number(r.orders?.discount_fees?.[partnerId] || 0);
    }
  }
  return out;
}
const DELIVERED_COLS = "order_id, unit_price, quantity, delivered_at, orders!inner(shipping_fees, discount_fees)";

/** 최근 6개월 — 달별 지금 숫자 + 마감해 둔 숫자 */
export async function settlementMonths(sb: Sb, partnerId: string): Promise<SettlementMonth[]> {
  const since = new Date(Date.now() - 185 * 86400e3).toISOString();
  const [months, rates, oi, st] = await Promise.all([
    monthlySummary(sb, partnerId),
    partnerRates(sb, partnerId),
    sb.from("order_items").select(DELIVERED_COLS).eq("partner_id", partnerId).eq("fulfil_status", "delivered").gte("delivered_at", since).limit(100000),
    sb.from("partner_settlements").select(SETTLE_COLS).eq("partner_id", partnerId),
  ]);
  if (oi.error || st.error) throw new Error((oi.error || st.error).message);
  const blank = { order_sales: 0, order_shipping: 0, order_discount: 0, order_fee: 0, open: true, settlement: null };
  const by = new Map<string, SettlementMonth>(months.map((m) => [m.month, { ...m, ...blank }]));
  const get = (m: string) => by.get(m) || by.set(m, { month: m, clicks: 0, orders: 0, confirmed: 0, confirmed_amount: 0, commission: 0, canceled: 0, ...blank }).get(m)!;
  for (const [m, v] of deliveredByMonth((oi.data || []) as Delivered[], partnerId)) { const x = get(m); x.order_sales = v.sales; x.order_shipping = v.shipping; x.order_discount = v.discount; }
  for (const s of (st.data || []) as Settlement[]) get(s.month).settlement = s;
  const now = currentMonth();
  for (const m of by.values()) { m.order_fee = fee(m.order_sales - m.order_discount, rates.order); m.open = m.month >= now; }
  return [...by.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** 지난 달 마감 — 그 달의 숫자를 다시 세어 적는다. 정산을 끝낸 달은 고치지 않는다 */
export async function closeMonth(sb: Sb, partnerId: string, month: string, userId: string | null): Promise<Settlement> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("달은 2026-11 처럼 적어 주세요");
  if (month >= currentMonth()) throw new Error("끝난 달만 마감할 수 있어요");
  const rates = await partnerRates(sb, partnerId);
  const { start, end } = monthRange(month);
  const [prev, c, o, oi] = await Promise.all([
    sb.from("partner_settlements").select("status").eq("partner_id", partnerId).eq("month", month).maybeSingle(),
    sb.from("product_clicks").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).gte("created_at", start).lt("created_at", end),
    sb.from("partner_conversions").select("amount, status, commission").eq("partner_id", partnerId).gte("ordered_at", start).lt("ordered_at", end).limit(100000),
    sb.from("order_items").select(DELIVERED_COLS).eq("partner_id", partnerId).eq("fulfil_status", "delivered").gte("delivered_at", start).lt("delivered_at", end).limit(100000),
  ]);
  for (const r of [prev, c, o, oi]) if (r.error) throw new Error(r.error.message);
  if (prev.data?.status === "paid") throw new Error("이미 정산을 끝낸 달이에요");
  const confirmed = ((o.data || []) as { amount: number; status: string; commission: number | null }[]).filter((r) => r.status === "confirmed");
  if (confirmed.length > 0 && rates.link === null) throw new Error("구매 수수료율을 먼저 저장해 주세요");
  const app = deliveredByMonth((oi.data || []) as Delivered[], partnerId).get(month) || { sales: 0, shipping: 0, discount: 0 };
  if (app.sales > 0 && rates.order === null) throw new Error("앱 주문 수수료율을 먼저 저장해 주세요");
  const row = {
    partner_id: partnerId, month, clicks: c.count || 0, orders: (o.data || []).length,
    confirmed_amount: confirmed.reduce((s, r) => s + r.amount, 0), commission: confirmed.reduce((s, r) => s + (r.commission || 0), 0),
    order_sales: app.sales, order_shipping: app.shipping, order_discount: app.discount, order_fee: fee(app.sales - app.discount, rates.order),
    status: "closed", closed_at: new Date().toISOString(), closed_by: userId, paid_at: null,
  };
  const { data, error } = await sb.from("partner_settlements").upsert(row, { onConflict: "partner_id,month" }).select(SETTLE_COLS).single();
  if (error) throw new Error(error.message);
  return data;
}

/** 정산 끝 — 서로 줄 돈(구매 수수료·앱 주문 대금)을 주고받은 뒤. 마감한 달만 */
export async function markPaid(sb: Sb, partnerId: string, month: string, note: string | null): Promise<void> {
  const { data, error } = await sb.from("partner_settlements").update({ status: "paid", paid_at: new Date().toISOString(), note: note?.slice(0, 200) || null })
    .eq("partner_id", partnerId).eq("month", month).eq("status", "closed").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("마감한 달만 정산을 끝낼 수 있어요");
}
