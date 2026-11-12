import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { byRank, parseProfile, scoreAndRank, loadFeedback } from "@/lib/recommend";
import { getActorId } from "@/lib/actor-server";
import { TASTE_RANGES } from "@/lib/recommend/constants";
import { isAllergenic } from "@/lib/recommend/allergy";

/**
 * GET /api/products — 탐색 (거르기 + 정렬 + 쪽 나누기)
 * POST /api/products — 추천순·맛순·영양순: 프로필로 점수를 매긴다
 *   점수는 홈 추천과 같은 lib/recommend (scoreAndRank) — 같은 제품·같은 프로필이면 어디서나 같은 적합도
 *   전체 후보(건강 점수 상위 POOL 개)를 매긴 뒤 쪽을 나눈다 (전에는 20개짜리 한 쪽 안에서만 다시 정렬했다)
 * 가격순도 같은 방식 — 후보 전체에 가격을 붙인 뒤 정렬하고 쪽을 나눈다
 */
const POOL = 300;

/** 알레르기 유발 제품 거르기 (이름 + 원재료) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterAllergens(products: any[], allergies: string[]): any[] {
  if (!allergies.length) return products;
  return products.filter((p) => !isAllergenic(p, allergies));
}

/* ════════════════════════════════════════════
   상수 & 타입
   ════════════════════════════════════════════ */

type MallPrice = {
  platform: string;
  price: number;
  url: string;
  image_url: string | null;
};

const PURPOSE_TAG_MAP: Record<string, string[]> = {
  gut_health: ["probiotics", "prebiotic"],
  skin: ["collagen", "vitamin"],
  weight: ["diet", "sugar_free"],
  muscle: ["protein"],
  immunity: ["vitamin", "omega3", "zinc"],
  bone: ["calcium"],
  eye: ["lutein"],
};

/* ════════════════════════════════════════════
   공통: URL 파라미터 파싱
   ════════════════════════════════════════════ */

function parseSearchParams(searchParams: URLSearchParams) {
  return {
    salty: Number(searchParams.get("salty") || 0),
    sweet: Number(searchParams.get("sweet") || 0),
    spicy: Number(searchParams.get("spicy") || 0),
    fatty: Number(searchParams.get("fatty") || 0),
    search: searchParams.get("q") || null,
    tag: searchParams.get("tag") || null,
    tags: searchParams.get("tags") || null,
    purpose: searchParams.get("purpose") || null,
    dishCategory: searchParams.get("dish_category") || null,
    hasPriceOnly: searchParams.get("hasPrice") === "1",
    priceMin: Number(searchParams.get("price_min") || 0),
    priceMax: Number(searchParams.get("price_max") || 0),
    proteinMin: Number(searchParams.get("protein_min") || 0),
    caloriesMax: Number(searchParams.get("calories_max") || 0),
    sodiumMax: Number(searchParams.get("sodium_max") || 0),
    sugarMax: Number(searchParams.get("sugar_max") || 0),
    fiberMin: Number(searchParams.get("fiber_min") || 0),
    per100gSugarMax: Number(searchParams.get("per100g_sugar_max") || 0),
    per100gSodiumMax: Number(searchParams.get("per100g_sodium_max") || 0),
    per100gProteinMin: Number(searchParams.get("per100g_protein_min") || 0),
    per100gCaloriesMax: Number(searchParams.get("per100g_calories_max") || 0),
    healthScoreMin: Number(searchParams.get("health_min") || 0),
    sort: searchParams.get("sort") || "name",
    page: Number(searchParams.get("page") || 1),
    limit: Math.min(Number(searchParams.get("limit") || 20), 50),
    source: searchParams.get("source") || null,
    kind: searchParams.get("kind") === "meal_service" ? "meal_service" : null,
    allergies: (searchParams.get("allergies") || "").split(",").filter(Boolean),
  };
}

/* ════════════════════════════════════════════
   공통: DB 쿼리 빌드
   ════════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProductQuery(supabase: any, params: ReturnType<typeof parseSearchParams>, pool = false) {
  const {
    salty, sweet, fatty, spicy,
    search, tag, tags, purpose, dishCategory,
    hasPriceOnly, kind,
    proteinMin, caloriesMax, sodiumMax, sugarMax, fiberMin, healthScoreMin,
    sort, page, limit,
  } = params;

  // 정렬 매핑
  type OrderCol = "name" | "protein_g" | "calories" | "health_score";
  const sortMap: Record<string, { column: OrderCol; ascending: boolean }> = {
    name: { column: "name", ascending: true },
    price_asc: { column: "health_score", ascending: false }, // 후보 POOL 개를 받아 가격으로 다시 정렬
    price_desc: { column: "health_score", ascending: false },
    protein_desc: { column: "protein_g", ascending: false },
    calories_asc: { column: "calories", ascending: true },
    health_desc: { column: "health_score", ascending: false },
    recommend: { column: "health_score", ascending: false }, // 후보 POOL 개를 받아 점수로 다시 정렬
  };
  const orderBy = sortMap[sort] || sortMap.name;

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    // 건강 점수가 없는 제품(나트륨이 빠진 한 끼 등)도 탐색에는 보인다 — 점수 순이면 맨 뒤로
    .order(orderBy.column, { ascending: orderBy.ascending, nullsFirst: false });

  // 맛 필터
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
    // 매운맛 단계(1~10) → spicy_score(0~5) 가운데 ±1. 전에는 '이상'만 걸려 '덜 맵게'를 고르면 매운 제품만 남았다
    const target = Math.round(spicy / 2);
    query = query.gte("spicy_score", Math.max(0, target - 1)).lte("spicy_score", Math.min(5, target + 1));
  }

  // 상용제품 + 건강식단서비스
  // (홈 카테고리 '식단 서비스' → kind=meal_service)
  query = kind === "meal_service"
    ? query.eq("category_large", "건강식단서비스")
    : query.in("category_large", ["상용제품", "건강식단서비스"]);

  // 구매 가능 제품만
  if (hasPriceOnly) {
    query = query.eq("is_purchasable", true);
  }

  // 기능성 태그 필터
  if (tag) query = query.contains("functional_tags", [tag]);
  if (tags) {
    const tagList = tags.split(",").filter(Boolean);
    if (tagList.length === 1) query = query.contains("functional_tags", [tagList[0]]);
    else if (tagList.length > 1) query = query.or(tagList.map(t => `functional_tags.cs.{${t}}`).join(","));
  }

  // 목적 필터
  if (purpose) {
    const purposes = purpose.split(",").filter(Boolean);
    const allTags = new Set<string>();
    for (const p of purposes) {
      const mapped = PURPOSE_TAG_MAP[p];
      if (mapped) mapped.forEach(t => allTags.add(t));
    }
    if (allTags.size === 1) query = query.contains("functional_tags", [[...allTags][0]]);
    else if (allTags.size > 1) query = query.or([...allTags].map(t => `functional_tags.cs.{${t}}`).join(","));
  }

  // 음식 종류 필터
  if (dishCategory) {
    const cats = dishCategory.split(",").filter(Boolean);
    if (cats.length === 1) query = query.eq("dish_category", cats[0]);
    else if (cats.length > 1) query = query.in("dish_category", cats);
  }

  // 영양 조건 필터
  if (proteinMin > 0) query = query.gte("protein_g", proteinMin);
  if (caloriesMax > 0) query = query.lte("calories", caloriesMax);
  if (sodiumMax > 0) query = query.lte("sodium_mg", sodiumMax);
  if (sugarMax > 0) query = query.lte("sugar_g", sugarMax);
  if (fiberMin > 0) query = query.gte("fiber_g", fiberMin);
  if (healthScoreMin > 0) query = query.gte("health_score", healthScoreMin);

  // 검색
  if (search) query = query.ilike("name", `%${search}%`);

  // 쪽 나누기 — pool 이면 후보 전체(POOL 개)를 받아 서버에서 정렬한 뒤 나눈다
  if (pool) query = query.range(0, POOL - 1);
  else {
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);
  }

  return query;
}

/* ════════════════════════════════════════════
   공통: 가격 조회 + 후처리
   ════════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachPricesAndFilter(supabase: any, products: any[], params: ReturnType<typeof parseSearchParams>) {
  const {
    source, priceMin, priceMax, sort,
    per100gSugarMax, per100gSodiumMax, per100gProteinMin, per100gCaloriesMax,
  } = params;

  const productIds = products.map((p: { id: string }) => p.id);

  // 후보가 많을 때 주소가 너무 길어지지 않게 150개씩
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prices: any[] = [];
  for (let i = 0; i < productIds.length; i += 150) {
    let priceQuery = supabase
      .from("v_all_prices" as "product_prices")
      .select("product_id, platform, price, url, image_url")
      .in("product_id", productIds.slice(i, i + 150));
    if (source && source !== "all") priceQuery = priceQuery.eq("platform", source);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await priceQuery as { data: any[] | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    prices.push(...(data || []));
  }

  const priceMap: Record<string, MallPrice[]> = {};
  if (prices) {
    for (const p of prices) {
      if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
      priceMap[p.product_id].push({
        platform: p.platform, price: p.price, url: p.url, image_url: p.image_url,
      });
    }
  }

  // 가격 + 100g당 환산
  // DB 영양값은 이미 nutrient_base_g(보통 100g) 기준 — 전에는 1회 제공량으로 한 번 더 나눠 '100g당' 필터가 틀렸다
  let result = products.map((product: { id: string; nutrient_base_g?: number; sugar_g?: number; sodium_mg?: number; protein_g?: number; calories?: number }) => {
    const base = Number(product.nutrient_base_g) || 100;
    const per100 = (v: number | undefined | null) => (v != null ? Math.round((Number(v) * 100 / base) * 10) / 10 : null);
    return {
      ...product,
      per100g_sugar: per100(product.sugar_g),
      per100g_sodium: per100(product.sodium_mg),
      per100g_protein: per100(product.protein_g),
      per100g_calories: per100(product.calories),
      product_prices: (priceMap[product.id] || []).sort((a: MallPrice, b: MallPrice) => a.price - b.price),
    };
  });

  // 100g당 기준 후처리
  if (per100gSugarMax > 0) result = result.filter((p: { per100g_sugar: number | null }) => p.per100g_sugar != null && p.per100g_sugar <= per100gSugarMax);
  if (per100gSodiumMax > 0) result = result.filter((p: { per100g_sodium: number | null }) => p.per100g_sodium != null && p.per100g_sodium <= per100gSodiumMax);
  if (per100gProteinMin > 0) result = result.filter((p: { per100g_protein: number | null }) => p.per100g_protein != null && p.per100g_protein >= per100gProteinMin);
  if (per100gCaloriesMax > 0) result = result.filter((p: { per100g_calories: number | null }) => p.per100g_calories != null && p.per100g_calories <= per100gCaloriesMax);

  // 가격 필터
  if (priceMin > 0 || priceMax > 0) {
    result = result.filter((p: { product_prices: MallPrice[] }) => {
      const validPrices = p.product_prices.filter((pp: MallPrice) => pp.price > 0);
      if (validPrices.length === 0) return false;
      const best = Math.min(...validPrices.map((pp: MallPrice) => pp.price));
      if (priceMin > 0 && best < priceMin) return false;
      if (priceMax > 0 && best > priceMax) return false;
      return true;
    });
  }

  // 가격 정렬
  if (sort === "price_asc" || sort === "price_desc") {
    const asc = sort === "price_asc";
    result.sort((a: { product_prices: MallPrice[] }, b: { product_prices: MallPrice[] }) => {
      const aPrice = a.product_prices.length > 0 ? a.product_prices[0].price : Infinity;
      const bPrice = b.product_prices.length > 0 ? b.product_prices[0].price : Infinity;
      return asc ? aPrice - bPrice : bPrice - aPrice;
    });
  }

  const postFiltered = priceMin > 0 || priceMax > 0 || per100gSugarMax > 0 || per100gSodiumMax > 0 || per100gProteinMin > 0 || per100gCaloriesMax > 0;
  return { result, postFiltered };
}

/* ════════════════════════════════════════════
   GET: 기존 제품 탐색 (변경 없음)
   ════════════════════════════════════════════ */

/** 후보 전체를 정렬한 뒤 한 쪽만 — total 은 조건에 맞는 전체 수, 쪽은 정렬한 후보(최대 POOL) 안에서 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageOf(rows: any[], params: ReturnType<typeof parseSearchParams>, count: number | null) {
  const from = (params.page - 1) * params.limit;
  return { products: rows.slice(from, from + params.limit), total: Math.max(rows.length, count ?? 0), page: params.page, limit: params.limit, totalPages: Math.ceil(rows.length / params.limit), pooled: true };
}

export async function GET(request: NextRequest) {
  const params = parseSearchParams(request.nextUrl.searchParams);
  const supabase = createServiceRoleClient();

  // 가격순: 후보 전체에 가격을 붙여 정렬한 뒤 쪽을 나눈다 (전에는 이름순 20개 안에서만 정렬)
  if (params.sort === "price_asc" || params.sort === "price_desc") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, count } = await buildProductQuery(supabase, params, true) as { data: any[] | null; error: any; count: number | null };
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    try {
      const { result, postFiltered } = await attachPricesAndFilter(supabase, filterAllergens(data || [], params.allergies), params);
      return NextResponse.json(pageOf(result, params, postFiltered || params.allergies.length ? null : count));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  const query = buildProductQuery(supabase, params);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products, error, count } = await query as { data: any[] | null; error: any; count: number | null };

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!products || products.length === 0) {
    return NextResponse.json({ products: [], total: count, page: params.page, limit: params.limit, totalPages: Math.ceil((count || 0) / params.limit) });
  }

  // 알레르기 필터
  const allergyFiltered = filterAllergens(products, params.allergies);

  let attached;
  try { attached = await attachPricesAndFilter(supabase, allergyFiltered, params); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const { result, postFiltered } = attached;

  return NextResponse.json({
    products: result,
    total: postFiltered || params.allergies.length > 0 ? result.length : count,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil((postFiltered ? result.length : (count || 0)) / params.limit),
  });
}

/* ════════════════════════════════════════════
   POST: 추천순·맛순·영양순 (프로필 → 홈 추천과 같은 점수)
   body: 프로필(goals·tastes·allergies …), ?rank=recommend|taste_desc|nutrition_desc
   ════════════════════════════════════════════ */

export async function POST(request: NextRequest) {
  const limited = await limitRequest(request, "recommend");
  if (limited) return limited;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }
  const params = parseSearchParams(request.nextUrl.searchParams);
  const rank = request.nextUrl.searchParams.get("rank") || "recommend";
  params.sort = "recommend";
  const profile = parseProfile(body);
  const supabase = createServiceRoleClient();
  // 내 맛 평가로 입맛 보정 · 싫어한 제품 빼기 — 홈 추천과 같은 방식
  const actor = await getActorId();
  let feedback;
  try { feedback = actor ? await loadFeedback(supabase, actor, profile.tastes) : undefined; } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  if (feedback) Object.assign(profile.tastes, feedback.learned);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error, count } = await buildProductQuery(supabase, params, true) as { data: any[] | null; error: any; count: number | null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ products: [], total: 0, page: params.page, limit: params.limit, totalPages: 0 });

  // 거르기(가격·100g당)가 있으면 후보 전체에 가격을 먼저 붙인다
  const allergies = profile.allergies.length ? profile.allergies : params.allergies;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = filterAllergens(data, allergies);
  const needsPricesFirst = params.priceMin > 0 || params.priceMax > 0 || params.per100gSugarMax > 0 || params.per100gSodiumMax > 0 || params.per100gProteinMin > 0 || params.per100gCaloriesMax > 0;
  try {
    if (needsPricesFirst) rows = (await attachPricesAndFilter(supabase, rows, params)).result;
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }

  const purchasable = new Set(rows.filter((p) => p.is_purchasable).map((p) => p.id as string));
  const kstHour = new Date(Date.now() + 9 * 3600e3).getUTCHours();
  const scored = scoreAndRank(rows, { ...profile, allergies }, purchasable, undefined, undefined, kstHour, undefined, feedback);
  if (rank === "taste_desc") scored.sort((a, b) => (b.taste_score ?? 0) - (a.taste_score ?? 0) || byRank(a, b));
  else if (rank === "nutrition_desc") scored.sort((a, b) => (b.nutrition_score ?? 0) - (a.nutrition_score ?? 0) || byRank(a, b));

  const page = pageOf(scored, params, needsPricesFirst || allergies.length ? null : count);
  if (!needsPricesFirst) {
    try { page.products = (await attachPricesAndFilter(supabase, page.products, params)).result; }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  }
  return NextResponse.json(page);
}
