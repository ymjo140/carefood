/** 음식 종류 (lib/food-types) — 홈 카테고리 · 제품 탐색 필터 */
import { describe, expect, it } from "vitest";
import { foodTypeOr, legacyFoodTypes, parseFoodTypes } from "@/lib/food-types";

describe("parseFoodTypes", () => {
  it("모르는 값과 겹친 값은 버린다", () => {
    expect(parseFoodTypes("main, side,zzz,main")).toEqual(["main", "side"]);
    expect(parseFoodTypes(null)).toEqual([]);
  });
});

describe("legacyFoodTypes — 예전 주소도 같은 종류로", () => {
  it("role · kind · cat 을 type 으로", () => {
    expect(legacyFoodTypes(new URLSearchParams("role=main"))).toEqual(["main"]);
    expect(legacyFoodTypes(new URLSearchParams("kind=meal_service"))).toEqual(["service"]);
    expect(legacyFoodTypes(new URLSearchParams("cat=snack,bread"))).toEqual(["snack"]);
    expect(legacyFoodTypes(new URLSearchParams("cat=beverage,dairy"))).toEqual(["drink"]);
    expect(legacyFoodTypes(new URLSearchParams("type=soup&role=soup"))).toEqual(["soup"]);
  });
});

describe("foodTypeOr — 고른 종류 중 하나라도", () => {
  it("역할이 있으면 역할, 비어 있으면 끼니 구분으로 대신", () => {
    expect(foodTypeOr(["main"])).toBe("dish_role.eq.main,and(dish_role.is.null,meal_role.eq.meal)");
    expect(foodTypeOr(["rice", "service"])).toBe("dish_role.eq.rice,category_large.eq.건강식단서비스");
    expect(foodTypeOr([])).toBeNull();
  });
});
