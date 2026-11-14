import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";
import { addDays, kstDay, mondayOf, todayKst } from "@/lib/day";
import { DIARY_COLS, type DiaryRow } from "@/lib/challenges";
import { memberRun, type ChallengeRow, type GroupRow, type MemberRow } from "@/lib/challenge-groups";
import { asResult, selectAll, selectAllIn } from "@/lib/supabase/all";

/**
 * GET  /api/admin/challenges — 관리자: 인증 공유와 같이 하기가 도는지
 *   weeks: 최근 8주(월요일 시작, 한국 날짜) — 기록한 사람 · 공유한 사람 · 공유율 · 링크 본 사람 · 같이 시작 · 전환율
 *   completion: 최근 28일 안에 끝난 묶음의 완주율 — 혼자(1명) vs 같이(2명 이상)
 *   user_challenges: 사람이 만든 챌린지 최근 50개 (숨기기용)
 *   사람 수만, 개인 기록은 내보내지 않는다.
 * POST { id, active } — 사람이 만든 챌린지 숨기기·다시 보이기 (숨기면 목록·초대에서 빠진다)
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  await connection();
  const denied = await adminOnly();
  if (denied) return denied;
  const sb = createServiceRoleClient() as Sb;
  const today = todayKst();
  const firstMonday = addDays(mondayOf(today), -7 * 7);
  try {
    const [diary, links, events, ucs] = await Promise.all([
      // 1,000줄에서 잘리지 않게 끝까지 (lib/supabase/all.ts)
      asResult(selectAll(() => sb.from("meal_diary").select("user_id, date").gte("date", firstMonday).lte("date", today), "id", 2_000_000)),
      asResult(selectAll(() => sb.from("share_links").select("code, owner, shared_at").not("shared_at", "is", null).gte("shared_at", `${firstMonday}T00:00:00+09:00`), "code", 1_000_000)),
      asResult(selectAll(() => sb.from("share_events").select("code, visitor, type, day").gte("day", firstMonday), "id", 2_000_000)),
      sb.from("community_challenges").select("id, title, note, creator_id, is_active, created_at, metric, days").eq("kind", "user").order("created_at", { ascending: false }).limit(50),
    ]);
    for (const r of [diary, links, events, ucs]) if (r.error) throw new Error(r.error.message);

    // ── 주별 ──
    const weekOf = (d: string) => mondayOf(d);
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(firstMonday, i * 7));
    const recorders = new Map<string, Set<string>>(), sharers = new Map<string, Set<string>>(), visitors = new Map<string, Set<string>>(), joiners = new Map<string, Set<string>>();
    const add = (m: Map<string, Set<string>>, w: string, v: string) => (m.get(w) || m.set(w, new Set()).get(w)!).add(v);
    for (const r of (diary.data || []) as { user_id: string; date: string }[]) add(recorders, weekOf(r.date), r.user_id);
    for (const l of (links.data || []) as { owner: string; shared_at: string }[]) add(sharers, weekOf(kstDay(l.shared_at)), l.owner);
    for (const e of (events.data || []) as { code: string; visitor: string; type: string; day: string }[]) add(e.type === "join" ? joiners : e.type === "visit" ? visitors : new Map(), weekOf(e.day), `${e.code}|${e.visitor}`);
    const weekRows = weeks.map((w) => {
      const rec = recorders.get(w)?.size ?? 0, sh = sharers.get(w)?.size ?? 0, vi = visitors.get(w)?.size ?? 0, jo = joiners.get(w)?.size ?? 0;
      return { week: w, recorders: rec, sharers: sh, share_rate: rec ? Math.round((sh / rec) * 1000) / 10 : null, visits: vi, joins: jo, join_rate: vi ? Math.round((jo / vi) * 1000) / 10 : null };
    });

    // ── 완주율: 최근 28일 안에 끝난 묶음 ──
    const gs = await selectAll(() => sb.from("challenge_groups").select("*, community_challenges(id, slug, title, rule, metric, target, days, goal_days, is_active)")
      .gte("start_on", addDays(today, -28 - 30)).lte("start_on", today), "id", 1_000_000);
    const ended = (gs as (GroupRow & { community_challenges: ChallengeRow })[]).filter((g) => {
      const end = addDays(g.start_on, g.community_challenges.days - 1);
      return end < today && end >= addDays(today, -28);
    });
    const comp = { solo: { people: 0, reached: 0 }, together: { people: 0, reached: 0 } };
    if (ended.length) {
      const members = await selectAllIn<MemberRow>(ended.map((g) => g.id), 200, (p) => sb.from("community_challenge_members").select("challenge_id, user_id, started_on, joined_on, goal_days_eff, group_id, finished_runs, show_values, target_eff")
        .in("group_id", p), ["challenge_id", "user_id"], 1_000_000);
      const users = [...new Set(members.map((m) => m.user_id))];
      const from = ended.map((g) => g.start_on).sort()[0];
      const dr = await selectAllIn(users, 200, (p) => sb.from("meal_diary").select(`user_id, ${DIARY_COLS}`).in("user_id", p).gte("date", from).lte("date", today), "id", 2_000_000);
      const byUser = new Map<string, DiaryRow[]>();
      for (const r of (dr || []) as (DiaryRow & { user_id: string })[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) || []), r]);
      for (const m of members) {
        const g = ended.find((x) => x.id === m.group_id)!;
        const end = addDays(g.start_on, g.community_challenges.days - 1);
        const run = memberRun(g.community_challenges, g, m, byUser.get(m.user_id) || [], end);
        const bucket = g.member_count >= 2 ? comp.together : comp.solo;
        bucket.people += 1;
        if (run.reached) bucket.reached += 1;
      }
    }

    // ── 사람이 만든 챌린지 ──
    const list = (ucs.data || []) as { id: string; title: string; note: string | null; creator_id: string; is_active: boolean; created_at: string }[];
    const ids = list.map((c) => c.id);
    const creators = [...new Set(list.map((c) => c.creator_id))];
    const [mc, names] = await Promise.all([
      ids.length ? asResult(selectAllIn(ids, 100, (p) => sb.from("community_challenge_members").select("challenge_id").in("challenge_id", p), ["challenge_id", "user_id"], 1_000_000)) : { data: [], error: null },
      creators.length ? sb.from("community_profiles").select("actor_id, nickname").in("actor_id", creators) : { data: [], error: null },
    ]);
    if (mc.error || names.error) throw new Error((mc.error || names.error).message);
    const count = new Map<string, number>();
    for (const m of (mc.data || []) as { challenge_id: string }[]) count.set(m.challenge_id, (count.get(m.challenge_id) || 0) + 1);
    const nick = new Map<string, string>(((names.data || []) as { actor_id: string; nickname: string }[]).map((p) => [p.actor_id, p.nickname]));

    return NextResponse.json({
      weeks: weekRows,
      completion: comp,
      user_challenges: list.map((c) => ({ id: c.id, title: c.title, note: c.note, creator: nick.get(c.creator_id) || "익명", is_active: c.is_active, created_at: c.created_at, people: count.get(c.id) || 0 })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { id, active } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !UUID.test(id) || typeof active !== "boolean") return NextResponse.json({ error: "챌린지를 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  // 사람이 만든 것만 (공식 챌린지는 여기서 끄지 않는다)
  const { data, error } = await sb.from("community_challenges").update({ is_active: active }).eq("id", id).eq("kind", "user").select("id, is_active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "사람이 만든 챌린지만 숨길 수 있어요" }, { status: 404 });
  return NextResponse.json({ ok: true, is_active: data[0].is_active });
}
