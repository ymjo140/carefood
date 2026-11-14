/**
 * 업체 혜택(쿠폰) — 업체가 만들고, 자기 고객에게 준다 (v3 10.2). 서버 전용.
 *  · 종류: 정액 할인 · 정률 할인(최대 할인 금액) · 무료배송. 최소 주문 금액·받은 날부터 쓸 수 있는 날 수.
 *  · 결제할 때 업체 묶음마다 쓸 수 있는 것 중 할인이 가장 큰 하나를 자동으로 쓴다(조건부 update — 두 주문이 같은 쿠폰을 쓰지 못한다).
 *  · 할인은 업체 부담 — 정산에서 판매액에서 빼고, 수수료는 뺀 금액에 매긴다.
 *  · 쿠폰을 받았다는 알림은 광고다: 광고 동의자에게만, 21~8시는 야간 동의자에게만, 제목 앞에 (광고).
 *    동의하지 않은 사람도 쿠폰은 받는다 — 결제 화면에서 저절로 쓰인다.
 */
import { adText, isNight } from "./crm";
import { adsConsented } from "./customers";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400e3;

import { COUPON_KIND, couponText, type Coupon, type CouponKind } from "./coupon-text";
export { COUPON_KIND, couponText, type Coupon, type CouponKind };
export const COUPON_COLS = "id, partner_id, name, kind, value, max_discount, min_order, valid_days, status, created_at";

/** 이 묶음에 쓰면 얼마 할인되나 — 못 쓰면 0 */
export function discountOf(c: Pick<Coupon, "kind" | "value" | "max_discount" | "min_order">, subtotal: number, shippingFee: number) {
  if (subtotal <= 0 || subtotal < c.min_order) return 0;
  if (c.kind === "amount") return Math.min(c.value, subtotal);
  if (c.kind === "percent") {
    const d = Math.floor((subtotal * c.value) / 100 / 10) * 10; // 10원 단위 버림
    return Math.min(d, c.max_discount ?? d, subtotal);
  }
  return shippingFee;
}

/** 새 쿠폰 값 검사 */
export function parseCoupon(b: Record<string, unknown>): { coupon: Omit<Coupon, "id" | "partner_id" | "status" | "created_at"> } | { error: string } {
  const name = String(b.name || "").trim();
  if (name.length < 2 || name.length > 30) return { error: "쿠폰 이름은 2~30자로 적어 주세요" };
  const kind = String(b.kind) as CouponKind;
  if (!(kind in COUPON_KIND)) return { error: "혜택 종류를 골라 주세요" };
  const int = (v: unknown) => Math.floor(Number(v) || 0);
  const value = kind === "free_shipping" ? 0 : int(b.value);
  if (kind === "amount" && (value < 500 || value > 100000)) return { error: "할인 금액은 500원~10만 원으로 적어 주세요" };
  if (kind === "percent" && (value < 1 || value > 50)) return { error: "할인율은 1~50%로 적어 주세요" };
  const max = b.max_discount === "" || b.max_discount == null ? null : int(b.max_discount);
  if (kind === "percent" && max !== null && (max < 1 || max > 100000)) return { error: "최대 할인 금액은 10만 원까지예요" };
  const min = int(b.min_order);
  if (min < 0 || min > 1000000) return { error: "최소 주문 금액을 다시 적어 주세요" };
  const days = int(b.valid_days);
  if (days < 1 || days > 90) return { error: "쓸 수 있는 기간은 1~90일이에요" };
  return { coupon: { name, kind, value, max_discount: kind === "percent" ? max : null, min_order: min, valid_days: days } };
}

/** 쿠폰마다 준 수·쓴 수·할인한 금액·쓴 주문의 상품 금액 */
export async function couponStats(sb: Sb, partnerId: string) {
  const { data, error } = await sb.from("coupon_grants").select("coupon_id, status, discount_amount, used_order_id").eq("partner_id", partnerId).limit(50000);
  if (error) throw new Error(error.message);
  const out = new Map<string, { granted: number; used: number; discount: number }>();
  for (const g of (data || []) as { coupon_id: string; status: string; discount_amount: number }[]) {
    const s = out.get(g.coupon_id) || out.set(g.coupon_id, { granted: 0, used: 0, discount: 0 }).get(g.coupon_id)!;
    s.granted++;
    if (g.status === "used") { s.used++; s.discount += g.discount_amount || 0; }
  }
  return out;
}

type Push = (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<boolean>;

/**
 * 쿠폰 주기 — 이미 쓸 수 있는 같은 쿠폰이 있는 사람은 건너뛴다. 동의한 사람에게는 알림함·이 기기 알림.
 * notify=false: 다른 알림(자동 알림)이 쿠폰을 같이 알린다 — 쿠폰 알림을 따로 넣지 않는다
 * 돌려주는 값: 준 사람 수, 건너뛴 수, 알림을 받은 사람 수, 지금은 밤이라 알림 없이 쿠폰만 준 사람 수
 */
export async function grantCoupon(sb: Sb, partner: { id: string; name: string }, coupon: Coupon, users: string[], source: "manual" | "flow" | "influencer", push?: Push, notify = true) {
  if (coupon.status !== "active") throw new Error("멈춘 쿠폰은 줄 수 없어요");
  const now = Date.now();
  const uniq = [...new Set(users)];
  const have = new Set<string>();
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await sb.from("coupon_grants").select("user_id").eq("coupon_id", coupon.id).eq("status", "active").gt("expires_at", new Date(now).toISOString()).in("user_id", uniq.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const r of data || []) have.add(r.user_id);
  }
  // 만료된 채 active 로 남은 것은 새로 줄 수 있게 닫는다 (같은 쿠폰 active 는 한 사람에 하나)
  const { error: xErr } = await sb.from("coupon_grants").update({ status: "revoked" }).eq("coupon_id", coupon.id).eq("status", "active").lte("expires_at", new Date(now).toISOString());
  if (xErr) throw new Error(xErr.message);
  const targets = uniq.filter((u) => !have.has(u));
  const ads = await adsConsented(sb, targets);
  const night = isNight(now);
  const expires = new Date(now + coupon.valid_days * DAY).toISOString();
  const granted: { id: string; user_id: string }[] = [];
  for (let i = 0; i < targets.length; i += 300) {
    const rows = targets.slice(i, i + 300).map((u) => ({
      coupon_id: coupon.id, partner_id: partner.id, user_id: u, source, expires_at: expires,
      notified: notify && ads.has(u) && (!night || ads.get(u)!.night),
    }));
    const { data, error } = await sb.from("coupon_grants").insert(rows).select("id, user_id");
    if (error) {
      if (error.code !== "23505") throw new Error(error.message);
      // 그새 다른 요청이 같은 사람에게 줬다 — 한 줄씩 다시
      for (const r of rows) {
        const { data: one, error: oErr } = await sb.from("coupon_grants").insert(r).select("id, user_id");
        if (oErr && oErr.code !== "23505") throw new Error(oErr.message);
        if (one?.[0]) granted.push(one[0]);
      }
    } else granted.push(...(data || []));
  }
  const notified = notify ? granted.filter((g) => ads.has(g.user_id) && (!night || ads.get(g.user_id)!.night)) : [];
  if (push) {
    const t = adText(partner.name, `${coupon.name} 쿠폰을 받았어요`, `${couponText(coupon)}. ${coupon.valid_days}일 안에 결제할 때 저절로 쓰여요`);
    for (const g of notified) {
      try { await push(g.user_id, { ...t, url: "/me/coupons", tag: `coupon-${coupon.id}` }); }
      catch (e) { console.error("쿠폰 알림을 보내지 못했어요:", g.user_id.slice(0, 8), (e as Error).message); } // 알림함에는 이미 들어갔다
    }
  }
  return { granted: granted.length, skipped: uniq.length - targets.length, notified: notified.length, quiet: granted.length - notified.length };
}

export type BestCoupon = { grant_id: string; name: string; discount: number };

/**
 * 결제할 때 업체 묶음마다 쓸 쿠폰 — 할인이 가장 큰 하나 (같으면 먼저 끝나는 것)
 * bundles: partner_id → {subtotal, fee}
 */
export async function bestCoupons(sb: Sb, userId: string, bundles: Map<string, { subtotal: number; fee: number }>): Promise<Map<string, BestCoupon>> {
  const out = new Map<string, BestCoupon>();
  if (bundles.size === 0) return out;
  const { data, error } = await sb.from("coupon_grants")
    .select(`id, partner_id, expires_at, partner_coupons!inner(${COUPON_COLS})`)
    .eq("user_id", userId).eq("status", "active").gt("expires_at", new Date().toISOString())
    .in("partner_id", [...bundles.keys()]).eq("partner_coupons.status", "active").limit(200);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message || "")) return out;
    throw new Error(error.message);
  }
  type G = { id: string; partner_id: string; expires_at: string; partner_coupons: Coupon };
  for (const g of ((data || []) as G[]).sort((a, b) => a.expires_at.localeCompare(b.expires_at))) {
    const b = bundles.get(g.partner_id)!;
    const d = discountOf(g.partner_coupons, b.subtotal, b.fee);
    if (d > 0 && d > (out.get(g.partner_id)?.discount || 0)) out.set(g.partner_id, { grant_id: g.id, name: g.partner_coupons.name, discount: d });
  }
  return out;
}

/** 쿠폰을 쓴다 — 아직 쓸 수 있을 때만. 못 쓰면 false (그새 다른 주문에서 썼거나 끝남) */
export async function spendCoupon(sb: Sb, grantId: string, userId: string, orderId: string, amount: number) {
  const { data, error } = await sb.from("coupon_grants").update({ status: "used", used_order_id: orderId, used_at: new Date().toISOString(), discount_amount: amount })
    .eq("id", grantId).eq("user_id", userId).eq("status", "active").gt("expires_at", new Date().toISOString()).select("id");
  if (error) throw new Error(error.message);
  return !!data?.length;
}

/** 묶음이 통째로 취소되면 그 묶음에 쓴 쿠폰을 돌려준다 (기간이 남아 있을 때) */
export async function restoreCoupons(sb: Sb, orderId: string, partnerIds: string[]) {
  if (partnerIds.length === 0) return;
  const { error } = await sb.from("coupon_grants").update({ status: "active", used_order_id: null, used_at: null, discount_amount: 0 })
    .eq("used_order_id", orderId).eq("status", "used").in("partner_id", partnerIds).gt("expires_at", new Date().toISOString());
  // 같은 쿠폰을 그새 다시 받아 active 가 둘이 되면 막힌다 — 그때는 돌려주지 않는다
  if (error && error.code !== "23505") throw new Error(error.message);
}

/** 알림함 — 내가 받은 쿠폰 (알림을 보낸 것만, 30일) */
export async function couponNotifications(sb: Sb, actor: string) {
  const { data, error } = await sb.from("coupon_grants").select("id, granted_at, partner_coupons(name, kind, value, max_discount, min_order, valid_days), partners(name)")
    .eq("user_id", actor).eq("notified", true).gte("granted_at", new Date(Date.now() - 30 * DAY).toISOString()).order("granted_at", { ascending: false }).limit(20);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  type R = { id: string; granted_at: string; partner_coupons: Coupon | null; partners: { name: string } | null };
  return ((data || []) as R[]).filter((r) => r.partner_coupons).map((r) => ({
    id: `coupon-${r.id}`, type: "ad" as const, at: r.granted_at, who: r.partners?.name || "입점 업체",
    text: `${r.partner_coupons!.name} 쿠폰을 받았어요 — ${couponText(r.partner_coupons!)}`, url: "/me/coupons",
  }));
}

/** 내 쿠폰함 */
export async function myCoupons(sb: Sb, userId: string) {
  const { data, error } = await sb.from("coupon_grants").select(`id, status, granted_at, expires_at, used_at, discount_amount, partners(name), partner_coupons(${COUPON_COLS})`)
    .eq("user_id", userId).order("granted_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  const now = Date.now();
  type R = { id: string; status: string; granted_at: string; expires_at: string; used_at: string | null; discount_amount: number; partners: { name: string } | null; partner_coupons: Coupon | null };
  return ((data || []) as R[]).filter((r) => r.partner_coupons).map((r) => ({
    id: r.id, partner: r.partners?.name || "입점 업체", name: r.partner_coupons!.name, text: couponText(r.partner_coupons!),
    expires_at: r.expires_at, used_at: r.used_at, discount: r.discount_amount,
    status: r.status === "active" ? (Date.parse(r.expires_at) > now ? "active" : "expired") : r.status,
  }));
}
