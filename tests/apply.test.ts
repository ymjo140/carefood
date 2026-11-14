/** 입점 신청 값 읽기 (lib/partner/apply.ts) — 신청 화면과 신청 API 가 같은 규칙을 쓴다 */
import { describe, expect, it } from "vitest";
import { NEXT_STATUS, parseApplication, slugHint } from "@/lib/partner/apply";
import { PAY_DAY } from "@/lib/partner/payout";
import { PAY_DAY_OF_MONTH, STANDARD_RATES } from "@/lib/partner/rates";

const ok = { company_name: "핏밀", representative: "홍길동", email: "Ops@FitMeal.kr", business_type: "meal_service" };

describe("입점 신청", () => {
  it("필수 칸·업종을 보고, 값을 다듬는다", () => {
    expect(parseApplication({ ...ok, company_name: " " })).toMatchObject({ ok: false, field: "company_name" });
    expect(parseApplication({ ...ok, email: "ops@" })).toMatchObject({ ok: false, field: "email" });
    expect(parseApplication({ ...ok, business_type: "supplement" })).toMatchObject({ ok: false, field: "business_type" });
    expect(parseApplication({ ...ok, website: "fitmeal.kr" })).toMatchObject({ ok: false, field: "website" });
    expect(parseApplication({ ...ok, business_number: "123-45-678" })).toMatchObject({ ok: false, field: "business_number" });
    expect(parseApplication({ ...ok, product_count: "0" })).toMatchObject({ ok: false, field: "product_count" });
    const r = parseApplication({ ...ok, business_number: "1234567890", product_count: "50", phone: "", message: "  안녕하세요  " });
    expect(r).toMatchObject({ ok: true, value: { email: "ops@fitmeal.kr", business_number: "123-45-67890", product_count: 50, phone: null, message: "안녕하세요" } });
  });
  it("끝난 신청은 다시 열지 않는다", () => {
    expect(NEXT_STATUS.approved).toEqual([]);
    expect(NEXT_STATUS.rejected).toEqual([]);
    expect(NEXT_STATUS.pending).toContain("approved");
  });
  it("웹사이트에서 영문 이름 후보", () => {
    expect(slugHint("https://www.fitmeal.kr/shop")).toBe("fitmeal");
    expect(slugHint("https://한글.kr")).toBe("");
    expect(slugHint(null)).toBe("");
  });
  it("신청 화면의 조건은 정산 계산과 같은 값", () => {
    expect(PAY_DAY).toBe(PAY_DAY_OF_MONTH);
    expect(STANDARD_RATES).toEqual({ order: 5, link: 2 });
  });
});
