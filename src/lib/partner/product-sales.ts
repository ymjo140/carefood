/**
 * 제품별 판매·출고 — 앱 주문 기준 (v3 10.3·10.4). 서버 전용. 제품은 업체 제품 코드(partner_sku)로 묶는다.
 *  · 판매 현황(board): 지금 처리할 것 — 새 주문·출고 준비·배송 중·취소 요청 줄 수, 재고, 지난 30일 판매 수량
 *  · 성과(sales): 기간(from 이상 to 미만, 결제 시각 기준) 판매 수량·판매액·구매자·재주문율·평균 재주문 간격·취소율
 *    재주문율 = 기간 안에 이 제품을 산 사람 중, 기간 끝까지 이 제품을 서로 다른 주문으로 두 번 이상 산 사람. 우리 구매자라 가리지 않는다.
 */
import { LOW_STOCK } from "./stock";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400e3;

type Row = {
  order_id: string; partner_sku: string | null; product_name: string | null; quantity: number | null; unit_price: number | null;
  fulfil_status: string; cancel_requested_at: string | null; orders: { user_id: string; paid_at: string };
};
const COLS = "order_id, partner_sku, product_name, quantity, unit_price, fulfil_status, cancel_requested_at, orders!inner(user_id, paid_at)";

async function rows(sb: Sb, partnerId: string, until?: number): Promise<Row[]> {
  let q = sb.from("order_items").select(COLS).eq("partner_id", partnerId).not("orders.paid_at", "is", null).limit(50000);
  if (until) q = q.lt("orders.paid_at", new Date(until).toISOString());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export type BoardRow = {
  item_id: string | null; sku: string; name: string; status: string | null; stock: number | null; low: boolean;
  new: number; accepted: number; shipped: number; cancel_requests: number; sold_30: number;
};

/** 판매 현황 — 내 제품(판매 종료 제외) + 주문이 있었던 코드 */
export async function productBoard(sb: Sb, partnerId: string): Promise<BoardRow[]> {
  const now = Date.now();
  const [its, rs] = await Promise.all([
    sb.from("partner_items").select("id, partner_sku, status, stock, data->>name").eq("partner_id", partnerId).neq("status", "discontinued").limit(5000),
    rows(sb, partnerId),
  ]);
  if (its.error) throw new Error(its.error.message);
  const by = new Map<string, BoardRow>();
  for (const it of (its.data || []) as { id: string; partner_sku: string; stock: number | null; name: string; status: string }[]) {
    by.set(it.partner_sku, { item_id: it.id, sku: it.partner_sku, name: it.name || it.partner_sku, status: it.status, stock: it.stock, low: it.stock !== null && it.stock <= LOW_STOCK, new: 0, accepted: 0, shipped: 0, cancel_requests: 0, sold_30: 0 });
  }
  for (const r of rs) {
    const sku = r.partner_sku || r.product_name || "제품";
    const b = by.get(sku) || by.set(sku, { item_id: null, sku, name: r.product_name || sku, status: null, stock: null, low: false, new: 0, accepted: 0, shipped: 0, cancel_requests: 0, sold_30: 0 }).get(sku)!;
    if (r.fulfil_status === "new") b.new++;
    else if (r.fulfil_status === "accepted") { b.accepted++; if (r.cancel_requested_at) b.cancel_requests++; }
    else if (r.fulfil_status === "shipped") b.shipped++;
    if (r.fulfil_status !== "canceled" && Date.parse(r.orders.paid_at) >= now - 30 * DAY) b.sold_30 += r.quantity || 1;
  }
  // 처리할 것이 많은 제품 먼저
  return [...by.values()].sort((a, b) => (b.cancel_requests * 10 + b.new + b.accepted) - (a.cancel_requests * 10 + a.new + a.accepted) || b.sold_30 - a.sold_30);
}

export type SalesRow = {
  sku: string; name: string; quantity: number; revenue: number; buyers: number; repeat_buyers: number; repeat_rate: number | null;
  avg_gap: number | null; canceled: number; cancel_rate: number | null;
};

/** 기간 성과 — 제품별 */
export async function productSales(sb: Sb, partnerId: string, range: { from: number; to: number }) {
  const rs = await rows(sb, partnerId, range.to);
  type Acc = { name: string; qty: number; rev: number; canceled: number; buyers: Set<string>; orders: Map<string, Set<string>>; times: Map<string, number[]> };
  const by = new Map<string, Acc>();
  for (const r of rs) {
    const sku = r.partner_sku || r.product_name || "제품";
    const a = by.get(sku) || by.set(sku, { name: r.product_name || sku, qty: 0, rev: 0, canceled: 0, buyers: new Set(), orders: new Map(), times: new Map() }).get(sku)!;
    const at = Date.parse(r.orders.paid_at);
    const user = r.orders.user_id;
    if (r.fulfil_status !== "canceled") {
      // 기간 끝까지의 모든 주문 — 재주문 셈
      const os = a.orders.get(user) || a.orders.set(user, new Set()).get(user)!;
      if (!os.has(r.order_id)) { os.add(r.order_id); (a.times.get(user) || a.times.set(user, []).get(user)!).push(at); }
    }
    if (at < range.from) continue;
    if (r.fulfil_status === "canceled") { a.canceled += r.quantity || 1; continue; }
    a.qty += r.quantity || 1;
    a.rev += (r.unit_price || 0) * (r.quantity || 1);
    a.buyers.add(user);
  }
  const out: SalesRow[] = [...by.entries()].filter(([, a]) => a.buyers.size > 0 || a.canceled > 0).map(([sku, a]) => {
    const repeaters = [...a.buyers].filter((u) => (a.orders.get(u)?.size || 0) >= 2);
    const gaps = repeaters.flatMap((u) => { const t = [...(a.times.get(u) || [])].sort((x, y) => x - y); return t.slice(1).map((v, i) => (v - t[i]) / DAY); });
    const total = a.qty + a.canceled;
    return {
      sku, name: a.name, quantity: a.qty, revenue: a.rev, buyers: a.buyers.size, repeat_buyers: repeaters.length,
      repeat_rate: a.buyers.size ? Math.round((repeaters.length / a.buyers.size) * 100) : null,
      avg_gap: gaps.length ? Math.round(gaps.reduce((s, v) => s + v, 0) / gaps.length) : null,
      canceled: a.canceled, cancel_rate: total ? Math.round((a.canceled / total) * 100) : null,
    };
  }).sort((x, y) => y.revenue - x.revenue);
  // 합계는 모든 제품으로 — 구매자는 사람 단위로 한 번
  const allBuyers = new Set<string>(), allRepeat = new Set<string>();
  for (const a of by.values()) for (const u of a.buyers) { allBuyers.add(u); if ((a.orders.get(u)?.size || 0) >= 2) allRepeat.add(u); }
  return {
    rows: out,
    totals: { quantity: out.reduce((s, r) => s + r.quantity, 0), revenue: out.reduce((s, r) => s + r.revenue, 0), buyers: allBuyers.size, repeat_buyers: allRepeat.size },
  };
}
