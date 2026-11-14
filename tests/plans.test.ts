/** 캐릭터 구독 (lib/plans.ts) — 쓸 수 있는 캐릭터 · 결제일 · 결제 실패 유예 · 환불 · 요금제 변경 */
import { describe, expect, it } from "vitest";
import { accessOf, addMonthsKst, changeTiming, cheapestPlanFor, effectiveKind, nextPeriod, refundOnCancel, upgradeCharge, type SubRow } from "@/lib/plans";

const now = new Date("2026-12-10T03:00:00Z");
const sub = (o: Partial<SubRow> = {}): SubRow => ({
  id: "s1", user_id: "u1", plan_code: "kkirok", status: "active", source: "pg",
  anchor_at: "2026-11-20T01:00:00Z", current_period_start: "2026-11-20T01:00:00Z", current_period_end: "2026-12-20T01:00:00Z", cancel_at_period_end: false, ...o,
});

describe("쓸 수 있는 캐릭터", () => {
  it("구독을 열기 전(체험)에는 구독이 없어도 셋 다", () => {
    expect(accessOf(null, now, false)).toMatchObject({ mode: "beta", plan: "basic", characters: ["kkirok", "rami", "kkinyang"] });
  });
  it("구독을 열면 기본은 캐릭터 없음, 끼록이 플랜은 끼록이만, 모든 캐릭터 플랜은 셋", () => {
    expect(accessOf(null, now, true).characters).toEqual([]);
    expect(accessOf(sub(), now, true)).toMatchObject({ plan: "kkirok", characters: ["kkirok"], renews: true });
    expect(accessOf(sub({ plan_code: "all" }), now, true).characters).toEqual(["kkirok", "rami", "kkinyang"]);
  });
  it("해지해도 기간 끝까지 쓰고, 끝나면 기본", () => {
    const c = sub({ status: "canceled", cancel_at_period_end: true });
    expect(accessOf(c, now, true)).toMatchObject({ plan: "kkirok", renews: false });
    expect(accessOf(c, new Date("2026-12-20T01:00:01Z"), true).plan).toBe("basic");
  });
  it("결제 실패는 3일 더 쓰고 그 뒤 기본", () => {
    const p = sub({ status: "past_due" });
    expect(accessOf(p, new Date("2026-12-22T01:00:00Z"), true)).toMatchObject({ plan: "kkirok", retrying: true });
    expect(accessOf(p, new Date("2026-12-23T01:00:01Z"), true).plan).toBe("basic");
  });
  it("선물 구독은 다음 결제가 없다", () => {
    expect(accessOf(sub({ source: "gift" }), now, true).renews).toBe(false);
  });
  it("고른 캐릭터를 못 쓰게 되면 캐릭터 없이, 다시 구독하면 그대로", () => {
    expect(effectiveKind("rami", accessOf(sub(), now, true))).toBe("none");
    expect(effectiveKind("kkirok", accessOf(sub(), now, true))).toBe("kkirok");
    expect(effectiveKind("rami", accessOf(sub({ plan_code: "all" }), now, true))).toBe("rami");
    expect(effectiveKind("none", accessOf(null, now, false))).toBe("none");
  });
  it("캐릭터별 가장 싼 요금제", () => {
    expect(cheapestPlanFor("kkirok").code).toBe("kkirok");
    expect(cheapestPlanFor("rami").code).toBe("all");
    expect(cheapestPlanFor("kkinyang").code).toBe("all");
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
    expect(refundOnCancel({ paidAt, now: new Date("2026-12-07T01:00:00Z"), usedPaidCharacter: false })).toBe("full");
    expect(refundOnCancel({ paidAt, now: new Date("2026-12-07T01:00:00Z"), usedPaidCharacter: true })).toBe("none");
    expect(refundOnCancel({ paidAt, now: new Date("2026-12-08T01:00:01Z"), usedPaidCharacter: false })).toBe("none");
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
