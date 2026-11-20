/** 끼니 때 (lib/meal-time) — 아침에 보쌈·족발·치킨을 권하지 않는다 · 점심·저녁은 가르지 않는다 */
import { describe, expect, it } from "vitest";
import { mealTimeBonus, offMeal } from "@/lib/meal-time";
import { pickMenus, type Menu } from "@/lib/menu-pick";

const m = (name: string, calories: number, protein_g: number, sodium_mg: number): Menu =>
  ({ id: name, name, category: "한식", serving_desc: "1인분", serving_size_g: 300, calories, protein_g, carbs_g: 50, fat_g: 10, sodium_mg, sugar_g: 3 } as Menu);

describe("아침에 맞는 음식", () => {
  it("아침에는 보쌈·족발·치킨·삼겹살을 빼고, 점심·저녁은 그대로", () => {
    for (const n of ["보쌈", "족발", "치킨 (양념)", "삼겹살 구이", "닭갈비", "부대찌개", "마라탕"]) expect(offMeal(n, "breakfast")).toBe(true);
    expect(offMeal("보쌈", "dinner")).toBe(false);
    expect(offMeal("보쌈", "lunch")).toBe(false);
    expect(offMeal("김밥", "breakfast")).toBe(false);
  });
  it("아침다운 음식(죽·샌드위치·달걀·김밥·미역국)은 아침에만 +0.6", () => {
    expect(mealTimeBonus("전복죽", "breakfast")).toBe(0.6);
    expect(mealTimeBonus("에그 샌드위치", "breakfast")).toBe(0.6);
    expect(mealTimeBonus("미역국", "breakfast")).toBe(0.6);
    expect(mealTimeBonus("전복죽", "lunch")).toBe(0);
    expect(mealTimeBonus("제육볶음", "breakfast")).toBe(0);
  });
  it("대표 메뉴 고르기 — 아침에는 보쌈이 몫에 더 맞아도 나오지 않는다", () => {
    const foods = [m("보쌈", 640, 40, 600), m("김밥", 480, 12, 900)];
    const b = { kcal: 667, protein: 27, sodium: 667, sodiumCap: 1200, avoid: [] };
    expect(pickMenus(foods, { ...b, meal: "breakfast" }, 2).map((f) => f.name)).toEqual(["김밥"]);
    expect(pickMenus(foods, { ...b, meal: "dinner" }, 1)[0].name).toBe("보쌈");
  });
});
