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
import { mealBudget, menuFacts, pickMenus, type Menu } from "@/lib/menu-pick";
import { ALLERGEN_KEYWORDS } from "@/lib/recommend/constants";
import { kstDayStartIso, kstHour } from "@/lib/day";
import { CRISIS_REPLY, QUICK_SAYS, nextSlot, reactPrompt, riskOf, ruleReply, systemPrompt, type ChatCtx } from "@/lib/buddy-chat";
import { aiReady, askBuddy, type Turn } from "@/lib/buddy-ai";

/**
 * 같이 다니는 재료 캐릭터와 이야기하기 (내 화면에만). 규칙·안전선은 lib/buddy-chat.ts, AI 부르기는 lib/buddy-ai.ts.
 * GET  — 지난 이야기(최근 40개) · 오늘 남은 횟수. 부를 때 캐릭터가 먼저 말할 게 있으면 넣는다:
 *        오늘 처음이면 인사(문장 은행 + 숫자 체크), 마지막 캐릭터 말 뒤에 새 기록이 있으면 그 음식에 반응(AI, 없으면 문장 은행).
 *        같은 인사·반응은 한 번만 (auto_key 유일 — 동시에 불러도 한 줄).
 * POST { text } — 내 말 남기기(하루 한도는 DB 함수 buddy_chat_say 가 잠그고 센다) → 캐릭터 답.
 *        위기 말은 AI에 보내지 않고 정해진 말(109). AI 가 없거나 실패·선을 넘으면 규칙 답(기록을 남긴다).
 * DELETE — 이야기 모두 지우기.
 * AI 에 보내는 것: 캐릭터 설정, 오늘 기록한 음식 이름·끼니, 오늘 합계·목표 숫자, 이어 기록한 날, 다음 끼니 일반 메뉴, 최근 이야기 12개.
 * 보내지 않는 것: 이름·연락처·알레르기·건강 관심사. 메뉴의 알레르기 거르기는 여기서 미리 한다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Msg = { id: string; role: "me" | "buddy"; text: string; created_at: string };
const COLS = "id, role, text, created_at";

async function loadCtx(sb: Sb, actor: string, t: TodayMood, access: Access, buddy: { ingredient: string; personality: string }, days: number, stage: string) {
  const [dRes, pRes, fRes] = await Promise.all([
    sb.from("meal_diary").select("id, meal_type, food_name, created_at").eq("user_id", actor).eq("date", t.today).order("created_at", { ascending: true }).limit(40),
    sb.from("user_profiles").select("allergies").eq("user_id", actor).maybeSingle(),
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
  return { ctx, rows };
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
    const { ctx, rows } = await loadCtx(sb, actor, t, access, buddy, state.days, state.stage.name);

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
    if (auto?.text) {
      const { error } = await sb.from("buddy_chats").upsert(
        { user_id: actor, buddy_id: buddy.id, role: "buddy", text: auto.text, source: auto.source, auto_key: auto.key },
        { onConflict: "user_id,auto_key", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    const [messages, used] = await Promise.all([recent(sb, actor, 40), usedToday(sb, actor, t.today)]);
    return NextResponse.json({ ...base, buddy, messages, left: Math.max(0, base.limit - used) });
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
    if (risk === "crisis") {
      reply = CRISIS_REPLY; source = "safety";
    } else {
      const { ctx } = await loadCtx(sb, actor, t, access, buddy, state.days, state.stage.name);
      const careful = risk === "eating";
      const ai = aiReady() ? await askBuddy(systemPrompt(ctx, careful), [...history, { role: "me", text }]) : { text: null };
      if (ai.error && ai.error !== "no-key") console.error("캐릭터 답을 AI로 만들지 못했어요:", ai.error);
      reply = ai.text ?? ruleReply(text, ctx, careful);
      source = ai.text ? "ai" : "rule";
    }
    const { data: r, error: rErr } = await sb.from("buddy_chats")
      .insert({ user_id: actor, buddy_id: buddy.id, role: "buddy", text: reply, source }).select(COLS).single();
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
