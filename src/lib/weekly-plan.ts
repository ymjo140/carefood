/**
 * 식단 리스트(주간 식단) 칸 — 식단 리스트 화면과 식단 기록이 같이 쓴다.
 * 편집 중인 식단은 이 기기의 localStorage(DRAFT_KEY)에 있다. 요일(mon~sun) × 끼니(breakfast·lunch·dinner·supplement).
 */
export type PlanCell = {
  product_id?: string;
  name?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  sodium_mg?: number;
  /** 한 끼 값 — 묶음이면 개수로 나눈 값 */
  price?: number;
  /** 묶음일 때 판매 가격과 개수 ("12개 34,300원") */
  pack_price?: number;
  pack_count?: number;
  platform?: string;
  url?: string;
  type?: "product" | "eating_out";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _foods?: any[];
} | null;

export type PlanGrid = Record<string, Record<string, PlanCell>>;
export type PlanFood = Omit<NonNullable<PlanCell>, "_foods">;

export const DRAFT_KEY = "carefood_weekly_draft";
export const PLAN_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** 한 칸에 든 음식 — 여럿이면 _foods, 하나면 칸 자체 */
export function cellFoods(c: PlanCell | undefined): PlanFood[] {
  if (!c) return [];
  if (Array.isArray(c._foods) && c._foods.length > 0) return c._foods as PlanFood[];
  const { _foods: _, ...one } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
  return one.product_id || one.name ? [one] : [];
}

/** "2026-11-12" → "thu" (날짜 문자열의 달력 요일) */
export function weekdayKey(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getUTCDay()] || "mon";
}

/** 식단 기록의 끼니 이름 → 식단 리스트 칸 이름 (간식만 다르다) */
export const planMealKey = (meal: string) => (meal === "snack" ? "supplement" : meal);

/** 이 기기에서 편집 중인 식단 리스트 — 없거나 못 읽으면 null */
export function readDraftGrid(): PlanGrid | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw)?.grid;
    return g && typeof g === "object" ? (g as PlanGrid) : null;
  } catch { return null; } // ds-allow: 저장 공간을 못 쓰는 브라우저 — 식단 리스트가 없는 것으로 본다
}
