/**
 * 프로필 기반 DB 쿼리 빌더
 * 3계층 필터 (Must / Should / Nice) + Graceful Degradation
 */

import type { UserProfile } from "./types";
import { DIET_PURPOSE_ORDER } from "./constants";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SupabaseClient = any;
type SupabaseQuery = any;

// ── 메인: Graceful Degradation 포함 쿼리 실행 ──

export async function fetchRecommendPool(
  supabase: SupabaseClient,
  profile: UserProfile,
  limit = 500,
): Promise<{ products: Record<string, unknown>[]; degraded: boolean; degradeMessage?: string }> {
  // 1차: Must + Should + Nice
  let result = await executeQuery(supabase, profile, "full", limit);
  if (result.length >= 30) {
    return { products: result, degraded: false };
  }

  // 2차: Must + Should (Nice 해제)
  result = await executeQuery(supabase, profile, "no_nice", limit);
  if (result.length >= 10) {
    return { products: result, degraded: true, degradeMessage: "맛 조건을 넓혀서 찾았어요" };
  }

  // 3차: Must + Should 확장 (±30%)
  result = await executeQuery(supabase, profile, "relaxed", limit);
  if (result.length >= 3) {
    return { products: result, degraded: true, degradeMessage: "조건을 넓혀서 찾았어요" };
  }

  // 4차: Must만 (최종 폴백)
  result = await executeQuery(supabase, profile, "must_only", limit);
  return {
    products: result,
    degraded: true,
    degradeMessage: result.length > 0 ? "기본 조건으로 찾았어요" : undefined,
  };
}

/**
 * 첫 방문(프로필 없음) 후보 — 지금 살 수 있는 한 끼·반찬 중 건강 점수가 높은 것.
 * 인기 순위를 만들 이용 기록이 아직 없어 건강 점수로 고른다.
 */
export async function fetchColdPool(supabase: SupabaseClient, limit = 300): Promise<Record<string, unknown>[]> {
  const { data, error } = await (supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .eq("is_purchasable", true)
    .in("meal_role", ["meal", "side"])
    .not("health_score", "is", null)
    .order("health_score", { ascending: false })
    .limit(limit) as unknown as Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>);
  if (error) throw new Error(error.message);
  return data || [];
}

// ── 쿼리 실행 ──

type QueryMode = "full" | "no_nice" | "relaxed" | "must_only";

async function executeQuery(
  supabase: SupabaseClient,
  profile: UserProfile,
  mode: QueryMode,
  limit: number,
): Promise<Record<string, unknown>[]> {
  let query = supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .not("health_score", "is", null)
    .neq("dish_category", "sauce")
    .neq("dish_category", "ingredient")
    .neq("dish_category", "supplement") // 건강기능식품은 끼니 추천에서 뺀다
    // 분류가 '기타'로 잘못 들어간 영양제·소스·식재료까지 (meal_role — scripts/build_taste_profile.py)
    .or("meal_role.is.null,meal_role.not.in.(supplement,condiment,ingredient)");

  // ── Must 필터 (안전 — 항상 적용) ──
  query = applyMustFilters(query, profile);

  // ── Should 필터 (개인화) ──
  if (mode !== "must_only") {
    const relaxFactor = mode === "relaxed" ? 1.3 : 1.0;
    query = applyShouldFilters(query, profile, relaxFactor);
  }

  // ── Nice 필터 (선호) ──
  if (mode === "full") {
    query = applyNiceFilters(query, profile);
  }

  // ── 끼니 우선: 앞 두 단계는 한 끼·반찬만 (간식·음료는 조건을 넓힐 때 들어온다)
  //    100g 당 단백질로 정렬하면 말린 간식(먹태·육포)이 위로 오는 것을 막는다
  if (mode === "full" || mode === "no_nice") {
    query = query.in("meal_role", ["meal", "side"]);
  }

  // ── 정렬 ──
  const order = getOrderBy(profile);
  // 나트륨 적은 순이면 빠진 값(0·0.1mg)이 맨 앞에 몰린다 — 20mg 미만은 뺀다 (흰밥 같은 반찬도 빠지지만 후보일 뿐)
  if (order.column === "sodium_mg") query = query.gte("sodium_mg", 20);
  query = query.order(order.column as "name", { ascending: order.ascending });

  // ── 제한 ──
  query = query.limit(limit);

  const { data } = await query as { data: Record<string, unknown>[] | null };
  return data || [];
}

// ── Must 필터: 건강 리스크 기반, 절대 완화 안 함 ──

function applyMustFilters(query: SupabaseQuery, profile: UserProfile) {
  // 혈당 주의 → 당류 하드 상한
  if (profile.healthRisks.glucose === "warning") {
    query = query.lte("sugar_g", profile.perMeal.maxSugarG); // 보통 8g
  }

  // 혈압 주의 → 나트륨 하드 상한
  if (profile.healthRisks.bloodPressure === "warning") {
    query = query.lte("sodium_mg", profile.perMeal.maxSodiumMg); // 보통 500mg
  }

  // 신장 관심 → 저단백 + 저염
  if (profile.healthRisks.kidney) {
    query = query.lte("protein_g", 10).lte("sodium_mg", 400);
  }

  // 고지혈 주의 → 저지방
  if (profile.healthRisks.cholesterol === "warning") {
    query = query.lte("fat_g", 15);
  }

  // 상용제품 + 건강식단서비스 모두 포함
  query = query.in("category_large", ["상용제품", "건강식단서비스"]);

  return query;
}

// ── Should 필터: perMeal 기반 개인화 ──

function applyShouldFilters(query: SupabaseQuery, profile: UserProfile, relaxFactor: number) {
  // 열량 밀도 (100g 당) — DB 값은 100g 당이라 한 끼 목표(400~800kcal)와 바로 견주면 안 된다.
  //   전에는 calories ≥ 한 끼 하한(≈433)으로 걸러 100g 당 433kcal 넘는 마른 것(볶은 콩·김)만 남았다 (scripts/eval_recommend.mjs)
  //   한 끼 양은 순위(scoring.ts 의 1회 제공량 환산)에서 본다. 여기서는 마른 간식만 뺀다.
  const lighter = profile.goals.includes("weight_loss") || profile.dietType === "diet";
  query = query.lte("calories", Math.round((lighter ? 250 : 350) * relaxFactor));

  // 혈당 경계 (Must보단 느슨)
  if (profile.healthRisks.glucose === "borderline") {
    query = query.lte("sugar_g", Math.round(profile.perMeal.maxSugarG * relaxFactor));
  }

  // 혈압 경계
  if (profile.healthRisks.bloodPressure === "borderline") {
    query = query.lte("sodium_mg", Math.round(profile.perMeal.maxSodiumMg * relaxFactor));
  }

  // 콜레스테롤 경계
  if (profile.healthRisks.cholesterol === "borderline") {
    query = query.lte("fat_g", Math.round(20 * relaxFactor));
  }

  return query;
}

// ── Nice 필터: 맛 선호 ──

function applyNiceFilters(query: SupabaseQuery, profile: UserProfile) {
  // 제품 맛 단계(products.taste_* — 영양 수치·원재료·이름)로 거른다
  // 짠·단·고소: 고른 단계보다 2단계 이상 '센' 제품만 뺀다 (덜한 것은 남긴다 — 순위에서 맛 점수로 가린다)
  // 매운맛: 못 먹는 사람(1~3)에게는 4단계 이하만, 좋아하는 사람(8~10)에게는 4단계 이상만
  // 값을 모르면 남긴다
  const { tastes } = profile;
  for (const axis of ["salty", "sweet", "fatty"] as const) {
    const lv = tastes[axis];
    if (lv >= 1 && lv <= 10) query = query.or(`taste_${axis}.lte.${Math.min(10, lv + 1)},taste_${axis}.is.null`);
  }
  if (tastes.spicy >= 1 && tastes.spicy <= 3) query = query.or("taste_spicy.lte.4,taste_spicy.is.null");
  else if (tastes.spicy >= 8) query = query.gte("taste_spicy", 4);
  return query;
}

// ── 정렬: 식단 목적 + 관심사에 따라 ──

function getOrderBy(profile: UserProfile): { column: string; ascending: boolean } {
  // 1순위: 식단 목적
  for (const goal of profile.goals) {
    if (DIET_PURPOSE_ORDER[goal]) return DIET_PURPOSE_ORDER[goal];
  }
  // 2순위: 식단 유형
  if (DIET_PURPOSE_ORDER[profile.dietType]) return DIET_PURPOSE_ORDER[profile.dietType];
  // 3순위: 관심사
  for (const concern of profile.concerns) {
    if (DIET_PURPOSE_ORDER[concern]) return DIET_PURPOSE_ORDER[concern];
  }
  return DIET_PURPOSE_ORDER.default;
}

// ── 구매 가능 제품 ID 로드 ──

export async function loadPurchasableIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from("v_all_prices" as "product_prices")
    .select("product_id") as { data: { product_id: string }[] | null };
  return new Set<string>((data || []).map((p) => p.product_id));
}

// ── 가격 로드 ──

export type PriceInfo = { platform: string; price: number; url: string; image_url: string | null };

export async function loadPrices(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<Record<string, PriceInfo[]>> {
  if (productIds.length === 0) return {};
  const { data } = await supabase
    .from("v_all_prices" as "product_prices")
    .select("product_id, platform, price, url, image_url")
    .in("product_id", productIds) as { data: { product_id: string; platform: string; price: number; url: string; image_url: string | null }[] | null };

  const map: Record<string, PriceInfo[]> = {};
  for (const p of data || []) {
    if (!map[p.product_id]) map[p.product_id] = [];
    map[p.product_id].push({ platform: p.platform, price: p.price, url: p.url, image_url: p.image_url });
  }
  // 가격순 정렬
  for (const id of Object.keys(map)) {
    map[id].sort((a, b) => a.price - b.price);
  }
  return map;
}
