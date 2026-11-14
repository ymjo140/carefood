/**
 * 오늘 내 기록으로 캐릭터 표정을 정하는 사실들 (서버 전용) — /api/me/mascot · /api/me/buddy 가 같이 쓴다. 규칙은 lib/mascot.ts.
 */
import { addDays, todayKst } from "@/lib/day";
import { DIARY_COLS, countedMeals, judgeDay, type DiaryRow } from "@/lib/challenges";
import { MEMBER_COLS, memberTarget, type ChallengeRow, type MemberRow } from "@/lib/challenge-groups";
import { planGroupAlerts } from "@/lib/challenge-alerts";
import { DEFAULT_PREFS, cleanPrefs, moodOf, type MascotFacts, type MascotPrefs, type MascotState } from "@/lib/mascot";
import { selectAll } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

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

export type TodayMood = {
  today: string; facts: MascotFacts; state: MascotState; streak: number; meals: number; lastFood: string | null;
  /** 오늘 합계와 내 목표 (숫자 체크·다음 끼니용) — 목표가 없으면 열량 2,000 · 단백질 80 · 나트륨 2,000 (식단 기록 화면과 같은 기본값) */
  totals: { kcal: number; protein: number; sodium: number }; goals: { kcal: number; protein: number; sodium: number };
};

export async function loadTodayMood(sb: Sb, actor: string): Promise<TodayMood> {
  const today = todayKst();
  const [diary, goal, everRes, lastRes] = await Promise.all([
    selectAll<DiaryRow>(() => sb.from("meal_diary").select(DIARY_COLS).eq("user_id", actor).gte("date", addDays(today, -60)).lte("date", today), "id"),
    sb.from("daily_nutrition_goals").select("daily_calories, daily_protein_g, max_sodium_mg").eq("user_id", actor).maybeSingle(),
    sb.from("meal_diary").select("id").eq("user_id", actor).limit(1),
    sb.from("meal_diary").select("food_name").eq("user_id", actor).eq("date", today).order("created_at", { ascending: false }).limit(1),
  ]);
  if (goal.error) throw new Error(goal.error.message);
  if (everRes.error) throw new Error(everRes.error.message);
  if (lastRes.error) throw new Error(lastRes.error.message);
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
  // 캐릭터를 고르면 표정·삐지기는 늘 켜짐 (끄려면 '캐릭터 없이')
  const state = moodOf(facts, { sulk: true, moods: true });
  const last = ((lastRes.data || []) as { food_name: string | null }[])[0];
  const sum = (f: "protein_g" | "sodium_mg") => todayRows.reduce((a, r) => a + (Number(r[f]) || 0), 0);
  return {
    today, facts, state, streak, meals: facts.todayMeals, lastFood: last?.food_name ?? null,
    totals: { kcal: facts.todayKcal, protein: Math.round(sum("protein_g")), sodium: Math.round(sum("sodium_mg")) },
    goals: { kcal: facts.goalKcal, protein: Number(goal.data?.daily_protein_g) || 80, sodium: Number(goal.data?.max_sodium_mg) || 2000 },
  };
}

type PrefRow = { mascot: string; mascot_sulk: boolean; mascot_moods: boolean; simple_mode: boolean };
/** 캐릭터 켜기/끄기 설정 (notification_prefs) — kind 가 'none' 이면 캐릭터 없이 */
export async function prefsOf(sb: Sb, actor: string): Promise<MascotPrefs> {
  const { data, error } = await sb.from("notification_prefs").select("mascot, mascot_sulk, mascot_moods, simple_mode").eq("user_id", actor).maybeSingle();
  if (error) throw new Error(error.message);
  const r = data as PrefRow | null;
  return r ? cleanPrefs({ kind: r.mascot, sulk: r.mascot_sulk, moods: r.mascot_moods, simple: r.simple_mode }) : DEFAULT_PREFS;
}
