/** 테스트 업체(is_demo) 제품은 검수를 통과해도 앱에서 보이거나 팔리지 않는다 */
import { describe, expect, it } from "vitest";
import { fakeSb, withRpc } from "./fake-sb";
import { approveItem, productValues } from "@/lib/partner/ingest";
import { partnerOffersFor } from "@/lib/partner/orders";
import type { PartnerItem } from "@/lib/partner/schema";

const item = {
  partner_sku: "DEMO-1", name: "닭가슴살 도시락", brand: "예시", category: "lunchbox", meal_role: "meal", weight_unit: "g",
  total_weight: 300, serving_size: 300, pack_count: 1, nutrition_basis: "per_100", nutrition_source: "lab",
  nutrition: {}, per100: { calories_kcal: 150, protein_g: 12, sodium_mg: 200, carbs_g: 15, fat_g: 4 },
  ingredients_raw: "닭가슴살, 현미", allergens: [], storage: "frozen", status: "on_sale",
  offers: [{ channel: "app", price: 6900, url: "" }], images: [],
} as unknown as PartnerItem;

describe("테스트 업체 제품 숨기기", () => {
  it("운영 업체 제품은 앱에 보이고 살 수 있다 · 테스트 업체 제품은 둘 다 아니다", () => {
    expect(productValues(item, true)).toMatchObject({ is_active: true, is_purchasable: true });
    expect(productValues(item, true, true)).toMatchObject({ is_active: false, is_purchasable: false });
  });
  it("검수를 통과시켜도 테스트 업체 제품은 숨긴 채로 들어가고 가격은 업체 화면용으로 붙는다", async () => {
    const pid = "22222222-2222-4222-8222-222222222222";
    const sb = withRpc(fakeSb({
      partners: [{ id: pid, status: "active", is_demo: true }],
      partner_items: [{ id: "item-1", partner_id: pid, data: item, product_id: null, partners: { status: "active", is_demo: true } }],
      products: [], partner_offers: [], partner_item_versions: [],
    }), { partner_refresh_availability: () => 0 });
    const productId = await approveItem(sb, "item-1", null);
    expect(sb.tables.products.find((p) => p.id === productId)).toMatchObject({ is_active: false, is_purchasable: false });
    expect(sb.tables.partner_offers).toHaveLength(1);
    await expect(approveItem(sb, "item-1", "33333333-3333-4333-8333-333333333333")).rejects.toThrow("붙이지 않아요");
  });
  it("앱 주문은 테스트 업체 가격을 고르지 않는다", async () => {
    const offer = (partner_id: string, is_demo: boolean, price: number) => ({
      product_id: "p1", price, partner_id, is_available: true,
      partners: { slug: partner_id, name: partner_id, status: "active", is_demo },
      partner_items: { partner_sku: "S", status: "approved", approved_data: {} },
    });
    const sb = fakeSb({ partner_offers: [offer("demo", true, 1000), offer("real", false, 5000)] });
    expect((await partnerOffersFor(sb, ["p1"])).get("p1")?.partner_id).toBe("real");
    const only = fakeSb({ partner_offers: [offer("demo", true, 1000)] });
    expect((await partnerOffersFor(only, ["p1"])).size).toBe(0);
  });
});
