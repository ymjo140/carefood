import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/dashboard
 * 관리 대시보드 데이터 (데이터 현황 + 품질 + 사용자 분석)
 */
export async function GET(_request: NextRequest) {
  await connection(); // force dynamic rendering
  const supabase = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // ── 1. 데이터 현황 ──
  const [
    { count: totalProducts },
    { count: activeProducts },
    { count: purchasable },
    { count: categorized },
    { count: spikyTagged },
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true).eq("is_purchasable", true),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true).not("dish_category", "is", null),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true).gt("spicy_score", 0),
  ]);

  // 플랫폼별 매칭
  const platformStats = await Promise.all([
    sb.from("kurly_products").select("*", { count: "exact", head: true }).eq("match_status", "matched"),
    sb.from("st11_products").select("*", { count: "exact", head: true }).eq("match_status", "matched"),
    sb.from("oasis_products").select("*", { count: "exact", head: true }).eq("match_status", "matched"),
    sb.from("homeplus_products").select("*", { count: "exact", head: true }).eq("match_status", "matched"),
  ]);

  // 품목제조보고
  const { count: foodReportsTotal } = await sb.from("food_reports").select("*", { count: "exact", head: true });
  const { count: foodReportsMatched } = await sb.from("food_reports").select("*", { count: "exact", head: true }).not("matched_product_id", "is", null);

  // ── 2. 품질 관리 ──
  const [
    { count: lowScoreCount },
    { count: noPriceCount },
    { count: noIngredientProducts },
  ] = await Promise.all([
    sb.from("kurly_products").select("*", { count: "exact", head: true }).eq("match_status", "low_score"),
    sb.from("products").select("*", { count: "exact", head: true }).eq("is_active", true).eq("is_purchasable", true).is("calories", null),
    sb.from("products").select("*", { count: "exact", head: true }).eq("is_active", true).eq("is_purchasable", true).is("calories", null),
  ]);

  // ── 3. 사용자 분석 ──
  const { count: totalProfiles } = await sb.from("user_profiles").select("*", { count: "exact", head: true }).eq("onboarding_completed", true);
  const { count: totalReviews } = await sb.from("product_reviews").select("*", { count: "exact", head: true });
  const { count: totalInteractions } = await sb.from("user_interactions").select("*", { count: "exact", head: true });

  // 세그먼트 분포
  const { data: ageDistribution } = await sb
    .from("user_profiles")
    .select("age_group")
    .eq("onboarding_completed", true)
    .not("age_group", "is", null);

  const { data: concernDistribution } = await sb
    .from("user_profiles")
    .select("concerns")
    .eq("onboarding_completed", true);

  const { data: dietDistribution } = await sb
    .from("user_profiles")
    .select("diet_type")
    .eq("onboarding_completed", true)
    .not("diet_type", "is", null);

  // 집계
  const ageCounts: Record<string, number> = {};
  for (const r of (ageDistribution || [])) {
    if (r.age_group) ageCounts[r.age_group] = (ageCounts[r.age_group] || 0) + 1;
  }

  const concernCounts: Record<string, number> = {};
  for (const r of (concernDistribution || [])) {
    for (const c of (r.concerns || [])) {
      concernCounts[c] = (concernCounts[c] || 0) + 1;
    }
  }

  const dietCounts: Record<string, number> = {};
  for (const r of (dietDistribution || [])) {
    if (r.diet_type) dietCounts[r.diet_type] = (dietCounts[r.diet_type] || 0) + 1;
  }

  // 최근 7일 행동 추이
  const { data: recentInteractions } = await sb
    .from("user_interactions")
    .select("action, created_at")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);

  const dailyActions: Record<string, { views: number; clicks: number; reviews: number }> = {};
  for (const i of (recentInteractions || [])) {
    const day = new Date(i.created_at).toISOString().slice(0, 10);
    if (!dailyActions[day]) dailyActions[day] = { views: 0, clicks: 0, reviews: 0 };
    if (i.action === "view") dailyActions[day].views++;
    else if (i.action === "click_price") dailyActions[day].clicks++;
  }

  return NextResponse.json({
    data: {
      total_products: totalProducts || 0,
      active_products: activeProducts || 0,
      purchasable: purchasable || 0,
      categorized: categorized || 0,
      spicy_tagged: spikyTagged || 0,
      platforms: {
        kurly: platformStats[0].count || 0,
        "11st": platformStats[1].count || 0,
        oasis: platformStats[2].count || 0,
        homeplus: platformStats[3].count || 0,
      },
      food_reports: { total: foodReportsTotal || 0, matched: foodReportsMatched || 0 },
    },
    quality: {
      low_score_matches: lowScoreCount || 0,
      no_nutrition: noPriceCount || 0,
      no_ingredients_linked: (purchasable || 0) - (foodReportsMatched || 0),
    },
    users: {
      total_profiles: totalProfiles || 0,
      total_reviews: totalReviews || 0,
      total_interactions: totalInteractions || 0,
      age_distribution: ageCounts,
      concern_distribution: concernCounts,
      diet_distribution: dietCounts,
      daily_actions: dailyActions,
    },
    generated_at: new Date().toISOString(),
  });
}
