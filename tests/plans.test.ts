/** 캐릭터 구독 (lib/plans.ts) — 쓸 수 있는 캐릭터 · 결제일 · 결제 실패 유예 · 환불 · 요금제 변경 */
import { describe, expect, it } from "vitest";
import { BETA_SLOTS, accessOf, addMonthsKst, changeTiming, cheapestPlanFor, hasPerk, nextPeriod, refundOnCancel, upgradeCharge, type SubRow } from "@/lib/plans";

const now = new Date("2026-12-10T03:00:00Z");
const sub = (o: Partial<SubRow> = {}): SubRow => ({
  id: "s1", user_id: "u1", plan_code: "kkirok", status: "active", source: "pg",
  anchor_at: "2026-11-20T01:00:00Z", current_period_start: "2026-11-20T01:00:00Z", current_period_end: "2026-12-20T01:00:00Z", cancel_at_period_end: false, ...o,
});

describe("쓸 수 있는 기능 · 캐릭터 칸", () => {
  it("구독을 열기 전(체험)에는 구독이 없어도 모든 기능 · 칸 제한 없음", () => {
    const a = accessOf(null, now, false);
    expect(a).toMatchObject({ mode: "beta", plan: "basic", slots: BETA_SLOTS });
    expect(hasPerk(a, "report")).toBe(true);
  });
  it("구독을 열면 무료는 캐릭터 1마리·구독 기능 없음, 기본 구독은 체크·추천·리포트, 플러스는 3마리·꾸미기", () => {
    expect(accessOf(null, now, true)).toMatchObject({ plan: "basic", slots: 1, perks: [] });
    expect(accessOf(sub(), now, true)).toMatchObject({ plan: "kkirok", slots: 1, perks: ["check", "recs", "report"], renews: true });
    const plus = accessOf(sub({ plan_code: "all" }), now, true);
    expect(plus.slots).toBe(3);
    expect(hasPerk(plus, "closet")).toBe(true);
  });
  it("해지해도 기간 끝까지 쓰고, 끝나면 무료", () => {
    const c = sub({ status: "canceled", cancel_at_period_end: true });
    expect(accessOf(c, now, true)).toMatchObject({ plan: "kkirok", renews: false });
    expect(accessOf(c, new Date("2026-12-20T01:00:01Z"), true).plan).toBe("basic");
  });
  it("결제 실패는 3일 더 쓰고 그 뒤 무료", () => {
    const p = sub({ status: "past_due" });
    expect(accessOf(p, new Date("2026-12-22T01:00:00Z"), true)).toMatchObject({ plan: "kkirok", retrying: true });
    expect(accessOf(p, new Date("2026-12-23T01:00:01Z"), true).plan).toBe("basic");
  });
  it("선물 구독은 다음 결제가 없다", () => {
    expect(accessOf(sub({ source: "gift" }), now, true).renews).toBe(false);
  });
  it("기능별 가장 싼 요금제", () => {
    expect(cheapestPlanFor("check").code).toBe("kkirok");
    expect(cheapestPlanFor("closet").code).toBe("all");
    expect(cheapestPlanFor("swap").code).toBe("all");
  });
});

describe("결제일 (한국 시간 같은 날, 없으면 그달 마지막 날)", () => {
  // 1월 31일 10시(한국) 첫 결제
  const a = "2027-01-31T01:00:00Z";
  it("짧은 달은 마지막 날, 다음 달은 다시 31일", () => {
    expect(addMonthsKst(a, 1)).toBe("2027-02-28T01:00:00.000Z");
    expect(addMonthsKst(a, 2)).toBe("2027-03-31T01:00:00.000Z");
    expect(addMonthsKst(a, 3)).toBe("2027-04-30T01:00:00.000Z");
    expect(addMonthsKst(a, 12)).toBe("2028-01-31T01:00:00.000Z");
  });
  it("한국 자정 넘긴 시각도 한국 날짜로 센다", () => {
    // 한국 12월 31일 0시 30분 = UTC 12월 30일 15:30
    expect(addMonthsKst("2026-12-30T15:30:00Z", 2)).toBe("2027-02-27T15:30:00.000Z");
  });
  it("갱신은 anchor 에서 세어 28일로 밀리지 않는다", () => {
    const p = nextPeriod({ anchor_at: a, current_period_end: addMonthsKst(a, 1) });
    expect(p).toEqual({ start: "2027-02-28T01:00:00.000Z", end: "2027-03-31T01:00:00.000Z" });
  });
});

describe("환불 · 요금제 변경", () => {
  const paidAt = "2026-12-01T01:00:00Z";
  it("7일 안 + 유료 캐릭터를 안 썼으면 전액", () => {
    expect(refundOnCancel({ paidAt, now: new Date("2026-12-07T01:00:00Z"), usedPerk: false })).toBe("full");
    expect(refundOnCancel({ paidAt, now: new Date("2026-12-07T01:00:00Z"), usedPerk: true })).toBe("none");
    expect(refundOnCancel({ paidAt, now: new Date("2026-12-08T01:00:01Z"), usedPerk: false })).toBe("none");
  });
  it("올리면 바로, 내리면 다음 결제일부터", () => {
    expect(changeTiming("kkirok", "all")).toBe("now");
    expect(changeTiming("all", "kkirok")).toBe("next");
    expect(changeTiming("all", "all")).toBe("same");
  });
  it("올릴 때 차액은 남은 기간 비율, 10원 단위 버림", () => {
    const o = { from: "kkirok" as const, to: "all" as const, periodStart: "2026-12-01T00:00:00Z", periodEnd: "2026-12-31T00:00:00Z" };
    expect(upgradeCharge({ ...o, now: new Date("2026-12-01T00:00:00Z") })).toBe(2000);
    expect(upgradeCharge({ ...o, now: new Date("2026-12-16T00:00:00Z") })).toBe(1000);
    expect(upgradeCharge({ ...o, now: new Date("2026-12-21T00:00:00Z") })).toBe(660);
    expect(upgradeCharge({ ...o, to: "kkirok", from: "all", now: new Date("2026-12-16T00:00:00Z") })).toBe(0);
  });
});
