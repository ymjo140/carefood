/**
 * 다음 끼니 일반 메뉴 고르기 — 대표 메뉴(common_foods, 먹는 단위)에서 오늘 남은 열량·단백질·나트륨에 맞는 것.
 * 다음 끼니 추천(/api/diary/next)과 먹기 전 알림(/api/push/run)이 같이 쓴다. DB 없이 계산만 (시험: tests/menu-pick.test.ts).
 * "성분 정보 + 통계적 매칭" — 효능을 말하지 않는다. 광고비로 순서를 바꾸지 않는다(일반 메뉴는 파는 물건이 아님).
 */
import type { CommonFoodRow } from "@/lib/dishes";
import { seedOf } from "@/lib/buddy";
import { budgetFit, sodiumCap, sodiumTerm, underCap } from "@/lib/rec-fit";
import { fitsMeal, isMain, timeBonus, type MealClass } from "@/lib/meal-time";
import { signalTerm, type Signals } from "@/lib/rec-events";

/** 대표 메뉴 — 끼니 때·역할 칸(meal_times·breakfast_pref·dish_role)은 있으면 쓴다 (lib/meal-time) */
export type Menu = Omit<CommonFoodRow, "source"> & MealClass;
export type MealKey = "breakfast" | "lunch" | "dinner" | "snack";
export type Budget = {
  meal: MealKey;
  /** 이번 끼니에 쓸 열량·단백질·나트륨 (남은 양을 남은 끼니로 나눈 값) */
  kcal: number; protein: number; sodium: number;
  /** 이번 끼니 나트륨 상한 — 하루 기준(lib/rec-fit sodiumCap). 없으면 몫의 1.6배 */
  sodiumCap?: number;
  /** 이름에 들어 있으면 뺀다 (알레르기) */
  avoid: string[];
  /** 본인 반응(넘김·기록·찜) — lib/rec-events */
  signals?: Signals;
};

export const MEAL_CATS = new Set(["한식", "양식", "일식", "분식", "편의점", "중식", "패스트푸드"]);
export const SNACK_CATS = new Set(["간식", "카페"]);

/** 이번 끼니 예산 — 남은 열량을 남은 끼니로 나누되, 한 끼는 하루 목표의 45%를 넘기지 않는다 (식단 기록 화면과 같은 계산) */
export function mealBudget(o: { meal: MealKey; mainLeft: number; goalKcal: number; remainKcal: number; remainProtein: number; remainSodium: number }) {
  const left = Math.max(1, o.mainLeft);
  const kcal = Math.round(o.meal === "snack" ? Math.min(o.remainKcal, 300) : Math.min(o.remainKcal / left, o.goalKcal * 0.45));
  // 간식의 단백질·나트륨 몫은 열량 비율만큼 (남은 양 × 간식 kcal ÷ 남은 kcal) — 끼니 몫(20g)을 그대로 쓰면 단백질 많은 것(계란)만 올라왔다
  const part = o.meal === "snack" ? Math.min(1 / left, Math.max(0, kcal) / Math.max(1, o.remainKcal)) : 1 / left;
  return {
    kcal,
    protein: Math.round(Math.max(0, o.remainProtein) * part),
    sodium: Math.round(Math.max(0, o.remainSodium) * part),
    sodiumCap: sodiumCap({ meal: o.meal, remainSodium: o.remainSodium, share: Math.round(Math.max(0, o.remainSodium) * part), mainLeft: o.mainLeft }),
  };
}

/** 대표 메뉴 한 개의 점수 — 몫 맞춤×3 + 단백질 채움×2 + kcal 당 단백질(최대 1.5) + 나트륨(하루 기준) + 끼니 때 + 본인 반응.
 *  다음 끼니 제품(lib/next-picks pickScore)과 같은 식이라 메뉴·제품을 한 줄로 견줄 수 있다 */
export function menuScore(f: Menu, b: Budget) {
  const kcal = f.calories || 1, p = f.protein_g || 0;
  const fill = b.protein > 0 ? Math.min(1, p / b.protein) : 0;
  return budgetFit(kcal, b.kcal) * 3 + fill * 2 + Math.min(1.5, (p * 4) / kcal) + sodiumTerm(f.sodium_mg, b.sodium, b.sodiumCap)
    + timeBonus(f, b.meal) + signalTerm(b.signals, `menu:${f.name}`);
}

/** 남은 양에 맞는 메뉴 n개 — 같은 종류(한식·양식…)는 한 번씩, 날마다 조금씩 다르게(seed) */
export function pickMenus(foods: Menu[], b: Budget, n = 2, seed = 0): Menu[] {
  if (b.kcal < 120) return [];
  const cats = b.meal === "snack" ? SNACK_CATS : MEAL_CATS;
  const minKcal = b.meal === "snack" ? 60 : 200;
  const maxKcal = Math.max(minKcal + 50, b.kcal * 1.1);
  // 한 끼로 권하려면 단백질 8g 이상 — 밥 한 공기 같은 곁들이는 메뉴는 빼고(없으면 그대로)
  const fits = foods.filter((f) =>
    cats.has(f.category) &&
    (f.calories || 0) >= minKcal && (f.calories || 0) <= maxKcal &&
    !b.avoid.some((w) => w && f.name.includes(w)) &&
    fitsMeal(f, b.meal) && (b.meal === "snack" || isMain(f)));
  const meaty = b.meal === "snack" ? fits : fits.filter((f) => (f.protein_g || 0) >= 8);
  const ok = meaty.length ? meaty : fits;
  const score = (f: Menu) => menuScore(f, b);
  const byScore = (a: Menu, z: Menu) => score(z) - score(a) || a.name.localeCompare(z.name);
  // 하루 기준 나트륨 상한 안에 드는 것 먼저(점수순 — 몫을 넘은 만큼은 점수에서 깎인다), 모자라면 나트륨이 적은 순으로 채운다
  const under = ok.filter((f) => underCap(f.sodium_mg, b.sodium, b.sodiumCap)).sort(byScore);
  const over = ok.filter((f) => !underCap(f.sodium_mg, b.sodium, b.sodiumCap)).sort((a, z) => (a.sodium_mg || 0) - (z.sodium_mg || 0) || byScore(a, z));
  const scored = [...under, ...over].map((f) => ({ f }));
  // 위쪽(최고 점수와 1점 안쪽, 6개까지)에서 날마다 시작점을 돌린다 — 매일 같은 메뉴만 나오지 않게.
  //   1점 밖은 돌리지 않는다: 몫에 한참 못 미치는 것이 날짜 때문에 맨 앞에 오지 않게
  // 나트륨 안에 드는 것이 n개 이상이면 그 안에서만 돌린다 (넘는 것이 위로 올라오지 않게)
  const best = under.length ? score(under[0]) : 0;
  const near = under.slice(0, 6).filter((f) => score(f) >= best - 1).length;
  const top = scored.slice(0, Math.max(n, near));
  const start = top.length ? seedOf(seed) % top.length : 0;
  const ordered = [...top.slice(start), ...top.slice(0, start), ...scored.slice(top.length)];
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
  // 나트륨을 모르면 0mg 이라고 쓰지 않고 뺀다
  const na = m.sodium_mg == null ? "" : ` · 나트륨 ${f(m.sodium_mg)}mg`;
  return `단백질 ${f(m.protein_g)}g${na} · ${f(m.calories)}kcal`;
}

/** 무엇을 기준으로 골랐는지 한 줄 — 단백질이 많이 남았으면 단백질, 나트륨이 빠듯하면 나트륨, 아니면 열량 */
export function budgetReason(b: Pick<Budget, "kcal" | "protein" | "sodium">) {
  const f = (v: number) => Math.round(v).toLocaleString("ko-KR");
  if (b.protein >= 15) return `이번 끼니에 단백질 ${f(b.protein)}g쯤 채울 수 있게 골랐어요`;
  if (b.sodium < 600) return `나트륨이 ${f(b.sodium)}mg 남아서 국물 적은 쪽으로 골랐어요`;
  return `${f(b.kcal)}kcal 안쪽으로 골랐어요`;
}
