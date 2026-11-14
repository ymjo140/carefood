/**
 * 상태가 바뀌는 흐름 — 가짜 Supabase(tests/fake-sb.ts)로 조건부 update·환불·마감을 시험한다.
 * 진짜 DB 처럼 한 번에 1,000줄까지만 돌려준다.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fakeSb, withRpc, type Fake } from "./fake-sb";
import { selectAll, selectAllIn, selectUpTo } from "@/lib/supabase/all";
import { buyerConfirm, buyerReturnRequest, recomputeRefund } from "@/lib/orders";
import { updateFulfilment, updateReturn } from "@/lib/partner/orders";
import { closeMonth, markPaid, previousMonth } from "@/lib/partner/settlement";
import { parseSettings } from "@/lib/partner/settings";
import { parseCarrier } from "@/lib/partner/fulfil-sheet";

const P = "11111111-1111-4111-8111-111111111111";
const O = "22222222-2222-4222-8222-222222222222";
const U = "buyer-1";
const DAY = 86400e3;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

/** 결제한 주문 하나 + 이 업체 줄 두 개 */
function shop(fulfil: string, over: Record<string, unknown> = {}): Fake {
  const order = { id: O, user_id: U, status: "delivered", paid_at: ago(10), created_at: ago(10), shipping: null, third_party_consent_at: null,
    shipping_fees: { [P]: 3000 }, discount_fees: { [P]: 1000 }, refund_amount: 0, refunded_amount: 0, delivery_week_start: null };
  const embedded = { ...order };
  const line = (i: number) => ({
    id: `line-${i}`, order_id: O, partner_id: P, partner_sku: `S${i}`, product_name: `제품${i}`, quantity: 1, unit_price: 5000, day_of_week: null, meal_type: null,
    fulfil_status: fulfil, tracking_carrier: "cj", tracking_number: "123456789012", accepted_at: ago(9), shipped_at: ago(8), delivered_at: ago(3), confirmed_at: null, confirm_by: null,
    cancel_reason: null, canceled_by: null, cancel_requested_at: null, cancel_request_reason: null, created_at: ago(10),
    return_status: null, return_type: null, return_reason: null, return_note: null, return_requested_at: null, return_resolved_at: null, return_reply: null, return_fee: null,
    orders: embedded, partners: { name: "핏밀" }, ...over,
  });
  return withRpc(fakeSb({ orders: [order], order_items: [line(1), line(2)], partners: [{ id: P, name: "핏밀", commission_rate: 5, order_commission_rate: 10 }], coupon_grants: [] }),
    { partner_stock_put: () => null });
}

describe("1,000줄 나눠 받기 (lib/supabase/all.ts)", () => {
  const sb = fakeSb({ t: Array.from({ length: 2345 }, (_, i) => ({ id: String(i).padStart(5, "0"), g: i % 7 })) });
  it("limit 를 크게 줘도 1,000줄에서 잘린다 (고치기 전 모습)", async () => {
    const { data } = await sb.from("t").select("id").limit(50000);
    expect(data).toHaveLength(1000);
  });
  it("selectAll 은 끝까지, 겹치거나 빠지는 줄 없이", async () => {
    const rows = await selectAll<{ id: string }>(() => sb.from("t").select("id"), "id");
    expect(rows).toHaveLength(2345);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2345);
  });
  it("max 를 넘으면 틀린 숫자 대신 오류", async () => {
    await expect(selectAll(() => sb.from("t").select("id"), "id", 1500)).rejects.toThrow();
  });
  it("selectUpTo 는 앞에서 n줄, 내림차순도", async () => {
    const rows = await selectUpTo<{ id: string }>(() => sb.from("t").select("id"), "-id", 1200);
    expect(rows).toHaveLength(1200);
    expect(rows[0].id).toBe("02344");
  });
  it("selectAllIn 은 id 를 나눠 묻고 묶음마다 끝까지", async () => {
    const rows = await selectAllIn<{ id: string }>([0, 1, 2, 3, 4, 5, 6].map(String), 2, (p) => sb.from("t").select("id").in("g", p.map(Number)), "id");
    expect(rows).toHaveLength(2345);
  });
});

describe("환불 금액 (recomputeRefund)", () => {
  it("묶음이 통째로 취소되면 상품 + 배송비 − 쿠폰", async () => {
    const sb = shop("canceled");
    await recomputeRefund(sb, O);
    expect(sb.tables.orders[0].refund_amount).toBe(10000 + 3000 - 1000);
  });
  it("마음이 바뀐 반품은 반품 배송비를 묶음에 한 번 뺀다", async () => {
    const sb = shop("canceled", { return_status: "returned", return_fee: 4000 });
    await recomputeRefund(sb, O);
    expect(sb.tables.orders[0].refund_amount).toBe(10000 + 3000 - 1000 - 4000);
  });
  it("일부만 취소된 묶음은 환불이 없고, 환불 금액은 줄지 않는다", async () => {
    const sb = shop("delivered");
    sb.tables.order_items[0].fulfil_status = "canceled";
    sb.tables.orders[0].refund_amount = 500;
    await recomputeRefund(sb, O);
    expect(sb.tables.orders[0].refund_amount).toBe(500);
  });
});

describe("반품·교환 요청 (buyerReturnRequest)", () => {
  it("받은 뒤 확정 전이면 요청, 두 번 눌러도 한 번", async () => {
    const sb = shop("delivered");
    expect(await buyerReturnRequest(sb, U, O, P, { type: "return", reason: "damaged", note: "터졌어요" })).toEqual({ ok: true });
    expect(sb.tables.order_items.every((l) => l.return_status === "requested")).toBe(true);
    expect(await buyerReturnRequest(sb, U, O, P, { type: "return", reason: "damaged", note: "터졌어요" })).toEqual({ ok: true });
  });
  it("남의 주문·발송 중·이미 확정·거절된 주문은 막는다", async () => {
    expect((await buyerReturnRequest(shop("delivered"), "someone", O, P, { type: "return", reason: "damaged", note: "x" })).ok).toBe(false);
    expect((await buyerReturnRequest(shop("shipped"), U, O, P, { type: "return", reason: "damaged", note: "x" })).ok).toBe(false);
    expect((await buyerReturnRequest(shop("delivered", { confirmed_at: ago(1) }), U, O, P, { type: "return", reason: "damaged", note: "x" })).ok).toBe(false);
    expect((await buyerReturnRequest(shop("delivered", { delivered_at: ago(9) }), U, O, P, { type: "return", reason: "damaged", note: "x" })).ok).toBe(false); // 8일 지나 이미 확정
    expect((await buyerReturnRequest(shop("delivered", { return_status: "rejected" }), U, O, P, { type: "return", reason: "damaged", note: "x" })).ok).toBe(false);
  });
  it("문제 반품은 남길 말이 필요하고, 마음이 바뀐 반품은 없어도 된다", async () => {
    expect((await buyerReturnRequest(shop("delivered"), U, O, P, { type: "return", reason: "defect", note: "" })).ok).toBe(false);
    expect((await buyerReturnRequest(shop("delivered"), U, O, P, { type: "return", reason: "change_mind", note: "" })).ok).toBe(true);
  });
  it("요청 중에는 확정 버튼이 요청을 거두고 확정한다, 회수 중이면 막는다", async () => {
    const sb = shop("delivered", { return_status: "requested", return_type: "return", return_reason: "change_mind", return_requested_at: ago(1), delivered_at: ago(9) });
    expect(await buyerConfirm(sb, U, O, P)).toEqual({ ok: true });
    expect(sb.tables.order_items.every((l) => l.return_status === null && l.confirmed_at && l.confirm_by === "buyer")).toBe(true);
    const sb2 = shop("delivered", { return_status: "approved", return_type: "return", return_reason: "damaged", return_requested_at: ago(1) });
    expect((await buyerConfirm(sb2, U, O, P)).ok).toBe(false);
  });
});

describe("업체 반품·교환 처리 (updateReturn)", () => {
  const req = (type: "return" | "exchange", reason = "change_mind") => shop("delivered", { return_status: "requested", return_type: type, return_reason: reason, return_requested_at: ago(1) });
  it("반품 마치기 — 취소로 바꾸고 환불(반품 배송비 뺌), 재고는 돌려놓지 않음", async () => {
    const sb = req("return");
    const r = await updateReturn(sb, { id: P }, O, { action: "returned", fee: 4000 });
    expect(r.ok).toBe(true);
    expect(sb.tables.order_items.every((l) => l.fulfil_status === "canceled" && l.return_status === "returned" && l.return_fee === 4000)).toBe(true);
    expect(sb.tables.orders[0].refund_amount).toBe(10000 + 3000 - 1000 - 4000);
    expect(sb.calls.some((c) => c.table === "partner_stock_put")).toBe(false);
  });
  it("반품 배송비는 마음이 바뀐 반품에만", async () => {
    expect((await updateReturn(req("return", "damaged"), { id: P }, O, { action: "returned", fee: 4000 })).ok).toBe(false);
  });
  it("거절은 이유가 필요하고, 그날부터 다시 8일 (delivered_at 을 지금으로)", async () => {
    const sb = req("return");
    expect((await updateReturn(sb, { id: P }, O, { action: "reject" })).ok).toBe(false);
    const before = Date.now();
    expect((await updateReturn(sb, { id: P }, O, { action: "reject", reply: "열린 냉장 식품이에요" })).ok).toBe(true);
    expect(Date.parse(sb.tables.order_items[0].delivered_at)).toBeGreaterThanOrEqual(before - 1000);
    expect(sb.tables.order_items[0].return_status).toBe("rejected");
  });
  it("교환품 보내기 — 발송으로 돌아가고 확정이 지워진다", async () => {
    const sb = req("exchange", "wrong");
    expect((await updateReturn(sb, { id: P }, O, { action: "exchanged", carrier: "cj", tracking_number: "998877665544" })).ok).toBe(true);
    expect(sb.tables.order_items.every((l) => l.fulfil_status === "shipped" && l.delivered_at === null && l.return_status === "exchanged")).toBe(true);
  });
  it("반품 요청에 교환품·교환 요청에 반품 마치기는 막는다, 받아들인 요청은 거절 못 함", async () => {
    expect((await updateReturn(req("return"), { id: P }, O, { action: "exchanged", carrier: "cj", tracking_number: "998877665544" })).ok).toBe(false);
    expect((await updateReturn(req("exchange"), { id: P }, O, { action: "returned" })).ok).toBe(false);
    const sb = req("return");
    await updateReturn(sb, { id: P }, O, { action: "approve" });
    expect((await updateReturn(sb, { id: P }, O, { action: "reject", reply: "x" })).ok).toBe(false);
  });
  it("다른 업체 주문은 없는 주문", async () => {
    expect(await updateReturn(req("return"), { id: "33333333-3333-4333-8333-333333333333" }, O, { action: "approve" })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("업체 주문 처리 (updateFulfilment)", () => {
  it("새 주문 → 접수, 같은 걸 다시 보내도 그대로", async () => {
    const sb = shop("new");
    expect(await updateFulfilment(sb, { id: P }, O, { status: "accepted" })).toMatchObject({ ok: true, changed: true });
    expect(await updateFulfilment(sb, { id: P }, O, { status: "accepted" })).toMatchObject({ ok: true, changed: false });
  });
  it("발송한 뒤 12시간이 안 됐으면 배송 완료로 바꿀 수 없다", async () => {
    const sb = shop("shipped", { shipped_at: new Date(Date.now() - 3 * 3600e3).toISOString(), delivered_at: null });
    expect(await updateFulfilment(sb, { id: P }, O, { status: "delivered" })).toMatchObject({ ok: false, code: "conflict" });
  });
  it("발송한 주문은 취소할 수 없다", async () => {
    expect(await updateFulfilment(shop("shipped"), { id: P }, O, { status: "canceled", reason: "x" })).toMatchObject({ ok: false, code: "conflict" });
  });
  it("송장 번호 형식", async () => {
    expect(await updateFulfilment(shop("accepted"), { id: P }, O, { status: "shipped", carrier: "cj", tracking_number: "12" })).toMatchObject({ ok: false, code: "invalid" });
    expect(await updateFulfilment(shop("accepted"), { id: P }, O, { status: "shipped", carrier: "direct", tracking_number: "" })).toMatchObject({ ok: true });
  });
});

describe("월 마감 (closeMonth · markPaid)", () => {
  let sb: Fake;
  const month = previousMonth();
  beforeEach(() => {
    sb = withRpc(fakeSb({ partners: [{ id: P, commission_rate: 5, order_commission_rate: 10 }], partner_settlements: [], product_clicks: [], partner_conversions: [], order_items: [] }), {});
  });
  it("돈이 오가지 않은 달은 자동 마감하지 않는다", async () => {
    expect(await closeMonth(sb, P, month, null, { auto: true })).toBeNull();
    expect(sb.tables.partner_settlements).toHaveLength(0);
  });
  it("정산을 끝낸 달은 다시 마감하지 않는다", async () => {
    sb.tables.partner_settlements.push({ id: "s1", partner_id: P, month, status: "paid" });
    await expect(closeMonth(sb, P, month, "admin")).rejects.toThrow(/정산을 끝낸/);
  });
  it("자동 마감은 이미 마감한 달을 다시 세지 않는다", async () => {
    // 그 달에 돈이 오간 기록이 있어도(구매 링크 구매확정 1건)
    sb.tables.partner_conversions.push({ id: "c1", partner_id: P, ordered_at: new Date(Date.parse(`${month}-15T00:00:00+09:00`)).toISOString(), amount: 10000, status: "confirmed", commission: 500 });
    sb.tables.partner_settlements.push({ id: "s1", partner_id: P, month, status: "closed", order_sales: 123 });
    expect(await closeMonth(sb, P, month, null, { auto: true })).toBeNull();
    expect(sb.tables.partner_settlements[0].order_sales).toBe(123);
  });
  it("마감은 그 달 숫자를 적는다 — 구매 링크 수수료", async () => {
    sb.tables.partner_conversions.push({ id: "c1", partner_id: P, ordered_at: new Date(Date.parse(`${month}-15T00:00:00+09:00`)).toISOString(), amount: 10000, status: "confirmed", commission: 500 });
    sb.tables.partner_conversions.push({ id: "c2", partner_id: P, ordered_at: new Date(Date.parse(`${month}-16T00:00:00+09:00`)).toISOString(), amount: 7000, status: "canceled", commission: 350 });
    const s = await closeMonth(sb, P, month, "admin");
    expect(s).toMatchObject({ orders: 2, confirmed_amount: 10000, commission: 500, status: "closed" });
  });
  it("마감한 달만 정산을 끝낼 수 있고, 두 번 끝내지 않는다", async () => {
    await expect(markPaid(sb, P, month, null)).rejects.toThrow();
    sb.tables.partner_settlements.push({ id: "s1", partner_id: P, month, status: "closed" });
    await markPaid(sb, P, month, "입금", 10000);
    expect(sb.tables.partner_settlements[0]).toMatchObject({ status: "paid", paid_amount: 10000 });
    await expect(markPaid(sb, P, month, null)).rejects.toThrow();
  });
  it("이번 달은 마감할 수 없다", async () => {
    const cur = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
    await expect(closeMonth(sb, P, cur, "admin")).rejects.toThrow(/끝난 달/);
  });
});

describe("입력 해석", () => {
  it("택배사 — 코드·이름·줄임", () => {
    expect(parseCarrier("CJ대한통운")).toBe("cj");
    expect(parseCarrier(" cj ")).toBe("cj");
    expect(parseCarrier("우체국")).toBe("epost");
    expect(parseCarrier("DHL")).toBeNull();
  });
  it("업체 설정 — 사업자 번호·계좌·메일", () => {
    expect(parseSettings({ business_number: "1234567890" })).toEqual({ patch: { business_number: "123-45-67890" } });
    expect("error" in parseSettings({ business_number: "123" })).toBe(true);
    expect(parseSettings({ bank_account: "123-456-789012" })).toEqual({ patch: { bank_account: "123456789012" } });
    expect("error" in parseSettings({ bank_account: "12ab" })).toBe(true);
    expect(parseSettings({ tax_email: "" })).toEqual({ patch: { tax_email: null } });
  });
});

describe("내 주문 목록 — 1,000줄 넘는 식단 줄", () => {
  it("주문 30개 × 40줄(1,200줄)도 잘리지 않는다", async () => {
    const { listMyOrders } = await import("@/lib/orders");
    const orders = Array.from({ length: 30 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, user_id: U, created_at: ago(i), status: "paid", paid_at: ago(i),
      total_price: 0, shipping_fee: 0, shipping_fees: {}, final_price: 0, refund_amount: 0, refunded_amount: 0, refunded_at: null }));
    const items = orders.flatMap((o) => Array.from({ length: 40 }, (_, j) => ({ id: `${o.id}-${String(j).padStart(2, "0")}`, created_at: o.created_at, order_id: o.id, partner_id: P,
      product_id: null, product_name: `제품${j}`, quantity: 1, unit_price: 1000, fulfil_status: "new", partners: { name: "핏밀" } })));
    const sb = fakeSb({ orders, order_items: items, order_inquiries: [] });
    const mine = await listMyOrders(sb, U);
    expect(mine.reduce((s, o) => s + o.groups.reduce((t, g) => t + g.lines.length, 0), 0)).toBe(1200);
  });
});
