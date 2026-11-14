/**
 * 재료 캐릭터 서버 쪽 — 보자기 받기(가입·연속 30일·시즌 참여)·풀기·같이 다니기, 지금 표정과 한 줄. 규칙은 lib/buddy.ts · lib/buddy-lines.ts.
 */
import { addDays, kstDay } from "@/lib/day";
import { selectAll } from "@/lib/supabase/all";
import {
  STREAK_WRAP_DAYS, buddyName, ingredientOf, pickIngredient, pickPersonality, seedOf, stageOf, wrapKey,
  type IngredientKey, type PersonalityKey, type WrapKind,
} from "@/lib/buddy";
import { buddyLine, situationOf } from "@/lib/buddy-lines";
import type { TodayMood } from "@/lib/mascot-facts";
import { checkLines } from "@/lib/buddy-check";
import { hasPerk, type Access } from "@/lib/plans";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type BuddyRow = { id: string; user_id: string; ingredient: IngredientKey; personality: PersonalityKey; active: boolean; hatched_at: string };
export type WrapRow = { id: string; kind: WrapKind; key: string; earned_at: string };
const BUDDY_COLS = "id, user_id, ingredient, personality, active, hatched_at";

/** 받을 보자기가 있으면 넣는다 (같은 열쇠는 한 번만 — unique(user_id, key)) */
export async function grantWraps(sb: Sb, actor: string, t: Pick<TodayMood, "today" | "streak" | "facts">) {
  const rows: { user_id: string; kind: WrapKind; key: string }[] = [{ user_id: actor, kind: "start", key: wrapKey.start() }];
  if (t.streak >= STREAK_WRAP_DAYS) {
    // 30일째가 된 날 — 오늘 기록했으면 오늘부터, 아니면 어제부터 거꾸로 센다
    const end = t.facts.todayRecords ? t.today : addDays(t.today, -1);
    const mark = addDays(end, -(t.streak % STREAK_WRAP_DAYS));
    rows.push({ user_id: actor, kind: "streak", key: wrapKey.streak(mark) });
  }
  const { data: ms, error: mErr } = await sb.from("community_challenge_members").select("challenge_id").eq("user_id", actor).limit(500);
  if (mErr) throw new Error(mErr.message);
  const cids = [...new Set(((ms || []) as { challenge_id: string }[]).map((m) => m.challenge_id))];
  let seasonIds: string[] = [];
  if (cids.length) {
    const { data: cs, error: cErr } = await sb.from("community_challenges").select("season_id").in("id", cids).eq("kind", "season");
    if (cErr) throw new Error(cErr.message);
    seasonIds = [...new Set(((cs || []) as { season_id: string | null }[]).map((c) => c.season_id).filter(Boolean))] as string[];
  }
  if (seasonIds.length) {
    const { data: ss, error: sErr } = await sb.from("challenge_seasons").select("slug").in("id", seasonIds);
    if (sErr) throw new Error(sErr.message);
    for (const s of (ss || []) as { slug: string }[]) rows.push({ user_id: actor, kind: "season", key: wrapKey.season(s.slug) });
  }
  const { error } = await sb.from("buddy_wraps").upsert(rows, { onConflict: "user_id,key", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/** 같이 기록한 날 수 — 캐릭터를 만난 날부터 기록이 있는 날 */
async function daysTogether(sb: Sb, actor: string, since: string) {
  const rows = await selectAll<{ date: string }>(() => sb.from("meal_diary").select("id, date").eq("user_id", actor).gte("date", since), "id");
  return new Set(rows.map((r) => r.date)).size;
}

export async function loadBuddyState(sb: Sb, actor: string, t: TodayMood, access: Access) {
  await grantWraps(sb, actor, t);
  const [bRes, wRes] = await Promise.all([
    sb.from("buddies").select(BUDDY_COLS).eq("user_id", actor).order("hatched_at", { ascending: true }).limit(100),
    sb.from("buddy_wraps").select("id, kind, key, earned_at").eq("user_id", actor).is("opened_at", null).order("earned_at", { ascending: true }),
  ]);
  if (bRes.error) throw new Error(bRes.error.message);
  if (wRes.error) throw new Error(wRes.error.message);
  const buddies = (bRes.data || []) as BuddyRow[];
  const active = buddies.find((b) => b.active) ?? null;
  const since = buddies.length ? kstDay(buddies[0].hatched_at) : t.today;
  const days = buddies.length ? await daysTogether(sb, actor, since) : 0;
  const view = (b: BuddyRow) => ({ id: b.id, ingredient: b.ingredient, personality: b.personality, name: buddyName(b.ingredient, b.personality), active: b.active, hatched_on: kstDay(b.hatched_at) });
  let line: string | null = null, situation = null as ReturnType<typeof situationOf> | null;
  if (active) {
    situation = situationOf({ mood: t.state.mood, welcomeBack: t.state.welcomeBack, todayRecords: t.facts.todayRecords, streak: t.streak, hatchedToday: kstDay(active.hatched_at) === t.today });
    line = buddyLine(active.ingredient, active.personality, situation, { food: t.lastFood, days: t.streak, seed: seedOf(actor, t.today) });
  }
  return {
    buddy: active ? view(active) : null,
    collection: buddies.map(view),
    wraps: ((wRes.data || []) as WrapRow[]).map((w) => ({ id: w.id, kind: w.kind, key: w.key })),
    days, stage: stageOf(days), situation, line,
    // 기록 직후 숫자 체크 — 오늘 기록이 있고 구독 기능(check)이 있을 때만 (체험 기간엔 모두)
    check: active && t.facts.todayRecords > 0 && hasPerk(access, "check") ? checkLines(t.totals, t.goals) : null,
  };
}

/** 보자기 풀기 — 재료·성격을 정하고 DB 함수로 한 번만 연다 */
export async function openWrap(sb: Sb, actor: string, wrapId: string) {
  const { data: w, error } = await sb.from("buddy_wraps").select("id, kind, key, opened_at").eq("id", wrapId).eq("user_id", actor).maybeSingle();
  if (error) throw new Error(error.message);
  if (!w) return { error: "없는 보자기예요", status: 404 as const };
  if (w.opened_at) return { error: "이미 푼 보자기예요", status: 409 as const };
  let month = Number(kstDay(new Date()).slice(5, 7));
  if (w.kind === "season") {
    const slug = String(w.key).replace(/^season:/, "");
    const { data: s, error: sErr } = await sb.from("challenge_seasons").select("start_on").eq("slug", slug).maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (s?.start_on) month = Number(String(s.start_on).slice(5, 7));
  }
  const ingredient = pickIngredient(w.kind as WrapKind, month, Math.random);
  const personality = pickPersonality(Math.random);
  const { data: b, error: oErr } = await sb.rpc("buddy_open", { p_user: actor, p_wrap: wrapId, p_ingredient: ingredient, p_personality: personality });
  if (oErr) {
    if (oErr.code === "P0001") return { error: oErr.message, status: 409 as const };
    throw new Error(oErr.message);
  }
  const row = b as BuddyRow;
  return { buddy: { id: row.id, ingredient: row.ingredient, personality: row.personality, name: buddyName(row.ingredient, row.personality), active: row.active, rare: ingredientOf(row.ingredient)?.rarity !== "common" } };
}
