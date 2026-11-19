/**
 * 캐릭터 이야기의 '오늘 하루' · '일주일' 추천 (화면·서버 공용 규칙)
 *  - 오늘 하루: 아직 기록하지 않은 끼니마다 두 개씩 (lib/chat-recs rankRecs, 끼니끼리 겹치지 않게)
 *  - 일주일: 식단 탭 '일주일'의 추천으로 채우기와 같은 7일 짜기(lib/weekly-box-server) → 카드 → '일주일 식단에 담기'
 * 고르는 기준은 영양·입맛뿐 — 광고비로 바꾸지 않는다. AI 는 고른 것을 말로 옮기기만 한다.
 */
import type { MealKey } from "@/lib/menu-pick";
import type { Pick } from "@/lib/chat-recs";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export const DAY_LABEL: Record<DayKey, string> = { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" };
export const MEAL_LABEL: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식", supplement: "보충" };

/** 식단에 담을 때 쓰는 칸 값 — 식단 리스트(saved_meal_plans.grid) 한 칸과 같은 모양 */
export type PlanCell = {
  product_id: string | null; name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; sodium_mg?: number;
  price?: number; platform?: string | null; url?: string | null; type: "product";
};
/** 하루·일주일 추천 카드의 한 줄 — Pick 에 어느 날·끼니인지와 담을 칸 값을 붙인다 */
export type PlanPick = Pick & { slot?: { day: DayKey | null; meal: string }; cell?: PlanCell };

const WEEK = /일주일|이번\s*주|다음\s*주|한\s*주|7\s*일|칠\s*일|주간|요일별/;
const PLAN = /식단|추천|짜\s*(줘|주|볼)|짜줘|메뉴|뭐\s*먹|뭘\s*먹|채워|계획|골라/;

/** 일주일 식단을 물었는지 */
export function isWeekAsk(text: string) {
  return WEEK.test(text) && PLAN.test(text);
}

/** 오늘 하루 전체를 물었는지 — 끼니를 하나 짚지 않은 추천이면 하루로 본다 */
export function isDayAsk(text: string, mealNamed: boolean) {
  if (/오늘\s*(하루|전체|식단|세\s*끼|삼시)|하루\s*(식단|전체|치)|세\s*끼|삼시\s*세\s*끼|오늘\s*뭐\s*먹/.test(text)) return true;
  return !mealNamed;
}

/** 하루 추천에 넣을 끼니 — 아침·점심·저녁 중 아직 기록하지 않은 것 모두(지난 끼니도). 세 끼를 다 기록했으면 간식 */
export function dayMeals(logged: Set<string>): MealKey[] {
  const main = (["breakfast", "lunch", "dinner"] as MealKey[]).filter((m) => !logged.has(m));
  return main.length ? main : ["snack"];
}

type BoxItem = {
  product_id: string; name: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; sodium_mg: number | null;
  best_price?: number | null; slot_type?: string | null; health_source?: string | null; prices?: { platform?: string; url?: string }[];
};
const r1 = (v: number | null | undefined) => (v == null || Number.isNaN(Number(v)) ? undefined : Math.round(Number(v) * 10) / 10);

/** 7일 짜기 결과(box.days) → 카드 줄 */
export function weekPicks(days: { meals?: BoxItem[]; supplements?: BoxItem[] }[]): PlanPick[] {
  const out: PlanPick[] = [];
  days.slice(0, 7).forEach((d, i) => {
    const day = DAY_KEYS[i];
    for (const m of d.meals || []) {
      const kcal = r1(m.calories), p = r1(m.protein_g);
      out.push({
        kind: "product", id: m.product_id, name: m.name, maker: null, image: null, href: `/products/${m.product_id}`,
        facts: [kcal != null ? `${Math.round(kcal).toLocaleString("ko-KR")}kcal` : null, p != null ? `단백질 ${Math.round(p)}g` : null].filter(Boolean).join(" · "),
        slot: { day, meal: m.slot_type || "lunch" },
        cell: {
          product_id: m.product_id, name: m.name, calories: kcal != null ? Math.round(kcal) : undefined, protein_g: p, carbs_g: r1(m.carbs_g), fat_g: r1(m.fat_g), sodium_mg: r1(m.sodium_mg),
          price: m.best_price ?? undefined, platform: m.health_source || m.prices?.[0]?.platform || null, url: m.prices?.[0]?.url || null, type: "product",
        },
      });
    }
  });
  return out;
}

/** 카드 줄 → 식단 리스트 칸(7일 × 끼니) */
export function planGrid(items: PlanPick[]) {
  const grid: Record<string, Record<string, PlanCell | null>> = {};
  for (const d of DAY_KEYS) grid[d] = { breakfast: null, lunch: null, dinner: null, supplement: null };
  for (const it of items) {
    if (!it.slot?.day || !it.cell) continue;
    const meal = it.slot.meal === "snack" ? "supplement" : it.slot.meal;
    if (meal in grid[it.slot.day] && !grid[it.slot.day][meal]) grid[it.slot.day][meal] = it.cell;
  }
  return grid;
}

/** 하루별 열량 합 (카드 줄 아래 숫자) */
export function dayKcal(items: PlanPick[], day: DayKey) {
  return Math.round(items.filter((i) => i.slot?.day === day).reduce((a, i) => a + (i.cell?.calories || 0), 0));
}

/** 묶음 종류 — 카드를 어떻게 그릴지 */
export function planKind(items: PlanPick[] | null | undefined): "week" | "day" | "list" {
  if (!items?.length) return "list";
  if (items.some((i) => i.slot?.day)) return "week";
  if (items.some((i) => i.slot && !i.slot.day)) return "day";
  return "list";
}
