/**
 * 다음 끼니 일반 메뉴 고르기 — 대표 메뉴(common_foods, 먹는 단위)에서 오늘 남은 열량·단백질·나트륨에 맞는 것.
 * 다음 끼니 추천(/api/diary/next)과 먹기 전 알림(/api/push/run)이 같이 쓴다. DB 없이 계산만 (시험: tests/menu-pick.test.ts).
 * "성분 정보 + 통계적 매칭" — 효능을 말하지 않는다. 광고비로 순서를 바꾸지 않는다(일반 메뉴는 파는 물건이 아님).
 */
import type { CommonFoodRow } from "@/lib/dishes";
import { seedOf } from "@/lib/buddy";

export type Menu = Omit<CommonFoodRow, "source">;
export type MealKey = "breakfast" | "lunch" | "dinner" | "snack";
export type Budget = {
  meal: MealKey;
  /** 이번 끼니에 쓸 열량·단백질·나트륨 (남은 양을 남은 끼니로 나눈 값) */
  kcal: number; protein: number; sodium: number;
  /** 이름에 들어 있으면 뺀다 (알레르기) */
  avoid: string[];
};

const MEAL_CATS = new Set(["한식", "양식", "일식", "분식", "편의점", "중식", "패스트푸드"]);
const SNACK_CATS = new Set(["간식", "카페"]);

/** 이번 끼니 예산 — 남은 열량을 남은 끼니로 나누되, 한 끼는 하루 목표의 45%를 넘기지 않는다 (식단 기록 화면과 같은 계산) */
export function mealBudget(o: { meal: MealKey; mainLeft: number; goalKcal: number; remainKcal: number; remainProtein: number; remainSodium: number }) {
  const left = Math.max(1, o.mainLeft);
  return {
    kcal: Math.round(o.meal === "snack" ? Math.min(o.remainKcal, 300) : Math.min(o.remainKcal / left, o.goalKcal * 0.45)),
    protein: Math.round(Math.max(0, o.remainProtein) / left),
    sodium: Math.round(Math.max(0, o.remainSodium) / left),
  };
}

/** 남은 양에 맞는 메뉴 n개 — 같은 종류(한식·양식…)는 한 번씩, 날마다 조금씩 다르게(seed) */
export function pickMenus(foods: Menu[], b: Budget, n = 2, seed = 0): Menu[] {
  if (b.kcal < 120) return [];
  const cats = b.meal === "snack" ? SNACK_CATS : MEAL_CATS;
  const minKcal = b.meal === "snack" ? 60 : 200;
  const maxKcal = Math.max(minKcal + 50, b.kcal * 1.1);
  const ok = foods.filter((f) =>
    cats.has(f.category) &&
    (f.calories || 0) >= minKcal && (f.calories || 0) <= maxKcal &&
    !b.avoid.some((w) => w && f.name.includes(w)));
  // 나트륨이 남았으면 그 안에서만, 다 썼으면 가장 적은 쪽으로
  const pool = b.sodium > 0 ? ok.filter((f) => (f.sodium_mg || 0) <= b.sodium) : ok;
  const scored = (pool.length ? pool : ok).map((f) => {
    const kcal = f.calories || 1, p = f.protein_g || 0, na = f.sodium_mg || 0;
    const fill = b.protein > 0 ? Math.min(1, p / b.protein) : 0;
    return { f, score: fill * 2 + (p * 4) / kcal - (b.sodium > 0 ? 0 : na / 2000) };
  }).sort((a, z) => z.score - a.score || a.f.name.localeCompare(z.f.name));
  // 위쪽 6개 안에서 날마다 시작점을 돌린다 — 매일 같은 메뉴만 나오지 않게
  const top = scored.slice(0, 6);
  const start = top.length ? seedOf(seed) % top.length : 0;
  const ordered = [...top.slice(start), ...top.slice(0, start), ...scored.slice(6)];
  const out: Menu[] = [];
  const usedCats = new Set<string>();
  for (const { f } of ordered) {
    if (usedCats.has(f.category)) continue;
    usedCats.add(f.category);
    out.push(f);
    if (out.length >= n) break;
  }
  return out;
}

/** 메뉴 한 줄 숫자 — "단백질 21g · 나트륨 640mg · 520kcal" */
export function menuFacts(m: Pick<Menu, "calories" | "protein_g" | "sodium_mg">) {
  const f = (v: number | null) => Math.round(v || 0).toLocaleString("ko-KR");
  return `단백질 ${f(m.protein_g)}g · 나트륨 ${f(m.sodium_mg)}mg · ${f(m.calories)}kcal`;
}

/** 무엇을 기준으로 골랐는지 한 줄 — 단백질이 많이 남았으면 단백질, 나트륨이 빠듯하면 나트륨, 아니면 열량 */
export function budgetReason(b: Pick<Budget, "kcal" | "protein" | "sodium">) {
  const f = (v: number) => Math.round(v).toLocaleString("ko-KR");
  if (b.protein >= 15) return `이번 끼니에 단백질 ${f(b.protein)}g쯤 채울 수 있게 골랐어요`;
  if (b.sodium < 600) return `나트륨이 ${f(b.sodium)}mg 남아서 국물 적은 쪽으로 골랐어요`;
  return `${f(b.kcal)}kcal 안쪽으로 골랐어요`;
}
