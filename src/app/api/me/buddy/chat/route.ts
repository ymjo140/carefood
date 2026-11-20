import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { loadTodayMood, prefsOf, type TodayMood } from "@/lib/mascot-facts";
import { loadBuddyState } from "@/lib/buddy-server";
import { loadAccess } from "@/lib/subscription";
import { chatLimit, hasPerk, type Access } from "@/lib/plans";
import { seedOf } from "@/lib/buddy";
import { buddyLine } from "@/lib/buddy-lines";
import { checkLines } from "@/lib/buddy-check";
import { MEAL_CATS, SNACK_CATS, mealBudget, menuFacts, pickMenus, type MealKey, type Menu } from "@/lib/menu-pick";
import { perServing } from "@/lib/nutrition";
import { avoidedNote, focusOf, isRecAsk, mealOfText, rankRecs, type Cand, type Focus, type Pick, type ProfileGoal, type RecentMeal } from "@/lib/chat-recs";
import { dayMeals, isDayAsk, isWeekAsk, weekPicks, type PlanPick } from "@/lib/chat-plans";
import { buildWeeklyBox } from "@/lib/weekly-box-server";
import { cleanTastes, tasteFit, tasteReason } from "@/lib/recommend/taste";
import { ALLERGEN_KEYWORDS } from "@/lib/recommend/constants";
import { addDays, kstDayStartIso, kstHour } from "@/lib/day";
import { loadSignals, logRec } from "@/lib/rec-events";
import { CRISIS_REPLY, QUICK_SAYS, nextSlot, reactPrompt, riskOf, ruleReply, systemPrompt, type ChatCtx } from "@/lib/buddy-chat";
import { aiReady, askBuddy, type Turn } from "@/lib/buddy-ai";
import { dueNow, suppNames, takenFromText } from "@/lib/supplements";
import { loadSupps, markTaken } from "@/lib/supplements-server";
import { josa } from "@/lib/buddy";

/**
 * 같이 다니는 재료 캐릭터와 이야기하기 (내 화면에만). 규칙·안전선은 lib/buddy-chat.ts, AI 부르기는 lib/buddy-ai.ts.
 * GET  — 지난 이야기(최근 40개) · 오늘 남은 횟수. 부를 때 캐릭터가 먼저 말할 게 있으면 넣는다:
 *        오늘 처음이면 인사(문장 은행 + 숫자 체크), 마지막 캐릭터 말 뒤에 새 기록이 있으면 그 음식에 반응(AI, 없으면 문장 은행).
 *        같은 인사·반응은 한 번만 (auto_key 유일 — 동시에 불러도 한 줄).
 * POST { text } — 내 말 남기기(하루 한도는 DB 함수 buddy_chat_say 가 잠그고 센다) → 캐릭터 답.
 *        위기 말은 AI에 보내지 않고 정해진 말(109). AI 가 없거나 실패·선을 넘으면 규칙 답(기록을 남긴다).
 * DELETE — 이야기 모두 지우기.
 * 추천을 물으면("뭐 먹을까", "당류 적은 거") 우리 DB(제품 products · 대표 메뉴 common_foods)에서 고르고(lib/chat-recs.ts) 카드로 같이 남긴다(items).
 *   끼니를 짚으면 그 끼니 3개, 짚지 않으면 오늘 하루(아직 기록하지 않은 끼니마다 2개, slot.meal) — lib/chat-plans.ts
 *   "일주일 식단" 을 물으면 식단 탭 '추천으로 채우기'와 같은 7일 짜기(slot.day · cell) → 화면 카드의 '일주일 식단에 담기'로 식단 리스트에 저장
 *   AI 는 고른 것을 말로 옮기기만 한다. 순서는 영양 기준뿐 — 광고비로 바꾸지 않는다.
 * AI 에 보내는 것: 캐릭터 설정, 오늘 기록한 음식 이름·끼니, 오늘 합계·목표 숫자, 이어 기록한 날, 다음 끼니 메뉴·추천 목록(이름·숫자), 최근 이야기 12개.
 * 보내지 않는 것: 이름·연락처·알레르기·건강 관심사. 메뉴의 알레르기 거르기는 여기서 미리 한다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Msg = { id: string; role: "me" | "buddy"; text: string; created_at: string; items?: Pick[] | null };
const COLS = "id, role, text, items, created_at";

// 제품에서 한 끼로 먹는 종류 · 간식에서 빼는 종류 (/api/diary/next 와 같은 기준)
const MEAL_DISH = ["rice", "soup", "noodle", "grill", "salad", "set", "bread", "side"];
const NOT_SNACK = ["supplement", "powder", "sauce", "ingredient", "seafood", "rice", "soup", "noodle", "set"];
const FOCUS_ORDER: Record<string, { col: string; asc: boolean }> = {
  sugar: { col: "sugar_g", asc: true }, sodium: { col: "sodium_mg", asc: true }, protein: { col: "protein_g", asc: false },
  light: { col: "calories", asc: true }, budget: { col: "health_score", asc: false },
};

type Base = Awaited<ReturnType<typeof loadCtx>>;
type ProdRow = Record<string, unknown> & { id: string; name: string; manufacturer: string | null; image_url: string | null; calories: number | null; protein_g: number | null; carbs_g: number | null; sugar_g: number | null; sodium_mg: number | null; serving_size_g: number | null; nutrient_base_g: number | null; dish_category: string | null };

/** 추천에 쓰는 재료 — 최근 3일 기록 · 최근 이틀 권한 것 · 입맛 (한 번 읽어 하루 추천의 끼니마다 같이 쓴다) */
async function recBase(sb: Sb, actor: string, t: TodayMood, base: Base) {
  const [recentRes, shownRes] = await Promise.all([
    // 최근 3일 기록 — 바로 전 끼니 · 점심·저녁 겹침 빼기
    sb.from("meal_diary").select("date, meal_type, food_name, product_id, created_at").eq("user_id", actor).gte("date", addDays(t.today, -2)).lte("date", t.today).limit(200),
    // 최근 이틀 대화에서 권한 것 — 뒤로 미룬다
    sb.from("buddy_chats").select("items").eq("user_id", actor).eq("role", "buddy").not("items", "is", null).gte("created_at", kstDayStartIso(addDays(t.today, -1))).limit(50),
  ]);
  if (recentRes.error) throw new Error(recentRes.error.message);
  if (shownRes.error) throw new Error(shownRes.error.message);
  const prof = base.profile;
  const tastes = cleanTastes({ salty: prof?.taste_salty, sweet: prof?.taste_sweet, fatty: prof?.taste_fatty, spicy: prof?.taste_spicy });
  const fit = (raw: Record<string, unknown>) => { const f = tasteFit(tastes, raw); return { taste: f.score, tasteWhy: tasteReason(f) }; };
  const recent: RecentMeal[] = ((recentRes.data || []) as { date: string; meal_type: string | null; food_name: string | null; product_id: string | null; created_at: string }[])
    .filter((r) => r.food_name).map((r) => ({ date: r.date, meal: r.meal_type || "snack", food: String(r.food_name), productId: r.product_id, at: r.created_at }));
  const shown = ((shownRes.data || []) as { items: Pick[] | null }[]).flatMap((r) => (r.items || []).map((i) => i.id));
  return { fit, recent, shown, prods: new Map<string, ProdRow[]>() };
}

/** 한 끼 후보 — 제품(살 수 있는 것) · 대표 메뉴. 제품 목록은 (끼니/간식 × 초점)마다 한 번만 읽는다 */
async function candsFor(sb: Sb, meal: MealKey, focus: Focus, base: Base, rb: Awaited<ReturnType<typeof recBase>>): Promise<Cand[]> {
  const o = FOCUS_ORDER[focus.key];
  const key = `${meal === "snack" ? "snack" : "meal"}:${focus.key}`;
  if (!rb.prods.has(key)) {
    let q = sb.from("products")
      .select("id, name, manufacturer, image_url, calories, protein_g, carbs_g, sugar_g, fat_g, sodium_mg, serving_size_g, nutrient_base_g, dish_category, taste_salty, taste_sweet, taste_fatty, taste_spicy, spicy_score")
      .eq("is_purchasable", true).is("nutrition_flag", null).is("rec_hold", null).gt("calories", 0)
      .gt("serving_size_g", 0).lte("serving_size_g", 350).not(o.col, "is", null);
    // 종류를 DB 에서 먼저 거른 뒤 자른다 (lib/next-picks 와 같은 이유 — 자른 뒤 거르면 후보가 거의 남지 않는다)
    // 끼니 역할로도 거른다 (lib/next-picks 와 같은 기준) — 간식은 간식만, 한 끼는 원물 재료·양념·영양제·음료 빼기
    q = meal !== "snack"
      ? q.in("dish_category", MEAL_DISH).not("meal_role", "in", "(ingredient,condiment,supplement,drink)")
      : q.eq("meal_role", "snack").in("dish_category", ["snack", "dairy", "side", "salad", "grill"]);
    if (focus.key === "light") q = q.gte("calories", 40);
    const { data, error } = await q.order(o.col, { ascending: o.asc, nullsFirst: false }).limit(1000);
    if (error) throw new Error(error.message);
    rb.prods.set(key, (data || []) as ProdRow[]);
  }
  const products: Cand[] = rb.prods.get(key)!
    .filter((r) => meal !== "snack" || !NOT_SNACK.includes(r.dish_category || ""))
    .map((raw) => {
      const r = perServing(raw);
      // 맛 단계는 100g 기준 값으로 잰다 (perServing 전)
      return { kind: "product" as const, id: r.id, name: r.name, maker: r.manufacturer, image: r.image_url, category: r.dish_category,
        calories: r.calories, protein_g: r.protein_g, carbs_g: r.carbs_g, sugar_g: r.sugar_g, sodium_mg: r.sodium_mg, ...rb.fit(raw) };
    });
  const cats = meal === "snack" ? SNACK_CATS : MEAL_CATS;
  const menus: Cand[] = base.foods.filter((f) => cats.has(f.category)).map((f) => {
    const g = Number(f.serving_size_g) || 0;
    const per100 = (v: number | null) => (v == null || !g ? null : (Number(v) * 100) / g);
    return {
      kind: "menu" as const, id: f.id, name: f.name, maker: null, image: null, category: f.category,
      calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, sugar_g: f.sugar_g, sodium_mg: f.sodium_mg,
      ...rb.fit({ sodium_mg: per100(f.sodium_mg), sugar_g: per100(f.sugar_g), fat_g: per100(f.fat_g) }),
    };
  });
  return [...menus, ...products];
}

const budgetOf = (t: TodayMood, meal: MealKey, mainLeft: number) => mealBudget({
  meal, mainLeft, goalKcal: t.goals.kcal,
  remainKcal: t.goals.kcal - t.totals.kcal, remainProtein: t.goals.protein - t.totals.protein, remainSodium: t.goals.sodium - t.totals.sodium,
});

/** 추천을 물었으면 우리 DB(제품 · 대표 메뉴)에서 고른다 — 순서는 영양·입맛 기준뿐. 내 목표·최근 3일 기록·최근 권한 것을 같이 본다.
 *  끼니를 짚으면 그 끼니 3개, 짚지 않으면 오늘 하루(아직 기록하지 않은 끼니마다 2개) */
async function loadRecs(sb: Sb, actor: string, text: string, t: TodayMood, base: Base) {
  if (!isRecAsk(text) && !isDayAsk(text, true)) return null;
  const prof = base.profile;
  const focus = focusOf(text, prof);
  const named = mealOfText(text);
  const [rb, signals] = await Promise.all([recBase(sb, actor, t, base), loadSignals(sb, actor, addDays(t.today, -30))]);
  const opts = (shown: string[]) => ({ today: t.today, recent: rb.recent, shown, vegetarian: prof?.diet_type === "vegetarian" });
  if (!isDayAsk(text, !!named)) {
    const meal: MealKey = named ?? base.slot.meal;
    const b = budgetOf(t, meal, meal === base.slot.meal ? base.slot.mainLeft : Math.max(1, base.slot.mainLeft));
    const picks = rankRecs(await candsFor(sb, meal, focus, base, rb), focus.key, { meal, ...b, avoid: base.avoid, signals },
      `${actor}:${t.today}:${text}`, 3, opts(rb.shown));
    await logShown(sb, actor, t.today, picks.map((p) => ({ ...p, meal })));
    return { kind: "meal" as const, focus, meal, picks, avoided: avoidedNote(rb.recent, meal, t.today) };
  }
  // 오늘 하루 — 끼니끼리 같은 것을 권하지 않게 고른 것을 쌓아 간다
  const meals = dayMeals(new Set(base.rows.map((r) => r.meal_type || "")));
  const mainLeft = meals.filter((m) => m !== "snack").length || 1;
  const picks: PlanPick[] = [];
  const shown = [...rb.shown];
  for (const meal of meals) {
    const b = budgetOf(t, meal, mainLeft);
    const got = rankRecs(await candsFor(sb, meal, focus, base, rb), focus.key, { meal, ...b, avoid: base.avoid, signals },
      `${actor}:${t.today}:${text}:${meal}`, 2, opts([...shown, ...picks.map((p) => p.id)]));
    picks.push(...got.map((p) => ({ ...p, slot: { day: null, meal } })));
  }
  await logShown(sb, actor, t.today, picks.map((p) => ({ ...p, meal: p.slot?.meal ?? meals[0] })));
  return { kind: "day" as const, focus, meal: meals[0], picks, avoided: null };
}

/** 대화에서 권한 것 — 반응 기록(rec_events, shown). 기록하면 recorded 로 이어진다 (lib/rec-events) */
const logShown = (sb: Sb, actor: string, day: string, picks: { kind: string; id: string; name: string; meal: string }[]) =>
  logRec(sb, picks.map((p) => ({ user_id: actor, surface: "chat" as const, item_key: p.kind === "product" ? p.id : `menu:${p.name}`, meal: p.meal, day, action: "shown" as const })));

/** 일주일 — 식단 탭 '추천으로 채우기'와 같은 7일 짜기. 내 목표·질환 관심·알레르기·입맛은 서버 프로필에서 (AI 에는 보내지 않는다) */
async function loadWeek(sb: Sb, actor: string, base: Base) {
  const [{ data: up, error: uErr }, { data: g, error: gErr }] = await Promise.all([
    sb.from("user_profiles").select("goals, concerns, conditions, allergies, taste_salty, taste_sweet, taste_spicy, taste_fatty").eq("user_id", actor).maybeSingle(),
    sb.from("daily_nutrition_goals").select("daily_calories, daily_protein_g, max_sodium_mg").eq("user_id", actor).maybeSingle(),
  ]);
  if (uErr) throw new Error(uErr.message);
  if (gErr) throw new Error(gErr.message);
  const tv = (v: unknown) => (typeof v === "number" && v >= 1 && v <= 10 ? v : 5);
  const kcal = Number(g?.daily_calories) || 0;
  const r = await buildWeeklyBox({
    concerns: up?.concerns || [], conditions: up?.conditions || [], goals: up?.goals || [], allergies: up?.allergies || [],
    tastes: { salty: tv(up?.taste_salty), sweet: tv(up?.taste_sweet), spicy: tv(up?.taste_spicy), fatty: tv(up?.taste_fatty) },
    budget: 100000, mealsPerDay: 3, supplementsPerDay: 0,
    nutrition_goals: kcal ? {
      dailyCalories: kcal, dailyProteinG: Number(g?.daily_protein_g) || 60, maxSodiumMg: Number(g?.max_sodium_mg) || 2000, maxSugarG: 50,
      perMealCalMax: Math.round((kcal / 3) * 1.2), perMealSodiumMax: Math.round((Number(g?.max_sodium_mg) || 2000) / 3 * 1.2), perMealSugarMax: 15,
    } : undefined,
  }, actor);
  void base;
  const picks = r.box?.days ? weekPicks(r.box.days) : [];
  return { kind: "week" as const, picks };
}

async function loadCtx(sb: Sb, actor: string, t: TodayMood, access: Access, buddy: { ingredient: string; personality: string }, days: number, stage: string) {
  const [dRes, pRes, fRes] = await Promise.all([
    sb.from("meal_diary").select("id, meal_type, food_name, created_at").eq("user_id", actor).eq("date", t.today).order("created_at", { ascending: true }).limit(40),
    sb.from("user_profiles").select("allergies, goals, conditions, concerns, diet_type, taste_salty, taste_sweet, taste_fatty, taste_spicy").eq("user_id", actor).maybeSingle(),
    sb.from("common_foods").select("id, name, category, serving_desc, serving_size_g, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g"),
  ]);
  if (dRes.error) throw new Error(dRes.error.message);
  if (pRes.error) throw new Error(pRes.error.message);
  if (fRes.error) throw new Error(fRes.error.message);
  const rows = (dRes.data || []) as { id: string; meal_type: string | null; food_name: string | null; created_at: string }[];
  const hour = kstHour();
  const slot = nextSlot(hour, new Set(rows.map((r) => r.meal_type || "")));
  const b = mealBudget({
    meal: slot.meal, mainLeft: slot.mainLeft, goalKcal: t.goals.kcal,
    remainKcal: t.goals.kcal - t.totals.kcal, remainProtein: t.goals.protein - t.totals.protein, remainSodium: t.goals.sodium - t.totals.sodium,
  });
  const avoid = (((pRes.data?.allergies as string[] | null) || []).flatMap((a) => ALLERGEN_KEYWORDS[a] || []));
  const menus = pickMenus((fRes.data || []) as Menu[], { meal: slot.meal, ...b, avoid }, hasPerk(access, "recs") ? 2 : 1, seedOf(actor, t.today, slot.meal));
  const ctx: ChatCtx = {
    ingredient: buddy.ingredient, personality: buddy.personality, today: t.today, hour,
    meals: rows.filter((r) => r.food_name).map((r) => ({ meal: r.meal_type || "snack", food: String(r.food_name).slice(0, 30) })),
    totals: t.totals, goals: t.goals, streak: t.streak, days, stage,
    next: { meal: slot.meal, menus: menus.map((m) => ({ name: m.name, facts: menuFacts(m) })) },
    check: hasPerk(access, "check"),
  };
  // 내 목표·입맛은 서버에서 추천 고르기에만 쓴다 (AI 에는 보내지 않는다)
  const profile = pRes.data as (ProfileGoal & { taste_salty: number | null; taste_sweet: number | null; taste_fatty: number | null; taste_spicy: number | null }) | null;
  return { ctx, rows, slot, avoid, profile, foods: (fRes.data || []) as Menu[] };
}

async function recent(sb: Sb, actor: string, n: number): Promise<Msg[]> {
  const { data, error } = await sb.from("buddy_chats").select(COLS).eq("user_id", actor).order("created_at", { ascending: false }).limit(n);
  if (error) throw new Error(error.message);
  return ((data || []) as Msg[]).reverse();
}

async function usedToday(sb: Sb, actor: string, today: string) {
  const { count, error } = await sb.from("buddy_chats").select("id", { count: "exact", head: true })
    .eq("user_id", actor).eq("role", "me").gte("created_at", kstDayStartIso(today));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function setup(sb: Sb, actor: string) {
  const [prefs, t, access] = await Promise.all([prefsOf(sb, actor), loadTodayMood(sb, actor), loadAccess(sb, actor)]);
  const state = await loadBuddyState(sb, actor, t, access);
  return { prefs, t, access, state };
}

export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const sb = createServiceRoleClient() as Sb;
  try {
    const { prefs, t, access, state } = await setup(sb, actor);
    const base = { on: prefs.kind !== "none", ai: aiReady(), mood: t.state.mood, stage: state.stage, wraps: state.wraps.length, limit: chatLimit(access), quick: QUICK_SAYS };
    if (!state.buddy) return NextResponse.json({ ...base, buddy: null, messages: [], left: 0 });
    const buddy = state.buddy;
    const [{ ctx: ctx0, rows }, supps] = await Promise.all([loadCtx(sb, actor, t, access, buddy, state.days, state.stage.name), loadSupps(sb, actor, t.today)]);
    const ctx: ChatCtx = { ...ctx0, supps };
    const due = dueNow(supps, ctx.hour);

    // 캐릭터가 먼저 할 말 — 오늘 처음이면 인사, 마지막 캐릭터 말 뒤에 새 기록이 있으면 반응
    const { data: lastB, error: lErr } = await sb.from("buddy_chats").select("created_at").eq("user_id", actor).eq("role", "buddy")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lErr) throw new Error(lErr.message);
    const lastAt = (lastB as { created_at: string } | null)?.created_at ?? null;
    const latest = rows.at(-1);
    let auto: { key: string; text: string; source: "ai" | "rule" } | null = null;
    const ms = (iso: string) => new Date(iso).getTime();
    if (!lastAt || ms(lastAt) < ms(kstDayStartIso(t.today))) {
      auto = { key: `greet:${t.today}`, text: [state.line, ...(state.check ?? [])].filter(Boolean).join("\n"), source: "rule" };
    } else if (latest && latest.food_name && ms(latest.created_at) > ms(lastAt)) {
      const turns: Turn[] = [...(await recent(sb, actor, 8)), { role: "me", text: reactPrompt(String(latest.food_name).slice(0, 30), latest.meal_type || "snack") }];
      const ai = aiReady() ? await askBuddy(systemPrompt(ctx), turns) : { text: null };
      if (ai.error && ai.error !== "no-key") console.error("캐릭터 반응을 AI로 만들지 못했어요:", ai.error);
      const fallback = buddyLine(buddy.ingredient, buddy.personality, "logged", { food: latest.food_name, days: t.streak, seed: seedOf(actor, latest.id) })
        + (state.check?.length ? `\n${checkLines(t.totals, t.goals)[0]}` : "");
      auto = { key: `meal:${latest.id}`, text: ai.text ?? fallback, source: ai.text ? "ai" : "rule" };
    }
    // 영양제 — 챙길 때가 지났는데 안 먹은 게 있으면 하루 한 번 묻는다
    const autos = [auto];
    if (due.length) {
      const names = suppNames(due);
      autos.push({ key: `supp:${t.today}`, text: `${names}${josa(names, "은", "는")} 챙겼어요? 먹었으면 '영양제 먹었어요'라고 말해 줘요`, source: "rule" });
    }
    for (const a of autos) {
      if (!a?.text) continue;
      const { error } = await sb.from("buddy_chats").upsert(
        { user_id: actor, buddy_id: buddy.id, role: "buddy", text: a.text, source: a.source, auto_key: a.key },
        { onConflict: "user_id,auto_key", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    const [messages, used] = await Promise.all([recent(sb, actor, 40), usedToday(sb, actor, t.today)]);
    const quick = due.length ? ["영양제 먹었어요", ...QUICK_SAYS.slice(0, 3)] : QUICK_SAYS;
    return NextResponse.json({ ...base, quick, buddy, messages, supps: { count: supps.length, due: due.length }, left: Math.max(0, base.limit - used) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({})); // ds-allow: 몸통이 없으면 아래에서 400
  const text = String(body?.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return NextResponse.json({ error: "할 말을 적어 주세요" }, { status: 400 });
  if (text.length > 300) return NextResponse.json({ error: "300자까지 보낼 수 있어요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  try {
    const { prefs, t, access, state } = await setup(sb, actor);
    if (prefs.kind === "none") return NextResponse.json({ error: "캐릭터를 꺼 두었어요. 캐릭터 화면에서 켜 주세요" }, { status: 409 });
    if (!state.buddy) return NextResponse.json({ error: "같이 다니는 캐릭터가 없어요" }, { status: 404 });
    const buddy = state.buddy;
    const limit = chatLimit(access);
    const history = await recent(sb, actor, 12);
    const { data: mineId, error: sErr } = await sb.rpc("buddy_chat_say", {
      p_user: actor, p_buddy: buddy.id, p_text: text, p_since: kstDayStartIso(t.today), p_limit: limit,
    });
    if (sErr) {
      if (sErr.code === "P0001") return NextResponse.json({ error: sErr.message, left: 0 }, { status: 429 });
      throw new Error(sErr.message);
    }

    const risk = riskOf(text);
    let reply: string, source: "ai" | "rule" | "safety";
    let recs: Awaited<ReturnType<typeof loadRecs>> = null;
    let items: PlanPick[] = [];
    if (risk === "crisis") {
      reply = CRISIS_REPLY; source = "safety";
    } else {
      const [base, supps0] = await Promise.all([loadCtx(sb, actor, t, access, buddy, state.days, state.stage.name), loadSupps(sb, actor, t.today)]);
      const careful = risk === "eating";
      // 영양제를 먹었다는 말이면 체크부터 (먹었는지만 — 효과·양은 다루지 않는다)
      const just = takenFromText(text, supps0, base.ctx.hour);
      await markTaken(sb, actor, t.today, just.map((x) => x.id));
      const supps = supps0.map((x) => (just.some((j) => j.id === x.id) ? { ...x, taken: true } : x));
      let week: Awaited<ReturnType<typeof loadWeek>> | null = null;
      if (!careful && !just.length) {
        if (isWeekAsk(text)) week = await loadWeek(sb, actor, base);
        else recs = await loadRecs(sb, actor, text, t, base);
      }
      items = week ? week.picks : recs?.picks ?? [];
      const ctx: ChatCtx = {
        ...base.ctx, recs: recs?.kind === "meal" ? recs : null, supps, suppJust: just.length ? suppNames(just) : null,
        plan: week ? { kind: "week", picks: week.picks } : recs?.kind === "day" ? { kind: "day", picks: recs.picks, focus: recs.focus } : null,
      };
      const ai = aiReady() ? await askBuddy(systemPrompt(ctx, careful), [...history, { role: "me", text }]) : { text: null };
      if (ai.error && ai.error !== "no-key") console.error("캐릭터 답을 AI로 만들지 못했어요:", ai.error);
      reply = ai.text ?? ruleReply(text, ctx, careful);
      source = ai.text ? "ai" : "rule";
    }
    const { data: r, error: rErr } = await sb.from("buddy_chats")
      .insert({ user_id: actor, buddy_id: buddy.id, role: "buddy", text: reply, source, items: items.length ? items : null }).select(COLS).single();
    if (rErr) throw new Error(rErr.message);
    const used = await usedToday(sb, actor, t.today);
    return NextResponse.json({ mine: { id: mineId, role: "me", text }, reply: r, left: Math.max(0, limit - used) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  const actor = await getActorId();
  if (!actor) return noActor();
  const sb = createServiceRoleClient() as Sb;
  const { error } = await sb.from("buddy_chats").delete().eq("user_id", actor);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
