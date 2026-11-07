import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { usablePrices, type PriceRow } from "@/lib/prices";

/**
 * GET /api/shopping-list?ids=a,b,c — 식단에 담은 제품의 몰별 가격 (장보기 목록)
 * 제품마다 쓸 수 있는 가격을 싼 순으로. 공개 데이터만 돌려준다.
 */
export async function GET(request: NextRequest) {
  await connection();
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 60);
  if (ids.length === 0) return NextResponse.json({ items: [] });
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return NextResponse.json({ error: "제품 번호가 올바르지 않아요" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const [{ data: products, error }, { data: prices, error: prErr }] = await Promise.all([
    sb.from("products").select("id, name, manufacturer, image_url").in("id", ids),
    sb.from("v_all_prices").select("product_id, platform, price, url, image_url, last_crawled_at").in("product_id", ids),
  ]);
  if (error || prErr) return NextResponse.json({ error: (error || prErr).message }, { status: 500 });

  const byProduct: Record<string, (PriceRow & { product_id: string })[]> = {};
  for (const p of prices || []) (byProduct[p.product_id] ||= []).push(p);

  const items = (products || []).map((p: { id: string; name: string; manufacturer: string | null; image_url: string | null }) => {
    const list = usablePrices(byProduct[p.id]);
    return {
      product_id: p.id,
      name: p.name,
      manufacturer: p.manufacturer,
      image_url: p.image_url || list.find((x) => x.image_url)?.image_url || null,
      prices: list.map(({ platform, price, url, last_crawled_at }) => ({ platform, price, url, last_crawled_at })),
    };
  });
  return NextResponse.json({ items });
}
