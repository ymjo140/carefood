import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { addDays, todayKst } from "@/lib/day";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { fillBudget } from "@/lib/ai-fill";
import { HOME_MEALS, PLAN_DAYS, slotState } from "@/lib/home-meal";
import { weekState } from "@/lib/home-meal-server";
import type { MealKey } from "@/lib/menu-pick";

/**
 * 담을 날 고르기 (화면: components/HomeMealRecs 의 시트)
 * GET /api/home/meal-slots?meal=dinner
 *   → { days: [{ date, state: empty|planned|recorded, plan_title, budget_kcal }] } — 오늘부터 7일
 *   budget_kcal: 그날 그 끼니 몫(그날 기록·다른 끼니 예정을 뺀) — 오늘 몫으로 고른 한 상이 그날에도 맞는지 한 줄로 보여 주려고
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, "plan");
  if (limited) return limited;
  const me = await getActorId();
  if (!me) return noActor();
  const meal = req.nextUrl.searchParams.get("meal") as MealKey;
  if (!HOME_MEALS.includes(meal)) return NextResponse.json({ error: "끼니를 다시 골라 주세요" }, { status: 400 });
  const from = todayKst(), to = addDays(from, PLAN_DAYS - 1);
  try {
    const { goals, rows, plans } = await weekState(createServiceRoleClient() as Sb, me, from, to);
    const days = Array.from({ length: PLAN_DAYS }, (_, i) => {
      const date = addDays(from, i);
      const dRows = rows.filter((r) => r.date === date), dPlans = plans.filter((p) => p.date === date);
      return {
        date,
        state: slotState(meal, date, rows, plans),
        plan_title: dPlans.find((p) => p.meal === meal)?.plan_title ?? null,
        budget_kcal: fillBudget(meal, goals, dRows, dPlans.filter((p) => p.meal !== meal)).kcal,
      };
    });
    return NextResponse.json({ meal, days });
  } catch (e) {
    console.error("담을 날 읽기:", (e as Error).message);
    return NextResponse.json({ error: "날짜를 불러오지 못했어요" }, { status: 500 });
  }
}
