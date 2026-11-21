import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { addDays, isDay, todayKst } from "@/lib/day";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { loadNextPicks, type PickItem } from "@/lib/next-picks";
import { seedOf } from "@/lib/buddy";
import { fillBudget } from "@/lib/ai-fill";
import { saveAiPlan } from "@/lib/ai-fill-server";
import { HOME_MEALS, mealsToAvoid, PLAN_DAYS } from "@/lib/home-meal";
import { dayState } from "@/lib/home-meal-server";
import { logRec } from "@/lib/rec-events";
import { perServing } from "@/lib/nutrition";
import type { MealKey } from "@/lib/menu-pick";
import type { PlanFood } from "@/lib/weekly-plan";

/**
 * 홈 '오늘 ○○ 추천' (화면: components/HomeMealRecs, 규칙: lib/home-meal · lib/next-picks)
 * GET  /api/home/meal-recs?meal=dinner
 *   → { meal, budget: { kcal, sodiumCap }, products: 메인 제품(5), combos: 한 상(밥 + 국·찌개 + 반찬, 3) }
 *   오늘 남은 양(목표 − 기록 − 다른 끼니 예정)으로 이 끼니 몫을 정하고 그 몫에 맞춰 고른다 — 식단 탭 'AI 추천'과 같은 규칙.
 *   그날 이미 먹었거나 다른 끼니에 담은 제품은 뺀다. 저녁은 점심이 비어 있으면 점심 추천을 빼고 고른다(같은 것이 나오지 않게).
 *   세 상은 밥·국·반찬이 서로 겹치지 않는다(같은 음식 묶음까지 — lib/dish-family).
 *   로그인하지 않아도 된다(기기 쿠키) — 목표가 없으면 하루 2,000kcal·단백질 60g·나트륨 2,000mg.
 * GET  /api/home/meal-recs?meal=dinner&part=combos&skip=id,id&prev=id,id
 *   '다른 한 상 보기'·'더보기' — 이미 보여 준 음식(skip)과 겹치지 않는 다음 세 상만. prev 는 '다른 한 상 보기'로 넘긴 상(반응 기록: skipped).
 *   더 고를 것이 없으면 combos: [] — 화면이 처음부터 다시 돈다.
 * POST /api/home/meal-recs { meal, date?, product_ids, replace? } — 그날 그 끼니의 예정('AI 추천')으로 담는다.
 *   date 는 오늘부터 6일 뒤까지(한국 시간). 값은 서버가 DB 에서 다시 읽는다(1회 제공량).
 *   이미 기록한 끼니 → 409 recorded. 예정이 있으면 replace 가 없을 때 409 planned { plan_title } —
 *   replace: { plan_title } 이면 그 예정이 지금도 같은 이름일 때만 지우고 담는다(그 사이 바뀌었으면 409).
 * 순서는 영양 기준뿐 — 광고비로 바꾸지 않는다. "성분 정보 + 통계적 매칭" — 처방이 아니다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type PriceRow = { product_id: string; platform: string; price: number; image_url: string | null };

const ids = (v: string | null, max: number) => (v || "").split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, max);

export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, "recommend");
  if (limited) return limited;
  const me = await getActorId();
  if (!me) return noActor();
  const sp = req.nextUrl.searchParams;
  const meal = sp.get("meal") as MealKey;
  if (!HOME_MEALS.includes(meal)) return NextResponse.json({ error: "끼니를 다시 골라 주세요" }, { status: 400 });
  const combosOnly = sp.get("part") === "combos";
  const skip = new Set(ids(sp.get("skip"), 60));
  const prev = ids(sp.get("prev"), 12);
  const date = todayKst();
  const sb = createServiceRoleClient() as Sb;
  try {
    const { goals, rows, plans } = await dayState(sb, me, date);
    const taken = new Set<string>([...rows.map((r) => r.meal_type || ""), ...plans.filter((p) => (p.foods || []).length).map((p) => p.meal)]);
    const exclude = new Set<string>([
      ...rows.map((r) => r.product_id).filter((x): x is string => !!x),
      ...plans.filter((p) => p.meal !== meal).flatMap((p) => (p.foods || []).map((f) => (f as { product_id?: string }).product_id)).filter((x): x is string => !!x),
    ]);
    // 저녁: 점심이 비어 있으면 점심에 권할 것을 먼저 뺀다 (기록이 없으면 두 끼 몫이 같아 같은 것이 나왔다)
    for (const p of mealsToAvoid(meal, taken)) {
      const pb = fillBudget(p, goals, rows, plans);
      const got = await loadNextPicks(sb, me, { meal: p, ...pb, exclude, menus: 0, seed: seedOf(me, date, p), combos: true, count: 5 });
      for (const it of got.items) exclude.add(it.id);
      for (const c of got.combos) for (const f of c.foods) if (f.role !== "rice") exclude.add(f.id);
    }
    const b = fillBudget(meal, goals, rows, plans);
    const got = await loadNextPicks(sb, me, { meal, ...b, exclude, menus: 0, seed: seedOf(me, date, meal), combos: true, count: 5, comboCount: 3, comboAvoid: skip });

    const items = combosOnly ? [] : got.items;
    const allIds = [...new Set([...items.map((i) => i.id), ...got.combos.flatMap((c) => c.foods.map((f) => f.id))])];
    const { data: prices, error: prErr } = allIds.length
      ? await sb.from("product_prices").select("product_id, platform, price, image_url").in("product_id", allIds).gt("price", 0)
      : { data: [], error: null };
    if (prErr) throw new Error(prErr.message);
    const byId = new Map<string, PriceRow[]>();
    for (const p of (prices || []) as PriceRow[]) byId.set(p.product_id, [...(byId.get(p.product_id) || []), p]);
    const view = (i: PickItem) => {
      const ps = byId.get(i.id) || [];
      const best = ps.length ? ps.reduce((a, p) => (p.price < a.price ? p : a)) : null;
      return {
        id: i.id, name: i.name, manufacturer: i.manufacturer, role: i.role ?? "main",
        calories: i.calories, protein_g: i.protein_g, sodium_mg: i.sodium_mg,
        image_url: i.image_url || ps.find((p) => p.image_url)?.image_url || null,
        price: best?.price ?? null, platform: best?.platform ?? null,
      };
    };
    const sum = (xs: PickItem[], k: "calories" | "protein_g") => Math.round(xs.reduce((a, x) => a + (Number(x[k]) || 0), 0) * 10) / 10;

    // 반응 기록 — 보여 준 것(shown), '다른 한 상 보기'로 넘긴 것(skipped). 덤 기록이라 실패해도 추천은 간다
    const ev = (key: string, action: "shown" | "skipped") => ({ user_id: me, surface: "home" as const, item_key: key, meal, day: date, action });
    await logRec(sb, [
      ...allIds.map((k) => ev(k, "shown")),
      ...prev.map((k) => ev(k, "skipped")),
    ]);

    return NextResponse.json({
      meal,
      budget: { kcal: b.kcal, sodiumCap: b.sodiumCap },
      products: items.map(view),
      combos: got.combos.map((c) => ({
        foods: c.foods.map(view),
        calories: sum(c.foods, "calories"), protein_g: sum(c.foods, "protein_g"),
        sodium_mg: c.foods.some((f) => f.sodium_mg == null) ? null : c.foods.reduce((a, f) => a + (f.sodium_mg || 0), 0),
      })),
    });
  } catch (e) {
    console.error("홈 끼니 추천:", (e as Error).message);
    return NextResponse.json({ error: "추천을 불러오지 못했어요" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "plan");
  if (limited) return limited;
  const me = await getActorId();
  if (!me) return noActor();
  const body = await req.json().catch(() => null);
  const meal = body?.meal as MealKey;
  const productIds = Array.isArray(body?.product_ids) ? (body.product_ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 4) : [];
  if (!HOME_MEALS.includes(meal) || !productIds.length) return NextResponse.json({ error: "담을 음식을 다시 골라 주세요" }, { status: 400 });
  const today = todayKst();
  const date = body?.date == null ? today : String(body.date);
  if (!isDay(date) || date < today || date > addDays(today, PLAN_DAYS - 1)) {
    return NextResponse.json({ error: "오늘부터 일주일 안의 날짜를 골라 주세요" }, { status: 400 });
  }
  const replace = body?.replace && typeof body.replace === "object" ? { plan_title: body.replace.plan_title == null ? null : String(body.replace.plan_title) } : null;
  const sb = createServiceRoleClient() as Sb;
  try {
    const { rows, plans } = await dayState(sb, me, date);
    if (rows.some((r) => r.meal_type === meal)) return NextResponse.json({ error: "이미 기록한 끼니예요", code: "recorded" }, { status: 409 });
    const existing = plans.find((p) => p.meal === meal);
    if (existing && !replace) {
      return NextResponse.json({ error: "이미 담아 둔 계획이 있는 끼니예요", code: "planned", plan_title: existing.plan_title }, { status: 409 });
    }
    const { data, error } = await sb.from("products")
      .select("id, name, calories, protein_g, sodium_mg, carbs_g, fat_g, serving_size_g, nutrient_base_g, meal_role")
      .in("id", productIds).eq("is_purchasable", true);
    if (error) throw new Error(error.message);
    const r1 = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? undefined : Math.round(Number(v) * 10) / 10);
    const byId = new Map(((data || []) as { id: string }[]).map((p) => [p.id, perServing(p as never) as Record<string, unknown>]));
    const foods: PlanFood[] = productIds.map((id) => byId.get(id)).filter((p): p is Record<string, unknown> => !!p).map((p) => ({
      product_id: String(p.id), name: String(p.name), type: "product",
      calories: r1(p.calories), protein_g: r1(p.protein_g), sodium_mg: r1(p.sodium_mg), carbs_g: r1(p.carbs_g), fat_g: r1(p.fat_g),
    }));
    if (foods.length !== productIds.length) return NextResponse.json({ error: "지금은 살 수 없는 제품이 있어요. 새로고침해 주세요" }, { status: 409 });
    if (existing && replace) {
      // 시트를 연 뒤 다른 기기에서 바뀌었으면 덮지 않는다 — 이름이 같을 때만 지운다
      let del = sb.from("planned_meals").delete().eq("user_id", me).eq("date", date).eq("meal", meal);
      del = replace.plan_title == null ? del.is("plan_title", null) : del.eq("plan_title", replace.plan_title);
      const { data: gone, error: dErr } = await del.select("meal");
      if (dErr) throw new Error(dErr.message);
      if (!gone?.length) return NextResponse.json({ error: "그 사이 계획이 바뀌었어요. 다시 골라 주세요", code: "changed" }, { status: 409 });
    }
    if (await saveAiPlan(sb, me, date, meal, foods, false) === "conflict") {
      return NextResponse.json({ error: "그 사이 다른 계획이 담겼어요. 다시 골라 주세요", code: "changed" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, date });
  } catch (e) {
    console.error("홈 끼니 담기:", (e as Error).message);
    return NextResponse.json({ error: "담지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
