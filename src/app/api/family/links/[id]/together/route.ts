import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MEAL_LABEL, accountActor, isFamilyMeal, kindOf, kindWord, nicknameOf } from "@/lib/family";
import { planFoodOf, sendInput, sendPlanTo } from "@/lib/family-send";
import { loadNextPicks, personMealBudget } from "@/lib/next-picks";
import { loadPrices } from "@/lib/recommend/query-builder";
import { userPusher } from "@/lib/push";
import { seedOf, josa } from "@/lib/buddy";
import { todayKst } from "@/lib/day";

/**
 * 같이 먹기 — 가족·친구와 오늘 같은 끼니를 같은 음식으로 (식단 탭 사람 칩 › 끼니 › '같이 먹기')
 * GET  ?meal=dinner — 두 사람 모두에게 맞는 후보: 열량·단백질·나트륨은 두 사람 한 끼 예산 중 작은 쪽, 알레르기는 두 사람 것을 모두 뺀다.
 *      두 사람의 목표·남은 양·알레르기는 내보내지 않는다(후보와 성분 숫자만). mine: 내 그 끼니 상태(기록함·내 계획 있음)
 * POST { meal, kind, ref, note? } — 상대 그 끼니에 예정으로 보내고(추천 보내기와 같은 규칙), 내 그 끼니 예정에도 같은 음식을 담는다.
 *      내가 이미 기록한 끼니면 멈춘다. 내 계획이 있으면 이 음식으로 바꾼다(화면에서 미리 알린다).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function linkOf(sb: Sb, id: string, me: string) {
  const { data, error } = await sb.from("family_links").select("id, owner_id, label, kind").eq("id", id).eq("viewer_id", me).eq("status", "active").maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; owner_id: string; label: string; kind: string } | null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const meal = request.nextUrl.searchParams.get("meal");
  if (!isFamilyMeal(meal)) return NextResponse.json({ error: "끼니를 골라 주세요" }, { status: 400 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  const sb = createServiceRoleClient() as Sb;
  const today = todayKst();
  try {
    const l = await linkOf(sb, id, who.actor);
    if (!l) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const [mine, theirs, { data: plan, error: pErr }] = await Promise.all([
      personMealBudget(sb, who.actor, meal, today),
      personMealBudget(sb, l.owner_id, meal, today),
      sb.from("planned_meals").select("id, sent_name").eq("user_id", who.actor).eq("date", today).eq("meal", meal).maybeSingle(),
    ]);
    if (pErr) throw new Error(pErr.message);
    const { menus, items } = await loadNextPicks(sb, [who.actor, l.owner_id], {
      meal, kcal: Math.min(mine.kcal, theirs.kcal), protein: Math.min(mine.protein, theirs.protein), sodium: Math.min(mine.sodium, theirs.sodium),
      menus: 3, seed: seedOf(`${who.actor}:${l.owner_id}`, today, meal),
    });
    const prices = await loadPrices(sb, items.map((i) => i.id));
    return NextResponse.json({
      mine: { recorded: mine.recorded, planned: !!plan },
      menus: menus.map((m) => ({ id: m.id, name: m.name, category: m.category, calories: Math.round(Number(m.calories) || 0), protein_g: Math.round(Number(m.protein_g) || 0), sodium_mg: Math.round(Number(m.sodium_mg) || 0) })),
      items: items.map((i) => {
        const ps = (prices[i.id] || []).filter((p) => p.price > 0);
        return { id: i.id, name: i.name, calories: i.calories, protein_g: Math.round(i.protein_g), sodium_mg: i.sodium_mg, price: ps.length ? Math.min(...ps.map((p) => p.price)) : null };
      }).filter((i) => i.price !== null),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const { meal } = body;
  if (!isFamilyMeal(meal)) return NextResponse.json({ error: "끼니를 골라 주세요" }, { status: 400 });
  const input = sendInput(body);
  if (!input) return NextResponse.json({ error: "같이 먹을 음식을 골라 주세요" }, { status: 400 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  const sb = createServiceRoleClient() as Sb;
  const today = todayKst();
  try {
    const l = await linkOf(sb, id, who.actor);
    if (!l) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const word = kindWord(kindOf(l));
    const { count: ate, error: dErr } = await sb.from("meal_diary").select("id", { count: "exact", head: true }).eq("user_id", who.actor).eq("date", today).eq("meal_type", meal);
    if (dErr) throw new Error(dErr.message);
    if ((ate || 0) > 0) return NextResponse.json({ error: `내 ${MEAL_LABEL[meal]}은 이미 기록했어요` }, { status: 409 });

    const food = await planFoodOf(sb, input.kind, input.ref);
    if ("error" in food) return NextResponse.json({ error: food.error }, { status: food.status });
    const name = ((await nicknameOf(sb, who.actor)) || word).slice(0, 20);
    // 상대 쪽이 먼저 — 상대가 이미 기록했거나 직접 계획을 담았으면 내 계획도 바꾸지 않는다
    const res = await sendPlanTo(sb, { owner: l.owner_id, sender: who.actor, senderName: name, label: l.label, word, meal, foods: food.foods, note: input.note, today });
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
    const { error: mErr } = await sb.from("planned_meals").upsert(
      { user_id: who.actor, date: today, meal, foods: food.foods, plan_title: `같이 먹기 · ${l.label}`.slice(0, 60), sent_by: null, sent_name: null, note: null },
      { onConflict: "user_id,date,meal" },
    );
    if (mErr) {
      console.error("같이 먹기 — 내 예정을 담지 못했어요:", mErr.message);
      return NextResponse.json({ ok: true, partial: true, error: `${l.label}에게는 보냈지만 내 ${MEAL_LABEL[meal]}에는 담지 못했어요. 식단 탭에서 직접 담아 주세요` }, { status: 207 });
    }

    const dish = String(food.foods[0].name || "음식");
    let pushed = false;
    const push = userPusher(sb);
    if (push) {
      try {
        pushed = await push(l.owner_id, {
          title: `${name} 님이 ${MEAL_LABEL[meal]} 같이 먹자고 해요`,
          body: `${dish}${josa(dish, "을", "를")} 같이 · ${input.note ? `“${input.note}”` : "예정에 담겼어요"}`, url: "/diary", tag: `famtogether-${l.id}`,
        });
      } catch (e) { console.error("같이 먹기 푸시를 보내지 못했어요:", (e as Error).message); } // ds-allow: 두 사람 예정에는 담겼다 — 푸시만 빠짐
    }
    return NextResponse.json({ ok: true, pushed, food: dish });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
