/** 캐릭터 이야기의 하루·일주일 추천 (lib/chat-plans) */
import { describe, expect, it } from "vitest";
import { dayKcal, dayMeals, isDayAsk, isWeekAsk, planGrid, planKind, weekPicks } from "@/lib/chat-plans";
import { planLine } from "@/lib/buddy-chat";

describe("무엇을 물었나", () => {
  it("일주일 식단", () => {
    expect(isWeekAsk("일주일 식단 추천")).toBe(true);
    expect(isWeekAsk("이번 주 식단 짜 줘")).toBe(true);
    expect(isWeekAsk("7일 메뉴 골라 줘")).toBe(true);
    expect(isWeekAsk("일주일 동안 고마웠어")).toBe(false);
  });
  it("끼니를 짚지 않은 추천은 오늘 하루로", () => {
    expect(isDayAsk("뭐 먹을까?", false)).toBe(true);
    expect(isDayAsk("점심 뭐 먹을까?", true)).toBe(false);
    expect(isDayAsk("오늘 하루 식단 추천해 줘", true)).toBe(true);
  });
  it("하루 추천 끼니 — 기록 안 한 세 끼 모두, 다 했으면 간식", () => {
    expect(dayMeals(new Set())).toEqual(["breakfast", "lunch", "dinner"]);
    expect(dayMeals(new Set(["breakfast"]))).toEqual(["lunch", "dinner"]);
    expect(dayMeals(new Set(["breakfast", "lunch", "dinner"]))).toEqual(["snack"]);
  });
});

describe("일주일 카드 → 식단 리스트", () => {
  const meal = (id: string, slot: string, kcal: number) => ({ product_id: id, name: `메뉴${id}`, calories: kcal, protein_g: 20, carbs_g: 50, fat_g: 10, sodium_mg: 600, best_price: 5000, slot_type: slot, prices: [{ platform: "kurly", url: "https://x" }] });
  const days = Array.from({ length: 7 }, (_, d) => ({ meals: [meal(`${d}a`, "breakfast", 300), meal(`${d}b`, "lunch", 600), meal(`${d}c`, "dinner", 550)] }));
  const items = weekPicks(days);
  it("7일 × 3끼 줄, 요일·끼니가 붙는다", () => {
    expect(items).toHaveLength(21);
    expect(items[0].slot).toEqual({ day: "mon", meal: "breakfast" });
    expect(items[20].slot).toEqual({ day: "sun", meal: "dinner" });
    expect(planKind(items)).toBe("week");
    expect(dayKcal(items, "tue")).toBe(1450);
  });
  it("식단 리스트 칸 모양으로", () => {
    const g = planGrid(items);
    expect(Object.keys(g)).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(g.mon.lunch).toMatchObject({ product_id: "0b", calories: 600, price: 5000, platform: "kurly", type: "product" });
    expect(g.mon.supplement).toBeNull();
  });
  it("AI 없이 답할 때 한 줄", () => {
    expect(planLine({ kind: "week", picks: items })).toContain("일주일 식단에 담기");
    expect(planLine({ kind: "week", picks: [] })).toContain("추천으로 채우기");
    expect(planLine({ kind: "day", picks: [{ ...items[0], slot: { day: null, meal: "lunch" } }] })).toContain("점심");
  });
});
