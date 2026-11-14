import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { addDays, daysBetween, todayKst } from "@/lib/day";
import { viewerFilters } from "@/lib/community-safety";
import { CODE_RE, JOIN_MESSAGES, groupPeriod, nicknames, type ChallengeRow, type GroupRow } from "@/lib/challenge-groups";
import { refCode, shareEvent } from "@/lib/share-links";

/**
 * GET  /api/j/[code] — 초대 링크를 받은 사람이 보는 것: 챌린지·기간·연 사람·같이 하는 사람(닉네임)·내 상태·연 사람의 인증 카드
 *   status: member(이미 같이 함) | open(들어올 수 있음) | closed(남은 날 3일 미만) | full | blocked
 * POST /api/j/[code] — 같이 하기 (가입 없이 익명 아이디로). 공유 링크로 들어왔으면 그 링크에 '같이 하기'를 달아 준다
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function find(sb: Sb, code: string) {
  const { data: g, error } = await sb.from("challenge_groups").select("*").eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!g) return null;
  const { data: c, error: cErr } = await sb.from("community_challenges").select("id, slug, title, rule, metric, target, days, goal_days, is_active").eq("id", g.challenge_id).maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!c || !c.is_active) return null;
  return { g: g as GroupRow, c: c as ChallengeRow };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code } = await params;
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "초대 링크를 찾지 못했어요" }, { status: 404 });
  const actor = await getActorId();
  const sb = createServiceRoleClient() as Sb;
  try {
    const found = await find(sb, code);
    if (!found) return NextResponse.json({ error: "초대 링크를 찾지 못했어요" }, { status: 404 });
    const { g, c } = found;
    const today = todayKst();
    const period = groupPeriod(g, c);
    const [{ data: ms, error: mErr }, { data: card, error: kErr }, filters] = await Promise.all([
      sb.from("community_challenge_members").select("user_id, joined_at").eq("group_id", g.id).order("joined_at").limit(50),
      sb.from("share_links").select("card_url").eq("group_id", g.id).eq("owner", g.host_id).is("revoked_at", null).not("card_url", "is", null).order("created_at", { ascending: false }).limit(1),
      viewerFilters(sb, actor),
    ]);
    if (mErr || kErr) throw new Error((mErr || kErr).message);
    const users = ((ms || []) as { user_id: string }[]).map((m) => m.user_id);
    const names = await nicknames(sb, [...new Set([g.host_id, ...users])]);
    let blocked = !!actor && filters.blocked.has(g.host_id);
    if (actor && !blocked) {
      const { data: b, error: bErr } = await sb.from("community_blocks").select("blocker_id").eq("blocker_id", g.host_id).eq("blocked_id", actor).limit(1);
      if (bErr) throw new Error(bErr.message);
      blocked = !!b?.length;
    }
    const remaining = c.days - Math.max(0, daysBetween(g.start_on, today));
    const status = actor && users.includes(actor) ? "member" : blocked ? "blocked" : remaining < 3 ? "closed" : g.member_count >= g.max_members ? "full" : "open";
    const lateBy = Math.max(0, daysBetween(g.start_on, today));
    return NextResponse.json({
      group: { id: g.id, code: g.code, ...period, member_count: g.member_count, max_members: g.max_members },
      challenge: { id: c.id, title: c.title, rule: c.rule, days: c.days },
      host: names.get(g.host_id) || "익명",
      // 같이 하는 사람은 첫 글자만 (아직 참여하지 않은 사람에게 닉네임을 다 보이지 않는다). 연 사람 이름은 초대에 이미 있다
      members: users.filter((u) => !filters.blocked.has(u)).slice(0, 8).map((u) => (names.get(u) || "익명").slice(0, 1)),
      status,
      starts_in: Math.max(0, daysBetween(today, g.start_on)),
      // 늦게 들어오면: 오늘부터 세고 성공 기준은 남은 날의 70%
      late: status === "open" && lateBy > 0 ? { remaining, goal: Math.ceil(remaining * (c.goal_days ? c.goal_days / c.days : 0.7)), from: today, ends_on: addDays(g.start_on, c.days - 1) } : null,
      card_url: card?.[0]?.card_url ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "초대 링크를 찾지 못했어요" }, { status: 404 });
  const actor = await getActorId();
  if (!actor) return noActor();
  const sb = createServiceRoleClient() as Sb;
  const limited = await rateLimit(sb, request, actor, "challenge");
  if (limited) return limited;
  try {
    const found = await find(sb, code);
    if (!found) return NextResponse.json({ error: "초대 링크를 찾지 못했어요" }, { status: 404 });
    const via = await refCode();
    const { data, error } = await sb.rpc("challenge_group_join", { p_group: found.g.id, p_user: actor, p_today: todayKst(), p_via: via });
    if (error) throw new Error(error.message);
    const status = data.status as string;
    if (status !== "joined" && status !== "moved" && status !== "already") {
      return NextResponse.json({ error: JOIN_MESSAGES[status] || "같이 하지 못했어요", status }, { status: status === "missing" ? 404 : 409 });
    }
    if (via && status !== "already") {
      try { await shareEvent(sb, via, actor, "join"); }
      catch (e) { console.error("공유 링크 전환을 적지 못했어요:", (e as Error).message); } // ds-allow: 세기는 보조 — 같이 하기는 이미 됐다
    }
    return NextResponse.json({ ok: true, status, group_id: found.g.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
