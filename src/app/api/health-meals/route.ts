import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/health-meals — 건강 식단 서비스 제품 목록
 * POST /api/health-meals — 제품 추가/수정 (관리용)
 */

export async function GET(request: NextRequest) {
  await connection();
  const sp = request.nextUrl.searchParams;
  const source = sp.get("source"); // greating, sixmeal, designmeal 등
  const category = sp.get("category");
  const dishType = sp.get("dish_type"); // meal, salad, drink, snack
  const limit = Math.min(Number(sp.get("limit") || 50), 100);
  const page = Number(sp.get("page") || 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  let query = sb.from("health_meal_products")
    .select("*", { count: "exact" })
    .eq("is_available", true)
    .order("created_at", { ascending: false });

  if (source) query = query.eq("source", source);
  if (category) query = query.eq("category", category);
  if (dishType) query = query.eq("dish_type", dishType);

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 소스별 통계
  const { data: stats } = await sb.from("health_meal_products")
    .select("source")
    .eq("is_available", true);

  const sourceCounts: Record<string, number> = {};
  if (stats) {
    for (const s of stats) {
      sourceCounts[s.source] = (sourceCounts[s.source] || 0) + 1;
    }
  }

  return NextResponse.json({
    products: data || [],
    total: count,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
    sources: sourceCounts,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { products } = body; // 배열로 받기

    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: "products 배열 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;
    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const p of products) {
      if (!p.source || !p.name) {
        errors.push(`source, name 필수: ${p.name || "?"}`);
        continue;
      }

      const row = {
        source: p.source,
        source_id: p.source_id || null,
        name: p.name,
        description: p.description || null,
        category: p.category || null,
        price: p.price || null,
        image_url: p.image_url || null,
        product_url: p.product_url || null,
        serving_size_g: p.serving_size_g || null,
        calories: p.calories || null,
        protein_g: p.protein_g || null,
        fat_g: p.fat_g || null,
        carbs_g: p.carbs_g || null,
        sugar_g: p.sugar_g || null,
        sodium_mg: p.sodium_mg || null,
        fiber_g: p.fiber_g || null,
        is_available: p.is_available !== false,
        is_subscription: p.is_subscription || false,
        health_tags: p.health_tags || [],
        dish_type: p.dish_type || "meal",
        updated_at: new Date().toISOString(),
      };

      const { error } = await sb.from("health_meal_products").upsert(row, {
        onConflict: "source,source_id",
      });

      if (error) {
        errors.push(`${p.name}: ${error.message}`);
      } else {
        inserted++;
      }
    }

    return NextResponse.json({ ok: true, inserted, errors: errors.length > 0 ? errors : undefined });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
