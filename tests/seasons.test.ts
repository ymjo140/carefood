/** 큰 시즌 날짜 (lib/seasons.ts) — 매달 첫 월요일 4주 · 1월 첫 월요일 8주 · 2월 없음 · 첫 시즌 2026년 12월 */
import { describe, expect, it } from "vitest";
import { firstMonday, seasonChallengeText, seasonChallenges, seasonEnd, seasonOfMonth, seasonsAround } from "@/lib/seasons";

describe("시즌 날짜", () => {
  it("첫 월요일", () => {
    expect(firstMonday(2026, 12)).toBe("2026-12-07");
    expect(firstMonday(2027, 1)).toBe("2027-01-04");
    expect(firstMonday(2027, 3)).toBe("2027-03-01");
  });
  it("첫 시즌은 12월, 11월은 없음, 2월은 새해 시즌이 덮음", () => {
    expect(seasonOfMonth(2026, 11)).toBeNull();
    expect(seasonOfMonth(2027, 2)).toBeNull();
    const ny = seasonOfMonth(2027, 1)!;
    expect([ny.slug, ny.days, seasonEnd(ny)]).toEqual(["2027-newyear", 56, "2027-02-28"]);
  });
  it("지금·다음 시즌", () => {
    expect(seasonsAround("2026-11-14")).toMatchObject({ current: null, next: { slug: "2026-12" } });
    expect(seasonsAround("2026-12-20")).toMatchObject({ current: { slug: "2026-12" }, next: { slug: "2027-newyear" } });
    expect(seasonsAround("2027-01-03")).toMatchObject({ current: { slug: "2026-12" } }); // 12월 시즌 마지막 날
    expect(seasonsAround("2027-02-20")).toMatchObject({ current: { slug: "2027-newyear" }, next: { slug: "2027-03" } });
  });
  it("시즌 챌린지 — 겹치지 않게, 제목에 기간 숫자 없음", () => {
    const s = seasonOfMonth(2026, 12)!;
    const cs = seasonChallenges(s);
    expect(cs.map((c) => c.metric)).toEqual(["meals_min", "kcal_band", "macro_type", "macro_type", "record_any"]);
    expect(seasonChallengeText(s, cs[1]).title).toBe("연말에도 세 끼 · 열량 구간 지키기");
  });
});
