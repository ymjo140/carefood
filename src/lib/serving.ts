/**
 * 한 번 먹는 양(g) — 제품의 1회 제공량(serving_size_g)은 포장 전체 무게(1kg·3kg)가 들어간 것이 많다
 * (살 수 있는 한 끼 제품의 27%가 500g 넘음). 20~500g 이면 그대로 쓰고, 밖이면 아래처럼 본다.
 *
 * - 한 끼 국물 요리는 300g 으로 두면 한 그릇이 안 된다 — 500g 국은 500g 인데 550g 곰탕은 300g 으로 뚝 떨어졌다
 *   (곰탕·갈비탕·육개장 포장은 가운데 값 500~550g, 100g 당 30~50kcal)
 *   · 삼계탕·백숙: 한 마리 한 봉(가운데 값 900g)이 1인분 → 1,200g 까지는 포장 그대로, 넘으면 900g
 *   · 곰탕·갈비탕·육개장·국밥·국: 한 그릇 600g 까지 (포장이 그보다 작으면 포장 그대로)
 *   · 찌개·전골·죽: 두세 번 나눠 먹는 포장이 많아 400g
 * - 그 밖의 한 끼 300g · 한 끼가 아니면 100g
 * 식단 기록·추천 순위·검색 목록·식단 리스트·제품 상세가 모두 이 함수를 쓴다.
 */
const WHOLE_CHICKEN = /삼계탕|백숙|반계탕/;
const SOUP_BOWL = /갈비탕|곰탕|설렁탕|우족탕|도가니탕|육개장|해장국|국밥|추어탕|감자탕|탕(?=[\s\d(]|$)|국(?=[\s\d(]|$)/;
const STEW = /찌개|전골|죽(?=[\s\d(]|$)/;

export function defaultServingG(p: { serving_size_g?: unknown; meal_role?: unknown; name?: unknown }): number {
  const raw = Number(p.serving_size_g) || 0;
  if (raw >= 20 && raw <= 500) return raw;
  if (p.meal_role !== "meal") return 100;
  const name = String(p.name || "");
  if (WHOLE_CHICKEN.test(name)) return raw > 500 && raw <= 1200 ? raw : 900;
  if (SOUP_BOWL.test(name)) return raw > 500 ? Math.min(raw, 600) : 600;
  if (STEW.test(name)) return 400;
  return 300;
}

/** 100g(nutrient_base_g) 당 값 → grams 만큼 */
export function scaleNutrient(per: unknown, grams: number, baseG: unknown = 100): number | null {
  if (per === null || per === undefined || per === "") return null;
  const v = Number(per);
  if (!Number.isFinite(v)) return null;
  const base = Number(baseG) > 0 ? Number(baseG) : 100;
  return (v * grams) / base;
}
