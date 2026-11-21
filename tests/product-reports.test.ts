/** 정보 오류 신고 (lib/product-reports) */
import { describe, expect, it } from "vitest";
import { cleanClaim, cleanFix, fixPlausible } from "@/lib/product-reports";

describe("cleanClaim — 사용자가 적은 맞는 값", () => {
  it("종류에 맞는 칸만 남긴다", () => {
    expect(cleanClaim("nutrition", { kcal: "114", protein_g: 23, serving_g: 100 })).toEqual({ kcal: 114, protein_g: 23 });
    expect(cleanClaim("serving", { serving_g: "85", kcal: 100 })).toEqual({ serving_g: 85 });
    expect(cleanClaim("wrong_page", { kcal: 100 })).toBeNull();
  });
  it("빈 칸·범위 밖·숫자 아님은 버린다", () => {
    expect(cleanClaim("nutrition", { kcal: "", protein_g: -1, sodium_mg: "많음" })).toBeNull();
    expect(cleanClaim("nutrition", { kcal: 99999 })).toBeNull();
  });
});

describe("cleanFix — 관리자 수정 값", () => {
  it("알려진 칸만, 범위 밖은 틀린 칸으로", () => {
    expect(cleanFix({ nutrient_base_g: "100", calories: 114, hacked: 1 })).toEqual({ fix: { nutrient_base_g: 100, calories: 114 }, bad: [] });
    expect(cleanFix({ calories: -5 }).bad).toEqual(["열량"]);
  });
});

describe("fixPlausible — 고친 값이 될 수 있는 값인지", () => {
  it("닭가슴살 30g 에 단백질 23g·탄 1·지 2 는 안 된다(26 < 30.6 이라 통과) — 30g 에 단백질 30g 은 안 된다", () => {
    expect(fixPlausible({ nutrient_base_g: 30, calories: 114, protein_g: 30, carbs_g: 1, fat_g: 2 })).not.toBeNull();
    expect(fixPlausible({ nutrient_base_g: 100, calories: 114, protein_g: 23, carbs_g: 1, fat_g: 2 })).toBeNull();
  });
  it("1g 에 9.2kcal 초과", () => {
    expect(fixPlausible({ nutrient_base_g: 20, calories: 243 })).toContain("열량");
  });
});
