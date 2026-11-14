import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { addDays, kstDay, todayKst } from "@/lib/day";
import { imagePrefix } from "@/lib/community-images";
import { DIARY_COLS, type DiaryRow } from "@/lib/challenges";
import { memberRun, type ChallengeRow, type MemberRow } from "@/lib/challenge-groups";
import { enrichGroupBuys, type GroupBuyRow } from "@/lib/group-buy-server";
import { bestOption, discountOf, readOffer } from "@/lib/group-buy";
import { dayTarget } from "@/lib/share-links";

/**
 * GET /api/community/share-card?kind=meal|challenge|group_buy&id= — 인증 카드에 그릴 것 (내 것만)
 *   meal: 내 식단 글 — 사진 · 끼니 · 날짜 · 음식 이름(앞 3개) · 합계 · 기록 연속 일수
 *   challenge: 내가 하는 챌린지 — 날마다 해냈는지 · 해낸 날 수 · 같이 하는 사람 수 · 연속 일수. 링크는 내 묶음 초대(/j/<code>)
 *   group_buy: 내가 연 공구 — 사진 · 가장 많이 깎은 구성 · 모인 인원 · 남은 날
 *   streak: 이어서 기록한 날 수(id = 오늘 날짜) — 최근 14일 점. 링크는 하루 기록과 같음
 *   day: 내 하루 식단 기록(id = YYYY-MM-DD) — 합계 · 음식 이름 · 기록한 끼니 수 · 연속 일수. 링크는 하고 있는 챌린지 초대(없으면 첫 화면)
 * 사진은 우리 저장소 것만 준다(카드는 브라우저 캔버스에 그려서, 다른 사이트 사진은 그릴 수 없다).
 * 건강 목표·질환 관련 값·몸무게는 넣지 않는다. 다른 사람의 것은 카드 대신 링크로만 나눈다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 오늘(오늘 기록이 없으면 어제)부터 거꾸로 하루도 빠짐없이 식단을 기록한 날 수 */
async function streakOf(sb: Sb, actor: string) {
  const today = todayKst();
  const { data, error } = await sb.from("meal_diary").select("date").eq("user_id", actor).gte("date", addDays(today, -365)).lte("date", today).limit(5000);
  if (error) throw new Error(error.message);
  const days = new Set(((data || []) as { date: string }[]).map((r) => r.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

const ownImage = (u: unknown): string | null => (typeof u === "string" && u.startsWith(imagePrefix()) ? u : null);

export async function GET(request: NextRequest) {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const kind = request.nextUrl.searchParams.get("kind");
  const id = request.nextUrl.searchParams.get("id") || "";
  const byDate = kind === "day" || kind === "streak";
  const okId = byDate ? /^\d{4}-\d{2}-\d{2}$/.test(id) && id <= todayKst() : /^[0-9a-f-]{36}$/i.test(id);
  if (!okId) return NextResponse.json({ error: "카드로 만들 것을 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;

  try {
    if (kind === "streak") {
      // 오늘(오늘 기록이 없으면 어제)까지 이어진 날 수 + 최근 14일 기록 여부
      const today = todayKst();
      const [{ data: rows, error }, { data: prof, error: pErr }, target, streak] = await Promise.all([
        sb.from("meal_diary").select("date").eq("user_id", actor).gte("date", addDays(today, -13)).lte("date", today).limit(2000),
        sb.from("community_profiles").select("nickname").eq("actor_id", actor).maybeSingle(),
        dayTarget(sb, actor),
        streakOf(sb, actor),
      ]);
      if (error || pErr) throw new Error((error || pErr).message);
      if (streak < 1) return NextResponse.json({ error: "이어진 기록이 없어요" }, { status: 404 });
      const has = new Set(((rows || []) as { date: string }[]).map((r) => r.date));
      const days = Array.from({ length: 14 }, (_, i) => { const date = addDays(today, i - 13); return { date, state: has.has(date) ? "done" : date === today ? "today" : "missed" }; });
      return NextResponse.json({ card: { kind: "streak", author: prof?.nickname || null, url: target.target_url, day: today, streak, days } });
    }

    if (kind === "day") {
      const [{ data: rows, error }, { data: prof, error: pErr }, target] = await Promise.all([
        sb.from("meal_diary").select("meal_type, food_name, calories, protein_g, carbs_g, fat_g").eq("user_id", actor).eq("date", id).order("created_at").limit(200),
        sb.from("community_profiles").select("nickname").eq("actor_id", actor).maybeSingle(),
        dayTarget(sb, actor),
      ]);
      if (error || pErr) throw new Error((error || pErr).message);
      const list = (rows || []) as { meal_type: string | null; food_name: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }[];
      if (!list.length) return NextResponse.json({ error: "이날 기록이 없어요" }, { status: 404 });
      const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") => Math.round(list.reduce((a, r) => a + (Number(r[k]) || 0), 0));
      const names = [...new Set(list.map((r) => r.food_name).filter(Boolean))];
      return NextResponse.json({
        card: {
          kind: "meal", author: prof?.nickname || null, url: target.target_url, photo: null, meal_type: "day", day: id,
          foods: names.slice(0, 3).map((n) => n.slice(0, 24)), food_count: names.length,
          meals: new Set(list.map((r) => r.meal_type).filter((m) => m === "breakfast" || m === "lunch" || m === "dinner")).size,
          total: { calories: sum("calories"), protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g") },
          streak: await streakOf(sb, actor),
        },
      });
    }

    if (kind === "meal") {
      const { data: p, error } = await sb.from("community_feed").select("id, user_id, author_nickname, image_urls, video_poster, meal_type, meal_data, created_at, is_active")
        .eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!p || !p.is_active) return NextResponse.json({ error: "글을 찾지 못했어요" }, { status: 404 });
      if (p.user_id !== actor) return NextResponse.json({ error: "내 글만 인증 카드로 만들 수 있어요" }, { status: 403 });
      const foods = (Array.isArray(p.meal_data?.foods) ? p.meal_data.foods : []) as { name?: string }[];
      const t = p.meal_data?.total || null;
      return NextResponse.json({
        card: {
          kind: "meal", author: p.author_nickname, url: `/community/${p.id}`,
          photo: ownImage(p.video_poster) || ownImage((p.image_urls || [])[0]),
          meal_type: p.meal_type, day: kstDay(p.created_at),
          foods: foods.map((f) => String(f.name || "").slice(0, 24)).filter(Boolean).slice(0, 3), food_count: foods.length,
          total: t ? { calories: Number(t.calories) || 0, protein_g: Number(t.protein_g) || 0, carbs_g: Number(t.carbs_g) || 0, fat_g: Number(t.fat_g) || 0 } : null,
          streak: await streakOf(sb, actor),
        },
      });
    }

    if (kind === "challenge") {
      const [{ data: c, error: cErr }, { data: m, error: mErr }, { data: prof, error: pErr }] = await Promise.all([
        sb.from("community_challenges").select("id, slug, title, rule, metric, target, days, goal_days, is_active").eq("id", id).maybeSingle(),
        sb.from("community_challenge_members").select("challenge_id, user_id, started_on, joined_on, goal_days_eff, group_id, finished_runs, show_values, challenge_groups(id, code, start_on, member_count)")
          .eq("challenge_id", id).eq("user_id", actor).maybeSingle(),
        sb.from("community_profiles").select("nickname").eq("actor_id", actor).maybeSingle(),
      ]);
      if (cErr || mErr || pErr) throw new Error((cErr || mErr || pErr).message);
      if (!c) return NextResponse.json({ error: "챌린지를 찾지 못했어요" }, { status: 404 });
      if (!m) return NextResponse.json({ error: "참여한 챌린지만 인증 카드로 만들 수 있어요" }, { status: 403 });
      const today = todayKst();
      const g = m.challenge_groups as { id: string; code: string; start_on: string; member_count: number } | null;
      const { data: rows, error: dErr } = await sb.from("meal_diary").select(DIARY_COLS)
        .eq("user_id", actor).gte("date", m.started_on).lte("date", today).limit(5000);
      if (dErr) throw new Error(dErr.message);
      const run = memberRun(c as ChallengeRow, g, m as MemberRow, (rows || []) as DiaryRow[], today);
      return NextResponse.json({
        card: {
          kind: "challenge", author: prof?.nickname || null, url: g ? `/j/${g.code}` : "/community/challenges",
          title: c.title, rule: c.rule, total_days: c.days, done: run.done_count, goal: run.goal, finished: run.finished,
          days: run.days.map((d) => ({ date: d.date, state: d.state })),
          people: g?.member_count ?? 1,
          streak: await streakOf(sb, actor),
        },
      });
    }

    if (kind === "group_buy") {
      const { data: g, error } = await sb.from("group_buys").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!g) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });
      if (g.creator_id !== actor) return NextResponse.json({ error: "내가 연 공구만 인증 카드로 만들 수 있어요" }, { status: 403 });
      const [e] = await enrichGroupBuys(sb, [g as GroupBuyRow]);
      const offer = readOffer(e.offer);
      const best = bestOption(offer);
      const pct = best ? discountOf(best, e.lowest_unit_price) : null;
      return NextResponse.json({
        card: {
          kind: "group_buy", author: e.host_nickname, url: `/group-buy/${e.id}`,
          photo: ownImage(e.video_poster) || ownImage((e.image_urls || [])[0]),
          product_name: e.product_name,
          best: best ? { packs: best.packs, price: best.price, pct: pct != null && pct > 0 ? pct : null } : null,
          count: e.current_count || 0, target: e.target_count,
          days_left: e.expires_at ? Math.max(0, Math.ceil((Date.parse(e.expires_at) - Date.now()) / 86400e3)) : null,
        },
      });
    }

    return NextResponse.json({ error: "카드 종류를 골라 주세요" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
