/** 입점 양식 — 상에서의 자리(dish_role)·먹는 때(meal_times) (lib/partner/schema) */
import { describe, expect, it } from "vitest";
import { dishRoleOf, legacyDishRole, parseRow, roleIssues } from "@/lib/partner/schema";
import { excelSamples } from "@/lib/partner/demo";

const row = (over: Record<string, string> = {}) => ({ ...excelSamples()[0], ...over });

describe("상에서의 자리", () => {
  it("필수 — 비우면 반려", () => {
    const r = parseRow(row({ dish_role: "" }), "brand");
    expect(r.item).toBeNull();
    expect(r.errors.map((e) => e.field)).toContain("dish_role");
  });
  it("코드나 이름 둘 다 받고, 먹는 역할은 자리에서 정한다", () => {
    expect(parseRow(row({ dish_role: "main" }), "brand").item?.meal_role).toBe("meal");
    const side = parseRow(row({ dish_role: "반찬", name: "메추리알 장조림", calories_kcal: "150", total_weight: "150", serving_size: "150" }), "brand").item;
    expect(side?.dish_role).toBe("side");
    expect(side?.meal_role).toBe("side");
  });
  it("음료는 dish_role 없이(null) 먹는 역할만 drink", () => {
    const it_ = parseRow(row({ dish_role: "drink", name: "단백질 쉐이크" }), "brand").item!;
    expect(it_.meal_role).toBe("drink");
    expect(dishRoleOf(it_)).toBeNull();
  });
  it("예전 제품(자리 없이 저장)은 카테고리·먹는 역할로", () => {
    expect(legacyDishRole("lunchbox", "meal")).toBe("main");
    expect(legacyDishRole("soup", "meal")).toBe("soup");
    expect(legacyDishRole("protein", "side")).toBe("side");
    expect(legacyDishRole("dairy")).toBe("snack");
    expect(dishRoleOf({ category: "drink", meal_role: "drink" })).toBeNull();
  });
});

describe("먹는 때", () => {
  it("이름·코드 목록을 받아 아침→간식 순으로 정리", () => {
    expect(parseRow(row({ meal_times: "저녁, lunch, 점심" }), "brand").item?.meal_times).toEqual(["lunch", "dinner"]);
  });
  it("비우면 없음(우리 규칙), 모르는 값은 반려", () => {
    expect(parseRow(row({ meal_times: "" }), "brand").item?.meal_times).toBeUndefined();
    expect(parseRow(row({ meal_times: "야식" }), "brand").errors[0]?.field).toBe("meal_times");
  });
});

describe("자리가 이름·열량과 어긋나면 검수로", () => {
  it("김밥을 반찬으로", () => {
    expect(roleIssues("곤약꼬마김밥 스팸계란", "side", 300).map((x) => x.code)).toContain("role_mismatch");
  });
  it("미역국을 반찬으로 · 탕수육은 국이 아니다", () => {
    expect(roleIssues("소고기 미역국", "side", 120)).toHaveLength(1);
    expect(roleIssues("찹쌀 탕수육", "side", 300)).toHaveLength(0);
  });
  it("반찬인데 1회 600kcal 넘음 · 한 끼인데 150kcal 미만", () => {
    expect(roleIssues("수제 돈까스", "side", 720)[0].message).toMatch(/720kcal/);
    expect(roleIssues("닭가슴살 볶음밥", "main", 120)[0].message).toMatch(/120kcal/);
  });
  it("맞게 고르면 없음", () => {
    expect(roleIssues("닭가슴살 현미 볶음밥 도시락", "main", 420)).toHaveLength(0);
    expect(roleIssues("메추리알 장조림", "side", 150)).toHaveLength(0);
  });
  it("parseRow 가 검수 사유로 올린다 (반려는 아니다)", () => {
    const r = parseRow(row({ dish_role: "side" }), "brand");
    expect(r.item).not.toBeNull();
    expect(r.review.map((x) => x.code)).toContain("role_mismatch");
  });
  it("1회 제공량이 포장 전체(500g 이상)와 같으면 검수", () => {
    const r = parseRow(row({ total_weight: "1000", serving_size: "1000", nutrition_basis: "100g", calories_kcal: "140" }), "brand");
    expect(r.review.map((x) => x.code)).toContain("serving_whole");
  });
});
