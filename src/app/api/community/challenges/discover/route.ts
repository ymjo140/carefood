import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import { addDays, todayKst } from "@/lib/day";
import { DIARY_COLS, type DiaryRow } from "@/lib/challenges";
import { MEMBER_COLS, diaryOf, memberRun, type ChallengeRow, type MemberRow } from "@/lib/challenge-groups";
import { nearestTier, ruleOf } from "@/lib/challenge-rules";
import { seasonsAround } from "@/lib/seasons";
import { selectAll } from "@/lib/supabase/all";

/**
 * GET /api/community/challenges/discover — 나에게 맞는 챌린지(최대 3개) + 챌린지 순위
 *  순위는 챌린지끼리만 (사람 이름·열량 숫자 없음). 기본·시즌·공개한 사용자 챌린지만 (링크로만인 것은 빼기).
 *   - 많이 하는: 최근 7일 시작한 사람 수
 *   - 끝까지 많이 한: 최근 4주에 끝난 사람 중 목표를 채운 비율 (끝난 사람 10명 미만은 빼기)
 *   - 친구들이 하는: 내가 팔로우한 사람이 지금 하는 것 (몇 명인지만)
 *  추천(위에서부터 3개까지): 열량 구간(기록 목표에 가장 가까운 구간) · 단백질이 목표의 70% 미만인 날이 절반 이상이면 단백질 채우기 ·
 *   아침 기록이 주 2번 이하면 아침 챙겨 먹기 · 기록이 띄엄띄엄이면 매일 기록하기. 이미 하는 규칙은 뺀다. 질환 관련 목표는 쓰지 않는다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = ChallengeRow & { kind: string; visibility: string; season_id: string | null; challenge_seasons?: { title: string; start_on: string; days: number } | null };
type Mem = MemberRow & { joined_at: string; challenge_groups: { start_on: string } | null };
const MIN_FINISHED = 10;

export async function GET() {
  await connection();
  const actor = await getActorId();
  const sb = createServiceRoleClient() as Sb;
  const today = todayKst();
  try {
    const { current } = seasonsAround(today);
    const { data: cs, error } = await sb.from("community_challenges")
      .select("id, slug, title, rule, metric, target, days, goal_days, is_active, kind, visibility, season_id, challenge_seasons(title, start_on, days)")
      .eq("is_active", true).or("kind.eq.official,kind.eq.season,and(kind.eq.user,visibility.eq.public)").limit(2000);
    if (error) throw new Error(error.message);
    const rows = ((cs || []) as Row[]).filter((c) => c.kind !== "season" || c.challenge_seasons?.start_on && addDays(c.challenge_seasons.start_on, c.challenge_seasons.days - 1) >= today);
    const byId = new Map(rows.map((c) => [c.id, c]));
    const members = rows.length ? await selectAll<Mem>(() => sb.from("community_challenge_members").select(`${MEMBER_COLS}, joined_at, challenge_groups(start_on)`)
      .in("challenge_id", rows.map((c) => c.id)), ["challenge_id", "user_id"], 200_000) : [];
    const endOf = (m: Mem, c: Row) => addDays(m.challenge_groups?.start_on || m.started_on, c.days - 1);
    const meta = (c: Row) => c.kind === "season" ? `${(c.challenge_seasons?.title || "시즌").split(" · ")[0]} · ${c.days}일`
      : c.kind === "user" ? `사용자 챌린지 · ${c.days}일` : `기본 · ${c.days}일`;
    const row = (c: Row, value: string) => ({ id: c.id, title: c.title, meta: meta(c), value, kind: c.kind, metric: c.metric });

    // 많이 하는
    const weekAgo = Date.now() - 7 * 86400e3;
    const started = new Map<string, number>();
    for (const m of members) if (Date.parse(m.joined_at) >= weekAgo) started.set(m.challenge_id, (started.get(m.challenge_id) || 0) + 1);
    const popular = [...started].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => row(byId.get(id)!, `${n}명`));

    // 끝까지 많이 한 — 최근 4주에 끝난 사람
    const ended = members.filter((m) => { const c = byId.get(m.challenge_id)!; const e = endOf(m, c); return e < today && e >= addDays(today, -28); }).slice(0, 3000);
    const completed: ReturnType<typeof row>[] = [];
    if (ended.length) {
      const from = ended.map((m) => m.challenge_groups?.start_on || m.started_on).sort()[0];
      const diary = await diaryOf(sb, [...new Set(ended.map((m) => m.user_id))], from, addDays(today, -1));
      const by = new Map<string, { n: number; ok: number }>();
      for (const m of ended) {
        const c = byId.get(m.challenge_id)!;
        const run = memberRun(c, m.challenge_groups ? { start_on: m.challenge_groups.start_on } : null, m, diary.get(m.user_id) || [], today);
        const x = by.get(c.id) || { n: 0, ok: 0 };
        x.n++; if (run.reached) x.ok++;
        by.set(c.id, x);
      }
      completed.push(...[...by].filter(([, x]) => x.n >= MIN_FINISHED).sort((a, b) => b[1].ok / b[1].n - a[1].ok / a[1].n).slice(0, 5)
        .map(([id, x]) => row(byId.get(id)!, `${Math.round((x.ok / x.n) * 100)}%`)));
    }

    // 친구들이 하는
    let friends: ReturnType<typeof row>[] = [];
    let following: string[] = [];
    if (actor) {
      const { data: fs, error: fErr } = await sb.from("community_follows").select("following_id").eq("follower_id", actor).limit(1000);
      if (fErr) throw new Error(fErr.message);
      following = ((fs || []) as { following_id: string }[]).map((f) => f.following_id);
      const set = new Set(following);
      const cnt = new Map<string, number>();
      for (const m of members) if (set.has(m.user_id) && endOf(m, byId.get(m.challenge_id)!) >= today) cnt.set(m.challenge_id, (cnt.get(m.challenge_id) || 0) + 1);
      friends = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => row(byId.get(id)!, `${n}명`));
    }

    // 나에게 맞는 챌린지
    type Pick = { kind: "season" | "template"; challenge_id?: string; metric: string; target: number; days: number; title: string; reason: string };
    const picks: Pick[] = [];
    if (actor) {
      const [d, g, mine] = await Promise.all([
        selectAll<DiaryRow>(() => sb.from("meal_diary").select(DIARY_COLS).eq("user_id", actor).gte("date", addDays(today, -14)).lt("date", today), "id"),
        sb.from("daily_nutrition_goals").select("daily_calories, daily_protein_g").eq("user_id", actor).maybeSingle(),
        sb.from("community_challenge_members").select("challenge_id, started_on, challenge_groups(start_on), community_challenges(metric, days)").eq("user_id", actor),
      ]);
      if (g.error || mine.error) throw new Error((g.error || mine.error).message);
      type MyRow = { started_on: string; challenge_groups: { start_on: string } | null; community_challenges: { metric: string; days: number } | null };
      const doing = new Set(((mine.data || []) as MyRow[]).filter((m) => m.community_challenges && addDays(m.challenge_groups?.start_on || m.started_on, m.community_challenges.days - 1) >= today)
        .map((m) => m.community_challenges!.metric));
      const goalKcal = Number(g.data?.daily_calories) || null;
      const goalP = Number(g.data?.daily_protein_g) || 60;
      const days = new Map<string, DiaryRow[]>();
      for (const r of d) days.set(r.date, [...(days.get(r.date) || []), r]);
      const recorded = days.size;
      const add = (p: Pick) => { if (picks.length < 3 && !doing.has(p.metric) && !picks.some((x) => x.metric === p.metric)) picks.push(p); };
      const tpl = (metric: string, target: number, days: number, reason: string) => {
        const spec = ruleOf(metric)!;
        add({ kind: "template", metric, target, days, title: spec.title(days, target), reason });
      };
      // 1) 열량 구간
      const tier = nearestTier(goalKcal);
      const seasonKcal = current ? rows.find((c) => c.kind === "season" && c.metric === "kcal_band" && c.challenge_seasons?.start_on === current.start_on) : undefined;
      const kcalReason = goalKcal ? `기록 목표 ${goalKcal.toLocaleString("ko-KR")}kcal과 가장 가까운 ${tier.toLocaleString("ko-KR")}kcal 구간 · 숫자는 나만 봐요` : `기록 목표가 없어 ${tier.toLocaleString("ko-KR")}kcal 구간부터 · 숫자는 나만 봐요`;
      if (seasonKcal && current && addDays(current.start_on, current.days - 7) >= today) add({ kind: "season", challenge_id: seasonKcal.id, metric: "kcal_band", target: tier, days: current.days, title: seasonKcal.title, reason: kcalReason });
      else if (recorded >= 3) tpl("kcal_band", tier, 30, kcalReason);
      // 2) 단백질
      const low = [...days.values()].filter((rs) => rs.reduce((s, r) => s + (Number(r.protein_g) || 0), 0) < goalP * 0.7).length;
      if (recorded >= 3 && low * 2 >= recorded) tpl("protein_min", Math.min(150, Math.max(30, Math.round(goalP / 5) * 5)), 14, `2주 중 ${low}일 단백질이 목표의 70%에 못 미쳤어요`);
      // 3) 아침
      const bf = [...days.entries()].filter(([day, rs]) => day >= addDays(today, -7) && rs.some((r) => r.meal_type === "breakfast")).length;
      if (recorded >= 3 && bf <= 2) tpl("breakfast", 1, 14, `지난 7일 아침 기록이 ${bf}번이었어요`);
      // 4) 띄엄띄엄
      if (recorded < 7) tpl("record_any", 1, 14, recorded ? `지난 2주 중 ${recorded}일 기록했어요` : "처음이라면 매일 한 끼 기록부터");
      // 채우기: 시즌 주제
      const lead = current ? rows.find((c) => c.kind === "season" && c.challenge_seasons?.start_on === current.start_on && c.metric !== "kcal_band" && c.metric !== "macro_type") : undefined;
      if (lead && current && addDays(current.start_on, current.days - 7) >= today) add({ kind: "season", challenge_id: lead.id, metric: lead.metric, target: Number(lead.target), days: lead.days, title: lead.title, reason: "지금 시즌에서 많이 하는 챌린지" });
    }

    return NextResponse.json({ picks, ranks: { popular, completed, friends }, follows: following.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
