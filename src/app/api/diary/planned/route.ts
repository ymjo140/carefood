import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { addDays, isDay, todayKst } from "@/lib/day";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { cleanPlanFoods, PLANNED_MEALS } from "@/lib/planned-meals";

/**
 * 날짜에 담아 둔 끼니 계획(예정) — 식단 탭의 '식단 불러오기'가 담고, 하루 보기에서 '먹었어요'로 기록하면 지운다.
 * GET    /api/diary/planned?from=YYYY-MM-DD&to=YYYY-MM-DD  (to 포함, 최대 14일) → { planned: [{date, meal, foods, plan_title}], ready }
 * POST   /api/diary/planned { date, meals: { breakfast?: PlanFood[], … }, plan_title? } — 끼니마다 바꿔 담는다
 * DELETE /api/diary/planned?date=…&meal=…                   — 한 끼 빼기
 * 표(planned_meals)가 아직 없으면(마이그레이션 적용 전) 읽기는 빈 목록 + ready:false, 쓰기는 503.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const notReady = (e: any) => e?.code === "42P01" || e?.code === "PGRST205" || /planned_meals/.test(String(e?.message || ""));

export async function GET(req: NextRequest) {
  await connection();
  const userId = await getActorId();
  if (!userId) return noActor();
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to") || from;
  if (!isDay(from) || !isDay(to) || to < from || addDays(from, 14) < to) {
    return NextResponse.json({ error: "기간을 다시 골라 주세요" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data, error } = await sb.from("planned_meals")
    .select("date, meal, foods, plan_title, sent_name, note")
    .eq("user_id", userId).gte("date", from).lte("date", to)
    .order("date");
  if (error) {
    if (notReady(error)) {
      console.warn("planned_meals 표가 아직 없어요 — 마이그레이션 20261123 적용 전");
      return NextResponse.json({ planned: [], ready: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ planned: data || [], ready: true });
}

export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "diary");
  if (limited) return limited;
  const userId = await getActorId();
  if (!userId) return noActor();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const date = body.date;
  const today = todayKst();
  // 예정은 앞으로 올 날에만 — 오늘·지난 날은 바로 기록한다 (화면도 그렇게 나눈다). 너무 먼 날은 받지 않는다
  if (!isDay(date) || date <= today || date > addDays(today, 60)) {
    return NextResponse.json({ error: "내일부터 두 달 안의 날짜만 담을 수 있어요" }, { status: 400 });
  }
  const meals = body.meals && typeof body.meals === "object" ? body.meals : {};
  const plan_title = typeof body.plan_title === "string" && body.plan_title.trim() ? body.plan_title.trim().slice(0, 60) : null;
  const rows = PLANNED_MEALS
    .map((meal) => ({ meal, foods: cleanPlanFoods(meals[meal]) }))
    .filter((r) => r.foods.length > 0)
    // 내가 담은 계획 — 가족이 보낸 예정을 덮으면 보낸 사람 표시도 지운다
    .map((r) => ({ user_id: userId, date, meal: r.meal, foods: r.foods, plan_title, sent_by: null, sent_name: null, note: null }));
  if (rows.length === 0) return NextResponse.json({ error: "담을 끼니를 골라 주세요" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { error } = await sb.from("planned_meals").upsert(rows, { onConflict: "user_id,date,meal" });
  if (error) {
    if (notReady(error)) return NextResponse.json({ error: "예정 담기는 아직 준비 중이에요" }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: rows.length });
}

export async function DELETE(req: NextRequest) {
  const userId = await getActorId();
  if (!userId) return noActor();
  const date = req.nextUrl.searchParams.get("date");
  const meal = req.nextUrl.searchParams.get("meal");
  if (!isDay(date) || !PLANNED_MEALS.includes(meal as never)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { error } = await sb.from("planned_meals").delete().eq("user_id", userId).eq("date", date).eq("meal", meal);
  if (error) {
    if (notReady(error)) return NextResponse.json({ ok: true }); // 표가 없으면 뺄 예정도 없다 — 빼기는 이미 된 것과 같다
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
