import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// 맛 레벨 → 영양성분 범위 매핑 (기본값)
const TASTE_RANGES: Record<string, Record<number, [number, number]>> = {
  salty: {
    1: [0, 300],
    2: [300, 500],
    3: [500, 800],
    4: [800, 1200],
    5: [1200, 9999],
  },
  sweet: {
    1: [0, 3],
    2: [3, 6],
    3: [6, 12],
    4: [12, 20],
    5: [20, 99],
  },
  fatty: {
    1: [0, 3],
    2: [3, 7],
    3: [7, 15],
    4: [15, 25],
    5: [25, 99],
  },
};

// 가격 정보 타입
type MallPrice = {
  platform: string;
  price: number;
  url: string;
  image_url: string | null;
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const salty = Number(searchParams.get("salty") || 0);
  const sweet = Number(searchParams.get("sweet") || 0);
  const spicy = Number(searchParams.get("spicy") || 0);
  const fatty = Number(searchParams.get("fatty") || 0);
  const search = searchParams.get("q") || null;
  const tag = searchParams.get("tag") || null; // 기능성 태그 필터
  const hasPriceOnly = searchParams.get("hasPrice") === "1"; // 구매 가능만 (서버사이드)
  const page = Number(searchParams.get("page") || 1);
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);
  const source = searchParams.get("source") || null;

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order("name");

  // 맛 필터 적용
  if (salty >= 1 && salty <= 5) {
    const [min, max] = TASTE_RANGES.salty[salty];
    query = query.gte("sodium_mg", min).lt("sodium_mg", max);
  }
  if (sweet >= 1 && sweet <= 5) {
    const [min, max] = TASTE_RANGES.sweet[sweet];
    query = query.gte("sugar_g", min).lt("sugar_g", max);
  }
  if (fatty >= 1 && fatty <= 5) {
    const [min, max] = TASTE_RANGES.fatty[fatty];
    query = query.gte("fat_g", min).lt("fat_g", max);
  }
  if (spicy >= 1 && spicy <= 5) {
    query = query.gte("spicy_score", spicy);
  }

  // 상용제품만 (구매 가능 제품)
  query = query.eq("category_large", "상용제품");

  // 구매 가능 제품만 (서버사이드 필터)
  if (hasPriceOnly) {
    query = query.eq("is_purchasable", true);
  }

  // 기능성 태그 필터
  if (tag) {
    query = query.contains("functional_tags", [tag]);
  }

  // 검색 (패턴 매칭)
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  // 페이지네이션
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products, error, count } = await query as { data: any[] | null; error: any; count: number | null };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!products || products.length === 0) {
    return NextResponse.json({
      products: [],
      total: count,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  }

  // 2단계: 이 제품들의 가격 정보를 v_all_prices에서 가져오기
  const productIds = products.map((p: { id: string }) => p.id);

  let priceQuery = supabase
    .from("v_all_prices" as "product_prices")
    .select("product_id, platform, price, url, image_url")
    .in("product_id", productIds);

  // 특정 쇼핑몰만 필터
  if (source && source !== "all") {
    priceQuery = priceQuery.eq("platform", source);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prices } = await priceQuery as { data: any[] | null };

  // 가격을 product_id별로 그룹핑
  const priceMap: Record<string, MallPrice[]> = {};
  if (prices) {
    for (const p of prices) {
      if (!priceMap[p.product_id]) {
        priceMap[p.product_id] = [];
      }
      priceMap[p.product_id].push({
        platform: p.platform,
        price: p.price,
        url: p.url,
        image_url: p.image_url,
      });
    }
  }

  // 가격 정보 합치기 (가격순 정렬)
  const productsWithPrices = products.map((product: { id: string }) => ({
    ...product,
    product_prices: (priceMap[product.id] || []).sort(
      (a: MallPrice, b: MallPrice) => a.price - b.price
    ),
  }));

  return NextResponse.json({
    products: productsWithPrices,
    total: count,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
