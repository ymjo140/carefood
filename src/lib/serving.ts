/**
 * 한 번 먹는 양(g) — 제품의 1회 제공량(serving_size_g)은 포장 전체 무게(1kg·3kg)가 들어간 것이 많다
 * (살 수 있는 한 끼 제품의 27%가 500g 넘음). 20~500g 밖이면 한 끼 300g · 그 밖 100g 으로 본다.
 * 식단 기록·추천 순위·검색 목록이 모두 이 함수를 쓴다.
 */
export function defaultServingG(p: { serving_size_g?: unknown; meal_role?: unknown }): number {
  const raw = Number(p.serving_size_g) || 0;
  if (raw >= 20 && raw <= 500) return raw;
  return p.meal_role === "meal" ? 300 : 100;
}

/** 100g(nutrient_base_g) 당 값 → grams 만큼 */
export function scaleNutrient(per: unknown, grams: number, baseG: unknown = 100): number | null {
  if (per === null || per === undefined || per === "") return null;
  const v = Number(per);
  if (!Number.isFinite(v)) return null;
  const base = Number(baseG) > 0 ? Number(baseG) : 100;
  return (v * grams) / base;
}
