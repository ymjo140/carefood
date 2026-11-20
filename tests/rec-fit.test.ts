/** 추천 잣대 (lib/rec-fit) · 다음 끼니 제품 점수 (lib/next-picks pickScore) · 대표 메뉴 (lib/menu-pick) — 몫에 맞는 것이 먼저 */
import { describe, expect, it } from "vitest";
import { budgetFit, known, sodiumTerm } from "@/lib/rec-fit";
import { pickScore } from "@/lib/next-picks";
import { menuFacts, pickMenus, type Menu } from "@/lib/menu-pick";

describe("몫 맞춤", () => {
  it("몫의 90~105% 는 1, 모자라면 50% 에서 0, 넘치면 150% 에서 0", () => {
    expect(budgetFit(610, 667)).toBe(1);
    expect(budgetFit(700, 667)).toBe(1);
    expect(budgetFit(200, 667)).toBe(0);
    expect(budgetFit(467, 667)).toBeCloseTo(0.5, 1);
    expect(budgetFit(1010, 667)).toBe(0);
  });
  it("값이 없거나 몫이 없으면 0", () => {
    expect(budgetFit(null, 667)).toBe(0);
    expect(budgetFit(500, 0)).toBe(0);
  });
});

describe("나트륨은 모르면 모름", () => {
  it("몫 안 +0.3 · 넘으면 −1 · 모르면 0 · 몫이 없으면 보지 않음", () => {
    expect(sodiumTerm(400, 800)).toBe(0.3);
    expect(sodiumTerm(900, 800)).toBe(-1);
    expect(sodiumTerm(null, 800)).toBe(0);
    expect(sodiumTerm(900, 0)).toBe(0);
  });
  it("known: 빈 값은 null, 0 은 0", () => {
    expect(known(null)).toBeNull();
    expect(known("")).toBeNull();
    expect(known(0)).toBe(0);
  });
});

describe("다음 끼니 제품 점수 — 아침 몫 667kcal", () => {
  const b = { kcal: 667, protein: 27, sodium: 800 };
  it("몫에 맞는 한 끼가 가벼운 고단백 샐러드보다 먼저 (전에는 반대)", () => {
    const meal = pickScore({ calories: 620, protein_g: 30, sodium_mg: 700 }, b);
    const salad = pickScore({ calories: 200, protein_g: 20, sodium_mg: 300 }, b);
    expect(meal).toBeGreaterThan(salad);
  });
  it("같은 조건이면 나트륨을 아는 쪽(몫 안)이 모르는 쪽보다 먼저", () => {
    expect(pickScore({ calories: 620, protein_g: 30, sodium_mg: 500 }, b)).toBeGreaterThan(pickScore({ calories: 620, protein_g: 30, sodium_mg: null }, b));
  });
});

describe("대표 메뉴도 몫에 맞게", () => {
  const m = (id: string, name: string, calories: number, protein_g: number): Menu =>
    ({ id, name, category: id, serving_desc: "1인분", serving_size_g: 300, calories, protein_g, carbs_g: 50, fat_g: 10, sodium_mg: 500, sugar_g: 3 } as Menu);
  it("667kcal 몫이면 620kcal 덮밥이 200kcal 샐러드보다 먼저", () => {
    const foods = [m("한식", "닭가슴살 덮밥", 620, 32), m("양식", "샐러드", 200, 12)];
    const got = pickMenus(foods, { meal: "breakfast", kcal: 667, protein: 27, sodium: 800, avoid: [] }, 1, 0);
    expect(got[0].name).toBe("닭가슴살 덮밥");
  });
  it("나트륨을 모르면 0mg 이라고 쓰지 않는다", () => {
    expect(menuFacts({ calories: 520, protein_g: 21, sodium_mg: null })).toBe("단백질 21g · 520kcal");
    expect(menuFacts({ calories: 520, protein_g: 21, sodium_mg: 640 })).toBe("단백질 21g · 나트륨 640mg · 520kcal");
  });
});
