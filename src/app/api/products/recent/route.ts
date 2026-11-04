import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/products/recent?user_id=xxx — 최근 30일에 본·가격을 누른 제품 (최근 순, 최대 20개, 가격 포함)
 */
export async function GET(request: NextRequest) {
  await connection();
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const { data: rows, error } = await sb
    .from("user_interactions")
    .select("product_id, created_at")
    .eq("user_id", userId)
    .in("action", ["view", "click_price"])
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids: string[] = [...new Set<string>((rows || []).map((r: { product_id: string }) => r.product_id).filter(Boolean))].slice(0, 20);
  if (ids.length === 0) return NextResponse.json({ products: [] });

  const [{ data: products, error: pErr }, { data: prices }] = await Promise.all([
    sb.from("products").select("id, name, manufacturer, calories, protein_g, carbs_g, fat_g, sodium_mg, image_url").in("id", ids),
    sb.from("v_all_prices").select("product_id, platform, price, url, image_url").in("product_id", ids),
  ]);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const priceMap: Record<string, { platform: string; price: number; url: string; image_url: string | null }[]> = {};
  for (const pr of prices || []) (priceMap[pr.product_id] ||= []).push(pr);
  const byId = new Map((products || []).map((p: { id: string }) => [p.id, p]));

  const ordered = ids
    .map(id => byId.get(id))
    .filter(Boolean)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => ({ ...p, product_prices: (priceMap[p.id] || []).filter(x => x.price > 0).sort((a, b) => a.price - b.price) }));

  return NextResponse.json({ products: ordered });
}
