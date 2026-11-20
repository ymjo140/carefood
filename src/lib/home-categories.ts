import type { IconName } from "@/components/ui";

/**
 * 홈 카테고리 칸 — 누르면 /products 로 가서 이 조건으로 거른다.
 * query 는 /products 주소에 그대로 붙는다 (ProductExplorer 가 주소에서 읽음).
 *   cat         음식 종류(dish_category, 쉼표로 여러 개)
 *   protein_min 1회 제공량 단백질 하한(g)
 *   kind        meal_service = 건강식단 서비스만
 *   role        한 끼에서 맡는 몫(products.dish_role, lib/meal-time) — main 메인 요리 · rice 밥 · soup 국·찌개 · side 반찬
 * 도시락·샐러드·고단백은 '메인 요리' 안에서 음식 종류·영양 조건으로 고른다 (2026-11-20 역할 칸으로 바꿈)
 */
export const HOME_CATEGORIES: { key: string; label: string; icon: IconName; query: Record<string, string> }[] = [
  { key: "main", label: "메인 요리", icon: "plate", query: { role: "main" } },
  { key: "rice", label: "밥", icon: "rice", query: { role: "rice" } },
  { key: "soup", label: "국·찌개", icon: "bowl", query: { role: "soup" } },
  { key: "side", label: "반찬", icon: "side", query: { role: "side" } },
  { key: "snack", label: "간식", icon: "cookie", query: { cat: "snack,bread" } },
  { key: "drink", label: "음료", icon: "cup", query: { cat: "beverage,dairy" } },
  { key: "meal", label: "식단 서비스", icon: "calendar", query: { kind: "meal_service" } },
  { key: "all", label: "전체", icon: "grid", query: {} },
];

export function categoryHref(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  return qs ? `/products?${qs}` : "/products";
}
