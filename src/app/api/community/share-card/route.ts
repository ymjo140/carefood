import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { addDays, kstDay, todayKst } from "@/lib/day";
import { imagePrefix } from "@/lib/community-images";
import { runProgress, type ChallengeMetric, type DiaryRow } from "@/lib/challenges";
import { enrichGroupBuys, type GroupBuyRow } from "@/lib/group-buy-server";
import { bestOption, discountOf, readOffer } from "@/lib/group-buy";

/**
 * GET /api/community/share-card?kind=meal|challenge|group_buy&id= — 인증 카드에 그릴 것 (내 것만)
 *   meal: 내 식단 글 — 사진 · 끼니 · 날짜 · 음식 이름(앞 3개) · 합계 · 기록 연속 일수
 *   challenge: 내가 하는 챌린지 — 날마다 해냈는지 · 해낸 날 수 · 연속 일수
 *   group_buy: 내가 연 공구 — 사진 · 가장 많이 깎은 구성 · 모인 인원 · 남은 날
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "카드로 만들 것을 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;

  try {
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
        sb.from("community_challenges").select("id, title, rule, metric, target, days").eq("id", id).maybeSingle(),
        sb.from("community_challenge_members").select("started_on").eq("challenge_id", id).eq("user_id", actor).maybeSingle(),
        sb.from("community_profiles").select("nickname").eq("actor_id", actor).maybeSingle(),
      ]);
      if (cErr || mErr || pErr) throw new Error((cErr || mErr || pErr).message);
      if (!c) return NextResponse.json({ error: "챌린지를 찾지 못했어요" }, { status: 404 });
      if (!m) return NextResponse.json({ error: "참여한 챌린지만 인증 카드로 만들 수 있어요" }, { status: 403 });
      const today = todayKst();
      const { data: rows, error: dErr } = await sb.from("meal_diary").select("date, meal_type, calories, protein_g, sugar_g, sodium_mg")
        .eq("user_id", actor).gte("date", m.started_on).lte("date", today).limit(5000);
      if (dErr) throw new Error(dErr.message);
      const run = runProgress(c.metric as ChallengeMetric, Number(c.target), c.days, m.started_on, (rows || []) as DiaryRow[], today);
      return NextResponse.json({
        card: {
          kind: "challenge", author: prof?.nickname || null, url: "/community/challenges",
          title: c.title, rule: c.rule, total_days: c.days, done: run.done_count, finished: run.finished,
          days: run.days.map((d) => ({ date: d.date, state: d.state })),
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
