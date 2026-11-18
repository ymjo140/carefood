import { defaultServingG, scaleNutrient } from "@/lib/serving";

/**
 * 식단 기록 한 줄의 영양값 — 서버 전용. /api/diary(내 기록)와 가족 대신 기록(/api/family/links/[id]/proxy)이 같은 계산을 쓴다.
 * 제품(product_id)이면 영양값은 늘 서버가 제품 DB 값 × 그램으로 계산한다 (보낸 값은 쓰지 않는다).
 * 일반 음식·직접 입력이면 보낸 값을 쓰되 범위를 확인한다 (음수·터무니없는 값은 비운다). 배수는 마지막에 한 번만 곱한다.
 */
export const DIARY_MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export const MULTS = [0.5, 1, 1.5, 2];
export const NUTRIENTS = ["calories", "protein_g", "fat_g", "carbs_g", "sugar_g", "sodium_mg", "fiber_g"] as const;
export type Nutrients = Record<(typeof NUTRIENTS)[number], number | null>;
/** 한 번 기록에 들어갈 수 있는 최대값 — 넘으면 잘못 들어온 값으로 보고 비운다 */
export const MAX: Record<(typeof NUTRIENTS)[number], number> = { calories: 5000, protein_g: 400, fat_g: 400, carbs_g: 800, sugar_g: 500, sodium_mg: 20000, fiber_g: 200 };

export function clean(v: unknown, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
export function round(k: (typeof NUTRIENTS)[number], v: number | null): number | null {
  if (v === null) return null;
  return k === "calories" || k === "sodium_mg" ? Math.round(v) : Math.round(v * 10) / 10;
}
export const gramsOf = (v: unknown) => { const g = Number(v); return Number.isFinite(g) && g >= 1 && g <= 3000 ? Math.round(g) : null; };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function productNutrients(sb: any, productId: string, wantG: number | null, mult: number): Promise<{ n: Nutrients; grams: number } | null> {
  const { data: p, error } = await sb.from("products")
    .select("name, calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g, serving_size_g, nutrient_base_g, meal_role")
    .eq("id", productId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return null;
  // 예전 기록(다시 먹기)이 포장 전체 무게를 그대로 들고 오면 기본값으로
  const pkg = wantG !== null && Number(p.serving_size_g) === wantG && defaultServingG(p) !== wantG;
  const grams = wantG !== null && !pkg ? wantG : defaultServingG(p);
  const n = {} as Nutrients;
  for (const k of NUTRIENTS) {
    const v = scaleNutrient(p[k], grams, p.nutrient_base_g);
    n[k] = round(k, v === null ? null : v * mult);
  }
  return { n, grams };
}

export function givenNutrients(body: Record<string, unknown>, mult: number): Nutrients {
  const n = {} as Nutrients;
  for (const k of NUTRIENTS) {
    const v = clean(body[k], MAX[k]);
    n[k] = round(k, v === null ? null : v * mult);
  }
  return n;
}

