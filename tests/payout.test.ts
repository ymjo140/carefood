/** 앱 주문 대금 계산 (lib/partner/payout.ts) — 구매확정 규칙·묶음 합·반품 배송비·날짜 경계 */
import { describe, expect, it } from "vitest";
import { CONFIRM_DAYS, PAY_DAY, dailyOf, effConfirm, kstDay, monthMs, monthlyOf, payDate, toBundles, toReturnFeeBundles } from "@/lib/partner/payout";

const P = "partner-1";
const DAY = 86400e3;
const iso = (s: string) => new Date(s).toISOString();
type L = Parameters<typeof toBundles>[0][number];
const line = (order: string, over: Partial<L> = {}): L => ({
  order_id: order, partner_sku: "SKU-1", return_status: null, product_name: "닭가슴살 도시락", unit_price: 6900, quantity: 2,
  fulfil_status: "delivered", delivered_at: iso("2026-11-01T03:00:00Z"), confirmed_at: null, confirm_by: null,
  orders: { paid_at: iso("2026-10-30T03:00:00Z"), shipping_fees: { [P]: 3000 }, discount_fees: {} },
  ...over,
});

describe("구매확정 (effConfirm)", () => {
  const now = Date.parse("2026-11-20T00:00:00Z");
  it("배송 완료 + 8일이 지나면 그 시각에 확정", () => {
    expect(effConfirm(line("a"), now)).toBe(Date.parse("2026-11-01T03:00:00Z") + CONFIRM_DAYS * DAY);
  });
  it("8일이 안 지났으면 아직", () => {
    expect(effConfirm(line("a", { delivered_at: iso("2026-11-15T00:00:00Z") }), now)).toBeNull();
  });
  it("구매자가 누른 확정은 그 시각", () => {
    expect(effConfirm(line("a", { confirmed_at: iso("2026-11-02T00:00:00Z") }), now)).toBe(Date.parse("2026-11-02T00:00:00Z"));
  });
  it("발송·접수 상태는 확정이 아님", () => {
    expect(effConfirm(line("a", { fulfil_status: "shipped" }), now)).toBeNull();
  });
  it("반품·교환 요청·회수 중이면 8일이 지나도 확정하지 않음", () => {
    expect(effConfirm(line("a", { return_status: "requested" }), now)).toBeNull();
    expect(effConfirm(line("a", { return_status: "approved" }), now)).toBeNull();
  });
  it("거절·교환을 마친 뒤에는 다시 확정 규칙대로", () => {
    expect(effConfirm(line("a", { return_status: "rejected" }), now)).not.toBeNull();
  });
});

describe("업체 묶음 (toBundles)", () => {
  const now = Date.parse("2026-11-20T00:00:00Z");
  it("판매 − 쿠폰 + 배송비 − 수수료, 수수료는 (판매 − 쿠폰) × 율을 묶음마다 반올림", () => {
    const b = toBundles([line("a", { orders: { paid_at: iso("2026-10-30T03:00:00Z"), shipping_fees: { [P]: 3000 }, discount_fees: { [P]: 1385 } } })], P, 10, now)[0];
    expect(b.sales).toBe(13800);
    expect(b.discount).toBe(1385);
    expect(b.fee).toBe(Math.round((13800 - 1385) * 0.1)); // 1241.5 → 1242
    expect(b.payout).toBe(13800 - 1385 + 3000 - b.fee);
  });
  it("수수료율이 없으면 수수료 0", () => {
    expect(toBundles([line("a")], P, null, now)[0].fee).toBe(0);
  });
  it("취소 줄은 빼고, 다 취소된 묶음은 없다", () => {
    const bs = toBundles([line("a"), line("a", { fulfil_status: "canceled", unit_price: 99999 }), line("b", { fulfil_status: "canceled" })], P, 10, now);
    expect(bs.map((b) => b.order_id)).toEqual(["a"]);
    expect(bs[0].sales).toBe(13800);
  });
  it("묶음 확정은 모든 줄이 확정됐을 때, 늦은 쪽", () => {
    const later = iso("2026-11-05T00:00:00Z");
    const b = toBundles([line("a"), line("a", { delivered_at: later })], P, 10, now)[0];
    expect(b.confirmed_at).toBe(Date.parse(later) + CONFIRM_DAYS * DAY);
    const half = toBundles([line("a"), line("a", { fulfil_status: "shipped" })], P, 10, now)[0];
    expect(half.confirmed_at).toBeNull();
    expect(half.stage).toBe("shipping");
  });
});

describe("반품 배송비 묶음 (toReturnFeeBundles)", () => {
  it("묶음에 한 번, 반품을 마친 날이 확정일, 배송비 칸에만", () => {
    const r = toReturnFeeBundles([
      { order_id: "x", product_name: "도시락", return_fee: 4000, return_resolved_at: iso("2026-11-05T03:00:00Z"), orders: { paid_at: iso("2026-10-30T03:00:00Z") } },
      { order_id: "x", product_name: "샐러드", return_fee: 4000, return_resolved_at: iso("2026-11-05T03:00:00Z"), orders: { paid_at: iso("2026-10-30T03:00:00Z") } },
      { order_id: "y", product_name: "도시락", return_fee: 0, return_resolved_at: iso("2026-11-05T03:00:00Z"), orders: { paid_at: iso("2026-10-30T03:00:00Z") } },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "return_fee", order_id: "x", sales: 0, fee: 0, shipping: 4000, payout: 4000, confirmed_at: Date.parse("2026-11-05T03:00:00Z") });
  });
});

describe("날짜별 합 = 달 합 (dailyOf · monthlyOf)", () => {
  const now = Date.parse("2026-12-03T00:00:00Z");
  // 11월 이곳저곳에서 확정되는 묶음 40개 + 반품 배송비 2개
  const lines: L[] = [];
  for (let i = 0; i < 40; i++) {
    lines.push(line(`o${i}`, {
      unit_price: 4900 + i * 37, quantity: 1 + (i % 3),
      delivered_at: iso(new Date(Date.parse("2026-10-25T00:00:00Z") + i * 0.7 * DAY).toISOString()),
      orders: { paid_at: iso("2026-10-20T00:00:00Z"), shipping_fees: { [P]: i % 2 ? 3000 : 0 }, discount_fees: { [P]: i % 5 === 0 ? 777 : 0 } },
    }));
  }
  const bundles = [...toBundles(lines, P, 9.5, now), ...toReturnFeeBundles([
    { order_id: "r1", product_name: "도시락", return_fee: 3500, return_resolved_at: iso("2026-11-10T01:00:00Z"), orders: { paid_at: iso("2026-11-01T00:00:00Z") } },
    { order_id: "r2", product_name: "도시락", return_fee: 6000, return_resolved_at: iso("2026-11-30T16:00:00Z"), orders: { paid_at: iso("2026-11-01T00:00:00Z") } }, // 한국 12/1 01시 → 12월
  ])];
  const m = monthlyOf(bundles).get("2026-11")!;
  const d = dailyOf(bundles, "2026-11", now);
  it("모든 칸이 날짜별 합과 같다", () => {
    for (const k of ["sales", "discount", "shipping", "fee", "payout"] as const) expect(d.reduce((s, x) => s + x[k], 0)).toBe(m[k]);
    expect(d.reduce((s, x) => s + x.orders, 0)).toBe(m.orders);
  });
  it("반품 배송비는 주문 수에 넣지 않고, 한국 시간 달로 나뉜다", () => {
    const orders11 = bundles.filter((b) => b.kind === "order" && b.confirmed_at !== null && kstDay(b.confirmed_at).startsWith("2026-11")).length;
    expect(m.orders).toBe(orders11);
    expect(monthlyOf(bundles).get("2026-12")?.shipping).toBeGreaterThanOrEqual(6000);
  });
  it("받을 돈 = 판매 − 쿠폰 + 배송비 − 수수료", () => {
    expect(m.payout).toBe(m.sales - m.discount + m.shipping - m.fee);
  });
});

describe("날짜 경계", () => {
  it("지급일은 다음 달 10일, 12월은 다음 해 1월", () => {
    expect(PAY_DAY).toBe(10);
    expect(payDate("2026-11")).toBe("2026-12-10");
    expect(payDate("2026-12")).toBe("2027-01-10");
  });
  it("달 경계는 한국 시간 자정", () => {
    const { from, to } = monthMs("2026-11");
    expect(new Date(from).toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(new Date(to).toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(kstDay(Date.parse("2026-11-30T15:00:00Z"))).toBe("2026-12-01");
  });
});
