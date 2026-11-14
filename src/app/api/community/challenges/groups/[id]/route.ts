import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { todayKst } from "@/lib/day";
import { viewerFilters } from "@/lib/community-safety";
import { diaryOf, groupPeriod, memberRun, nicknames, type ChallengeRow, type GroupRow, type MemberRow } from "@/lib/challenge-groups";

/**
 * GET  /api/community/challenges/groups/[id] — 묶음 진행표 (같은 묶음 사람만 본다)
 *   사람마다 날짜 줄(해냄·못 함·오늘·앞으로·들어오기 전)과 해낸 날 수만. 성분 숫자는 보내지 않는다.
 *   내가 차단한 사람은 빼고 보여 준다.
 * POST /api/community/challenges/groups/[id] { to } — 응원하기 (같은 사람에게 하루 한 번)
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "묶음을 찾지 못했어요" }, { status: 404 });
  const actor = await getActorId();
  if (!actor) return noActor();
  const sb = createServiceRoleClient() as Sb;
  try {
    const { data: g, error } = await sb.from("challenge_groups").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!g) return NextResponse.json({ error: "묶음을 찾지 못했어요" }, { status: 404 });
    const group = g as GroupRow;
    const [{ data: c, error: cErr }, { data: ms, error: mErr }] = await Promise.all([
      sb.from("community_challenges").select("id, slug, title, rule, metric, target, days, goal_days, is_active").eq("id", group.challenge_id).maybeSingle(),
      sb.from("community_challenge_members").select("challenge_id, user_id, started_on, joined_on, goal_days_eff, group_id, finished_runs, show_values, target_eff").eq("group_id", id).limit(200),
    ]);
    if (cErr || mErr) throw new Error((cErr || mErr).message);
    const members = (ms || []) as MemberRow[];
    if (!members.some((m) => m.user_id === actor)) {
      return NextResponse.json({ error: "같이 하는 사람만 진행표를 볼 수 있어요", code: group.code }, { status: 403 });
    }
    const challenge = c as ChallengeRow;
    const period = groupPeriod(group, challenge);
    const today = todayKst();
    const filters = await viewerFilters(sb, actor);
    const shown = members.filter((m) => m.user_id === actor || !filters.blocked.has(m.user_id));
    const users = shown.map((m) => m.user_id);
    const [diary, names, cheers] = await Promise.all([
      diaryOf(sb, users, period.start_on, today < period.ends_on ? today : period.ends_on),
      nicknames(sb, users),
      sb.from("challenge_cheers").select("from_user, to_user").eq("group_id", id).eq("day", today),
    ]);
    if (cheers.error) throw new Error(cheers.error.message);
    const cheerRows = (cheers.data || []) as { from_user: string; to_user: string }[];
    const rows = shown.map((m) => {
      const run = memberRun(challenge, group, m, diary.get(m.user_id) || [], today);
      return {
        user_id: m.user_id, nickname: names.get(m.user_id) || "익명", is_me: m.user_id === actor, is_host: m.user_id === group.host_id,
        days: run.days.map((d) => ({ date: d.date, state: d.state })), done_count: run.done_count, goal: run.goal, reached: run.reached,
        cheered: cheerRows.some((x) => x.from_user === actor && x.to_user === m.user_id),
      };
    }).sort((a, b) => Number(b.is_me) - Number(a.is_me) || b.done_count - a.done_count || a.nickname.localeCompare(b.nickname));
    // 로그인 안 했으면 '다른 기기에서 이어 하려면 로그인' 안내를 띄운다
    const { data: auth } = await (await createServerSupabaseClient()).auth.getUser();
    return NextResponse.json({
      logged_in: !!auth?.user,
      group: { id: group.id, code: group.code, ...period, member_count: group.member_count, max_members: group.max_members, is_host: group.host_id === actor, finished: today > period.ends_on },
      challenge: { id: challenge.id, title: challenge.title, rule: challenge.rule, days: challenge.days },
      members: rows,
      cheers_received: cheerRows.filter((x) => x.to_user === actor).length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "묶음을 찾지 못했어요" }, { status: 404 });
  const actor = await getActorId();
  if (!actor) return noActor();
  const { to } = await request.json().catch(() => ({}));
  if (typeof to !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(to)) return NextResponse.json({ error: "응원할 사람을 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const limited = await rateLimit(sb, request, actor, "challenge");
  if (limited) return limited;
  const { data, error } = await sb.rpc("challenge_cheer", { p_group: id, p_from: actor, p_to: to, p_day: todayKst() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data.status === "not_member") return NextResponse.json({ error: "같은 묶음 사람만 응원할 수 있어요" }, { status: 403 });
  if (data.status === "self") return NextResponse.json({ error: "나에게는 응원할 수 없어요" }, { status: 400 });
  return NextResponse.json({ ok: true, status: data.status });
}
