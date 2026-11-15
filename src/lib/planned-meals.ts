import type { PlanFood } from "@/lib/weekly-plan";

/**
 * 날짜에 담아 둔 끼니 계획(예정) — 표 planned_meals, API /api/diary/planned.
 * 끼니 이름은 식단 기록과 같다(간식 = snack). 식단 리스트 칸(간식 = supplement)에서 옮길 때는 planMealKey 로 바꿔 읽는다.
 */
export const PLANNED_MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type PlannedMealKey = (typeof PLANNED_MEALS)[number];
export type PlannedMeal = { date: string; meal: PlannedMealKey; foods: PlanFood[]; plan_title: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : undefined;
};
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** 받은 음식 목록을 저장할 모양으로 — 이름이나 제품 번호가 있는 것만, 숫자는 상식적인 범위만, 12개까지 */
export function cleanPlanFoods(v: unknown): PlanFood[] {
  if (!Array.isArray(v)) return [];
  const out: PlanFood[] = [];
  for (const f of v.slice(0, 12)) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    const product_id = typeof o.product_id === "string" && UUID.test(o.product_id) ? o.product_id : undefined;
    const name = str(o.name, 80);
    if (!product_id && !name) continue;
    const food: PlanFood = {
      product_id, name,
      calories: num(o.calories, 5000), protein_g: num(o.protein_g, 500), carbs_g: num(o.carbs_g, 1000),
      fat_g: num(o.fat_g, 500), sodium_mg: num(o.sodium_mg, 20000), price: num(o.price, 10_000_000),
      platform: str(o.platform, 40), type: o.type === "eating_out" ? "eating_out" : o.type === "product" ? "product" : undefined,
    };
    // 비어 있는 칸은 저장하지 않는다
    out.push(Object.fromEntries(Object.entries(food).filter(([, x]) => x !== undefined)) as PlanFood);
  }
  return out;
}

/** 계획 끼니 합계 — 열량·단백질 */
export function planTotals(foods: PlanFood[]) {
  return foods.reduce((a, f) => ({ kcal: a.kcal + (Number(f.calories) || 0), protein: a.protein + (Number(f.protein_g) || 0) }), { kcal: 0, protein: 0 });
}
