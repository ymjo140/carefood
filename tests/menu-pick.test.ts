/** 다음 끼니 메뉴 고르기 (lib/menu-pick.ts) · 기록 직후 숫자 체크 (lib/buddy-check.ts) */
import { describe, expect, it } from "vitest";
import { budgetReason, mealBudget, menuFacts, pickMenus, type Menu } from "@/lib/menu-pick";
import { checkLines } from "@/lib/buddy-check";

const M = (name: string, category: string, calories: number, protein_g: number, sodium_mg: number): Menu =>
  ({ id: name, name, category, serving_desc: "1인분", serving_size_g: 300, calories, protein_g, carbs_g: 0, fat_g: 0, sodium_mg, sugar_g: 0 });
const FOODS: Menu[] = [
  M("두부조림 정식", "한식", 520, 21, 640),
  M("김치찌개", "한식", 450, 18, 1900),
  M("연어덮밥", "일식", 560, 26, 900),
  M("치킨 샐러드", "양식", 380, 28, 520),
  M("떡볶이", "분식", 480, 8, 1300),
  M("아메리카노", "카페", 10, 0, 5),
  M("그릭요거트볼", "간식", 220, 14, 80),
  M("땅콩버터 샌드위치", "양식", 450, 15, 500),
  M("야식 족발", "야식", 900, 40, 1800),
];
const budget = { meal: "dinner" as const, kcal: 650, protein: 25, sodium: 900, avoid: [] as string[] };

describe("다음 끼니 메뉴", () => {
  it("남은 나트륨 안에서, 단백질을 잘 채우는 쪽으로 · 종류는 겹치지 않게", () => {
    const got = pickMenus(FOODS, budget, 2, 1);
    expect(got).toHaveLength(2);
    for (const m of got) expect(m.sodium_mg).toBeLessThanOrEqual(900);
    expect(new Set(got.map((m) => m.category)).size).toBe(2);
    expect(got.map((m) => m.name)).not.toContain("김치찌개");
  });
  it("끼니에는 카페·간식·야식을 권하지 않고, 간식에는 간식·카페만", () => {
    for (let s = 0; s < 10; s++) for (const m of pickMenus(FOODS, budget, 3, s)) expect(["카페", "간식", "야식"]).not.toContain(m.category);
    for (const m of pickMenus(FOODS, { ...budget, meal: "snack", kcal: 300 }, 2)) expect(["간식", "카페"]).toContain(m.category);
  });
  it("알레르기 단어가 든 메뉴는 뺀다", () => {
    for (let s = 0; s < 10; s++) expect(pickMenus(FOODS, { ...budget, avoid: ["땅콩"] }, 3, s).map((m) => m.name)).not.toContain("땅콩버터 샌드위치");
  });
  it("남은 열량이 거의 없으면 권하지 않는다", () => {
    expect(pickMenus(FOODS, { ...budget, kcal: 100 })).toEqual([]);
  });
  it("나트륨을 다 썼으면 그래도 가장 적은 쪽을 권한다", () => {
    expect(pickMenus(FOODS, { ...budget, sodium: 0 }, 1).length).toBe(1);
  });
  it("한 끼 예산은 남은 끼니로 나누고, 하루 목표의 45%를 넘지 않는다", () => {
    expect(mealBudget({ meal: "lunch", mainLeft: 2, goalKcal: 1900, remainKcal: 1590, remainProtein: 64, remainSodium: 1660 }))
      .toEqual({ kcal: 795, protein: 32, sodium: 830 });
    expect(mealBudget({ meal: "dinner", mainLeft: 1, goalKcal: 1900, remainKcal: 1590, remainProtein: 0, remainSodium: -200 }).kcal).toBe(855);
  });
  it("숫자 한 줄과 고른 이유", () => {
    expect(menuFacts(FOODS[0])).toBe("단백질 21g · 나트륨 640mg · 520kcal");
    expect(budgetReason({ kcal: 650, protein: 25, sodium: 900 })).toContain("단백질 25g");
    expect(budgetReason({ kcal: 650, protein: 5, sodium: 300 })).toContain("나트륨이 300mg");
    expect(budgetReason({ kcal: 650, protein: 5, sodium: 900 })).toBe("650kcal 안쪽으로 골랐어요");
  });
});

describe("기록 직후 숫자 체크", () => {
  const goals = { kcal: 1900, protein: 76, sodium: 2000 };
  it("단백질은 목표의 몇 %, 나트륨이 기준의 70% 미만이면 남은 열량", () => {
    expect(checkLines({ kcal: 996, protein: 38, sodium: 1200 }, goals)).toEqual(["단백질 38g · 하루 목표의 50%", "남은 열량 904kcal"]);
  });
  it("나트륨이 기준의 70%를 넘으면 남은 나트륨, 넘었으면 사실만", () => {
    expect(checkLines({ kcal: 996, protein: 38, sodium: 1820 }, goals)[1]).toBe("나트륨 1,820mg · 내 기준까지 180mg 남았어요");
    expect(checkLines({ kcal: 996, protein: 38, sodium: 2300 }, goals)[1]).toBe("나트륨 2,300mg · 내 기준 2,000mg보다 300mg 더 기록됐어요");
  });
  it("목표를 넘긴 열량도 평가 없이 사실만", () => {
    expect(checkLines({ kcal: 2310, protein: 80, sodium: 500 }, goals)[1]).toBe("오늘 2,310kcal 기록했어요");
  });
});

import { planPreMeal, preSlotOf, sentTodayCount } from "@/lib/premeal-push";

describe("먹기 전 알림", () => {
  const T = "2026-11-15";
  const base = {
    slot: "lunch" as const, today: T, goals: { kcal: 1900, protein: 76, sodium: 2000 },
    foods: FOODS, avoid: [] as string[], name: "까다로운 고구마", sentToday: 0, seed: 3, recs: true,
    rows: [{ date: "2026-11-14", meal_type: "dinner", calories: 600, protein_g: 20, sodium_mg: 900 }],
  };
  it("11시대 점심 전 · 17시대 저녁 전만", () => {
    expect(preSlotOf(11)).toBe("lunch");
    expect(preSlotOf(17)).toBe("dinner");
    expect(preSlotOf(12)).toBeNull();
  });
  it("캐릭터 이름으로 부르고, 남은 영양에 맞는 일반 메뉴 하나를 숫자와 함께", () => {
    const p = planPreMeal(base)!;
    expect(p.key).toBe(`pre:${T}:lunch`);
    expect(p.payload.title).toBe("까다로운 고구마 · 점심 시간이에요");
    expect(p.payload.body).toMatch(/^오늘 첫 끼예요\. 점심은 .+ 어때요\? 단백질 \d+g · 나트륨 [\d,]+mg · [\d,]+kcal$/);
    expect(p.payload.title).not.toContain("(광고)");
  });
  it("오늘 기록이 있으면 단백질 합계부터", () => {
    const p = planPreMeal({ ...base, slot: "dinner", rows: [...base.rows, { date: T, meal_type: "lunch", calories: 686, protein_g: 30, sodium_mg: 1820 }] })!;
    expect(p.payload.body.startsWith("오늘 단백질 30g 기록했어요.")).toBe(true);
  });
  it("그 끼니를 이미 기록했거나, 최근 기록이 없거나, 하루 3개를 채웠으면 보내지 않는다", () => {
    expect(planPreMeal({ ...base, rows: [{ date: T, meal_type: "lunch", calories: 500, protein_g: 20, sodium_mg: 700 }] })).toBeNull();
    expect(planPreMeal({ ...base, rows: [] })).toBeNull();
    expect(planPreMeal({ ...base, sentToday: 3 })).toBeNull();
  });
  it("매 끼니 추천(recs)이 없으면 메뉴 없이 부르기만", () => {
    expect(planPreMeal({ ...base, recs: false })!.payload.body).toBe("오늘 첫 끼예요. 점심 먹고 같이 적어요");
  });
  it("오늘 보낸 캐릭터·끼니 알림 세기 — 끼니는 오늘 날짜, 삐짐은 빠진 날 열쇠로", () => {
    const logged = new Set([`u1|meal|${T}:lunch`, `u1|meal|pre:${T}:lunch`, "u1|mascot|sulk:2026-11-14", "u1|meal|2026-11-14:dinner", "u2|meal|pre:2026-11-15:lunch", "u1|challenge|2026-11-15"]);
    expect(sentTodayCount(logged, "u1", T)).toBe(3);
  });
});

describe("메뉴 고르기 — 운영에서 찾은 것", () => {
  const withRice = [...FOODS, M("쌀밥", "한식", 310, 5, 5)];
  it("단백질이 거의 없는 곁들이는 메뉴(쌀밥)는 한 끼로 권하지 않는다", () => {
    for (let s = 0; s < 10; s++) expect(pickMenus(withRice, { ...budget, sodium: 33, protein: 31 }, 2, s).map((m) => m.name)).not.toContain("쌀밥");
  });
  it("나트륨 안에 드는 메뉴가 모자라면 나트륨이 적은 순으로 채운다", () => {
    const got = pickMenus(withRice, { ...budget, sodium: 33 }, 2, 0);
    expect(got).toHaveLength(2);
    const allNa = withRice.filter((f) => (f.protein_g ?? 0) >= 8 && ["한식", "양식", "일식", "분식", "편의점", "중식", "패스트푸드"].includes(f.category)).map((f) => f.sodium_mg ?? 0).sort((a, b) => a - b);
    for (const m of got) expect(m.sodium_mg ?? 0).toBeLessThanOrEqual(allNa[2]);
  });
});
