/**
 * 월별 정산 — 지난 달을 마감하면 그때의 숫자를 partner_settlements 에 적어 둔다. 서버 전용.
 *  · 구매 링크 수수료: 그 달에 주문되어 구매확정된 금액 × 받은 때의 수수료율 (업체 → 케어푸드)
 *  · 앱 주문: 그 달에 배송 완료된 주문의 판매액과 수수료 (케어푸드가 받아 둔 돈에서 수수료를 빼고 업체에 준다)
 * 마감 뒤에 주문 상태가 바뀌면 지금 숫자와 마감 숫자가 달라진다 — 입금 확인 전에는 다시 마감할 수 있다.
 */
import { monthlySummary, type MonthSummary } from "./conversions";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Settlement = {
  month: string; clicks: number; orders: number; confirmed_amount: number; commission: number;
  order_sales: number; order_fee: number; status: "closed" | "paid"; closed_at: string; paid_at: string | null; note: string | null;
};
export type SettlementMonth = MonthSummary & { order_sales: number; order_fee: number; open: boolean; settlement: Settlement | null };

const kstMonth = (iso: string | number) => new Date((typeof iso === "number" ? iso : Date.parse(iso)) + 9 * 3600e3).toISOString().slice(0, 7);
export const currentMonth = () => kstMonth(Date.now());
/** 'YYYY-MM' → 그 달의 한국 시간 시작·끝 (ISO) */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: new Date(`${month}-01T00:00:00+09:00`).toISOString(), end: new Date(`${next}-01T00:00:00+09:00`).toISOString() };
}
const fee = (sales: number, rate: number | null) => (rate === null ? 0 : Math.round((sales * rate) / 100));

async function partnerRate(sb: Sb, partnerId: string): Promise<number | null> {
  const { data, error } = await sb.from("partners").select("commission_rate").eq("id", partnerId).single();
  if (error) throw new Error(error.message);
  return data.commission_rate === null || data.commission_rate === undefined ? null : Number(data.commission_rate);
}

/** 최근 6개월 — 달별 지금 숫자 + 마감해 둔 숫자 */
export async function settlementMonths(sb: Sb, partnerId: string): Promise<SettlementMonth[]> {
  const since = new Date(Date.now() - 185 * 86400e3).toISOString();
  const [months, rate, oi, st] = await Promise.all([
    monthlySummary(sb, partnerId),
    partnerRate(sb, partnerId),
    sb.from("order_items").select("unit_price, quantity, delivered_at").eq("partner_id", partnerId).eq("fulfil_status", "delivered").gte("delivered_at", since).limit(100000),
    sb.from("partner_settlements").select("month, clicks, orders, confirmed_amount, commission, order_sales, order_fee, status, closed_at, paid_at, note").eq("partner_id", partnerId),
  ]);
  if (oi.error || st.error) throw new Error((oi.error || st.error).message);
  const by = new Map<string, SettlementMonth>(months.map((m) => [m.month, { ...m, order_sales: 0, order_fee: 0, open: true, settlement: null }]));
  const get = (m: string) => by.get(m) || by.set(m, { month: m, clicks: 0, orders: 0, confirmed: 0, confirmed_amount: 0, commission: 0, canceled: 0, order_sales: 0, order_fee: 0, open: true, settlement: null }).get(m)!;
  for (const r of oi.data || []) get(kstMonth(r.delivered_at)).order_sales += (r.unit_price || 0) * (r.quantity || 1);
  for (const s of (st.data || []) as Settlement[]) get(s.month).settlement = s;
  const now = currentMonth();
  for (const m of by.values()) { m.order_fee = fee(m.order_sales, rate); m.open = m.month >= now; }
  return [...by.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** 지난 달 마감 — 그 달의 숫자를 다시 세어 적는다. 입금 확인한 달은 고치지 않는다 */
export async function closeMonth(sb: Sb, partnerId: string, month: string, userId: string | null): Promise<Settlement> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("달은 2026-11 처럼 적어 주세요");
  if (month >= currentMonth()) throw new Error("끝난 달만 마감할 수 있어요");
  const rate = await partnerRate(sb, partnerId);
  if (rate === null) throw new Error("수수료율을 먼저 저장해 주세요");
  const { start, end } = monthRange(month);
  const [prev, c, o, oi] = await Promise.all([
    sb.from("partner_settlements").select("status").eq("partner_id", partnerId).eq("month", month).maybeSingle(),
    sb.from("product_clicks").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).gte("created_at", start).lt("created_at", end),
    sb.from("partner_conversions").select("amount, status, commission").eq("partner_id", partnerId).gte("ordered_at", start).lt("ordered_at", end).limit(100000),
    sb.from("order_items").select("unit_price, quantity").eq("partner_id", partnerId).eq("fulfil_status", "delivered").gte("delivered_at", start).lt("delivered_at", end).limit(100000),
  ]);
  for (const r of [prev, c, o, oi]) if (r.error) throw new Error(r.error.message);
  if (prev.data?.status === "paid") throw new Error("이미 입금 확인한 달이에요");
  const confirmed = ((o.data || []) as { amount: number; status: string; commission: number | null }[]).filter((r) => r.status === "confirmed");
  const order_sales = ((oi.data || []) as { unit_price: number | null; quantity: number | null }[]).reduce((s, r) => s + (r.unit_price || 0) * (r.quantity || 1), 0);
  const row = {
    partner_id: partnerId, month, clicks: c.count || 0, orders: (o.data || []).length,
    confirmed_amount: confirmed.reduce((s, r) => s + r.amount, 0), commission: confirmed.reduce((s, r) => s + (r.commission || 0), 0),
    order_sales, order_fee: fee(order_sales, rate), status: "closed", closed_at: new Date().toISOString(), closed_by: userId, paid_at: null,
  };
  const { data, error } = await sb.from("partner_settlements").upsert(row, { onConflict: "partner_id,month" })
    .select("month, clicks, orders, confirmed_amount, commission, order_sales, order_fee, status, closed_at, paid_at, note").single();
  if (error) throw new Error(error.message);
  return data;
}

/** 입금 확인 — 마감한 달만 */
export async function markPaid(sb: Sb, partnerId: string, month: string, note: string | null): Promise<void> {
  const { data, error } = await sb.from("partner_settlements").update({ status: "paid", paid_at: new Date().toISOString(), note: note?.slice(0, 200) || null })
    .eq("partner_id", partnerId).eq("month", month).eq("status", "closed").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("마감한 달만 입금 확인할 수 있어요");
}
