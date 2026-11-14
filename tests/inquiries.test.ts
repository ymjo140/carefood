/** 주문 문의(lib/partner/inquiries.ts)·업체 리뷰(lib/partner/reviews.ts) — 가짜 DB 로 규칙과 개인정보 경계를 시험한다 */
import { describe, expect, it } from "vitest";
import { fakeSb, type Fake } from "./fake-sb";
import { answerInquiry, buyerAsk, countInquiries, inquiriesByBundle, listPartnerInquiries } from "@/lib/partner/inquiries";
import { countPartnerOrders } from "@/lib/partner/orders";
import { partnerReviews } from "@/lib/partner/reviews";
import { customerCode } from "@/lib/partner/customers";

const P = "11111111-1111-4111-8111-111111111111";
const P2 = "33333333-3333-4333-8333-333333333333";
const O = "22222222-2222-4222-8222-222222222222";
const U = "buyer-1";
const HOUR = 3600e3;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

function shop(extra: Record<string, unknown[]> = {}): Fake {
  return fakeSb({
    orders: [{ id: O, user_id: U, paid_at: ago(48), status: "paid", is_demo: false }],
    order_items: [{ id: "l1", order_id: O, partner_id: P, product_name: "닭가슴살 도시락", quantity: 2, fulfil_status: "accepted" }],
    order_inquiries: [],
    ...extra,
  });
}
const ask = (sb: Fake, body = "언제 보내 주시나요?", kind: unknown = "shipping", user = U, order = O, partner = P) => buyerAsk(sb, user, order, partner, { kind, body });

describe("주문 문의 — 주문자", () => {
  it("종류와 내용이 있어야 하고, 내 결제한 주문의 그 업체 묶음에만 남긴다", async () => {
    const sb = shop();
    expect(await ask(sb, "언제요?", "nope")).toMatchObject({ ok: false, code: "invalid" });
    expect(await ask(sb, " ")).toMatchObject({ ok: false, code: "invalid" });
    expect(await ask(sb, "언제요?", "shipping", "someone-else")).toMatchObject({ ok: false, code: "not_found" });
    expect(await ask(sb, "언제요?", "shipping", U, O, P2)).toMatchObject({ ok: false, code: "not_found" });
    const r = await ask(sb);
    expect(r).toMatchObject({ ok: true, inquiry: { kind: "shipping", body: "언제 보내 주시나요?", answer: null } });
    expect(sb.tables.order_inquiries).toHaveLength(1);
  });
  it("결제 전 주문에는 남길 수 없다", async () => {
    const sb = shop({ orders: [{ id: O, user_id: U, paid_at: null, status: "pending" }] });
    expect(await ask(sb)).toMatchObject({ ok: false, code: "not_found" });
  });
  it("같은 말은 두 번 남지 않고, 답을 기다리는 문의는 3개까지", async () => {
    const sb = shop();
    await ask(sb, "첫 문의");
    expect(await ask(sb, "첫 문의")).toMatchObject({ ok: false, code: "conflict" });
    await ask(sb, "둘째 문의"); await ask(sb, "셋째 문의");
    expect(await ask(sb, "넷째 문의")).toMatchObject({ ok: false, code: "conflict" });
    sb.tables.order_inquiries[0].answer = "답"; // 하나에 답하면 다시 물을 수 있다
    expect(await ask(sb, "넷째 문의")).toMatchObject({ ok: true });
  });
  it("내 주문 목록에는 묶음별로 오래된 것부터 붙는다", async () => {
    const sb = shop();
    await ask(sb, "첫째");
    await ask(sb, "둘째");
    const m = await inquiriesByBundle(sb, [O]);
    expect(m.get(`${O}|${P}`)?.map((q) => q.body)).toEqual(["첫째", "둘째"]);
  });
});

describe("주문 문의 — 업체", () => {
  it("업체 목록에는 가명 번호만 — user_id 는 나가지 않는다. 하루 지나면 늦은 문의", async () => {
    const sb = shop({ order_inquiries: [
      { id: "q1", order_id: O, partner_id: P, user_id: U, kind: "shipping", body: "늦은 문의", created_at: ago(30), answer: null, answered_at: null },
      { id: "q2", order_id: O, partner_id: P, user_id: U, kind: "product", body: "새 문의", created_at: ago(1), answer: null, answered_at: null },
      { id: "q3", order_id: O, partner_id: P2, user_id: U, kind: "other", body: "다른 업체", created_at: ago(1), answer: null, answered_at: null },
    ] });
    const list = await listPartnerInquiries(sb, P);
    expect(list.map((q) => q.body)).toEqual(["늦은 문의", "새 문의"]);
    expect(list[0]).toMatchObject({ customer: customerCode(P, U), late: true, status: "accepted", lines: [{ name: "닭가슴살 도시락", quantity: 2 }] });
    expect(list[1].late).toBe(false);
    expect(JSON.stringify(list)).not.toContain(U);
    expect(await countInquiries(sb, P)).toEqual({ open: 2, late: 1 });
    expect(await countPartnerOrders(sb, P)).toMatchObject({ inquiries: 2, inquiries_late: 1 });
  });
  it("답은 한 번만, 다른 업체 문의에는 답할 수 없고, 효능·질병 표현은 막는다", async () => {
    const sb = shop({ order_inquiries: [{ id: "44444444-4444-4444-8444-444444444444", order_id: O, partner_id: P, user_id: U, kind: "product", body: "?", created_at: ago(1), answer: null, answered_at: null }] });
    const id = "44444444-4444-4444-8444-444444444444";
    const me = { id: P, name: "핏밀" };
    expect(await answerInquiry(sb, { id: P2, name: "남" }, null, id, "내일 보내요", null)).toMatchObject({ ok: false, code: "not_found" });
    const blocked = await answerInquiry(sb, me, null, id, "혈당 관리에 좋아요", null);
    expect(blocked).toMatchObject({ ok: false, code: "invalid" });
    expect(sb.tables.order_inquiries[0].answer).toBeNull();
    expect(await answerInquiry(sb, me, null, id, "내일 오전에 보내 드릴게요", null)).toMatchObject({ ok: true, inquiry: { answer: "내일 오전에 보내 드릴게요" } });
    expect(await answerInquiry(sb, me, null, id, "다시 답", null)).toMatchObject({ ok: false, code: "conflict" });
    expect(sb.tables.order_inquiries[0].answer).toBe("내일 오전에 보내 드릴게요");
    expect(await listPartnerInquiries(sb, P, { answered: true })).toHaveLength(1);
  });
});

describe("업체 리뷰", () => {
  const PROD = "55555555-5555-4555-8555-555555555555";
  const sb = () => fakeSb({
    partner_items: [{ id: "item-1", partner_id: P, product_id: PROD, name: "닭가슴살 도시락" }, { id: "item-2", partner_id: P, product_id: null, name: "검수 중" }],
    product_reviews: [
      { id: "r1", product_id: PROD, user_id: U, rating: 5, would_rebuy: true, comment: "맛있어요", created_at: ago(2), reviewer_age_group: "30s", reviewer_gender: "f", reviewer_concerns: ["blood_sugar"], reviewer_conditions: ["x"] },
      { id: "r2", product_id: PROD, user_id: "stranger", rating: 3, would_rebuy: false, comment: "", created_at: ago(1), reviewer_age_group: "40s", reviewer_gender: "m", reviewer_concerns: [], reviewer_conditions: [] },
      { id: "r3", product_id: "other-product", user_id: U, rating: 1, would_rebuy: null, comment: "남의 제품", created_at: ago(1) },
    ],
    order_items: [{ id: "l1", order_id: O, partner_id: P, orders: { user_id: U, paid_at: ago(48) } }],
  });
  it("내 제품 리뷰만, 별점 평균·다시 살 비율, 내 고객만 가명 번호", async () => {
    const r = await partnerReviews(sb(), P);
    expect(r.products).toEqual([{ item_id: "item-1", name: "닭가슴살 도시락", count: 2, avg: 4, rebuy: 50, last_at: expect.any(String) }]);
    expect(r.reviews.map((x) => x.id)).toEqual(["r2", "r1"]);
    expect(r.reviews.find((x) => x.id === "r1")?.customer).toBe(customerCode(P, U));
    expect(r.reviews.find((x) => x.id === "r2")).toMatchObject({ customer: null, comment: null });
  });
  it("쓴 사람의 연령·성별·관심사·건강 상태와 user_id 는 업체에 가지 않는다", async () => {
    const out = JSON.stringify(await partnerReviews(sb(), P));
    for (const leak of ["30s", "blood_sugar", "reviewer_", U, "stranger"]) expect(out).not.toContain(leak);
  });
});
