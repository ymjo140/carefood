import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/track/click — 구매 링크 클릭 트래킹
 *
 * 제품 상세 페이지에서 외부 구매 링크를 클릭할 때 호출.
 * B2B 가치: 어떤 제품이 얼마나 구매 전환을 만드는지 데이터.
 */
export async function POST(request: NextRequest) {
  try {
    const { user_id, product_id, platform, click_url, referrer_page } = await request.json();

    if (!product_id || !platform) {
      return NextResponse.json({ error: "product_id, platform 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    await sb.from("product_clicks").insert({
      user_id: user_id || null,
      product_id,
      platform,
      click_url: click_url || null,
      referrer_page: referrer_page || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

/**
 * GET /api/track/click?product_id=xxx — 제품별 클릭 통계
 */
export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("product_id");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  if (productId) {
    const { data } = await sb
      .from("product_clicks")
      .select("platform, created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(100);

    // 플랫폼별 집계
    const platformCounts: Record<string, number> = {};
    for (const c of (data || [])) {
      platformCounts[c.platform] = (platformCounts[c.platform] || 0) + 1;
    }

    return NextResponse.json({
      product_id: productId,
      total_clicks: data?.length || 0,
      by_platform: platformCounts,
    });
  }

  // 전체 최근 클릭 (관리자용)
  const { data: recentClicks } = await sb
    .from("product_clicks")
    .select("product_id, platform, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ clicks: recentClicks || [] });
}
