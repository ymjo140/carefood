import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/interactions
 * 사용자 행동 기록 (조회, 클릭, 박스 추가 등)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, product_id, action, metadata } = body;

    if (!user_id || !product_id || !action) {
      return NextResponse.json({ error: "user_id, product_id, action 필수" }, { status: 400 });
    }

    const validActions = ["view", "click_price", "add_box", "remove_box"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `유효한 action: ${validActions.join(", ")}` }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("user_interactions")
      .insert({
        user_id,
        product_id,
        action,
        metadata: metadata || {},
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

/**
 * GET /api/interactions?user_id=xxx
 * 사용자 선호도 요약 (추천 개인화용)
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id 필수" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // 최근 30일 행동 집계
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: interactions } = await (supabase as any)
    .from("user_interactions")
    .select("product_id, action, created_at")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(200) as { data: { product_id: string; action: string; created_at: string }[] | null };

  if (!interactions || interactions.length === 0) {
    return NextResponse.json({
      total_interactions: 0,
      viewed_product_ids: [],
      clicked_product_ids: [],
      category_counts: {},
      manufacturer_counts: {},
    });
  }

  const viewedIds = [...new Set(interactions.filter(i => i.action === "view").map(i => i.product_id))];
  const clickedIds = [...new Set(interactions.filter(i => i.action === "click_price").map(i => i.product_id))];
  const allProductIds = [...new Set(interactions.map(i => i.product_id))];

  // 제품 정보 가져와서 카테고리/제조사 집계
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products } = await supabase
    .from("products")
    .select("id, dish_category, manufacturer, functional_tags")
    .in("id", allProductIds) as { data: { id: string; dish_category: string | null; manufacturer: string | null; functional_tags: string[] | null }[] | null };

  const categoryCounts: Record<string, number> = {};
  const manufacturerCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};

  if (products) {
    for (const p of products) {
      // 가중치: click > view
      const weight = clickedIds.includes(p.id) ? 3 : 1;
      if (p.dish_category) {
        categoryCounts[p.dish_category] = (categoryCounts[p.dish_category] || 0) + weight;
      }
      if (p.manufacturer) {
        manufacturerCounts[p.manufacturer] = (manufacturerCounts[p.manufacturer] || 0) + weight;
      }
      if (p.functional_tags) {
        for (const tag of p.functional_tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + weight;
        }
      }
    }
  }

  return NextResponse.json({
    total_interactions: interactions.length,
    viewed_product_ids: viewedIds.slice(0, 50),
    clicked_product_ids: clickedIds.slice(0, 50),
    category_counts: categoryCounts,
    manufacturer_counts: manufacturerCounts,
    tag_counts: tagCounts,
  });
}
