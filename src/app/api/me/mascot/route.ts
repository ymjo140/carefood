import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { addDays, todayKst } from "@/lib/day";
import { DIARY_COLS, countedMeals, judgeDay, type DiaryRow } from "@/lib/challenges";
import { MEMBER_COLS, memberTarget, type ChallengeRow, type MemberRow } from "@/lib/challenge-groups";
import { planGroupAlerts } from "@/lib/challenge-alerts";
import { DEFAULT_PREFS, cleanPrefs, lineOf, moodOf, type MascotFacts, type MascotPrefs } from "@/lib/mascot";
import { selectAll } from "@/lib/supabase/all";

/**
 * GET  /api/me/mascot — 내 캐릭터 설정 + 지금 표정·한 줄 (내 기록으로만 정한다, 다른 사람에게 보이지 않는다)
 * PATCH { kind?, sulk?, moods?, simple? } — 캐릭터 고르기 · 삐지기 · 배불러요·걱정돼요 표정 · 간단 모드
 * 규칙은 lib/mascot.ts
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type PrefRow = { mascot: string; mascot_sulk: boolean; mascot_moods: boolean; simple_mode: boolean };

async function prefsOf(sb: Sb, actor: string): Promise<MascotPrefs> {
  const { data, error } = await sb.from("notification_prefs").select("mascot, mascot_sulk, mascot_moods, simple_mode").eq("user_id", actor).maybeSingle();
  if (error) throw new Error(error.message);
  const r = data as PrefRow | null;
  return r ? cleanPrefs({ kind: r.mascot, sulk: r.mascot_sulk, moods: r.mascot_moods, simple: r.simple_mode }) : DEFAULT_PREFS;
}

/** 오늘 내 챌린지를 해냈나 · 같이 하는 묶음이 다 같이 해냈나 (채우면 바로 아는 규칙만 — 하루가 끝나야 아는 규칙은 다음 날 알림으로) */
async function challengeToday(sb: Sb, actor: string, today: string, mine: DiaryRow[]) {
  const { data: ms, error } = await sb.from("community_challenge_members").select(`${MEMBER_COLS}, challenge_groups(id, challenge_id, start_on, member_count)`).eq("user_id", actor);
  if (error) throw new Error(error.message);
  const rows = (ms || []) as (MemberRow & { challenge_groups: { id: string; challenge_id: string; start_on: string; member_count: number } | null })[];
  if (!rows.length) return { done: false, together: false };
  const { data: cs, error: cErr } = await sb.from("community_challenges").select("id, slug, title, rule, metric, target, days, goal_days, is_active")
    .in("id", rows.map((m) => m.challenge_id));
  if (cErr) throw new Error(cErr.message);
  const challenges = new Map(((cs || []) as ChallengeRow[]).map((c) => [c.id, c]));
  const todayRows = mine.filter((r) => r.date === today);
  let done = false;
  const groups: { id: string; challenge_id: string; start_on: string }[] = [];
  for (const m of rows) {
    const c = challenges.get(m.challenge_id);
    const g = m.challenge_groups;
    if (!c?.is_active || m.started_on > today) continue;
    const from = g?.start_on || m.started_on;
    if (addDays(from, c.days - 1) < today) continue;
    if (judgeDay(c.metric, memberTarget(c, m), todayRows).ok) done = true;
    if (g && g.member_count >= 2) groups.push({ id: g.id, challenge_id: g.challenge_id, start_on: g.start_on });
  }
  if (!done || !groups.length) return { done, together: false };
  const { data: all, error: aErr } = await sb.from("community_challenge_members").select(MEMBER_COLS).in("group_id", groups.map((g) => g.id)).limit(1000);
  if (aErr) throw new Error(aErr.message);
  const others = [...new Set(((all || []) as MemberRow[]).map((m) => m.user_id))];
  const { data: d, error: dErr } = await sb.from("meal_diary").select(`user_id, ${DIARY_COLS}`).in("user_id", others).eq("date", today).limit(5000);
  if (dErr) throw new Error(dErr.message);
  const diary = new Map<string, DiaryRow[]>();
  for (const r of (d || []) as (DiaryRow & { user_id: string })[]) diary.set(r.user_id, [...(diary.get(r.user_id) || []), r]);
  // 오후 한낮(15시)으로 계획하면 '그날 안에 아는 규칙'의 다 같이 해냈어요만 나온다
  const plan = planGroupAlerts({ groups, challenges, members: (all || []) as MemberRow[], diary, today, hour: 15 });
  return { done, together: plan.some((a) => a.user === actor && a.key.endsWith(`:${today}`)) };
}

export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const sb = createServiceRoleClient() as Sb;
  const today = todayKst();
  try {
    const [prefs, diary, goal, everRes] = await Promise.all([
      prefsOf(sb, actor),
      selectAll<DiaryRow>(() => sb.from("meal_diary").select(DIARY_COLS).eq("user_id", actor).gte("date", addDays(today, -60)).lte("date", today), "id"),
      sb.from("daily_nutrition_goals").select("daily_calories").eq("user_id", actor).maybeSingle(),
      sb.from("meal_diary").select("id").eq("user_id", actor).limit(1),
    ]);
    if (goal.error) throw new Error(goal.error.message);
    if (everRes.error) throw new Error(everRes.error.message);
    const byDay = new Map<string, DiaryRow[]>();
    for (const r of diary) byDay.set(r.date, [...(byDay.get(r.date) || []), r]);
    const kcal = (rs: DiaryRow[]) => Math.round(rs.reduce((s, r) => s + (Number(r.calories) || 0), 0));
    const todayRows = byDay.get(today) || [];
    let streak = 0;
    for (let d = todayRows.length ? today : addDays(today, -1); byDay.has(d); d = addDays(d, -1)) streak++;
    const ch = todayRows.length ? await challengeToday(sb, actor, today, diary) : { done: false, together: false };
    const facts: MascotFacts = {
      todayRecords: todayRows.length, todayMeals: countedMeals(todayRows).size, todayKcal: kcal(todayRows),
      goalKcal: Number(goal.data?.daily_calories) || 2000,
      past: [1, 2, 3].map((i) => { const rs = byDay.get(addDays(today, -i)) || []; return { records: rs.length, kcal: kcal(rs) }; }),
      ever: (everRes.data || []).length > 0, doneToday: ch.done, togetherToday: ch.together, streak,
    };
    const state = moodOf(facts, prefs);
    const kind = prefs.kind === "none" ? null : prefs.kind;
    return NextResponse.json({
      prefs, mood: state.mood, welcome_back: state.welcomeBack, streak, meals: facts.todayMeals,
      line: kind ? lineOf(kind, state, { streak, meals: facts.todayMeals }) : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  try {
    const next = cleanPrefs(body || {}, await prefsOf(sb, actor));
    const { error } = await sb.from("notification_prefs").upsert({
      user_id: actor, mascot: next.kind, mascot_sulk: next.sulk, mascot_moods: next.moods, simple_mode: next.simple, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ prefs: next });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
