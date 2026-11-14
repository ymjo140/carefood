import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { daysBetween, todayKst } from "@/lib/day";
import { ensureSeasons, seasonEnd } from "@/lib/seasons";
import { ensureNickname } from "@/lib/community-profile";
import { ensurePersonalTarget, newCode } from "@/lib/challenge-groups";
import { KCAL_TIERS, checkPersonalKcal, nearestTier, ruleOf } from "@/lib/challenge-rules";
import { macroOf } from "@/lib/challenges";
import { selectAll } from "@/lib/supabase/all";

/**
 * GET  /api/community/seasons — 지금 시즌·다음 시즌 (없으면 만든다), 시즌 안 챌린지와 하는 사람 수, 내가 하는 것, 내 열량 구간 추천
 *   열량 구간별 사람 수는 10명 이상일 때만 숫자로 (적으면 null). 내 열량·목표 숫자는 나에게만.
 * POST { action: "join", challenge_id, target? }     — 시즌 챌린지 시작 (열량 구간이면 고른 구간이 내 구간)
 *      { action: "version", parent_id, target, public? } — 숫자 바꿔서 하기 (내 버전 — 기간은 시즌과 같고 시즌 인원에 같이 센다)
 *      { action: "watch", season_id, on }              — 다음 시즌 시작 알림 받기 / 끄기
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_SHOW = 10;
type SeasonRow = { id: string; slug: string; title: string; kind: string; start_on: string; days: number; intro: string | null };
type ChRow = { id: string; title: string; rule: string; metric: string; target: number; sort: number; kind: string; season_id: string; parent_id: string | null };
type MemRow = { challenge_id: string; user_id: string; target_eff: number | null; group_id: string | null; started_on: string };

async function load(sb: Sb, actor: string | null) {
  const today = todayKst();
  const { current, next } = await ensureSeasons(sb, today);
  const slugs = [current?.slug, next?.slug].filter(Boolean) as string[];
  const { data: ss, error } = await sb.from("challenge_seasons").select("id, slug, title, kind, start_on, days, intro").in("slug", slugs.length ? slugs : ["-"]);
  if (error) throw new Error(error.message);
  const seasons = (ss || []) as SeasonRow[];
  const ids = seasons.map((s) => s.id);
  const { data: cs, error: cErr } = await sb.from("community_challenges").select("id, title, rule, metric, target, sort, kind, season_id, parent_id")
    .in("season_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).eq("is_active", true);
  if (cErr) throw new Error(cErr.message);
  const chs = (cs || []) as ChRow[];
  const members = chs.length ? await selectAll<MemRow>(() => sb.from("community_challenge_members").select("challenge_id, user_id, target_eff, group_id, started_on")
    .in("challenge_id", chs.map((c) => c.id)), ["challenge_id", "user_id"], 200_000) : [];
  const [goal, watch] = await Promise.all([
    actor ? sb.from("daily_nutrition_goals").select("daily_calories").eq("user_id", actor).maybeSingle() : { data: null, error: null },
    actor && ids.length ? sb.from("season_watchers").select("season_id").eq("user_id", actor).in("season_id", ids) : { data: [], error: null },
  ]);
  if (goal.error || watch.error) throw new Error((goal.error || watch.error).message);
  const goalKcal = Number(goal.data?.daily_calories) || null;
  const watching = new Set(((watch.data || []) as { season_id: string }[]).map((w) => w.season_id));

  const view = (s: SeasonRow) => {
    const ends = seasonEnd(s);
    const mine = chs.filter((c) => c.season_id === s.id);
    const official = mine.filter((c) => c.kind === "season").sort((a, b) => a.sort - b.sort);
    const people = new Set(members.filter((m) => mine.some((c) => c.id === m.challenge_id)).map((m) => m.user_id)).size;
    const started = s.start_on <= today;
    const remaining = started ? daysBetween(today, ends) + 1 : s.days;
    return {
      id: s.id, slug: s.slug, title: s.title, intro: s.intro, start_on: s.start_on, ends_on: ends, days: s.days,
      days_left: started ? remaining : null, starts_in: started ? null : daysBetween(today, s.start_on),
      people: people >= MIN_SHOW ? people : null, watching: watching.has(s.id),
      closed: remaining < 7,
      late: started && s.start_on < today && remaining >= 7 ? { remaining, goal: Math.ceil(remaining * 0.7) } : null,
      challenges: official.map((c) => {
        // 이 시즌 챌린지와 그 내 버전을 함께 센다
        const fam = new Set([c.id, ...mine.filter((v) => v.parent_id === c.id).map((v) => v.id)]);
        const ms = members.filter((m) => fam.has(m.challenge_id));
        const me = actor ? members.find((m) => fam.has(m.challenge_id) && m.user_id === actor) : undefined;
        const n = new Set(ms.map((m) => m.user_id)).size;
        return {
          id: c.id, title: c.title, rule: c.rule, metric: c.metric,
          target: c.metric === "kcal_band" ? null : Number(c.target),
          macro: c.metric === "macro_type" ? macroOf(Number(c.target)) : null,
          people: n >= MIN_SHOW ? n : null,
          mine: me ? { challenge_id: me.challenge_id, version: me.challenge_id !== c.id, target: c.metric === "kcal_band" ? me.target_eff : null } : null,
          tiers: c.metric === "kcal_band" ? KCAL_TIERS.map((k) => {
            const cnt = ms.filter((m) => m.target_eff && nearestTier(Number(m.target_eff)) === k).length;
            return { kcal: k, people: cnt >= MIN_SHOW ? cnt : null };
          }) : null,
          editable: !!ruleOf(c.metric)?.target && c.metric !== "kcal_band" && c.metric !== "macro_type",
        };
      }),
    };
  };
  const bySlug = new Map(seasons.map((s) => [s.slug, s]));
  return {
    current: current && bySlug.get(current.slug) ? view(bySlug.get(current.slug)!) : null,
    next: next && bySlug.get(next.slug) ? view(bySlug.get(next.slug)!) : null,
    my_tier: nearestTier(goalKcal), goal_kcal: goalKcal,
  };
}

export async function GET() {
  await connection();
  const actor = await getActorId();
  try { return NextResponse.json(await load(createServiceRoleClient() as Sb, actor)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

const MESSAGES: Record<string, string> = {
  closed: "시즌이 7일보다 적게 남아 지금은 들어갈 수 없어요. 다음 시즌에 같이 해요",
  missing: "시즌 챌린지를 찾지 못했어요",
  too_many: "오늘은 더 시작할 수 없어요. 내일 다시 해 주세요",
};

export async function POST(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  const limited = await rateLimit(sb, request, actor, "challenge");
  if (limited) return limited;
  const today = todayKst();
  try {
    if (body.action === "watch") {
      if (typeof body.season_id !== "string" || !UUID.test(body.season_id)) return NextResponse.json({ error: "시즌을 골라 주세요" }, { status: 400 });
      const { error } = body.on === false
        ? await sb.from("season_watchers").delete().eq("season_id", body.season_id).eq("user_id", actor)
        : await sb.from("season_watchers").upsert({ season_id: body.season_id, user_id: actor }, { onConflict: "season_id,user_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, watching: body.on !== false });
    }
    await ensureNickname(sb, actor, body.nickname);
    if (body.action === "join") {
      if (typeof body.challenge_id !== "string" || !UUID.test(body.challenge_id)) return NextResponse.json({ error: "챌린지를 골라 주세요" }, { status: 400 });
      const kcal = body.target == null ? undefined : checkPersonalKcal(body.target) ?? undefined;
      for (let i = 0; i < 3; i++) {
        const { data, error } = await sb.rpc("challenge_season_open", { p_challenge: body.challenge_id, p_user: actor, p_today: today, p_code: newCode() });
        if (error) { if (/duplicate key|unique/i.test(error.message)) continue; throw new Error(error.message); }
        if (data.status !== "opened" && data.status !== "already") return NextResponse.json({ error: MESSAGES[data.status] || "시작하지 못했어요" }, { status: 409 });
        await ensurePersonalTarget(sb, body.challenge_id, actor, kcal);
        if (kcal) await sb.from("community_challenge_members").update({ target_eff: kcal }).eq("challenge_id", body.challenge_id).eq("user_id", actor);
        return NextResponse.json({ ok: true, status: data.status, group_id: data.group_id });
      }
      throw new Error("초대 코드를 만들지 못했어요. 다시 시도해 주세요");
    }
    if (body.action === "version") {
      if (typeof body.parent_id !== "string" || !UUID.test(body.parent_id)) return NextResponse.json({ error: "시즌 챌린지를 골라 주세요" }, { status: 400 });
      const { data: p, error: pErr } = await sb.from("community_challenges").select("metric, season_id, challenge_seasons(title)").eq("id", body.parent_id).eq("kind", "season").maybeSingle();
      if (pErr) throw new Error(pErr.message);
      const spec = p ? ruleOf(p.metric) : null;
      if (!p || !spec?.target || spec.target.kind) return NextResponse.json({ error: "숫자를 바꿀 수 없는 챌린지예요" }, { status: 400 });
      const t = Number(body.target);
      if (!Number.isFinite(t) || t < spec.target.min || t > spec.target.max) return NextResponse.json({ error: `목표는 ${spec.target.min}~${spec.target.max}${spec.target.unit} 사이로 정해 주세요` }, { status: 400 });
      const target = Math.round(t / spec.target.step) * spec.target.step;
      const seasonTitle = String(p.challenge_seasons?.title || "시즌").replace(/^\d+월 시즌 · /, "");
      const name = spec.title(28, target).replace(/^\d+일\s*/, "");
      for (let i = 0; i < 3; i++) {
        const { data, error } = await sb.rpc("challenge_version_create", {
          p_parent: body.parent_id, p_user: actor, p_target: target, p_title: `${seasonTitle} · ${name} · 내 버전`, p_rule: spec.rule(target),
          p_today: today, p_code: newCode(), p_public: body.public === true,
        });
        if (error) { if (/duplicate key|unique/i.test(error.message)) continue; throw new Error(error.message); }
        if (data.status !== "created") return NextResponse.json({ error: MESSAGES[data.status] || "만들지 못했어요" }, { status: 409 });
        return NextResponse.json({ ok: true, challenge_id: data.challenge_id, group_id: data.group_id });
      }
      throw new Error("초대 코드를 만들지 못했어요. 다시 시도해 주세요");
    }
    return NextResponse.json({ error: "할 일을 골라 주세요" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
