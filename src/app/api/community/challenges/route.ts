import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { addDays, todayKst } from "@/lib/day";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { ensureNickname } from "@/lib/community-profile";
import { DIARY_COLS, type DiaryRow } from "@/lib/challenges";
import { JOIN_MESSAGES, memberRun, openGroup, startDate, type ChallengeRow, type GroupRow, type MemberRow, type StartChoice } from "@/lib/challenge-groups";
import { asResult, selectAll } from "@/lib/supabase/all";

/**
 * GET /api/community/challenges — 공식 챌린지 + 내가 하는 사람이 만든 챌린지(kind user, 위에) + 지금 하는 사람 수 + (참여했으면) 내 진행과 내 묶음(초대 코드·인원)
 * POST { challenge_id, start?: "today"|"tomorrow"|"monday" } — 참여하기 = 내 묶음을 연다 (끝난 뒤 다시 누르면 새 묶음)
 *   start 를 주면 그날 시작하는 묶음 (친구와 같이 시작하려고 날짜를 정할 때). 응답에 초대 코드
 * DELETE { challenge_id } — 그만두기 (묶음에서 빠진다)
 * 다른 사람의 기록은 보여 주지 않는다 — 사람 수만. 같은 묶음 사람끼리는 진행표(/api/community/challenges/groups/[id])에서 해낸 날만.
 */
type Row = ChallengeRow & { sort: number };
type Member = MemberRow & { challenge_groups: Pick<GroupRow, "start_on"> | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(sb: any, actor: string | null) {
  const today = todayKst();
  const { data: rows, error } = await sb.from("community_challenges").select("id, slug, title, rule, metric, target, days, goal_days, is_active, sort")
    .eq("is_active", true).eq("kind", "official").order("sort");
  if (error) throw new Error(error.message);
  const challenges = (rows || []) as (Row & { kind?: string; creator_id?: string | null; note?: string | null })[];
  const members = await selectAll<Member>(() => sb.from("community_challenge_members")
    .select("challenge_id, user_id, started_on, joined_on, goal_days_eff, group_id, finished_runs, show_values, challenge_groups(start_on)"), ["challenge_id", "user_id"], 1_000_000);
  // 내가 하는 '사람이 만든' 챌린지도 목록 위에 (링크로만 들어가는 것이라 공식 목록에는 없다)
  const myUserIds = actor ? [...new Set(members.filter((m) => m.user_id === actor).map((m) => m.challenge_id))].filter((id) => !challenges.some((c) => c.id === id)) : [];
  if (myUserIds.length) {
    const { data: ur, error: uErr } = await sb.from("community_challenges").select("id, slug, title, rule, metric, target, days, goal_days, is_active, sort, kind, creator_id, note")
      .in("id", myUserIds).eq("is_active", true);
    if (uErr) throw new Error(uErr.message);
    challenges.unshift(...((ur || []) as typeof challenges));
  }
  const endOf = (m: Member, c: Row) => addDays(m.challenge_groups?.start_on || m.started_on, c.days - 1);

  const mine = actor ? members.filter((m) => m.user_id === actor) : [];
  let diary: DiaryRow[] = [];
  const groups = new Map<string, GroupRow>();
  if (mine.length) {
    const from = mine.map((m) => m.started_on).sort()[0];
    const gids = mine.map((m) => m.group_id).filter(Boolean) as string[];
    const [d, g] = await Promise.all([
      asResult(selectAll(() => sb.from("meal_diary").select(DIARY_COLS).eq("user_id", actor).gte("date", from).lte("date", today), "id")),
      gids.length ? sb.from("challenge_groups").select("*").in("id", gids) : { data: [], error: null },
    ]);
    if (d.error) throw new Error(d.error.message);
    if (g.error) throw new Error(g.error.message);
    diary = (d.data || []) as DiaryRow[];
    for (const r of (g.data || []) as GroupRow[]) groups.set(r.id, r);
  }

  return challenges.map((c) => {
    const active = members.filter((m) => m.challenge_id === c.id && endOf(m, c) >= today);
    const finishedPeople = members.filter((m) => m.challenge_id === c.id && (m.finished_runs > 0 || endOf(m, c) < today)).length;
    const me = mine.find((m) => m.challenge_id === c.id);
    const g = me?.group_id ? groups.get(me.group_id) ?? null : null;
    return {
      id: c.id, slug: c.slug, title: c.title, rule: c.rule, metric: c.metric, target: Number(c.target), days: c.days,
      kind: c.kind === "user" ? "user" : "official", mine_created: !!actor && c.creator_id === actor, note: c.note ?? null,
      active_count: active.length,
      finished_count: finishedPeople,
      me: me ? {
        ...memberRun(c, g, me, diary, today), finished_runs: me.finished_runs,
        group: g ? { id: g.id, code: g.code, start_on: g.start_on, member_count: g.member_count, is_host: g.host_id === actor } : null,
      } : null,
    };
  });
}

export async function GET() {
  await connection();
  const actor = await getActorId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    return NextResponse.json({ challenges: await load(sb, actor) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { challenge_id, start, nickname } = await request.json().catch(() => ({}));
  if (typeof challenge_id !== "string" || !UUID.test(challenge_id)) return NextResponse.json({ error: "챌린지를 골라 주세요" }, { status: 400 });
  const choice: StartChoice = start === "tomorrow" || start === "monday" ? start : "today";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const limited = await rateLimit(sb, request, actor, "challenge");
  if (limited) return limited;
  const today = todayKst();
  // 오늘 시작으로 '참여하기'를 눌렀는데 이미 하고 있으면 그대로 (두 번 눌러도 새 묶음이 생기지 않게)
  if (choice === "today") {
    const { data: cur, error: mErr } = await sb.from("community_challenge_members").select("started_on, challenge_groups(start_on), community_challenges(days)")
      .eq("challenge_id", challenge_id).eq("user_id", actor).maybeSingle();
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    const from = cur?.challenge_groups?.start_on || cur?.started_on;
    if (cur && from && addDays(from, (cur.community_challenges?.days || 7) - 1) >= today) return NextResponse.json({ error: "이미 하고 있어요" }, { status: 409 });
  }
  try {
    await ensureNickname(sb, actor, nickname); // 진행표·초대에 보일 이름
    const r = await openGroup(sb, challenge_id, actor, startDate(choice, today));
    if (r.status !== "opened") return NextResponse.json({ error: JOIN_MESSAGES[r.status] || "참여하지 못했어요" }, { status: r.status === "missing" ? 404 : 409 });
    const list = await load(sb, actor);
    return NextResponse.json({ challenge: list.find((x) => x.id === challenge_id) ?? null, code: r.code, group_id: r.group_id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { challenge_id } = await request.json().catch(() => ({}));
  if (typeof challenge_id !== "string" || !UUID.test(challenge_id)) return NextResponse.json({ error: "챌린지를 골라 주세요" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { error } = await sb.rpc("challenge_group_leave", { p_challenge: challenge_id, p_user: actor });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
