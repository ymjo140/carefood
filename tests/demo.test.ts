/** 테스트 매장 예시 데이터 (lib/partner/demo.ts) — 여러 줄을 한 번에 넣을 때 줄마다 칸이 같아야 한다(빠진 칸은 null 로 들어가 not-null 위반) */
import { describe, expect, it } from "vitest";
import { fakeSb, withRpc } from "./fake-sb";
import { seedDemoOrders, seedDemoStore } from "@/lib/partner/demo";
import { loadBundles, monthlyOf } from "@/lib/partner/payout";
import type { Partner } from "@/lib/partner/ingest";

const partner = { id: "11111111-1111-4111-8111-111111111111", slug: "test-demo", name: "핏밀 데모", kind: "meal_service", status: "active", is_demo: true } as unknown as Partner;

function store() {
  const sb = withRpc(fakeSb({
    partners: [{ id: partner.id, name: partner.name, is_demo: true, commission_rate: 5, order_commission_rate: 10, business_number: null, tax_email: null, bank_account: null, contact_email: null }],
    orders: [], order_items: [], partner_coupons: [], coupon_grants: [], partner_flows: [], partner_items: [], partner_settlements: [], product_clicks: [], partner_conversions: [],
  }, 1000), {});
  // 여러 줄 insert 의 칸 모양을 기록
  const shapes: Record<string, Set<string>> = {};
  const from = sb.from;
  sb.from = (t: string) => {
    const b = from(t);
    const ins = b.insert.bind(b);
    b.insert = (p: Record<string, unknown> | Record<string, unknown>[]) => { if (Array.isArray(p)) for (const r of p) (shapes[t] ||= new Set()).add(Object.keys(r).sort().join(",")); return ins(p); };
    return b;
  };
  return { sb, shapes };
}

describe("테스트 매장 예시 데이터", () => {
  it("주문·주문 줄은 줄마다 칸이 같다", async () => {
    const { sb, shapes } = store();
    const r = await seedDemoOrders(sb, partner);
    expect(r.orders).toBeGreaterThan(100);
    expect(shapes.orders?.size).toBe(1);
    expect(shapes.order_items?.size).toBe(1);
  });
  it("반품 요청·회수 중 교환·마친 반품(반품 배송비)이 하나씩 있다", async () => {
    const { sb } = store();
    await seedDemoOrders(sb, partner);
    const st = (s: string) => new Set(sb.tables.order_items.filter((l) => l.return_status === s).map((l) => l.order_id)).size;
    expect(st("requested")).toBe(1);
    expect(st("approved")).toBe(1);
    expect(st("returned")).toBe(1);
    expect(sb.tables.order_items.find((l) => l.return_status === "returned")).toMatchObject({ fulfil_status: "canceled", return_fee: 4000 });
  });
  it("돈이 오간 지난 달은 모두 마감 — 지난 달만 마감, 그 앞은 정산 끝(한 달은 입금 차이), 숫자는 실제 계산과 같다", async () => {
    const { sb } = store();
    await seedDemoOrders(sb, partner);
    // 진짜 DB 는 orders!inner(...) 로 묶어 읽는다 — 가짜 DB 에는 미리 넣어 둔다
    const byId = new Map(sb.tables.orders.map((o) => [o.id, o]));
    for (const l of sb.tables.order_items) l.orders = byId.get(l.order_id);
    await seedDemoStore(sb, partner);
    const rows = [...sb.tables.partner_settlements].sort((a, b) => String(a.month).localeCompare(String(b.month)));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.slice(0, -1).every((r) => r.status === "paid")).toBe(true);
    expect(rows[rows.length - 1].status).toBe("closed");
    expect(rows.filter((r) => r.paid_amount !== null && r.paid_amount !== r.order_sales - r.order_discount + r.order_shipping - r.order_fee - r.commission)).toHaveLength(1);
    const bundles = await loadBundles(sb, partner.id, 10, { deliveredFrom: Date.now() - 260 * 86400e3 });
    const m = monthlyOf(bundles);
    for (const r of rows) expect(r.order_sales).toBe(m.get(r.month as string)?.sales ?? 0);
    expect(sb.tables.partners[0]).toMatchObject({ business_number: "123-45-67890", bank_name: "예시은행" });
  });
});
