import type { IconName } from "@/components/ui";

/**
 * 홈 카테고리 칸 — 누르면 /products 로 가서 이 조건으로 거른다.
 * query 는 /products 주소에 그대로 붙는다 (ProductExplorer 가 주소에서 읽음).
 *   cat         음식 종류(dish_category, 쉼표로 여러 개)
 *   protein_min 1회 제공량 단백질 하한(g)
 *   kind        meal_service = 건강식단 서비스만
 */
export const HOME_CATEGORIES: { key: string; label: string; icon: IconName; query: Record<string, string> }[] = [
  { key: "set", label: "도시락", icon: "lunchbox", query: { cat: "set" } },
  { key: "salad", label: "샐러드", icon: "leaf", query: { cat: "salad" } },
  { key: "protein", label: "고단백", icon: "egg", query: { protein_min: "20" } },
  { key: "rice", label: "밥·면", icon: "bowl", query: { cat: "rice,noodle" } },
  { key: "snack", label: "간식", icon: "cookie", query: { cat: "snack,bread" } },
  { key: "drink", label: "음료", icon: "cup", query: { cat: "beverage,dairy" } },
  { key: "meal", label: "식단 서비스", icon: "calendar", query: { kind: "meal_service" } },
  { key: "all", label: "전체", icon: "grid", query: {} },
];

export function categoryHref(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  return qs ? `/products?${qs}` : "/products";
}
