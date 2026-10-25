import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// 맛 레벨 → 영양성분 범위 매핑 (10단계)
const TASTE_RANGES: Record<string, Record<number, [number, number]>> = {
  salty: {
    1: [0, 100], 2: [100, 200], 3: [200, 350], 4: [350, 500], 5: [500, 650],
    6: [650, 800], 7: [800, 1000], 8: [1000, 1200], 9: [1200, 1500], 10: [1500, 9999],
  },
  sweet: {
    1: [0, 1], 2: [1, 2], 3: [2, 4], 4: [4, 6], 5: [6, 9],
    6: [9, 12], 7: [12, 16], 8: [16, 20], 9: [20, 25], 10: [25, 99],
  },
  fatty: {
    1: [0, 1], 2: [1, 3], 3: [3, 5], 4: [5, 7], 5: [7, 10],
    6: [10, 15], 7: [15, 20], 8: [20, 25], 9: [25, 30], 10: [30, 99],
  },
};

// 목적 → 관련 태그 매핑 (OR 조합)
const PURPOSE_TAG_MAP: Record<string, string[]> = {
  gut_health: ["probiotics", "prebiotic"],
  skin: ["collagen", "vitamin"],
  weight: ["diet", "sugar_free"],
  muscle: ["protein"],
  immunity: ["vitamin", "omega3", "zinc"],
  bone: ["calcium"],
  eye: ["lutein"],
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
  const tag = searchParams.get("tag") || null; // 단일 태그 (하위 호환)
  const tags = searchParams.get("tags") || null; // 다중 성분 태그 (OR)
  const purpose = searchParams.get("purpose") || null; // 목적 필터 (OR)
  const hasPriceOnly = searchParams.get("hasPrice") === "1";
  const priceMin = Number(searchParams.get("price_min") || 0);
  const priceMax = Number(searchParams.get("price_max") || 0);
  const page = Number(searchParams.get("page") || 1);
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);
  const source = searchParams.get("source") || null;

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order("name");

  // 맛 필터 적용 (10단계)
  if (salty >= 1 && salty <= 10) {
    const [min, max] = TASTE_RANGES.salty[salty];
    query = query.gte("sodium_mg", min).lt("sodium_mg", max);
  }
  if (sweet >= 1 && sweet <= 10) {
    const [min, max] = TASTE_RANGES.sweet[sweet];
    query = query.gte("sugar_g", min).lt("sugar_g", max);
  }
  if (fatty >= 1 && fatty <= 10) {
    const [min, max] = TASTE_RANGES.fatty[fatty];
    query = query.gte("fat_g", min).lt("fat_g", max);
  }
  if (spicy >= 1 && spicy <= 10) {
    query = query.gte("spicy_score", Math.ceil(spicy / 2));
  }

  // 상용제품만
  query = query.eq("category_large", "상용제품");

  // 구매 가능 제품만
  if (hasPriceOnly) {
    query = query.eq("is_purchasable", true);
  }

  // 기능성 태그 필터 (단일 - 하위호환)
  if (tag) {
    query = query.contains("functional_tags", [tag]);
  }

  // 다중 성분 태그 필터 (OR: 선택한 성분 중 하나라도 포함)
  if (tags) {
    const tagList = tags.split(",").filter(Boolean);
    if (tagList.length === 1) {
      query = query.contains("functional_tags", [tagList[0]]);
    } else if (tagList.length > 1) {
      query = query.or(tagList.map(t => `functional_tags.cs.{${t}}`).join(","));
    }
  }

  // 목적 필터 (OR: 목적에 해당하는 태그 중 하나라도 포함)
  if (purpose) {
    const purposes = purpose.split(",").filter(Boolean);
    const allTags = new Set<string>();
    for (const p of purposes) {
      const mapped = PURPOSE_TAG_MAP[p];
      if (mapped) mapped.forEach(t => allTags.add(t));
    }
    if (allTags.size === 1) {
      query = query.contains("functional_tags", [[...allTags][0]]);
    } else if (allTags.size > 1) {
      query = query.or([...allTags].map(t => `functional_tags.cs.{${t}}`).join(","));
    }
  }

  // 검색
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

  // 2단계: 가격 정보
  const productIds = products.map((p: { id: string }) => p.id);

  let priceQuery = supabase
    .from("v_all_prices" as "product_prices")
    .select("product_id, platform, price, url, image_url")
    .in("product_id", productIds);

  if (source && source !== "all") {
    priceQuery = priceQuery.eq("platform", source);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prices } = await priceQuery as { data: any[] | null };

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

  // 가격 정보 합치기
  let productsWithPrices = products.map((product: { id: string }) => ({
    ...product,
    product_prices: (priceMap[product.id] || []).sort(
      (a: MallPrice, b: MallPrice) => a.price - b.price
    ),
  }));

  // 클라이언트사이드 가격 필터 (DB에서 직접 조인이 안 되므로)
  if (priceMin > 0 || priceMax > 0) {
    productsWithPrices = productsWithPrices.filter((p: { product_prices: MallPrice[] }) => {
      const validPrices = p.product_prices.filter((pp: MallPrice) => pp.price > 0);
      if (validPrices.length === 0) return false;
      const best = Math.min(...validPrices.map((pp: MallPrice) => pp.price));
      if (priceMin > 0 && best < priceMin) return false;
      if (priceMax > 0 && best > priceMax) return false;
      return true;
    });
  }

  return NextResponse.json({
    products: productsWithPrices,
    total: priceMin > 0 || priceMax > 0 ? productsWithPrices.length : count,
    page,
    limit,
    totalPages: Math.ceil((priceMin > 0 || priceMax > 0 ? productsWithPrices.length : (count || 0)) / limit),
  });
}
