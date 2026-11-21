/**
 * 음식 종류 — 홈 카테고리 · 제품 탐색 필터가 같은 이름과 같은 조건을 쓴다 (/products?type=main,side)
 * 역할(products.dish_role)이 정해진 제품은 역할로, 아직 비어 있는 제품은 끼니 구분(meal_role)으로 대신 본다.
 *   (2026-11-21 가격 있는 판매 제품 중 역할이 빈 것: 간식 13,630 · 반찬 3,156 · 끼니 3,048 — 분류가 끝나면 meal_role 대신은 줄어든다)
 * 재료·소스·양념(ingredient·condiment)은 음식 종류로 고르지 않는다.
 */
export type FoodType = "main" | "rice" | "soup" | "side" | "snack" | "drink" | "service";

export const FOOD_TYPES: { key: FoodType; label: string }[] = [
  { key: "main", label: "메인 요리" },
  { key: "rice", label: "밥" },
  { key: "soup", label: "국·찌개" },
  { key: "side", label: "반찬" },
  { key: "snack", label: "간식" },
  { key: "drink", label: "음료" },
  { key: "service", label: "식단 서비스" },
];

export const FOOD_TYPE_LABEL = Object.fromEntries(FOOD_TYPES.map((t) => [t.key, t.label])) as Record<FoodType, string>;

export function isFoodType(v: string): v is FoodType {
  return v in FOOD_TYPE_LABEL;
}

/** 주소 값 → 음식 종류 목록 (모르는 값은 버림) */
export function parseFoodTypes(v: string | null | undefined): FoodType[] {
  return [...new Set((v || "").split(",").map((s) => s.trim()).filter(isFoodType))];
}

/** 예전 주소(role · kind · cat)를 음식 종류로 — 북마크·공유 링크가 계속 맞게 */
export function legacyFoodTypes(sp: URLSearchParams): FoodType[] {
  const out = new Set<FoodType>(parseFoodTypes(sp.get("type")));
  for (const r of (sp.get("role") || "").split(",")) if (isFoodType(r)) out.add(r);
  if (sp.get("kind") === "meal_service") out.add("service");
  const cat = (sp.get("cat") || "").split(",");
  if (cat.some((c) => c === "snack" || c === "bread")) out.add("snack");
  if (cat.some((c) => c === "beverage")) out.add("drink");
  return [...out];
}

/** PostgREST or() 조건 — 고른 종류 가운데 하나라도 맞으면 (서버 /api/products) */
const CLAUSE: Record<FoodType, string> = {
  main: "dish_role.eq.main,and(dish_role.is.null,meal_role.eq.meal)",
  rice: "dish_role.eq.rice",
  soup: "dish_role.eq.soup",
  side: "dish_role.eq.side,and(dish_role.is.null,meal_role.eq.side)",
  snack: "dish_role.eq.snack,and(dish_role.is.null,meal_role.eq.snack)",
  drink: "and(dish_role.is.null,meal_role.eq.drink)",
  service: "category_large.eq.건강식단서비스",
};

export function foodTypeOr(types: FoodType[]): string | null {
  return types.length ? types.map((t) => CLAUSE[t]).join(",") : null;
}
