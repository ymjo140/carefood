import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import { viewerFilters } from "@/lib/community-safety";
import { enrichGroupBuys, type GroupBuyRow } from "@/lib/group-buy-server";
import { bestOption, discountOf, readOffer } from "@/lib/group-buy";

/**
 * GET /api/community/reels — 피드 맨 위 '오늘의 식단 · 공구' 줄
 *   사진·영상이 붙은 최근 30일 식단 글 + 관심을 모으는 공구, 새것부터 12개. 영상은 표지 사진 + 길이(seconds)
 *   보는 사람이 차단한 사람·숨긴 글·신고로 가려진 글은 뺀다.
 *   응답: items[{ kind: "meal"|"group_buy", id, image, author, created_at, ...종류별 숫자 }]
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
    const filters = await viewerFilters(sb, actor);
    const [posts, gbs] = await Promise.all([
      sb.from("community_feed").select("id, user_id, author_nickname, image_urls, video_poster, video_seconds, meal_type, meal_data, content, created_at, sponsor")
        .eq("is_active", true).eq("hidden_by_reports", false).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(LIMIT * 6),
      sb.from("group_buys").select("*").eq("status", "recruiting").gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(LIMIT),
    ]);
    if (posts.error) throw new Error(posts.error.message);
    if (gbs.error) throw new Error(gbs.error.message);

    const meals = ((posts.data || []) as {
      id: string; user_id: string; author_nickname: string | null; image_urls: string[] | null; video_poster: string | null; video_seconds: number | null; meal_type: string | null;
      meal_data: { total?: Total } | null; content: string | null; created_at: string; sponsor: { partner_name?: string } | null;
    }[])
      .filter((p) => !filters.blocked.has(p.user_id) && !filters.hidden.has(p.id) && (!!p.video_poster || (p.image_urls || []).length > 0))
      .map((p) => ({
        kind: "meal" as const, id: p.id, image: p.video_poster || p.image_urls![0], author: p.author_nickname || "익명", created_at: p.created_at,
        seconds: p.video_poster ? Number(p.video_seconds) || null : null,
        meal_type: p.meal_type, kcal: p.meal_data?.total?.calories ?? null, protein_g: p.meal_data?.total?.protein_g ?? null,
        // 협업 글은 첫 부분에 협찬 표시 (lib/partner/collabs.ts sponsorFor)
        text: `${p.sponsor ? `협찬 · ${p.sponsor.partner_name || "입점 업체"} — ` : ""}${p.content || ""}`.slice(0, 40),
      }));

    const groups = (await enrichGroupBuys(sb, ((gbs.data || []) as GroupBuyRow[]).filter((g) => !filters.blocked.has(g.creator_id))))
      .map((g) => ({
        kind: "group_buy" as const, id: g.id, image: g.image_url, author: g.host_nickname, created_at: g.created_at,
        product_name: g.product_name, current_count: g.current_count || 0, target_count: g.target_count,
        seconds: g.video_url ? Number(g.video_seconds) || null : null,
        // 조건표가 있으면 가장 많이 깎은 구성의 할인율 · 마감까지 남은 날
        pct: (() => { const b = bestOption(readOffer(g.offer)); const p = b ? discountOf(b, g.lowest_unit_price) : null; return p != null && p > 0 ? p : null; })(),
        days_left: g.expires_at ? Math.max(0, Math.ceil((Date.parse(g.expires_at) - Date.now()) / 86400e3)) : null,
      }));

    const items = [...meals, ...groups].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, LIMIT);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
