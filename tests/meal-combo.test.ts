/** 한 상 (lib/next-picks bestCombos) · AI 추천에서 한 상 고르기 (lib/ai-fill pickOne) */
import { describe, expect, it } from "vitest";
import { bestCombos, type PickItem } from "@/lib/next-picks";
import { pickOne, skipKey } from "@/lib/ai-fill";

const it_ = (id: string, name: string, calories: number, protein_g: number, sodium_mg: number | null, role: PickItem["role"]): PickItem =>
  ({ id, name, manufacturer: null, image_url: null, calories, protein_g, sodium_mg, serving_size_g: 200, nutrient_base_g: 100, role });
const rice = [it_("r1", "잡곡밥", 300, 6, 5, "rice")];
const soup = [it_("s1", "소고기미역국", 150, 12, 900, "soup"), it_("s2", "사골곰탕", 180, 20, 700, "soup"), it_("s3", "육개장", 200, 18, 1500, "soup")];
const side = [it_("d1", "메추리알 장조림", 120, 10, 350, "side"), it_("d2", "깍두기", 20, 1, 400, "side")];
const b = { meal: "lunch" as const, kcal: 667, protein: 27, sodium: 667, sodiumCap: 1200 };

describe("한 상 고르기", () => {
  it("밥 + 국 + 반찬을 합친 영양으로 몫에 맞추고, 국마다 가장 좋은 한 상 하나", () => {
    const got = bestCombos({ rice, soup, side }, b);
    expect(got.length).toBe(2); // 육개장은 밥과 합치면 하루 상한(1,200mg)을 넘는다
    expect(new Set(got.map((c) => c.foods[1].id)).size).toBe(got.length);
    expect(got[0].foods.map((f) => f.id)).toEqual(["r1", "s2", "d1"]); // 300+180+120 = 600kcal, 단백질 36g
  });
  it("국만 다르고 반찬이 같은 한 상은 뒤로 — 반찬이 겹치지 않는 것을 먼저 고른다", () => {
    const soups = [it_("s1", "사골 순대국", 140, 12, 200, "soup"), it_("s2", "얼큰 순대국", 140, 12, 200, "soup"), it_("s3", "북엇국", 130, 11, 250, "soup")];
    const sides = [it_("d1", "두부", 160, 14, 10, "side"), it_("d2", "구운계란", 140, 12, 300, "side")];
    const got = bestCombos({ rice, soup: soups, side: sides }, b);
    expect(got.length).toBe(3);
    expect(new Set(got.map((c) => c.foods[2]?.id)).size).toBe(2); // 예전에는 셋 다 두부
  });
  it("나트륨을 모르는 것이 하나라도 있으면 합도 모름 — 상한으로 빼지 않는다", () => {
    const got = bestCombos({ rice, soup: [it_("s9", "북엇국", 120, 15, null, "soup")], side: [] }, b);
    expect(got.length).toBe(1);
  });
});

describe("AI 추천에서 한 상", () => {
  it("한 상 점수가 높으면 밥·국·반찬을 같이 담고, 다른 추천은 국으로 가린다", () => {
    const combos = bestCombos({ rice, soup, side }, b);
    const p = pickOne([], [{ ...it_("m1", "닭가슴살 도시락", 400, 30, 600, undefined), score: 1 }], [], () => 0, 0, combos)!;
    expect(p.foods.map((f) => f.name)).toEqual(["잡곡밥", "사골곰탕", "메추리알 장조림"]);
    expect(p.facts).toMatch(/^밥·국·반찬 3가지 · 600kcal · 단백질 36g$/);
    const again = pickOne([], [], p.foods.map(skipKey), () => 0, 0, combos)!;
    expect(again.foods.some((f) => f.name === "사골곰탕")).toBe(false);
  });
});
