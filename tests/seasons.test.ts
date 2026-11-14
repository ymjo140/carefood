/** 큰 시즌 날짜 (lib/seasons.ts) — 매달 1일부터 그달 끝까지 · 새해는 1월 1일~2월 끝 · 2월 없음 · 첫 시즌 2026년 12월 */
import { describe, expect, it } from "vitest";
import { monthDays, seasonChallengeText, seasonChallenges, seasonEnd, seasonOfMonth, seasonsAround } from "@/lib/seasons";

describe("시즌 날짜", () => {
  it("달의 날 수", () => {
    expect(monthDays(2026, 12)).toBe(31);
    expect(monthDays(2027, 2)).toBe(28);
    expect(monthDays(2028, 2)).toBe(29);
    expect(monthDays(2027, 1, 2)).toBe(59);
  });
  it("매달 1일 시작, 첫 시즌은 12월, 11월은 없음, 2월은 새해 시즌이 덮음", () => {
    expect(seasonOfMonth(2026, 11)).toBeNull();
    expect(seasonOfMonth(2027, 2)).toBeNull();
    const dec = seasonOfMonth(2026, 12)!;
    expect([dec.start_on, dec.days, seasonEnd(dec)]).toEqual(["2026-12-01", 31, "2026-12-31"]);
    const ny = seasonOfMonth(2027, 1)!;
    expect([ny.slug, ny.start_on, ny.days, seasonEnd(ny)]).toEqual(["2027-newyear", "2027-01-01", 59, "2027-02-28"]);
    expect(seasonOfMonth(2027, 3)!.start_on).toBe("2027-03-01");
  });
  it("지금·다음 시즌 — 빈틈 없이 이어진다", () => {
    expect(seasonsAround("2026-11-14")).toMatchObject({ current: null, next: { slug: "2026-12" } });
    expect(seasonsAround("2026-12-31")).toMatchObject({ current: { slug: "2026-12" }, next: { slug: "2027-newyear" } });
    expect(seasonsAround("2027-01-01")).toMatchObject({ current: { slug: "2027-newyear" } });
    expect(seasonsAround("2027-02-28")).toMatchObject({ current: { slug: "2027-newyear" }, next: { slug: "2027-03" } });
    expect(seasonsAround("2027-03-01")).toMatchObject({ current: { slug: "2027-03" } });
  });
  it("시즌 챌린지 — 겹치지 않게, 제목에 기간 숫자 없음", () => {
    const s = seasonOfMonth(2026, 12)!;
    const cs = seasonChallenges(s);
    expect(cs.map((c) => c.metric)).toEqual(["meals_min", "kcal_band", "macro_type", "macro_type", "record_any"]);
    expect(seasonChallengeText(s, cs[1]).title).toBe("연말에도 세 끼 · 열량 구간 지키기");
    expect(seasonChallengeText(s, cs[0]).title).toBe("연말에도 세 끼 · 세 끼 기록하기");
  });
});
