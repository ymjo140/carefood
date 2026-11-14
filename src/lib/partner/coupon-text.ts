/** 쿠폰 종류와 한 줄 설명 — 화면·서버가 같이 쓴다 (v3 10.2) */
export const COUPON_KIND = { amount: "정액 할인", percent: "정률 할인", free_shipping: "무료배송" } as const;
export type CouponKind = keyof typeof COUPON_KIND;
export type Coupon = {
  id: string; partner_id: string; name: string; kind: CouponKind; value: number; max_discount: number | null; min_order: number;
  valid_days: number; status: "active" | "stopped"; created_at: string;
};

const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;
/** "3,000원 할인 · 2만 원 이상" 같은 한 줄 */
export function couponText(c: Pick<Coupon, "kind" | "value" | "max_discount" | "min_order">) {
  const main = c.kind === "amount" ? `${won(c.value)} 할인` : c.kind === "percent" ? `${c.value}% 할인${c.max_discount ? ` (최대 ${won(c.max_discount)})` : ""}` : "배송비 무료";
  return c.min_order > 0 ? `${main} · ${won(c.min_order)} 이상` : main;
}

