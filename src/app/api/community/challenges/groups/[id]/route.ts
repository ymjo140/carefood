import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { todayKst } from "@/lib/day";
import { viewerFilters } from "@/lib/community-safety";
import { diaryOf, groupPeriod, memberRun, nicknames, type ChallengeRow, type GroupRow, type MemberRow } from "@/lib/challenge-groups";
import { proofDays, proofKey } from "@/lib/challenge-proofs";
import { audienceOf, canSee } from "@/lib/community-visibility";

/**
 * GET  /api/community/challenges/groups/[id] — 묶음 보드 (같은 묶음 사람만 본다)
 *   사람끼리 비교하지 않는다 — 날짜 줄·해낸 날 수는 내 것만(me). 다른 사람은 '오늘 인증했는지'와 그 사진만.
 *   today: { total, proved } — "오늘 n명 중 m명 인증". 사진은 그 글을 볼 수 있을 때만(팔로워만 글이면 인증 표시만).
 *   성분 숫자는 보내지 않는다. 내가 차단한 사람은 빼고 보여 준다.
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
      sb.from("community_challenges").select("id, slug, title, rule, metric, target, days, goal_days, is_active, proof").eq("id", group.challenge_id).maybeSingle(),
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
    const myMember = members.find((m) => m.user_id === actor)!;
    const [diary, names, cheers, pd, todays, audience] = await Promise.all([
      diaryOf(sb, [actor], period.start_on, today < period.ends_on ? today : period.ends_on),
      nicknames(sb, users),
      sb.from("challenge_cheers").select("from_user, to_user").eq("group_id", id).eq("day", today),
      proofDays(sb, [challenge.id], [actor], period.start_on, today),
      sb.from("challenge_proofs").select("user_id, post_id, upload_id, created_at, community_uploads(url, taken_at), community_feed(id, user_id, visibility, is_active, hidden_by_reports)")
        .eq("challenge_id", challenge.id).eq("day", today).eq("status", "ok").in("user_id", users).order("created_at", { ascending: false }).limit(400),
      audienceOf(sb, actor),
    ]);
    if (cheers.error) throw new Error(cheers.error.message);
    if (todays.error) throw new Error(todays.error.message);
    const cheerRows = (cheers.data || []) as { from_user: string; to_user: string }[];
    type P = { user_id: string; post_id: string; community_uploads: { url: string; taken_at: string | null } | null; community_feed: { id: string; user_id: string; visibility: string; is_active: boolean; hidden_by_reports: boolean } | null };
    const proofOf = new Map<string, { photo: string | null; post_id: string | null; album: boolean }>();
    for (const r of (todays.data || []) as P[]) {
      if (proofOf.has(r.user_id)) continue; // 가장 최근 것 하나
      const f = r.community_feed;
      const seen = !!f && f.is_active && (r.user_id === actor || (!f.hidden_by_reports && canSee(f, audience)));
      proofOf.set(r.user_id, { photo: seen ? r.community_uploads?.url ?? null : null, post_id: seen ? r.post_id : null, album: !r.community_uploads?.taken_at });
    }
    const mine = memberRun(challenge, group, myMember, diary.get(actor) || [], today, pd.get(proofKey(challenge.id, actor)));
    const rows = shown.map((m) => ({
      user_id: m.user_id, nickname: names.get(m.user_id) || "익명", is_me: m.user_id === actor, is_host: m.user_id === group.host_id,
      today: proofOf.has(m.user_id) ? { proved: true, ...proofOf.get(m.user_id)! } : { proved: false, photo: null, post_id: null, album: false },
      cheered: cheerRows.some((x) => x.from_user === actor && x.to_user === m.user_id),
    })).sort((a, b) => Number(b.is_me) - Number(a.is_me) || a.nickname.localeCompare(b.nickname, "ko"));
    // 로그인 안 했으면 '다른 기기에서 이어 하려면 로그인' 안내를 띄운다
    const { data: auth } = await (await createServerSupabaseClient()).auth.getUser();
    return NextResponse.json({
      logged_in: !!auth?.user,
      group: { id: group.id, code: group.code, ...period, member_count: group.member_count, max_members: group.max_members, is_host: group.host_id === actor, finished: today > period.ends_on },
      challenge: { id: challenge.id, title: challenge.title, rule: challenge.rule, days: challenge.days, proof: challenge.proof === "none" ? "none" : "photo" },
      me: { days: mine.days.map((d) => ({ date: d.date, state: d.state })), done_count: mine.done_count, goal: mine.goal, reached: mine.reached },
      today: { total: rows.length, proved: rows.filter((r) => r.today.proved).length },
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
