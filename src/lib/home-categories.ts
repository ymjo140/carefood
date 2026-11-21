import type { IconName } from "@/components/ui";

/**
 * 홈 카테고리 칸 — 누르면 /products?type=… 로 가서 그 음식 종류로 거른다 (이름·조건은 lib/food-types, 제품 탐색 필터와 같다).
 * ProductExplorer 가 주소의 type 을 읽는다 (예전 role · kind · cat 주소도 읽어서 type 으로 바꾼다).
 */
export const HOME_CATEGORIES: { key: string; label: string; icon: IconName; query: Record<string, string> }[] = [
  { key: "main", label: "메인 요리", icon: "plate", query: { type: "main" } },
  { key: "rice", label: "밥", icon: "rice", query: { type: "rice" } },
  { key: "soup", label: "국·찌개", icon: "bowl", query: { type: "soup" } },
  { key: "side", label: "반찬", icon: "side", query: { type: "side" } },
  { key: "snack", label: "간식", icon: "cookie", query: { type: "snack" } },
  { key: "drink", label: "음료", icon: "cup", query: { type: "drink" } },
  { key: "meal", label: "식단 서비스", icon: "calendar", query: { type: "service" } },
  { key: "all", label: "전체", icon: "grid", query: {} },
];

export function categoryHref(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  return qs ? `/products?${qs}` : "/products";
}
