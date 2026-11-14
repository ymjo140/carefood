/** 택배 조회로 배송 완료 찍기 (lib/partner/tracking.ts) — 가짜 DB + 가짜 조회 응답 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSb, withRpc, type Fake } from "./fake-sb";
import { autoDeliver, trackOne } from "@/lib/partner/tracking";

const HOUR = 3600e3;
const now = Date.parse("2026-11-20T12:00:00Z");
const iso = (t: number) => new Date(t).toISOString();

function shop(lines: Record<string, unknown>[]): Fake {
  return withRpc(fakeSb({
    orders: [{ id: "o1", status: "dispatched", paid_at: iso(now - 72 * HOUR) }, { id: "o2", status: "dispatched", paid_at: iso(now - 72 * HOUR) }],
    order_items: lines.map((l, i) => ({
      id: `l${i}`, order_id: "o1", partner_id: "p1", fulfil_status: "shipped", tracking_carrier: "cj", tracking_number: "123456789012",
      shipped_at: iso(now - 48 * HOUR), tracking_checked_at: null, tracking_status: null, delivered_at: null, delivered_by: null, ...l,
    })),
  }), {});
}
/** tracker.delivery 응답 흉내 */
const reply = (code: string, time: string | null) => vi.fn(async () => ({ ok: true, json: async () => ({ data: { track: { lastEvent: { time, status: { code } } } } }) }) as unknown as Response);

describe("택배 조회 키", () => {
  afterEach(() => { delete process.env.TRACKER_CLIENT_ID; delete process.env.TRACKER_CLIENT_SECRET; });
  it("키가 없으면 아무것도 묻지 않는다", async () => {
    const f = reply("DELIVERED", iso(now));
    const r = await autoDeliver(shop([{}]), { now, fetch: f });
    expect(r.skipped).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("배송 완료 찍기", () => {
  beforeEach(() => { process.env.TRACKER_CLIENT_ID = "id"; process.env.TRACKER_CLIENT_SECRET = "secret"; });
  afterEach(() => { delete process.env.TRACKER_CLIENT_ID; delete process.env.TRACKER_CLIENT_SECRET; });

  it("배송 완료면 택배사가 알려 준 시각으로 묶음 전체를 배송 완료로", async () => {
    const sb = shop([{}, {}]);
    const r = await autoDeliver(sb, { now, fetch: reply("DELIVERED", iso(now - 5 * HOUR)) });
    expect(r).toMatchObject({ checked: 1, delivered: 1 });
    expect(sb.tables.order_items.every((l) => l.fulfil_status === "delivered" && l.delivered_by === "tracking" && l.delivered_at === iso(now - 5 * HOUR))).toBe(true);
    expect(sb.tables.orders[0].status).toBe("delivered");
  });
  it("아직이면 상태만 적고, 3시간 안에는 다시 묻지 않는다", async () => {
    const sb = shop([{}]);
    const f = reply("OUT_FOR_DELIVERY", iso(now));
    await autoDeliver(sb, { now, fetch: f });
    expect(sb.tables.order_items[0]).toMatchObject({ fulfil_status: "shipped", tracking_status: "OUT_FOR_DELIVERY" });
    await autoDeliver(sb, { now: now + HOUR, fetch: f });
    expect(f).toHaveBeenCalledTimes(1);
    await autoDeliver(sb, { now: now + 4 * HOUR, fetch: f });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("발송 12시간 전에는 묻지 않는다, 직접 배송은 묻지 않는다", async () => {
    const f = reply("DELIVERED", iso(now));
    await autoDeliver(shop([{ shipped_at: iso(now - 3 * HOUR) }]), { now, fetch: f });
    await autoDeliver(shop([{ tracking_carrier: "direct" }]), { now, fetch: f });
    expect(f).not.toHaveBeenCalled();
  });
  it("오래전 배송 완료는 7일 전으로 — 구매확정이 지난 달로 가지 않게", async () => {
    const sb = shop([{ shipped_at: iso(now - 20 * 24 * HOUR) }]);
    await autoDeliver(sb, { now, fetch: reply("DELIVERED", iso(now - 15 * 24 * HOUR)) });
    expect(sb.tables.order_items[0].delivered_at).toBe(iso(now - 7 * 24 * HOUR));
  });
  it("그새 업체가 배송 완료를 눌렀거나 취소됐으면 건드리지 않는다", async () => {
    const sb = shop([{}]);
    const f = vi.fn(async () => {
      sb.tables.order_items[0].fulfil_status = "delivered"; // 조회하는 사이 업체가 누름
      sb.tables.order_items[0].delivered_at = iso(now - HOUR);
      sb.tables.order_items[0].delivered_by = "partner";
      return { ok: true, json: async () => ({ data: { track: { lastEvent: { time: iso(now - 9 * HOUR), status: { code: "DELIVERED" } } } } }) } as unknown as Response;
    });
    const r = await autoDeliver(sb, { now, fetch: f });
    expect(r.delivered).toBe(0);
    expect(sb.tables.order_items[0]).toMatchObject({ delivered_by: "partner", delivered_at: iso(now - HOUR) });
  });
  it("조회가 실패하면 기록하고 다음 차례로 미룬다", async () => {
    const sb = shop([{}]);
    const f = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await autoDeliver(sb, { now, fetch: f });
    spy.mockRestore();
    expect(r.failed).toBe(1);
    expect(sb.tables.order_items[0].tracking_checked_at).toBe(iso(now));
  });
  it("송장이 없다는 응답은 오류가 아니라 '아직 모름'", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ errors: [{ message: "not found", extensions: { code: "NOT_FOUND" } }] }) }) as unknown as Response);
    expect(await trackOne("cj", "123456789012", f)).toEqual({ code: "UNKNOWN", time: null });
    expect(await trackOne("direct", "x", f)).toBeNull();
  });
});
