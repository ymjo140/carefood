import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { addDays, isDay, todayKst } from "@/lib/day";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { loadNextPicks } from "@/lib/next-picks";
import { seedOf } from "@/lib/buddy";
import { AI_PLAN_TITLE, FILL_MEALS, fillBudget, pickOne, skipKey, type DayPlan, type DayRow } from "@/lib/ai-fill";
import { menuScore, type MealKey } from "@/lib/menu-pick";
import { logRec } from "@/lib/rec-events";
import type { PlanFood } from "@/lib/weekly-plan";
import { saveAiPlan } from "@/lib/ai-fill-server";

/**
 * POST /api/diary/ai-fill { date, meal, skip?: string[] } — 식단 탭 빈 끼니의 'AI 추천' (규칙: lib/ai-fill.ts)
 *   그날 남은 양에 맞는 음식 하나(또는 밥·국·반찬 한 상)를 골라 그 끼니의 예정(planned_meals, plan_title "AI 추천")으로 담는다. 먹었다는 기록은 아니다.
 *   오늘부터 두 달 안의 날짜만 (지난 날은 무엇을 먹었는지 AI 가 알 수 없다).
 *   이미 기록했거나 다른 계획(식단 불러오기·가족이 보낸 것)이 담긴 끼니는 덮지 않는다 — 409.
 *   'AI 추천' 예정이 있으면 다시 고른다(skip: 지금까지 권한 것) — 그 줄이 그대로 'AI 추천'일 때만 바꾼다(조건부 update).
 *   반응 기록(lib/rec-events): 권한 것은 shown, 다시 고르면 바꾸기 전 것은 skipped — 다음 추천 점수에 쓴다.
 * → { foods: PlanFood[], facts }
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "recommend");
  if (limited) return limited;
  const me = await getActorId();
  if (!me) return noActor();
  const body = await req.json().catch(() => null);
  const date = body?.date;
  const meal = body?.meal as MealKey;
  const skip = Array.isArray(body?.skip) ? (body.skip as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 30).map((x) => x.slice(0, 90)) : [];
  const today = todayKst();
  if (!isDay(date) || date < today || date > addDays(today, 60)) {
    return NextResponse.json({ error: "오늘부터 두 달 안의 날짜만 채울 수 있어요" }, { status: 400 });
  }
  if (!FILL_MEALS.includes(meal as never)) return NextResponse.json({ error: "끼니를 다시 골라 주세요" }, { status: 400 });

  const sb = createServiceRoleClient() as Sb;
  try {
    const [gRes, dRes, pRes] = await Promise.all([
      sb.from("daily_nutrition_goals").select("daily_calories, daily_protein_g, max_sodium_mg").eq("user_id", me).maybeSingle(),
      sb.from("meal_diary").select("meal_type, calories, protein_g, sodium_mg, product_id").eq("user_id", me).eq("date", date).limit(500),
      sb.from("planned_meals").select("meal, foods, plan_title").eq("user_id", me).eq("date", date),
    ]);
    if (gRes.error) throw new Error(gRes.error.message);
    if (dRes.error) throw new Error(dRes.error.message);
    if (pRes.error) throw new Error(pRes.error.message);
    const rows = (dRes.data || []) as (DayRow & { product_id: string | null })[];
    const plans = (pRes.data || []) as (DayPlan & { plan_title: string | null; foods: { product_id?: string; calories?: number | null }[] })[];
    if (rows.some((r) => r.meal_type === meal)) return NextResponse.json({ error: "이미 기록한 끼니예요" }, { status: 409 });
    const mine = plans.find((p) => p.meal === meal) || null;
    if (mine && mine.plan_title !== AI_PLAN_TITLE) return NextResponse.json({ error: "이미 담아 둔 계획이 있는 끼니예요" }, { status: 409 });

    const goals = {
      kcal: Number(gRes.data?.daily_calories) || 2000,
      protein: Number(gRes.data?.daily_protein_g) || 60,
      sodium: Number(gRes.data?.max_sodium_mg) || 2000,
    };
    const b = fillBudget(meal, goals, rows, plans);
    // 그날 이미 먹었거나 다른 끼니에 담은 제품은 빼고 고른다
    const exclude = new Set<string>([
      ...rows.map((r) => r.product_id).filter((x): x is string => !!x),
      ...plans.filter((p) => p.meal !== meal).flatMap((p) => (p.foods || []).map((f) => (f as { product_id?: string }).product_id)).filter((x): x is string => !!x),
    ]);
    const seed = seedOf(me, date, meal);
    let got = await loadNextPicks(sb, me, { meal, ...b, exclude, menus: 3, seed, combos: true });
    // 남은 나트륨이 빠듯해 아무것도 안 맞으면 나트륨 조건 없이 한 번 더
    if (!got.menus.length && !got.items.length && !got.combos.length) got = await loadNextPicks(sb, me, { meal, ...b, sodium: 0, sodiumCap: 0, exclude, menus: 3, seed, combos: true });
    // 메뉴·제품을 같은 점수로 견준다 (높은 쪽 먼저)
    const pick = pickOne(got.menus, got.items, skip, (m) => menuScore(m, got.menuBudget), seed, got.combos);
    if (!pick) return NextResponse.json({ error: "지금 조건에 맞는 음식을 찾지 못했어요. 직접 기록해 주세요" }, { status: 404 });

    if (await saveAiPlan(sb, me, date, meal, pick.foods, !!mine) === "conflict") {
      return NextResponse.json({ error: "그 사이 다른 계획이 담겼어요. 새로고침해 주세요" }, { status: 409 });
    }
    const before = mine ? ((mine.foods || []) as PlanFood[]).map(skipKey) : [];
    const now = pick.foods.map(skipKey);
    await logRec(sb, [
      ...before.filter((k) => !now.includes(k)).map((k) => ({ user_id: me, surface: "ai_fill" as const, item_key: k, meal, day: date, action: "skipped" as const })),
      ...now.map((k) => ({ user_id: me, surface: "ai_fill" as const, item_key: k, meal, day: date, action: "shown" as const })),
    ]);
    return NextResponse.json({ foods: pick.foods, facts: pick.facts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
