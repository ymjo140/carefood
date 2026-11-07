import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { addDays, isoDay, runProgress, type ChallengeMetric, type DiaryRow } from "@/lib/challenges";

/**
 * GET /api/community/challenges — 챌린지 목록 + 지금 하는 사람 수 + (참여했으면) 내 진행
 * POST { challenge_id } — 참여하기 (끝난 뒤 다시 누르면 오늘부터 다시)
 * DELETE { challenge_id } — 그만두기
 * 다른 사람의 기록은 보여 주지 않는다 — 사람 수만.
 */
type Row = { id: string; slug: string; title: string; rule: string; metric: ChallengeMetric; target: number; days: number; sort: number };
type Member = { challenge_id: string; user_id: string; started_on: string; finished_runs: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(sb: any, actor: string | null) {
  const today = isoDay(new Date());
  const { data: rows, error } = await sb.from("community_challenges").select("id, slug, title, rule, metric, target, days, sort").eq("is_active", true).order("sort");
  if (error) throw new Error(error.message);
  const challenges = (rows || []) as Row[];
  const { data: mems, error: mErr } = await sb.from("community_challenge_members").select("challenge_id, user_id, started_on, finished_runs").limit(20000);
  if (mErr) throw new Error(mErr.message);
  const members = (mems || []) as Member[];

  const mine = actor ? members.filter((m) => m.user_id === actor) : [];
  let diary: DiaryRow[] = [];
  if (mine.length) {
    const from = mine.map((m) => m.started_on).sort()[0];
    const { data, error: dErr } = await sb.from("meal_diary").select("date, meal_type, calories, protein_g, sugar_g, sodium_mg")
      .eq("user_id", actor).gte("date", from).lte("date", today).limit(5000);
    if (dErr) throw new Error(dErr.message);
    diary = (data || []) as DiaryRow[];
  }

  return challenges.map((c) => {
    const active = members.filter((m) => m.challenge_id === c.id && addDays(m.started_on, c.days - 1) >= today);
    const finishedPeople = members.filter((m) => m.challenge_id === c.id && (m.finished_runs > 0 || addDays(m.started_on, c.days - 1) < today)).length;
    const me = mine.find((m) => m.challenge_id === c.id);
    return {
      id: c.id, slug: c.slug, title: c.title, rule: c.rule, metric: c.metric, target: Number(c.target), days: c.days,
      active_count: active.length,
      finished_count: finishedPeople,
      me: me ? { ...runProgress(c.metric, Number(c.target), c.days, me.started_on, diary.filter((d) => d.date >= me.started_on), today), finished_runs: me.finished_runs } : null,
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
  const { challenge_id } = await request.json().catch(() => ({}));
  if (typeof challenge_id !== "string" || !UUID.test(challenge_id)) return NextResponse.json({ error: "challenge_id 필수" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: c, error: cErr } = await sb.from("community_challenges").select("id, days").eq("id", challenge_id).eq("is_active", true).maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!c) return NextResponse.json({ error: "없는 챌린지예요" }, { status: 404 });
  const today = isoDay(new Date());
  const { data: cur, error: mErr } = await sb.from("community_challenge_members").select("started_on, finished_runs").eq("challenge_id", challenge_id).eq("user_id", actor).maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (cur && addDays(cur.started_on, c.days - 1) >= today) return NextResponse.json({ error: "이미 하고 있어요" }, { status: 409 });
  const { error } = await sb.from("community_challenge_members").upsert(
    { challenge_id, user_id: actor, started_on: today, finished_runs: (cur?.finished_runs || 0) + (cur ? 1 : 0), joined_at: new Date().toISOString() },
    { onConflict: "challenge_id,user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const list = await load(sb, actor);
    return NextResponse.json({ challenge: list.find((x) => x.id === challenge_id) ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { challenge_id } = await request.json().catch(() => ({}));
  if (typeof challenge_id !== "string" || !UUID.test(challenge_id)) return NextResponse.json({ error: "challenge_id 필수" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { error } = await sb.from("community_challenge_members").delete().eq("challenge_id", challenge_id).eq("user_id", actor);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
