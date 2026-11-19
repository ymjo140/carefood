import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import { viewerFilters } from "@/lib/community-safety";
import { enrichGroupBuys, type GroupBuyRow } from "@/lib/group-buy-server";
import { bestOption, discountOf, readOffer } from "@/lib/group-buy";
import type { CertSummary } from "@/lib/share-card-server";
import { regramAllowed, togetherCounts } from "@/lib/community-regram";
import { tagsAndSources } from "@/lib/community-tags";
import { audienceOf, canSee } from "@/lib/community-visibility";

/**
 * GET /api/community/reels — 피드 맨 위 '스토리' 줄
 *   사진·영상이 붙은 최근 30일 글(식단·인증) + 관심을 모으는 공구, 새것부터 12개. 영상은 표지 사진 + 길이(seconds)
 *   인증 글(cert: 챌린지·연속 기록·하루 기록)은 kind "cert" — 카드 그림 + 서버가 계산한 숫자, 같이 하기 링크(cert.url)
 *   리그램(남의 글을 내 스토리에 올림)은 kind "regram" — 사진·영상·식단은 원본 것, origin { id, author }. 원본이 지워졌거나 가려졌거나
 *   원본 글쓴이가 허락을 껐거나 차단 관계면 빠진다. 식단이 붙은 글은 copyable(따라하기), 올릴 수 있으면 regram_ok(내 스토리에 올리기).
 *   사진 글에서 서로 태그한 두 사람은 together { nickname, nth } (같이 먹기 N번째)
 *   보는 사람이 차단한 사람·숨긴 글·신고로 가려진 글, 볼 수 없는 팔로워만 글은 뺀다. 팔로워만 글은 리그램할 수 없다(regram_ok false).
 *   응답: items[{ kind: "meal"|"cert"|"group_buy", id, image, video, author, created_at, mine, liked, like_count, comment_count, ...종류별 숫자 }]
 *   스토리 보기(/stories)가 이 목록을 그대로 넘겨 본다 — 영상 주소·좋아요 상태·내 것인지까지 같이 준다.
 */
const LIMIT = 12;

type Total = { calories?: number; protein_g?: number } | null | undefined;

export async function GET() {
  await connection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const actor = await getActorId();
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();

  try {
    const [filters, audience] = await Promise.all([viewerFilters(sb, actor), audienceOf(sb, actor)]);
    const [posts, gbs] = await Promise.all([
      sb.from("community_feed").select("id, user_id, author_nickname, image_urls, video_url, video_poster, video_seconds, meal_type, meal_data, content, created_at, sponsor, like_count, comment_count, cert, regram_of, visibility")
        .eq("is_active", true).eq("hidden_by_reports", false).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(LIMIT * 6),
      sb.from("group_buys").select("*").eq("status", "recruiting").gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(LIMIT),
    ]);
    if (posts.error) throw new Error(posts.error.message);
    if (gbs.error) throw new Error(gbs.error.message);

    type Row = {
      id: string; user_id: string; author_nickname: string | null; image_urls: string[] | null; video_url: string | null; video_poster: string | null; video_seconds: number | null; meal_type: string | null;
      meal_data: { total?: Total; foods?: unknown[]; plan?: unknown } | null; content: string | null; created_at: string; sponsor: { partner_name?: string } | null; like_count: number | null; comment_count: number | null;
      cert: CertSummary | null; regram_of: string | null; is_active?: boolean; hidden_by_reports?: boolean; visibility?: string | null;
    };
    const rows = ((posts.data || []) as Row[]).filter((p) => !filters.blocked.has(p.user_id) && !filters.hidden.has(p.id) && canSee(p, audience));
    // 리그램의 원본 — 보이는 것만
    const originIds = [...new Set(rows.map((p) => p.regram_of).filter((v): v is string => !!v))];
    const { data: originRows, error: oErr } = originIds.length
      ? await sb.from("community_feed").select("id, user_id, author_nickname, image_urls, video_url, video_poster, video_seconds, meal_type, meal_data, content, created_at, sponsor, like_count, comment_count, cert, regram_of, is_active, hidden_by_reports, visibility").in("id", originIds)
      : { data: [], error: null };
    if (oErr) throw new Error(oErr.message);
    const origins = new Map(((originRows || []) as Row[]).filter((o) => o.is_active && !o.hidden_by_reports && !filters.blocked.has(o.user_id) && (o.visibility || "public") === "public").map((o) => [o.id, o]));
    const allow = await regramAllowed(sb, [...new Set([...rows.map((p) => p.user_id), ...[...origins.values()].map((o) => o.user_id)])]);
    const media = (p: Row) => !!p.video_poster || (p.image_urls || []).length > 0;
    const shown = rows.flatMap((p) => {
      if (!p.regram_of) return media(p) ? [{ row: p, src: p, origin: null as Row | null }] : [];
      const o = origins.get(p.regram_of);
      return o && media(o) && allow.get(o.user_id) !== false ? [{ row: p, src: o, origin: o }] : [];
    });
    // 내가 이미 스토리에 올린 원본
    const { data: mine, error: mErr } = actor
      ? await sb.from("community_feed").select("regram_of").eq("user_id", actor).eq("is_active", true).not("regram_of", "is", null).limit(500)
      : { data: [], error: null };
    if (mErr) throw new Error(mErr.message);
    const regrammed = new Set(((mine || []) as { regram_of: string }[]).map((r) => r.regram_of));
    const plain = shown.filter((x) => !x.origin).map((x) => x.row);
    const ts = await tagsAndSources(sb, plain, filters.blocked);
    const together = await togetherCounts(sb, plain, ts.people);

    const meals = shown.map(({ row: p, src, origin }) => ({
        kind: (origin ? "regram" : src.cert ? "cert" : "meal") as "meal" | "cert" | "regram", cert: origin ? null : src.cert || null,
        id: p.id, image: src.video_poster || src.image_urls![0], author: p.author_nickname || "익명", created_at: p.created_at,
        video: src.video_url && src.video_poster ? src.video_url : null,
        seconds: src.video_poster ? Number(src.video_seconds) || null : null,
        mine: !!actor && p.user_id === actor, like_count: p.like_count || 0, comment_count: p.comment_count || 0,
        meal_type: src.meal_type, kcal: src.meal_data?.total?.calories ?? null, protein_g: src.meal_data?.total?.protein_g ?? null,
        // 협업 글은 첫 부분에 협찬 표시 (lib/partner/collabs.ts sponsorFor) — 리그램은 원본의 협찬 표시를 그대로
        text: `${src.sponsor ? `협찬 · ${src.sponsor.partner_name || "입점 업체"} — ` : ""}${(origin ? p.content || origin.content : p.content) || ""}`.slice(0, 40),
        origin: origin ? { id: origin.id, author: origin.author_nickname || "익명" } : null,
        copyable: !!(src.meal_data?.plan || (src.meal_data?.foods && src.meal_data.foods.length)),
        regram_ok: !!actor && src.user_id !== actor && p.user_id !== actor && allow.get(src.user_id) !== false && !regrammed.has(src.id) && (src.visibility || "public") === "public",
        together: origin ? null : together.get(p.id) ?? null,
      }));

    const groups = (await enrichGroupBuys(sb, ((gbs.data || []) as GroupBuyRow[]).filter((g) => !filters.blocked.has(g.creator_id))))
      .map((g) => ({
        kind: "group_buy" as const, id: g.id, image: g.image_url, author: g.host_nickname, created_at: g.created_at,
        video: g.video_url && g.video_poster ? g.video_url : null,
        mine: !!actor && g.creator_id === actor, like_count: g.like_count || 0, comment_count: g.comment_count || 0,
        text: (g.description || "").slice(0, 60),
        product_name: g.product_name, current_count: g.current_count || 0, target_count: g.target_count,
        seconds: g.video_url ? Number(g.video_seconds) || null : null,
        // 조건표가 있으면 가장 많이 깎은 구성의 할인율 · 마감까지 남은 날
        pct: (() => { const b = bestOption(readOffer(g.offer)); const p = b ? discountOf(b, g.lowest_unit_price) : null; return p != null && p > 0 ? p : null; })(),
        days_left: g.expires_at ? Math.max(0, Math.ceil((Date.parse(g.expires_at) - Date.now()) / 86400e3)) : null,
      }));

    const top = [...meals, ...groups].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, LIMIT);
    // 보는 사람이 누른 좋아요 — 보여 줄 것만
    const liked = new Set<string>();
    if (actor && top.length) {
      const mealIds = top.filter((i) => i.kind !== "group_buy").map((i) => i.id);
      const gbIds = top.filter((i) => i.kind === "group_buy").map((i) => i.id);
      const [ml, gl] = await Promise.all([
        mealIds.length ? sb.from("community_feed_likes").select("post_id").eq("user_id", actor).in("post_id", mealIds) : { data: [], error: null },
        gbIds.length ? sb.from("group_buy_likes").select("group_buy_id").eq("user_id", actor).in("group_buy_id", gbIds) : { data: [], error: null },
      ]);
      if (ml.error) throw new Error(ml.error.message);
      if (gl.error) throw new Error(gl.error.message);
      for (const r of (ml.data || []) as { post_id: string }[]) liked.add(r.post_id);
      for (const r of (gl.data || []) as { group_buy_id: string }[]) liked.add(r.group_buy_id);
    }
    const items = top.map((i) => ({ ...i, liked: liked.has(i.id) }));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
