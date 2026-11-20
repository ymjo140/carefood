/**
 * 홈 '오늘 ○○ 추천' — 계산만 (시험: tests/home-meal.test.ts). 서버는 /api/home/meal-recs, 화면은 components/HomeMealRecs.
 *  - 처음 열리는 끼니는 지금 시각(한국 시간)으로: ~10시 아침 · ~15시 점심 · ~17시 간식 · ~21시 저녁 · 그 뒤 간식
 *  - 점심과 저녁은 아무것도 기록하지 않았으면 몫이 같아 같은 것이 나온다 — 저녁은 점심 추천(비어 있을 때)을 빼고 고른다.
 * 역할 이름은 products.dish_role (lib/meal-time).
 */
import type { MealKey } from "@/lib/menu-pick";

export const HOME_MEALS: MealKey[] = ["breakfast", "lunch", "dinner", "snack"];
export const HOME_MEAL_LABEL: Record<MealKey, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" };

/** 처음 보여 줄 끼니 — 한국 시각(0~23시) */
export function defaultMeal(hourKst: number): MealKey {
  if (hourKst < 10) return "breakfast";
  if (hourKst < 15) return "lunch";
  if (hourKst < 17) return "snack";
  if (hourKst < 21) return "dinner";
  return "snack";
}

/** 지금 한국 시각(시) */
export function hourKst(now = new Date()) {
  return (now.getUTCHours() + 9) % 24;
}

/** 이 끼니를 고를 때 먼저 빼 둘 끼니 — 저녁은 점심이 비어 있으면 점심 추천을 뺀다 (몫이 같아 같은 것이 나오지 않게) */
export function mealsToAvoid(meal: MealKey, taken: Set<string>): MealKey[] {
  return meal === "dinner" && !taken.has("lunch") ? ["lunch"] : [];
}

/** 몫에 대한 비율 (반올림 %) — 몫이 없으면 null */
export function shareOf(kcal: number, budget: number) {
  return budget > 0 ? Math.round((kcal / budget) * 100) : null;
}

/** 역할 이름 — products.dish_role */
export const DISH_ROLE_LABEL: Record<string, string> = { main: "메인 요리", rice: "밥", soup: "국·찌개", side: "반찬", snack: "간식" };
export const DISH_ROLES = Object.keys(DISH_ROLE_LABEL);
