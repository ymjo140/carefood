/**
 * 프로필 기반 DB 쿼리 빌더
 * 3계층 필터 (Must / Should / Nice) + Graceful Degradation
 */

import type { UserProfile } from "./types";
import { TASTE_RANGES, DIET_PURPOSE_ORDER } from "./constants";

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
    .neq("dish_category", "ingredient");

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

  // ── 정렬 ──
  const order = getOrderBy(profile);
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
  const pm = profile.perMeal;

  // 칼로리 범위 (식단유형에 따라 다름)
  const calMin = Math.round(pm.caloriesMin / relaxFactor);
  const calMax = Math.round(pm.caloriesMax * relaxFactor);

  // 칼로리 필터 (너무 빡빡하지 않게: 하한은 50 이상일 때만)
  if (calMin >= 50) {
    query = query.gte("calories", calMin);
  }
  query = query.lte("calories", calMax);

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
  const { tastes } = profile;
  const maxTaste = 10;

  if (tastes.salty >= 1 && tastes.salty <= maxTaste) {
    const low = Math.max(1, tastes.salty - 1);
    const high = Math.min(maxTaste, tastes.salty + 1);
    query = query.gte("sodium_mg", TASTE_RANGES.salty[low][0]).lt("sodium_mg", TASTE_RANGES.salty[high][1]);
  }
  if (tastes.sweet >= 1 && tastes.sweet <= maxTaste) {
    const low = Math.max(1, tastes.sweet - 1);
    const high = Math.min(maxTaste, tastes.sweet + 1);
    query = query.gte("sugar_g", TASTE_RANGES.sweet[low][0]).lt("sugar_g", TASTE_RANGES.sweet[high][1]);
  }
  if (tastes.fatty >= 1 && tastes.fatty <= maxTaste) {
    const low = Math.max(1, tastes.fatty - 1);
    const high = Math.min(maxTaste, tastes.fatty + 1);
    query = query.gte("fat_g", TASTE_RANGES.fatty[low][0]).lt("fat_g", TASTE_RANGES.fatty[high][1]);
  }

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
