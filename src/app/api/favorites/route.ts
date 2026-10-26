import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/favorites?user_id=xxx — 즐겨찾기 목록 (제품 정보 + 가격 포함)
 * POST /api/favorites — 즐겨찾기 추가/삭제 (toggle)
 */

export async function GET(request: NextRequest) {
  await connection();
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  // 즐겨찾기 목록
  const { data: favs, error } = await sb
    .from("user_favorites")
    .select("product_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!favs || favs.length === 0) return NextResponse.json({ favorites: [] });

  // 제품 정보 로드
  const productIds = favs.map((f: { product_id: string }) => f.product_id);
  const { data: products } = await sb
    .from("products")
    .select("id, name, manufacturer, calories, protein_g, sugar_g, sodium_mg, functional_tags, dish_category")
    .in("id", productIds);

  // 가격 정보 로드
  const { data: prices } = await sb
    .from("v_all_prices")
    .select("product_id, platform, price, url, image_url")
    .in("product_id", productIds)
    .gt("price", 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceMap: Record<string, any[]> = {};
  if (prices) {
    for (const p of prices) {
      if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
      priceMap[p.product_id].push({ platform: p.platform, price: p.price, url: p.url, image_url: p.image_url });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productMap: Record<string, any> = {};
  if (products) {
    for (const p of products) productMap[p.id] = p;
  }

  const favorites = favs.map((f: { product_id: string; created_at: string }) => {
    const product = productMap[f.product_id];
    const pp = (priceMap[f.product_id] || []).sort((a: { price: number }, b: { price: number }) => a.price - b.price);
    return {
      product_id: f.product_id,
      created_at: f.created_at,
      name: product?.name || "알 수 없는 제품",
      manufacturer: product?.manufacturer,
      calories: product?.calories,
      protein_g: product?.protein_g,
      sugar_g: product?.sugar_g,
      sodium_mg: product?.sodium_mg,
      functional_tags: product?.functional_tags || [],
      dish_category: product?.dish_category,
      best_price: pp[0]?.price || null,
      image_url: pp.find((p: { image_url: string | null }) => p.image_url)?.image_url || null,
      prices: pp.slice(0, 3),
    };
  });

  return NextResponse.json({ favorites });
}

export async function POST(request: NextRequest) {
  try {
    const { user_id, product_id, action } = await request.json();
    if (!user_id || !product_id) {
      return NextResponse.json({ error: "user_id, product_id 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    if (action === "remove") {
      await sb.from("user_favorites").delete().eq("user_id", user_id).eq("product_id", product_id);
      return NextResponse.json({ ok: true, favorited: false });
    }

    // toggle: 있으면 삭제, 없으면 추가
    const { data: existing } = await sb
      .from("user_favorites")
      .select("id")
      .eq("user_id", user_id)
      .eq("product_id", product_id)
      .single();

    if (existing) {
      await sb.from("user_favorites").delete().eq("id", existing.id);
      return NextResponse.json({ ok: true, favorited: false });
    } else {
      await sb.from("user_favorites").insert({ user_id, product_id });
      return NextResponse.json({ ok: true, favorited: true });
    }
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
