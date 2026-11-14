/**
 * 업체 고객 — 앱에서 이 업체 제품을 결제한 사람 (v3 10.2). 서버 전용.
 * 업체에는 연락처·이름·건강 목표를 주지 않는다. 사람은 업체마다 다른 가명 번호("7F3A2C")로만 보인다.
 * 주문 수는 결제한 주문 중 이 업체 묶음이 통째로 취소되지 않은 것. 금액은 상품 금액 − 쿠폰 할인 (배송비 뺌).
 */
import { createHash } from "node:crypto";
import { selectAll, selectAllIn } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400e3;

import { STAGES, type Stage } from "./customer-stages";
export { STAGES, isStage, type Stage } from "./customer-stages";

export function stageOf(orders: number, lastAt: number, now: number): Stage {
  const ago = (now - lastAt) / DAY;
  if (orders <= 1) return ago <= 30 ? "first" : "one_lapsed";
  if (ago <= 60) return orders >= 4 ? "loyal" : "repeat";
  return ago <= 120 ? "at_risk" : "lapsed";
}

/** 업체마다 다른 가명 번호 — 같은 사람이라도 업체가 다르면 번호가 다르다 */
export const customerCode = (partnerId: string, userId: string) =>
  createHash("sha256").update(`${partnerId}:${userId}`).digest("hex").slice(0, 6).toUpperCase();

export type CustomerOrder = {
  order_id: string; at: string; amount: number; discount: number; status: string; first: boolean;
  lines: { name: string; quantity: number }[];
};
export type Customer = {
  code: string; stage: Stage; orders: number; canceled: number; first_at: string; last_at: string; spend: number;
  avg_gap: number | null; top: string[]; ads: boolean; coupons: number;
};
type Row = {
  order_id: string; product_name: string | null; partner_sku: string | null; quantity: number | null; unit_price: number | null; fulfil_status: string;
  orders: { user_id: string; paid_at: string; discount_fees: Record<string, number> | null };
};

/** 업체 주문을 사람별로 — 내부용 (user_id 를 가진다. 업체 응답에는 code 만 내보낸다) */
export async function loadBuyers(sb: Sb, partnerId: string, now = Date.now()) {
  const data = await selectAll<Row>(() => sb.from("order_items")
    .select("order_id, product_name, partner_sku, quantity, unit_price, fulfil_status, orders!inner(user_id, paid_at, discount_fees)")
    .eq("partner_id", partnerId).not("orders.paid_at", "is", null), "id", 1_000_000);
  // 주문 하나 = 이 업체 묶음 하나
  const orders = new Map<string, { user: string; at: number; amount: number; discount: number; statuses: Set<string>; lines: Map<string, number> }>();
  for (const r of (data || []) as Row[]) {
    const o = orders.get(r.order_id) || orders.set(r.order_id, {
      user: r.orders.user_id, at: Date.parse(r.orders.paid_at), amount: 0, discount: Number(r.orders.discount_fees?.[partnerId] || 0), statuses: new Set(), lines: new Map(),
    }).get(r.order_id)!;
    o.statuses.add(r.fulfil_status);
    if (r.fulfil_status === "canceled") continue;
    o.amount += (r.unit_price || 0) * (r.quantity || 1);
    const name = r.product_name || r.partner_sku || "제품";
    o.lines.set(name, (o.lines.get(name) || 0) + (r.quantity || 1));
  }
  const byUser = new Map<string, { id: string; at: number; amount: number; discount: number; canceled: boolean; status: string; lines: Map<string, number> }[]>();
  for (const [id, o] of orders) {
    const canceled = o.statuses.size === 1 && o.statuses.has("canceled");
    const status = canceled ? "canceled" : [...o.statuses].filter((s) => s !== "canceled").sort((a, b) => ORDER_RANK[a] - ORDER_RANK[b])[0] || "new";
    (byUser.get(o.user) || byUser.set(o.user, []).get(o.user)!).push({ id, at: o.at, amount: o.amount, discount: canceled ? 0 : o.discount, canceled, status, lines: o.lines });
  }
  const buyers = [...byUser].map(([user, list]) => {
    list.sort((a, b) => a.at - b.at);
    const live = list.filter((o) => !o.canceled);
    const qty = new Map<string, number>();
    for (const o of live) for (const [n, q] of o.lines) qty.set(n, (qty.get(n) || 0) + q);
    const first = live[0], last = live[live.length - 1];
    return {
      user, code: customerCode(partnerId, user), list, live,
      orders: live.length, canceled: list.length - live.length,
      first_at: first ? first.at : list[0].at, last_at: last ? last.at : list[list.length - 1].at,
      spend: live.reduce((s, o) => s + Math.max(0, o.amount - o.discount), 0),
      avg_gap: live.length >= 2 ? Math.round((last.at - first.at) / DAY / (live.length - 1)) : null,
      top: [...qty].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n),
    };
  }).filter((b) => b.orders > 0); // 모두 취소한 사람은 고객으로 세지 않는다
  return buyers.map((b) => ({ ...b, stage: stageOf(b.orders, b.last_at, now) }));
}
export type Buyer = Awaited<ReturnType<typeof loadBuyers>>[number];
// 묶음 상태 — 덜 진행된 것을 묶음 상태로 본다
const ORDER_RANK: Record<string, number> = { new: 0, accepted: 1, shipped: 2, delivered: 3 };

/** id 목록을 300개씩 묻고 묶음마다 1,000줄 넘게도 끝까지 받는다 (한 사람에게 쿠폰이 여러 장일 수 있다) */
async function chunkIn<T>(sb: Sb, table: string, cols: string, key: string, ids: string[], extra?: (q: Sb) => Sb, order = key): Promise<T[]> {
  return selectAllIn<T>(ids, 300, (part) => { const q = sb.from(table).select(cols).in(key, part); return extra ? extra(q) : q; }, order);
}

/** 광고 동의한 사람 */
export async function adsConsented(sb: Sb, users: string[]): Promise<Map<string, { night: boolean }>> {
  const rows = await chunkIn<{ user_id: string; night: boolean }>(sb, "marketing_consents", "user_id, night", "user_id", users, (q) => q.eq("ads", true));
  return new Map(rows.map((r) => [r.user_id, { night: !!r.night }]));
}

/** 업체 화면용 고객 목록 */
export async function listCustomers(sb: Sb, partnerId: string) {
  const now = Date.now();
  const buyers = await loadBuyers(sb, partnerId, now);
  const users = buyers.map((b) => b.user);
  const [ads, grants] = await Promise.all([
    adsConsented(sb, users),
    chunkIn<{ user_id: string }>(sb, "coupon_grants", "user_id", "user_id", users, (q) => q.eq("partner_id", partnerId).eq("status", "active").gt("expires_at", new Date(now).toISOString()), "id"),
  ]);
  const coupons = new Map<string, number>();
  for (const g of grants) coupons.set(g.user_id, (coupons.get(g.user_id) || 0) + 1);
  const customers: Customer[] = buyers.sort((a, b) => b.last_at - a.last_at).map((b) => ({
    code: b.code, stage: b.stage, orders: b.orders, canceled: b.canceled, first_at: new Date(b.first_at).toISOString(), last_at: new Date(b.last_at).toISOString(),
    spend: b.spend, avg_gap: b.avg_gap, top: b.top, ads: ads.has(b.user), coupons: coupons.get(b.user) || 0,
  }));
  const counts = Object.fromEntries(Object.keys(STAGES).map((k) => [k, 0])) as Record<Stage, number>;
  for (const c of customers) counts[c.stage]++;
  // 30일 안 첫 주문 — 오늘 화면·주문 목록이 강조한다
  return { as_of: new Date(now).toISOString(), counts, total: customers.length, ads: customers.filter((c) => c.ads).length, customers };
}

/** 한 사람 — 주문 이력과 받은 혜택 */
export async function customerDetail(sb: Sb, partnerId: string, code: string) {
  const buyers = await loadBuyers(sb, partnerId);
  const b = buyers.find((x) => x.code === code);
  if (!b) return null;
  const [ads, grants] = await Promise.all([
    adsConsented(sb, [b.user]),
    sb.from("coupon_grants").select("id, status, granted_at, expires_at, used_at, discount_amount, source, partner_coupons(name)")
      .eq("partner_id", partnerId).eq("user_id", b.user).order("granted_at", { ascending: false }).limit(30),
  ]);
  if (grants.error) throw new Error(grants.error.message);
  const firstLive = b.live[0]?.id;
  const orders: CustomerOrder[] = [...b.list].reverse().map((o) => ({
    order_id: o.id.slice(0, 8), at: new Date(o.at).toISOString(), amount: o.amount, discount: o.discount, status: o.status, first: o.id === firstLive,
    lines: [...o.lines].map(([name, quantity]) => ({ name, quantity })),
  }));
  const now = Date.now();
  type G = { id: string; status: string; granted_at: string; expires_at: string; used_at: string | null; discount_amount: number; source: string; partner_coupons: { name: string } | null };
  return {
    code: b.code, stage: b.stage, orders: b.orders, canceled: b.canceled, first_at: new Date(b.first_at).toISOString(), last_at: new Date(b.last_at).toISOString(),
    spend: b.spend, avg_gap: b.avg_gap, top: b.top, ads: ads.has(b.user),
    history: orders,
    grants: ((grants.data || []) as G[]).map((g) => ({
      id: g.id, name: g.partner_coupons?.name || "쿠폰", source: g.source, granted_at: g.granted_at, expires_at: g.expires_at, used_at: g.used_at,
      discount: g.discount_amount, status: g.status === "active" && Date.parse(g.expires_at) <= now ? "expired" : g.status,
    })),
  };
}
