/** 식단 탭 빈 끼니 'AI 추천' (lib/ai-fill) — 이 끼니 몫 · 하나 고르기 · 다른 추천 */
import { describe, expect, it } from "vitest";
import { fillBudget, pickOne, skipKey } from "@/lib/ai-fill";
import type { Menu } from "@/lib/menu-pick";
import type { PickItem } from "@/lib/next-picks";
import { saveAiPlan } from "@/lib/ai-fill-server";
import { fakeSb } from "./fake-sb";

const goals = { kcal: 1800, protein: 90, sodium: 2000 };

describe("이 끼니 몫", () => {
  it("아무것도 없으면 하루를 세 끼로 나눈다", () => {
    expect(fillBudget("lunch", goals, [], [])).toEqual({ kcal: 600, protein: 30, sodium: 667, sodiumCap: 1200 }); // 상한 = 2,000 − 남은 두 끼 × 400
  });
  it("기록한 끼니와 다른 끼니에 담아 둔 예정을 빼고, 남은 끼니로 나눈다", () => {
    const rows = [{ meal_type: "breakfast", calories: 400, protein_g: 20, sodium_mg: 500 }];
    const plans = [{ meal: "dinner", foods: [{ calories: 700, protein_g: 40, sodium_mg: 900 }] }];
    // 남은 1800-400-700=700, 비어 있는 큰 끼니는 점심 하나
    expect(fillBudget("lunch", goals, rows, plans)).toEqual({ kcal: 700, protein: 30, sodium: 600, sodiumCap: 600 }); // 남은 끼니가 이것뿐 — 상한 = 남은 나트륨
  });
  it("다시 고를 때는 그 끼니의 지금 예정을 빼지 않는다", () => {
    const plans = [{ meal: "lunch", foods: [{ calories: 900, protein_g: 10, sodium_mg: 100 }] }];
    expect(fillBudget("lunch", goals, [], plans).kcal).toBe(600);
  });
  it("하루를 다 먹었어도 한 끼 후보는 낸다(하루의 30%) · 간식은 200kcal", () => {
    const rows = [{ meal_type: "breakfast", calories: 1800 }, { meal_type: "lunch", calories: 300 }];
    expect(fillBudget("dinner", goals, rows, []).kcal).toBe(540);
    expect(fillBudget("snack", goals, rows, []).kcal).toBe(200);
  });
});

const menu = (id: string, name: string): Menu => ({ id, name, category: "korean", serving_desc: "1인분", serving_size_g: 300, calories: 520, protein_g: 28, carbs_g: 60, fat_g: 12, sodium_mg: 800, sugar_g: 4 } as Menu);
const item = (id: string, name: string): PickItem => ({ id, name, manufacturer: "가", image_url: null, calories: 410.4, protein_g: 31.26, sodium_mg: 620, serving_size_g: 250, nutrient_base_g: 100 });

describe("하나 고르기", () => {
  const menus = [menu("m1", "닭가슴살 덮밥"), menu("m2", "두부 샐러드")];
  const items = [item("11111111-1111-4111-8111-111111111111", "연어 포케")];
  it("메뉴부터 — 대표 메뉴는 제품 번호 없이 이름과 1인분 값으로 담는다", () => {
    const p = pickOne(menus, items)!;
    expect(p.food).toEqual({ name: "닭가슴살 덮밥", calories: 520, protein_g: 28, carbs_g: 60, fat_g: 12, sodium_mg: 800 });
    expect(p.facts).toBe("520kcal · 단백질 28g");
  });
  it("다른 추천 — 권한 것은 건너뛰고 메뉴·제품을 번갈아 본다", () => {
    const first = pickOne(menus, items)!;
    const second = pickOne(menus, items, [skipKey(first.food)])!;
    expect(second.food).toMatchObject({ product_id: "11111111-1111-4111-8111-111111111111", name: "연어 포케", calories: 410.4, protein_g: 31.3, type: "product" });
    const third = pickOne(menus, items, [skipKey(first.food), skipKey(second.food)])!;
    expect(third.food.name).toBe("두부 샐러드");
  });
  it("점수가 있으면 메뉴·제품을 한 줄로 — 제품 점수가 높으면 제품이 먼저", () => {
    const scored = [{ ...items[0], score: 6 }];
    expect(pickOne(menus, scored, [], () => 4)!.food.name).toBe("연어 포케");
    expect(pickOne(menus, [{ ...items[0], score: 2 }], [], () => 4)!.food.name).toBe("닭가슴살 덮밥");
  });
  it("다 권했으면 처음 것으로 돌아가고, 후보가 없으면 null", () => {
    const all = ["menu:닭가슴살 덮밥", "menu:두부 샐러드", "11111111-1111-4111-8111-111111111111"];
    expect(pickOne(menus, items, all)!.food.name).toBe("닭가슴살 덮밥");
    expect(pickOne([], [])).toBeNull();
  });
});

describe("예정으로 담기 (덮지 않기)", () => {
  const food = [{ name: "두부 샐러드", calories: 520 }];
  const row = (title: string | null) => ({ user_id: "me", date: "2026-11-21", meal: "lunch", foods: [{ name: "예전" }], plan_title: title });
  it("비어 있으면 'AI 추천'으로 새로 담는다", async () => {
    const sb = fakeSb({ planned_meals: [] });
    expect(await saveAiPlan(sb, "me", "2026-11-21", "lunch", food, false)).toBe("ok");
    expect(sb.tables.planned_meals[0]).toMatchObject({ meal: "lunch", plan_title: "AI 추천", foods: food, sent_by: null });
  });
  it("그 사이 다른 계획이 먼저 담겼으면 덮지 않는다", async () => {
    const sb = fakeSb({ planned_meals: [row("식단 리스트")] });
    expect(await saveAiPlan(sb, "me", "2026-11-21", "lunch", food, false)).toBe("conflict");
    expect(sb.tables.planned_meals[0].foods).toEqual([{ name: "예전" }]);
  });
  it("다른 추천 — 아직 'AI 추천'일 때만 바꾸고, 다른 계획으로 바뀌었으면 그대로 둔다", async () => {
    const ai = fakeSb({ planned_meals: [row("AI 추천")] });
    expect(await saveAiPlan(ai, "me", "2026-11-21", "lunch", food, true)).toBe("ok");
    expect(ai.tables.planned_meals[0].foods).toEqual(food);
    const swapped = fakeSb({ planned_meals: [row("가족 식단")] });
    expect(await saveAiPlan(swapped, "me", "2026-11-21", "lunch", food, true)).toBe("conflict");
    expect(swapped.tables.planned_meals[0].foods).toEqual([{ name: "예전" }]);
  });
});
