/** 홈 '오늘 ○○ 추천' (lib/home-meal) — 처음 끼니 · 저녁에서 점심 추천 빼기 */
import { describe, expect, it } from "vitest";
import { defaultMeal, DISH_ROLES, hourKst, mealsToAvoid } from "@/lib/home-meal";

describe("defaultMeal — 지금 시각(한국)으로 처음 끼니", () => {
  it.each([
    [0, "breakfast"], [6, "breakfast"], [9, "breakfast"],
    [10, "lunch"], [14, "lunch"],
    [15, "snack"], [16, "snack"],
    [17, "dinner"], [20, "dinner"],
    [21, "snack"], [23, "snack"],
  ])("%i시 → %s", (h, meal) => expect(defaultMeal(h)).toBe(meal));
});

describe("hourKst", () => {
  it("UTC 에 9시간을 더하고 24로 돈다", () => {
    expect(hourKst(new Date("2026-11-20T00:30:00Z"))).toBe(9);
    expect(hourKst(new Date("2026-11-20T15:00:00Z"))).toBe(0);
    expect(hourKst(new Date("2026-11-20T23:59:00Z"))).toBe(8);
  });
});

describe("mealsToAvoid — 점심·저녁이 같은 것을 권하지 않게", () => {
  it("저녁: 점심이 비어 있으면 점심 추천을 먼저 뺀다", () => {
    expect(mealsToAvoid("dinner", new Set())).toEqual(["lunch"]);
    expect(mealsToAvoid("dinner", new Set(["breakfast"]))).toEqual(["lunch"]);
  });
  it("저녁: 점심을 기록했거나 담았으면 그 제품은 이미 빠지므로 따로 빼지 않는다", () => {
    expect(mealsToAvoid("dinner", new Set(["lunch"]))).toEqual([]);
  });
  it("다른 끼니는 빼지 않는다", () => {
    for (const m of ["breakfast", "lunch", "snack"] as const) expect(mealsToAvoid(m, new Set())).toEqual([]);
  });
});

describe("DISH_ROLES — 카테고리 거르기 값", () => {
  it("DB dish_role 값과 같다 (ingredient·condiment 는 홈 카테고리가 아니다)", () => {
    expect(DISH_ROLES).toEqual(["main", "rice", "soup", "side", "snack"]);
  });
});
