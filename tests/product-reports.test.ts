/** 정보 오류 신고 (lib/product-reports) */
import { describe, expect, it } from "vitest";
import { buildDbTrace, cleanClaim, cleanFix, fixPlausible } from "@/lib/product-reports";

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

describe("buildDbTrace — 신고 받은 제품이 DB 어디에 있는지", () => {
  const p = { id: "00000000-0000-0000-0000-000000000001", data_source: "mfds_api", food_code: "P120-302060000-0017", report_no: null, barcode: null,
    nutrient_base_g: 80, serving_size_g: 100, total_weight_g: null, calories: 155, protein_g: 18, carbs_g: 8, sugar_g: 0, fat_g: 6, sodium_mg: 0,
    created_at: "2026-10-14T00:00:00Z", updated_at: "2026-11-20T00:00:00Z" };
  it("저장값은 기준량당 그대로, 1회분·100g당은 계산, 신고 종류와 관련된 칸 표시", () => {
    const t = buildDbTrace(p, "nutrition", { servingG: 100 });
    const kcal = t.rows.find((r) => r.col === "calories")!;
    expect(kcal).toMatchObject({ stored: 155, serving: 193.8, per100: 193.8, flagged: true });
    expect(t.rows.find((r) => r.col === "serving_size_g")!.flagged).toBe(false);
    expect(t.source).toBe("식약처 품목제조보고 영양성분 API");
    expect(t.sql).toContain("where id = '00000000-0000-0000-0000-000000000001'");
    expect(t.sql).toContain("P120-302060000-0017");
  });
  it("고친 이력과 기준량 일괄 수정을 최근 순으로", () => {
    const t = buildDbTrace(p, "serving", {
      servingG: 100,
      fixes: [{ field: "sodium_mg", old_value: "0", new_value: "320", fixed_by: "admin@x", fixed_at: "2026-11-22T00:00:00Z" }],
      baseFixes: [{ old_base: 1, fixed_at: "2026-11-28T00:00:00Z", reason: "1g 기준 오류" }],
    });
    expect(t.history.map((h) => h.what)).toEqual(["영양 기준량 일괄 수정 1g → 80g (1g 기준 오류)", "나트륨 0 → 320"]);
    expect(t.rows.find((r) => r.col === "serving_size_g")!.flagged).toBe(true);
  });
  it("업체 제품은 업체 이름·제품 코드, 다시 올리면 덮인다고 알린다", () => {
    const t = buildDbTrace({ ...p, data_source: "partner", food_code: null }, "nutrition", { servingG: 100, partner: { name: "예시", sku: "EX-001", status: "approved" } });
    expect(t.partner?.sku).toBe("EX-001");
    expect(t.overwrite).toMatch(/업체가 같은 제품 코드로/);
  });
});
