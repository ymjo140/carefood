/**
 * 월별 정산 — 지난 달을 마감하면 그때의 숫자를 partner_settlements 에 적어 둔다. 서버 전용.
 *  · 구매 링크 수수료: 그 달에 주문되어 구매확정된 금액 × 받은 때의 수수료율 (업체 → 오늘끼록)
 *  · 앱 주문: 그 달에 구매확정된 업체 묶음의 판매액·배송비·업체 쿠폰 할인, (판매액 − 쿠폰 할인) × 앱 주문 수수료율
 *    (묶음마다 반올림 — lib/partner/payout.ts). 오늘끼록이 받아 둔 돈에서 업체에 줄 돈 = 판매액 − 쿠폰 할인 + 배송비 − 수수료.
 *    구매확정 = 구매자가 누른 때 또는 배송 완료 + 8일. 지급은 다음 달 10일
 * 마감 뒤에 주문 상태가 바뀌면 지금 숫자와 마감 숫자가 달라진다 — 정산을 끝내기 전에는 다시 마감할 수 있다.
 */
import { monthlySummary, type MonthSummary } from "./conversions";
import { CONFIRM_WINDOW, loadBundles, monthMs, monthlyOf } from "./payout";
import { asResult, selectAll } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Settlement = {
  month: string; clicks: number; orders: number; confirmed_amount: number; commission: number;
  order_sales: number; order_shipping: number; order_discount: number; order_fee: number; status: "closed" | "paid"; closed_at: string; paid_at: string | null; note: string | null;
  paid_amount: number | null;
};
export type SettlementMonth = MonthSummary & {
  order_sales: number; order_shipping: number; order_discount: number; order_fee: number; open: boolean; settlement: Settlement | null;
};
const SETTLE_COLS = "month, clicks, orders, confirmed_amount, commission, order_sales, order_shipping, order_discount, order_fee, status, closed_at, paid_at, note, paid_amount";

const kstMonth = (iso: string | number) => new Date((typeof iso === "number" ? iso : Date.parse(iso)) + 9 * 3600e3).toISOString().slice(0, 7);
export const currentMonth = () => kstMonth(Date.now());
/** 'YYYY-MM' → 그 달의 한국 시간 시작·끝 (ISO) */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: new Date(`${month}-01T00:00:00+09:00`).toISOString(), end: new Date(`${next}-01T00:00:00+09:00`).toISOString() };
}
const rateOf = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/** 업체에 줄 앱 주문 대금 */
export const orderPayout = (m: { order_sales: number; order_shipping: number; order_discount?: number; order_fee: number }) => m.order_sales - (m.order_discount || 0) + m.order_shipping - m.order_fee;

async function partnerRates(sb: Sb, partnerId: string): Promise<{ link: number | null; order: number | null }> {
  const { data, error } = await sb.from("partners").select("commission_rate, order_commission_rate").eq("id", partnerId).single();
  if (error) throw new Error(error.message);
  return { link: rateOf(data.commission_rate), order: rateOf(data.order_commission_rate) };
}

/** 최근 6개월 — 달별 지금 숫자 + 마감해 둔 숫자 (앱 주문은 구매확정된 달) */
export async function settlementMonths(sb: Sb, partnerId: string): Promise<SettlementMonth[]> {
  // 이번 달 포함 여섯 달 — 첫 달 1일(한국 자정)부터 세야 그 달 숫자가 잘리지 않는다 (185일 전부터 세면 첫 달이 반쪽이었다)
  let first = currentMonth();
  for (let i = 0; i < 5; i++) first = previousMonth(Date.parse(`${first}-15T00:00:00+09:00`));
  const since = monthMs(first).from;
  const rates = await partnerRates(sb, partnerId);
  const [months, bundles, st] = await Promise.all([
    monthlySummary(sb, partnerId, since),
    loadBundles(sb, partnerId, rates.order, { deliveredFrom: since - CONFIRM_WINDOW }),
    sb.from("partner_settlements").select(SETTLE_COLS).eq("partner_id", partnerId),
  ]);
  if (st.error) throw new Error(st.error.message);
  const blank = { order_sales: 0, order_shipping: 0, order_discount: 0, order_fee: 0, open: true, settlement: null };
  const by = new Map<string, SettlementMonth>(months.map((m) => [m.month, { ...m, ...blank }]));
  const get = (m: string) => by.get(m) || by.set(m, { month: m, clicks: 0, orders: 0, confirmed: 0, confirmed_amount: 0, commission: 0, canceled: 0, ...blank }).get(m)!;
  for (const [m, v] of monthlyOf(bundles)) {
    if (monthMs(m).from < since) continue; // 여섯 달 밖 — 배송 완료 창 끝에 걸린 일부만 잡혀 숫자가 틀린다
    const x = get(m); x.order_sales = v.sales; x.order_shipping = v.shipping; x.order_discount = v.discount; x.order_fee = v.fee;
  }
  for (const s of (st.data || []) as Settlement[]) get(s.month).settlement = s;
  const now = currentMonth();
  for (const m of by.values()) m.open = m.month >= now;
  return [...by.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** 지난 달 마감 — 그 달의 숫자를 다시 세어 적는다. 정산을 끝낸 달은 고치지 않는다 */
export async function closeMonth(sb: Sb, partnerId: string, month: string, userId: string | null, opt: { auto?: boolean; dry?: boolean } = {}): Promise<Settlement | null> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("달은 2026-11 처럼 적어 주세요");
  if (month >= currentMonth()) throw new Error("끝난 달만 마감할 수 있어요");
  const rates = await partnerRates(sb, partnerId);
  const { start, end } = monthRange(month);
  const win = monthMs(month);
  const [prev, c, o, bundles] = await Promise.all([
    sb.from("partner_settlements").select("status").eq("partner_id", partnerId).eq("month", month).maybeSingle(),
    sb.from("product_clicks").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).gte("created_at", start).lt("created_at", end),
    asResult(selectAll<{ amount: number; status: string; commission: number | null }>(() => sb.from("partner_conversions").select("amount, status, commission").eq("partner_id", partnerId).gte("ordered_at", start).lt("ordered_at", end), "id", 1_000_000)),
    // 이 달에 확정된 묶음 — 확정은 배송 완료 뒤 8일 안이라, 배송 완료가 달 시작 8일 전 ~ 달 끝인 줄이면 충분하다
    loadBundles(sb, partnerId, rates.order, { deliveredFrom: win.from - CONFIRM_WINDOW, deliveredTo: win.to }),
  ]);
  for (const r of [prev, c, o]) if (r.error) throw new Error(r.error.message);
  if (prev.data?.status === "paid") throw new Error("이미 정산을 끝낸 달이에요");
  const confirmed = ((o.data || []) as { amount: number; status: string; commission: number | null }[]).filter((r) => r.status === "confirmed");
  if (confirmed.length > 0 && rates.link === null) throw new Error("구매 수수료율을 먼저 저장해 주세요");
  const app = monthlyOf(bundles).get(month) || { sales: 0, shipping: 0, discount: 0, fee: 0 };
  if (app.sales > 0 && rates.order === null) throw new Error("앱 주문 수수료율을 먼저 저장해 주세요");
  const row = {
    partner_id: partnerId, month, clicks: c.count || 0, orders: (o.data || []).length,
    confirmed_amount: confirmed.reduce((s, r) => s + r.amount, 0), commission: confirmed.reduce((s, r) => s + (r.commission || 0), 0),
    order_sales: app.sales, order_shipping: app.shipping, order_discount: app.discount, order_fee: app.fee,
    status: "closed", closed_at: new Date().toISOString(), closed_by: userId, paid_at: null, paid_amount: null, auto_closed: !!opt.auto,
  };
  // 미리 세기(dry) — 적지 않고 숫자만 (관리자 지급 대기열의 '아직 마감 안 된 달')
  if (opt.dry) return { ...row, status: "closed", note: null } as Settlement;
  // 자동 마감은 주고받을 돈이 없는 달은 적지 않는다
  if (opt.auto && row.orders === 0 && row.confirmed_amount === 0 && row.order_sales === 0 && row.order_shipping === 0) return null;
  // 읽고 → 쓰는 사이에 정산을 끝냈거나 다른 쪽이 마감했으면 덮어쓰지 않는다: 있던 줄은 '마감' 상태일 때만 고치고, 없던 줄은 새로 넣는다
  if (prev.data) {
    if (opt.auto) return null; // 자동 마감은 이미 마감한 달을 다시 세지 않는다
    const { data, error } = await sb.from("partner_settlements").update(row).eq("partner_id", partnerId).eq("month", month).eq("status", "closed").select(SETTLE_COLS);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("그새 정산을 끝낸 달이에요. 새로 불러와 주세요");
    return data[0];
  }
  const { data, error } = await sb.from("partner_settlements").insert(row).select(SETTLE_COLS).single();
  if (error) {
    if (error.code === "23505") { if (opt.auto) return null; throw new Error("그새 다른 곳에서 마감했어요. 새로 불러와 주세요"); }
    throw new Error(error.message);
  }
  return data;
}

/** 지난 달 → 'YYYY-MM' (한국 시간) */
export function previousMonth(now = Date.now()): string {
  const cur = kstMonth(now);
  const [y, m] = cur.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * 지난 달 자동 마감 — 운영 중인 업체 가운데 아직 마감하지 않은 업체만 (/api/push/run 이 30분마다).
 * 달이 끝나면 그 달에 확정된 묶음은 더 늘지 않는다(확정일 기준). 수수료율이 없는 업체 등 실패는 업체마다 기록하고 넘어간다 — 관리자가 손으로 마감
 */
export async function autoCloseLastMonth(sb: Sb, now = Date.now()): Promise<{ month: string; closed: number; skipped: number; failed: { partner_id: string; message: string }[] }> {
  const month = previousMonth(now);
  const [p, st] = await Promise.all([
    sb.from("partners").select("id").eq("status", "active").eq("is_demo", false),
    sb.from("partner_settlements").select("partner_id").eq("month", month),
  ]);
  if (p.error) throw new Error(p.error.message);
  if (st.error) throw new Error(st.error.message);
  const done = new Set(((st.data || []) as { partner_id: string }[]).map((r) => r.partner_id));
  const out = { month, closed: 0, skipped: 0, failed: [] as { partner_id: string; message: string }[] };
  for (const { id } of (p.data || []) as { id: string }[]) {
    if (done.has(id)) continue;
    try { if (await closeMonth(sb, id, month, null, { auto: true })) out.closed++; else out.skipped++; }
    catch (e) { out.failed.push({ partner_id: id, message: (e as Error).message }); }
  }
  return out;
}

/**
 * 정산 끝 — 서로 줄 돈(구매 수수료·앱 주문 대금)을 주고받은 뒤. 마감한 달만.
 * paidAmount: 실제로 보낸 금액(오늘끼록 → 업체가 +, 업체 → 오늘끼록이 −). 적으면 업체 화면에서 계산과 맞춰 본다
 */
export async function markPaid(sb: Sb, partnerId: string, month: string, note: string | null, paidAmount: number | null = null): Promise<void> {
  if (paidAmount !== null && (!Number.isInteger(paidAmount) || Math.abs(paidAmount) > 1_000_000_000)) throw new Error("보낸 금액을 다시 확인해 주세요");
  const { data, error } = await sb.from("partner_settlements").update({ status: "paid", paid_at: new Date().toISOString(), note: note?.slice(0, 200) || null, paid_amount: paidAmount })
    .eq("partner_id", partnerId).eq("month", month).eq("status", "closed").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("마감한 달만 정산을 끝낼 수 있어요");
}
