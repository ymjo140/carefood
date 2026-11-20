/** 추천 잣대 (lib/rec-fit) · 다음 끼니 제품 점수 (lib/next-picks pickScore) · 대표 메뉴 (lib/menu-pick) — 몫에 맞는 것이 먼저 */
import { describe, expect, it } from "vitest";
import { budgetFit, known, plausible, snackFit, sodiumCap, sodiumTerm, underCap } from "@/lib/rec-fit";
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

describe("나트륨은 하루 기준 · 모르면 모름", () => {
  it("몫 안 +0.3 · 몫~상한은 넘은 만큼 0→−1.5 · 상한 밖 −3 · 모르면 0 · 몫이 없으면 보지 않음", () => {
    expect(sodiumTerm(400, 800, 1200)).toBe(0.3);
    expect(sodiumTerm(1000, 800, 1200)).toBeCloseTo(-0.75);
    expect(sodiumTerm(1200, 800, 1200)).toBeCloseTo(-1.5);
    expect(sodiumTerm(1300, 800, 1200)).toBe(-3);
    expect(sodiumTerm(null, 800, 1200)).toBe(0);
    expect(sodiumTerm(900, 0)).toBe(0);
  });
  it("상한 = 남은 나트륨 − 이후 끼니마다 400mg (몫보다 작지 않게) · 간식은 500mg 까지", () => {
    expect(sodiumCap({ meal: "breakfast", remainSodium: 2000, share: 667, mainLeft: 3 })).toBe(1200);
    expect(sodiumCap({ meal: "dinner", remainSodium: 900, share: 900, mainLeft: 1 })).toBe(900);
    expect(sodiumCap({ meal: "lunch", remainSodium: 700, share: 350, mainLeft: 2 })).toBe(350);
    expect(sodiumCap({ meal: "snack", remainSodium: 2000, share: 1000, mainLeft: 2 })).toBe(500);
  });
  it("한식 한 끼(나트륨 1,000mg)는 아침 몫 667mg 을 넘어도 후보에 남는다 — 하루 상한 1,200mg 안", () => {
    expect(underCap(1000, 667, 1200)).toBe(true);
    expect(underCap(1300, 667, 1200)).toBe(false);
    expect(underCap(null, 667, 1200)).toBe(true);
  });
  it("몫에 맞는 짠 한 끼(650kcal·1,000mg)가 몫에 한참 못 미치는 싱거운 것(380kcal·550mg)보다 먼저", () => {
    const b = { kcal: 667, protein: 27, sodium: 667, sodiumCap: 1200 };
    expect(pickScore({ calories: 650, protein_g: 28, sodium_mg: 1000 }, b)).toBeGreaterThan(pickScore({ calories: 380, protein_g: 30, sodium_mg: 550 }, b));
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

describe("간식 (홈 간식이 계란만 나오던 것)", () => {
  it("간식 몫은 '많아야 이만큼' — 몫의 40~105%(300kcal 기준 120~315)면 다 1", () => {
    expect(snackFit(120, 300)).toBe(1);
    expect(snackFit(200, 300)).toBe(1);
    expect(snackFit(300, 300)).toBe(1);
    expect(snackFit(90, 300)).toBeCloseTo(0.5);
    expect(snackFit(60, 300)).toBeCloseTo(0);
    expect(snackFit(450, 300)).toBeCloseTo(0);
    expect(budgetFit(150, 300)).toBeCloseTo(0); // 끼니 잣대로는 반 이하라 0 이었다
  });
  it("간식 점수: 단백질 몫(9g)을 채우면 그 이상은 더 쳐주지 않는다", () => {
    const b = { meal: "snack" as const, kcal: 300, protein: 9, sodium: 300, sodiumCap: 500 };
    const egg = pickScore({ calories: 248, protein_g: 31, sodium_mg: 280 }, b);
    const yogurt = pickScore({ calories: 150, protein_g: 10, sodium_mg: 80 }, b);
    expect(Math.abs(egg - yogurt)).toBeLessThan(0.3);
  });
  it("물리적으로 안 되는 값(1g 에 9kcal 넘음 · 단백질이 무게보다 많음)은 거른다", () => {
    expect(plausible({ calories: 273, protein_g: 8, serving_size_g: 20 })).toBe(false); // 그래놀라 20g 273kcal
    expect(plausible({ calories: 20, protein_g: 25, serving_size_g: 20 })).toBe(false);
    expect(plausible({ calories: 118, protein_g: 8, serving_size_g: 30 })).toBe(true);
    expect(plausible({ calories: 500, protein_g: 20, serving_size_g: null })).toBe(true); // 무게를 모르면 두기
  });
});
