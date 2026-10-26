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
  const dishCategory = searchParams.get("dish_category") || null; // 음식 종류 (쉼표 구분)
  const hasPriceOnly = searchParams.get("hasPrice") === "1";
  const priceMin = Number(searchParams.get("price_min") || 0);
  const priceMax = Number(searchParams.get("price_max") || 0);
  const proteinMin = Number(searchParams.get("protein_min") || 0);
  const caloriesMax = Number(searchParams.get("calories_max") || 0);
  const sodiumMax = Number(searchParams.get("sodium_max") || 0);
  const sugarMax = Number(searchParams.get("sugar_max") || 0);
  const fiberMin = Number(searchParams.get("fiber_min") || 0);
  // 100g당 기준 필터 (per_100g_ 접두사)
  const per100gSugarMax = Number(searchParams.get("per100g_sugar_max") || 0);
  const per100gSodiumMax = Number(searchParams.get("per100g_sodium_max") || 0);
  const per100gProteinMin = Number(searchParams.get("per100g_protein_min") || 0);
  const per100gCaloriesMax = Number(searchParams.get("per100g_calories_max") || 0);
  const sort = searchParams.get("sort") || "name";
  const page = Number(searchParams.get("page") || 1);
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);
  const source = searchParams.get("source") || null;

  const supabase = createServiceRoleClient();

  // 정렬 매핑
  type OrderCol = "name" | "protein_g" | "calories";
  const sortMap: Record<string, { column: OrderCol; ascending: boolean }> = {
    name: { column: "name", ascending: true },
    price_asc: { column: "name", ascending: true }, // 가격정렬은 후처리
    price_desc: { column: "name", ascending: true },
    protein_desc: { column: "protein_g", ascending: false },
    calories_asc: { column: "calories", ascending: true },
  };
  const orderBy = sortMap[sort] || sortMap.name;

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order(orderBy.column, { ascending: orderBy.ascending });

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

  // 음식 종류 필터
  if (dishCategory) {
    const cats = dishCategory.split(",").filter(Boolean);
    if (cats.length === 1) {
      query = query.eq("dish_category", cats[0]);
    } else if (cats.length > 1) {
      query = query.in("dish_category", cats);
    }
  }

  // 영양 조건 필터
  if (proteinMin > 0) query = query.gte("protein_g", proteinMin);
  if (caloriesMax > 0) query = query.lte("calories", caloriesMax);
  if (sodiumMax > 0) query = query.lte("sodium_mg", sodiumMax);
  if (sugarMax > 0) query = query.lte("sugar_g", sugarMax);
  if (fiberMin > 0) query = query.gte("fiber_g", fiberMin);

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

  // 가격 정보 합치기 + 100g당 환산값 추가
  let productsWithPrices = products.map((product: { id: string; serving_size_g?: number; sugar_g?: number; sodium_mg?: number; protein_g?: number; calories?: number }) => {
    const s = product.serving_size_g;
    const per100 = (v: number | undefined | null) => (v != null && s && s > 0) ? Math.round((v / s) * 100 * 10) / 10 : null;
    return {
      ...product,
      per100g_sugar: per100(product.sugar_g),
      per100g_sodium: per100(product.sodium_mg),
      per100g_protein: per100(product.protein_g),
      per100g_calories: per100(product.calories),
      product_prices: (priceMap[product.id] || []).sort(
        (a: MallPrice, b: MallPrice) => a.price - b.price
      ),
    };
  });

  // 100g당 기준 필터 (후처리)
  if (per100gSugarMax > 0) {
    productsWithPrices = productsWithPrices.filter((p: { per100g_sugar: number | null }) =>
      p.per100g_sugar != null && p.per100g_sugar <= per100gSugarMax);
  }
  if (per100gSodiumMax > 0) {
    productsWithPrices = productsWithPrices.filter((p: { per100g_sodium: number | null }) =>
      p.per100g_sodium != null && p.per100g_sodium <= per100gSodiumMax);
  }
  if (per100gProteinMin > 0) {
    productsWithPrices = productsWithPrices.filter((p: { per100g_protein: number | null }) =>
      p.per100g_protein != null && p.per100g_protein >= per100gProteinMin);
  }
  if (per100gCaloriesMax > 0) {
    productsWithPrices = productsWithPrices.filter((p: { per100g_calories: number | null }) =>
      p.per100g_calories != null && p.per100g_calories <= per100gCaloriesMax);
  }

  // 가격 필터 (후처리)
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

  // 가격 정렬 (후처리)
  if (sort === "price_asc" || sort === "price_desc") {
    const asc = sort === "price_asc";
    productsWithPrices.sort((a: { product_prices: MallPrice[] }, b: { product_prices: MallPrice[] }) => {
      const aPrice = a.product_prices.length > 0 ? a.product_prices[0].price : Infinity;
      const bPrice = b.product_prices.length > 0 ? b.product_prices[0].price : Infinity;
      return asc ? aPrice - bPrice : bPrice - aPrice;
    });
  }

  const postFiltered = priceMin > 0 || priceMax > 0 || per100gSugarMax > 0 || per100gSodiumMax > 0 || per100gProteinMin > 0 || per100gCaloriesMax > 0;
  return NextResponse.json({
    products: productsWithPrices,
    total: postFiltered ? productsWithPrices.length : count,
    page,
    limit,
    totalPages: Math.ceil((postFiltered ? productsWithPrices.length : (count || 0)) / limit),
  });
}
