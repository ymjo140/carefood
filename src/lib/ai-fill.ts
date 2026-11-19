/**
 * 식단 탭 빈 끼니의 'AI 추천' — 계산만 (DB 없이, 시험: tests/ai-fill.test.ts). 서버는 /api/diary/ai-fill.
 *  - 그날 목표에서 이미 기록한 것 + 다른 끼니에 담아 둔 예정을 빼고, 아직 비어 있는 끼니(이 끼니 포함)로 나눠 이 끼니 몫을 정한다.
 *  - 후보는 '다음 끼니'와 같은 규칙(lib/next-picks: 대표 메뉴 + 살 수 있는 제품)에서 하나 — 메뉴와 제품을 번갈아 보고, 이미 권했던 것(skip)은 건너뛴다.
 *  - 채운 것은 그날 그 끼니의 예정(planned_meals, plan_title "AI 추천")으로 담는다 — 먹었다는 기록이 아니다. 먹은 뒤 '계획대로 기록하기'.
 *  순서는 영양 기준뿐 — 광고비로 바꾸지 않는다. "성분 정보 + 통계적 매칭" — 처방이 아니다.
 */
import { mealBudget, type MealKey, type Menu } from "@/lib/menu-pick";
import type { PickItem } from "@/lib/next-picks";
import type { PlanFood } from "@/lib/weekly-plan";

export const AI_PLAN_TITLE = "AI 추천";
export const FILL_MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
const MAIN = ["breakfast", "lunch", "dinner"] as const;

type Nut = { calories?: number | null; protein_g?: number | null; sodium_mg?: number | null };
export type DayRow = Nut & { meal_type: string | null };
export type DayPlan = { meal: string; foods: Nut[] };
export type Goals = { kcal: number; protein: number; sodium: number };

const sum = (xs: Nut[], k: keyof Nut) => xs.reduce((a, x) => a + (Number(x[k]) || 0), 0);

/** 이 끼니 몫 — 오늘 많이 먹었어도 한 끼 후보는 보여 준다(한 끼 하루 목표의 30%, 간식 200kcal) */
export function fillBudget(meal: MealKey, goals: Goals, rows: DayRow[], plans: DayPlan[]) {
  const other = plans.filter((p) => p.meal !== meal);
  const planned = other.flatMap((p) => p.foods);
  const taken = new Set([...rows.map((r) => r.meal_type || ""), ...other.filter((p) => p.foods.length > 0).map((p) => p.meal)]);
  const mainLeft = MAIN.filter((m) => m === meal || !taken.has(m)).length;
  const eaten = [...rows, ...planned];
  const b = mealBudget({
    meal, mainLeft, goalKcal: goals.kcal,
    remainKcal: goals.kcal - sum(eaten, "calories"),
    remainProtein: goals.protein - sum(eaten, "protein_g"),
    remainSodium: goals.sodium - sum(eaten, "sodium_mg"),
  });
  const floor = meal === "snack" ? 200 : Math.round(goals.kcal * 0.3);
  return b.kcal >= 120 ? b : { ...b, kcal: floor };
}

export type FillPick = { food: PlanFood; facts: string };
const r1 = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? undefined : Math.round(Number(v) * 10) / 10);

/** 하나 고르기 — 메뉴·제품을 번갈아(메뉴 먼저) 보고 skip 에 든 것은 건너뛴다. 다 건너뛰면 처음 것으로 돌아간다 */
export function pickOne(menus: Menu[], items: PickItem[], skip: string[] = []): FillPick | null {
  const order: ({ kind: "menu"; m: Menu } | { kind: "product"; p: PickItem })[] = [];
  for (let i = 0; i < Math.max(menus.length, items.length); i++) {
    if (menus[i]) order.push({ kind: "menu", m: menus[i] });
    if (items[i]) order.push({ kind: "product", p: items[i] });
  }
  if (!order.length) return null;
  const seen = new Set(skip);
  const idOf = (x: (typeof order)[number]) => (x.kind === "menu" ? `menu:${x.m.name}` : x.p.id);
  const hit = order.find((x) => !seen.has(idOf(x))) ?? order[0];
  if (hit.kind === "product") {
    const p = hit.p;
    return {
      food: { product_id: p.id, name: p.name, calories: r1(p.calories), protein_g: r1(p.protein_g), sodium_mg: r1(p.sodium_mg), type: "product" },
      facts: factLine(p.calories, p.protein_g),
    };
  }
  const m = hit.m;
  return {
    // 대표 메뉴는 제품 DB 에 없다 — 이름과 대표 1인분 값을 담아 둔다 (기록할 때 이 값으로)
    food: { name: m.name, calories: r1(m.calories), protein_g: r1(m.protein_g), carbs_g: r1(m.carbs_g), fat_g: r1(m.fat_g), sodium_mg: r1(m.sodium_mg) },
    facts: factLine(m.calories, m.protein_g),
  };
}

/** 다시 고를 때 넘길 값 — 제품은 번호, 대표 메뉴는 'menu:이름' (담아 둔 음식만 보고도 만들 수 있게) */
export function skipKey(f: PlanFood) {
  return f.product_id ? f.product_id : `menu:${f.name ?? ""}`;
}

function factLine(kcal: number | null | undefined, protein: number | null | undefined) {
  const parts = [kcal != null ? `${Math.round(Number(kcal)).toLocaleString("ko-KR")}kcal` : null, protein != null ? `단백질 ${Math.round(Number(protein))}g` : null];
  return parts.filter(Boolean).join(" · ");
}
