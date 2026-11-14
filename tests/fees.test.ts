/**
 * 쓴 만큼 내는 요금 (11/14 결정) — 자동 알림 건당 10원 · 대행 연동 상품당 500원 · 입점 신청 관리자 알림.
 * partner_credit_take 는 DB 함수와 같은 규칙으로 흉내 낸다 (잠금은 DB 몫).
 */
import { describe, expect, it, vi } from "vitest";
import { fakeSb, withRpc, type Fake } from "./fake-sb";

vi.mock("@/lib/partner/ingest", () => ({
  ingestRows: vi.fn(async () => ({ batch_id: "batch-1", rows: 3, ok: 2, review: 1, error: 0, unchanged: 0, errors: [] })),
}));
vi.mock("@/lib/push", () => ({ sendToUser: vi.fn(async () => true) }));

import { runFlows } from "@/lib/partner/flows";
import { AGENCY_EXAMPLE_FILE, agencyFee, decideAgency } from "@/lib/partner/agency";
import { ingestRows } from "@/lib/partner/ingest";
import { sendToUser } from "@/lib/push";
import { adminAuthIds, notifyApplications } from "@/lib/partner/notify";
import { AGENCY_PRICE_PER_ITEM, FLOW_MESSAGE_PRICE } from "@/lib/partner/rates";

const P = "11111111-1111-4111-8111-111111111111";
const DAY = 86400e3;
const NOW = Date.parse("2026-11-14T03:00:00Z"); // 낮 12시 (KST)
const iso = (ms: number) => new Date(ms).toISOString();

type Args = { p_partner: string; p_unit: number; p_want: number; p_all: boolean; p_note: string };
/** DB 함수 partner_credit_take 와 같은 규칙 */
function credit(fake: Fake) {
  return withRpc(fake, {
    partner_credit_take: ({ p_partner, p_unit, p_want, p_all, p_note }: Args) => {
      if (p_want === 0) return 0;
      if (p_unit === 0) return p_want;
      const led = (fake.tables.partner_credit_ledger ||= []);
      const bal = led.filter((r) => r.partner_id === p_partner && r.status === "confirmed").reduce((s, r) => s + r.amount, 0);
      const n = Math.min(p_want, Math.floor(Math.max(bal, 0) / p_unit));
      if (p_all && n < p_want) return 0;
      if (n > 0) led.push({ id: `led-${led.length + 1}`, partner_id: p_partner, kind: "charge", amount: -(n * p_unit), status: "confirmed", note: p_note.replace("{n}", String(n)) });
      return n;
    },
  });
}
const topup = (amount: number) => ({ id: `top-${amount}`, partner_id: P, kind: "topup", amount, status: "confirmed", note: "충전" });
const balance = (fake: Fake) => (fake.tables.partner_credit_ledger || []).filter((r) => r.status === "confirmed").reduce((s, r) => s + r.amount, 0);

/** 70일 전에 산 고객 셋 — '다시 찾아 주세요'(60일) 대상 */
function shop(opts: { credit?: number; demo?: boolean; sends?: Record<string, unknown>[] } = {}) {
  const users = ["u1", "u2", "u3"];
  return credit(fakeSb({
    partner_flows: [{ partner_id: P, kind: "winback", is_on: true, coupon_id: null, title: "오랜만이에요", body: "새 메뉴가 나왔어요", delay_days: 60,
      partners: { name: "핏밀", status: "active", is_demo: !!opts.demo } }],
    order_items: users.map((u, i) => ({ id: `line-${i}`, order_id: `order-${u}`, partner_id: P, product_name: "도시락", partner_sku: "S1", quantity: 1, unit_price: 5000,
      fulfil_status: "confirmed", orders: { user_id: u, paid_at: iso(NOW - (70 + i) * DAY), discount_fees: {} } })),
    marketing_consents: users.map((u) => ({ user_id: u, ads: true, night: true })),
    flow_sends: opts.sends || [],
    partner_credit_ledger: opts.credit ? [topup(opts.credit)] : [],
  }));
}

describe(`자동 알림 건당 ${FLOW_MESSAGE_PRICE}원`, () => {
  it("충전금으로 낼 수 있는 만큼만 보내고 한 줄로 뺀다 — 나머지는 다음 차례에", async () => {
    const sb = shop({ credit: 25 });
    const r = await runFlows(sb as never, undefined, NOW);
    expect(r).toEqual({ sent: 2, short: 1 });
    expect(sb.tables.flow_sends).toHaveLength(2);
    const charges = sb.tables.partner_credit_ledger.filter((l) => l.kind === "charge");
    expect(charges).toEqual([expect.objectContaining({ amount: -20, note: "자동 알림 2건 × 10원" })]);
    expect(balance(sb)).toBe(5);

    // 충전하고 다음 차례 — 이미 받은 두 사람은 7일 안이라 건너뛰고 남은 한 사람만
    sb.tables.partner_credit_ledger.push(topup(100));
    sb.tables.flow_sends.forEach((s) => { s.sent_at = iso(NOW); });
    const r2 = await runFlows(sb as never, undefined, NOW + 1800e3);
    expect(r2).toEqual({ sent: 1, short: 0 });
    expect(balance(sb)).toBe(95);
  });

  it("충전금이 없으면 하나도 보내지 않는다", async () => {
    const sb = shop();
    expect(await runFlows(sb as never, undefined, NOW)).toEqual({ sent: 0, short: 3 });
    expect(sb.tables.flow_sends).toHaveLength(0);
  });

  it("예시 업체는 요금 없이 보낸다", async () => {
    const sb = shop({ demo: true });
    expect(await runFlows(sb as never, undefined, NOW)).toEqual({ sent: 3, short: 0 });
    expect(sb.tables.partner_credit_ledger).toHaveLength(0);
  });

  it("같은 계기로 이미 보낸 건(겹침)은 넣지 못하고 요금을 돌려준다", async () => {
    // 8일 전에 같은 주문으로 보낸 기록 — 7일 제한에는 걸리지 않지만 같은 계기라 다시 넣지 못한다
    const sb = shop({ credit: 100, sends: [{ id: "old", partner_id: P, kind: "winback", user_id: "u1", trigger_key: "win:order-u1", sent_at: iso(NOW - 8 * DAY) }] });
    const r = await runFlows(sb as never, undefined, NOW);
    expect(r.sent).toBe(2);
    expect(sb.tables.partner_credit_ledger.filter((l) => l.kind === "release")).toEqual([expect.objectContaining({ amount: 10 })]);
    expect(balance(sb)).toBe(80);
  });
});

describe(`대행 연동 상품당 ${AGENCY_PRICE_PER_ITEM}원`, () => {
  const partner = { id: P, slug: "fitmeal", name: "핏밀", kind: "brand" as const, status: "active", is_demo: false };
  const upload = (over: Record<string, unknown> = {}) => ({ id: "up-1", partner_id: P, status: "waiting", file_name: "핏밀_목록.xlsx", rows: [], batch_id: null, fee: 0,
    preview: { ok: 2, review: 1, error: 4, errors: [] }, ...over });
  const shopA = (creditAmount: number, over: Record<string, unknown> = {}) =>
    credit(fakeSb({ partner_agency_uploads: [upload(over)], partner_credit_ledger: creditAmount ? [topup(creditAmount)] : [] }));

  it("요금은 바로 반영 + 검수 줄만 센다 (오류 줄 뺌) · 예시 파일·예시 업체는 0원", () => {
    expect(agencyFee(upload(), partner)).toEqual({ items: 3, unit: 500, amount: 1500 });
    expect(agencyFee(upload({ file_name: AGENCY_EXAMPLE_FILE }), partner).amount).toBe(0);
    expect(agencyFee(upload(), { is_demo: true }).amount).toBe(0);
  });

  it("충전금이 모자라면 하나도 빼지 않고 기다림으로 둔다", async () => {
    const sb = shopA(1000);
    const r = await decideAgency(sb as never, partner, "up-1", "confirm", "", "user-1");
    expect(r).toMatchObject({ ok: false, status: 402 });
    if (!r.ok) expect(r.message).toContain("1,500원");
    expect(sb.tables.partner_agency_uploads[0].status).toBe("waiting");
    expect(balance(sb)).toBe(1000);
    expect(ingestRows).not.toHaveBeenCalled();
  });

  it("충전금이 있으면 반영하고 한 번에 빼며, 낸 금액을 파일에 적는다", async () => {
    const sb = shopA(2000);
    const r = await decideAgency(sb as never, partner, "up-1", "confirm", "", "user-1");
    expect(r).toMatchObject({ ok: true, fee: 1500 });
    expect(sb.tables.partner_agency_uploads[0]).toMatchObject({ status: "confirmed", fee: 1500, batch_id: "batch-1" });
    expect(sb.tables.partner_credit_ledger.filter((l) => l.kind === "charge")).toEqual([expect.objectContaining({ amount: -1500, note: "대행 연동 3개 × 500원 · 핏밀_목록.xlsx" })]);
    // 두 번 눌러도 한 번만
    expect(await decideAgency(sb as never, partner, "up-1", "confirm", "", "user-1")).toMatchObject({ ok: false, status: 409 });
    expect(balance(sb)).toBe(500);
  });

  it("반영하다 멈추면 요금을 돌려주고 기다림으로 돌린다", async () => {
    vi.mocked(ingestRows).mockRejectedValueOnce(new Error("boom"));
    const sb = shopA(2000);
    await expect(decideAgency(sb as never, partner, "up-1", "confirm", "", "user-1")).rejects.toThrow("boom");
    expect(sb.tables.partner_agency_uploads[0].status).toBe("waiting");
    expect(balance(sb)).toBe(2000);
  });

  it("예시 파일은 충전금이 없어도 반영된다", async () => {
    const sb = shopA(0, { file_name: AGENCY_EXAMPLE_FILE });
    expect(await decideAgency(sb as never, partner, "up-1", "confirm", "", "user-1")).toMatchObject({ ok: true, fee: 0 });
    expect(sb.tables.partner_credit_ledger).toHaveLength(0);
  });
});

describe("입점 신청 관리자 알림", () => {
  const apps = () => fakeSb({
    vendor_applications: [
      { id: "a1", company_name: "핏밀", status: "pending", admin_notified_at: null, created_at: iso(NOW - 3600e3) },
      { id: "a2", company_name: "그린샐러드", status: "pending", admin_notified_at: null, created_at: iso(NOW - 600e3) },
      { id: "a3", company_name: "이미 처리함", status: "rejected", admin_notified_at: null, created_at: iso(NOW - 900e3) },
    ],
    account_links: [{ auth_user_id: "admin-1", actor_id: "actor-admin" }],
    push_subscriptions: [{ endpoint: "https://push/1", user_id: "actor-admin", p256dh: "k", auth: "a" }],
  });

  it("기다리는 신청만 한 번 묶어 알리고, 알린 것으로 적어 다시 보내지 않는다", async () => {
    const sb = apps();
    vi.mocked(sendToUser).mockClear();
    expect(await notifyApplications(sb as never, true, async () => ["admin-1"])).toEqual({ applications: 2, pushed: 1 });
    expect(vi.mocked(sendToUser).mock.calls[0][2]).toMatchObject({ title: "입점 신청 2건이 왔어요", url: "/admin/partners" });
    expect(sb.tables.vendor_applications.filter((a) => a.admin_notified_at).map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(await notifyApplications(sb as never, true, async () => ["admin-1"])).toEqual({ applications: 0, pushed: 0 });
  });

  it("푸시 키가 없으면(send=false) 세기만 하고 적지 않는다", async () => {
    const sb = apps();
    expect(await notifyApplications(sb as never, false, async () => ["admin-1"])).toEqual({ applications: 2, pushed: 0 });
    expect(sb.tables.vendor_applications.every((a) => !a.admin_notified_at)).toBe(true);
  });

  it("관리자는 ADMIN_EMAILS 이메일이거나 role=admin 인 계정", async () => {
    const sb = { auth: { admin: { listUsers: async () => ({ data: { users: [
      { id: "x1", email: "Boss@Example.com" }, { id: "x2", email: "user@example.com" }, { id: "x3", email: null, app_metadata: { role: "admin" } },
    ] }, error: null }) } } };
    expect(await adminAuthIds(sb, "boss@example.com, other@example.com")).toEqual(["x1", "x3"]);
  });
});
