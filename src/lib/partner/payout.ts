/**
 * 앱 주문 대금 — 구매확정 기준 (11/14 결정). 서버 전용. 정산 화면·월 마감·엑셀이 모두 이 계산 하나를 쓴다.
 *  · 구매확정: 구매자가 업체 묶음에서 '구매확정하기'를 누른 때, 아니면 배송 완료 + 8일. order_auto_confirm() 이 늦게 돌아도
 *    계산은 같은 규칙으로 확정을 본다(effConfirm).
 *  · 업체 묶음(주문 하나 × 업체 하나) 단위로 센다: 판매액 − 업체 쿠폰 할인 + 배송비 − 수수료. 수수료는 묶음마다 반올림해서
 *    날짜별 합 = 달 합 = 엑셀 합이 늘 같다.
 *  · 확정일(한국 시간)이 속한 달에 정산하고, 다음 달 10일에 지급한다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400e3;
const KST = 9 * 3600e3;
export const CONFIRM_DAYS = 8;
export const PAY_DAY = 10;

export const kstDay = (t: number) => new Date(t + KST).toISOString().slice(0, 10);
export const kstMonthOf = (t: number) => new Date(t + KST).toISOString().slice(0, 7);
/** 'YYYY-MM' 의 정산 대금을 주는 날 — 다음 달 10일 ('YYYY-MM-DD') */
export function payDate(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-${String(PAY_DAY).padStart(2, "0")}` : `${y}-${String(m + 1).padStart(2, "0")}-${String(PAY_DAY).padStart(2, "0")}`;
}

type Line = {
  order_id: string; partner_sku: string | null; return_status: string | null; product_name: string; unit_price: number | null; quantity: number | null; fulfil_status: string;
  delivered_at: string | null; confirmed_at: string | null; confirm_by: string | null;
  orders: { paid_at: string; shipping_fees: Record<string, number> | null; discount_fees: Record<string, number> | null };
};
const COLS = "order_id, partner_sku, return_status, product_name, unit_price, quantity, fulfil_status, delivered_at, confirmed_at, confirm_by, orders!inner(paid_at, shipping_fees, discount_fees)";

/** 한 줄이 구매확정된 때 (아직이면 null). 반품·교환 요청·회수 중이면 확정하지 않는다 */
export function effConfirm(l: Pick<Line, "fulfil_status" | "delivered_at" | "confirmed_at"> & { return_status?: string | null }, now = Date.now()): number | null {
  if (l.fulfil_status !== "delivered") return null;
  if (!l.confirmed_at && (l.return_status === "requested" || l.return_status === "approved")) return null;
  if (l.confirmed_at) return Date.parse(l.confirmed_at);
  if (!l.delivered_at) return null;
  const auto = Date.parse(l.delivered_at) + CONFIRM_DAYS * DAY;
  return auto <= now ? auto : null;
}

export type Stage = "preparing" | "shipping" | "delivered" | "confirmed";
export type Bundle = {
  order_id: string; paid_at: string; delivered_at: string | null; confirmed_at: number | null; confirm_by: "buyer" | "auto" | null; auto_at: number | null;
  stage: Stage; lines: { sku: string | null; name: string; qty: number; amount: number }[];
  sales: number; discount: number; shipping: number; fee: number; payout: number;
};

/** 줄 → 업체 묶음 (취소 줄은 뺀다, 다 취소된 묶음은 없다) */
export function toBundles(lines: Line[], partnerId: string, rate: number | null, now = Date.now()): Bundle[] {
  const by = new Map<string, Line[]>();
  for (const l of lines) if (l.fulfil_status !== "canceled") (by.get(l.order_id) || by.set(l.order_id, []).get(l.order_id)!).push(l);
  const out: Bundle[] = [];
  for (const [order_id, ls] of by) {
    const o = ls[0].orders;
    const sales = ls.reduce((s, l) => s + (l.unit_price || 0) * (l.quantity || 1), 0);
    const discount = Number(o.discount_fees?.[partnerId] || 0), shipping = Number(o.shipping_fees?.[partnerId] || 0);
    const conf = ls.map((l) => effConfirm(l, now));
    const allDelivered = ls.every((l) => l.fulfil_status === "delivered");
    const confirmed = allDelivered && conf.every((c) => c !== null) ? Math.max(...(conf as number[])) : null;
    const stage: Stage = confirmed !== null ? "confirmed" : allDelivered ? "delivered" : ls.some((l) => l.fulfil_status === "shipped" || l.fulfil_status === "delivered") ? "shipping" : "preparing";
    const delivered = allDelivered ? ls.map((l) => l.delivered_at).filter((x): x is string => !!x).sort().pop() || null : null;
    const fee = rate === null ? 0 : Math.round(((sales - discount) * rate) / 100);
    out.push({
      order_id, paid_at: o.paid_at, delivered_at: delivered, confirmed_at: confirmed,
      confirm_by: confirmed === null ? null : ls.some((l) => l.confirm_by === "buyer") ? "buyer" : "auto",
      auto_at: delivered ? Date.parse(delivered) + CONFIRM_DAYS * DAY : null,
      stage, lines: ls.map((l) => ({ sku: l.partner_sku, name: l.product_name, qty: l.quantity || 1, amount: (l.unit_price || 0) * (l.quantity || 1) })),
      sales, discount, shipping, fee, payout: sales - discount + shipping - fee,
    });
  }
  return out;
}

async function page(q: () => any, max = 100000): Promise<Line[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Line[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as Line[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * 묶음 불러오기 — 배송 완료가 deliveredFrom 이후인 줄 + (live 면) 아직 배송 완료 전인 결제된 줄.
 * 확정은 배송 완료 뒤 8일 안에 일어나므로, 어떤 기간의 확정을 세려면 그 기간 시작 8일 전부터 배송 완료된 줄이면 충분하다.
 */
export async function loadBundles(sb: Sb, partnerId: string, rate: number | null, opts: { deliveredFrom: number; deliveredTo?: number; live?: boolean }, now = Date.now()) {
  const delivered = page(() => {
    let q = sb.from("order_items").select(COLS).eq("partner_id", partnerId).eq("fulfil_status", "delivered").not("orders.paid_at", "is", null)
      .gte("delivered_at", new Date(opts.deliveredFrom).toISOString());
    if (opts.deliveredTo) q = q.lt("delivered_at", new Date(opts.deliveredTo).toISOString());
    return q.order("delivered_at");
  });
  const live = opts.live ? page(() => sb.from("order_items").select(COLS).eq("partner_id", partnerId).in("fulfil_status", ["new", "accepted", "shipped"]).not("orders.paid_at", "is", null).order("created_at")) : Promise.resolve([]);
  const [a, b] = await Promise.all([delivered, live]);
  // 한 주문의 줄이 두 쪽에 나뉘면(일부만 배송 완료) 같은 묶음으로 합친다
  return toBundles([...a, ...b], partnerId, rate, now);
}

export type DayRow = { day: string; orders: number; sales: number; discount: number; shipping: number; fee: number; payout: number };
const blankDay = (day: string): DayRow => ({ day, orders: 0, sales: 0, discount: 0, shipping: 0, fee: 0, payout: 0 });

/** 'YYYY-MM' 달의 날마다 확정된 묶음 합 (없는 날은 0, 이번 달이면 오늘까지) */
export function dailyOf(bundles: Bundle[], month: string, now = Date.now()): DayRow[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = kstDay(now);
  const rows: DayRow[] = [];
  for (let d = 1; d <= days; d++) {
    const day = `${month}-${String(d).padStart(2, "0")}`;
    if (day > today) break;
    rows.push(blankDay(day));
  }
  const by = new Map(rows.map((r) => [r.day, r]));
  for (const b of bundles) {
    if (b.confirmed_at === null) continue;
    const r = by.get(kstDay(b.confirmed_at));
    if (!r) continue;
    r.orders++; r.sales += b.sales; r.discount += b.discount; r.shipping += b.shipping; r.fee += b.fee; r.payout += b.payout;
  }
  return rows;
}

/** 확정된 묶음의 달별 합 */
export function monthlyOf(bundles: Bundle[]) {
  const out = new Map<string, { orders: number; sales: number; discount: number; shipping: number; fee: number; payout: number }>();
  for (const b of bundles) {
    if (b.confirmed_at === null) continue;
    const k = kstMonthOf(b.confirmed_at);
    const v = out.get(k) || out.set(k, { orders: 0, sales: 0, discount: 0, shipping: 0, fee: 0, payout: 0 }).get(k)!;
    v.orders++; v.sales += b.sales; v.discount += b.discount; v.shipping += b.shipping; v.fee += b.fee; v.payout += b.payout;
  }
  return out;
}

/** 'YYYY-MM' → 그 달의 한국 시간 시작·끝 (ms) */
export function monthMs(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: Date.UTC(y, m - 1, 1) - KST, to: Date.UTC(y, m, 1) - KST };
}
export const CONFIRM_WINDOW = CONFIRM_DAYS * DAY;
