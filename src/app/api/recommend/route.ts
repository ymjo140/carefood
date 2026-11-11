import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import {
  parseProfile,
  getProfileLabels,
  scoreAndRank,
  fetchRecommendPool,
  loadPrices,
  loadUserInteractions,
  loadProductReviewStats,
  diversifyResults,
  insertExplorationSlots,
  getCFBoosts,
} from "@/lib/recommend";
import type { CFBoost } from "@/lib/recommend";

/**
 * POST /api/recommend — 프로필(목표·입맛·검진 수치) 기반 추천 (홈 · 검진 리포트)
 *   body: { profile, health } — 브라우저의 carefood_profile · carefood_health 그대로
 *   후보: lib/recommend/query-builder (거르기 + 단계적 완화) → 점수: lib/recommend/scoring (탐색 추천순과 같은 식)
 *   → 다양성 섞기 + 탐색 칸 → 상위 30개
 * (예전 GET — 묶음·쪽 나누기 탐색 — 은 부르는 곳이 없어 지웠다. 탐색은 /api/products)
 */

/** 구매 가능 제품 id — 이미 불러온 제품 행의 is_purchasable 로 */
function purchasableFrom(rows: Record<string, unknown>[]): Set<string> {
  return new Set(rows.filter((p) => p.is_purchasable).map((p) => p.id as string));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // v2 호환: concerns/tastes 직접 전달 → v4 프로필로 변환
    const profileRaw = body.profile || body;
    const healthRaw = body.health || null;
    const userId = (await getActorId()) || "";

    const profile = parseProfile(profileRaw, healthRaw);

    const supabase = createServiceRoleClient();

    // 3계층 필터 + Graceful Degradation + 인터랙션 (병렬)
    const loadInteractions = userId
      ? loadUserInteractions(supabase, userId)
      : Promise.resolve(undefined);

    const [{ products, degraded, degradeMessage }, interactions] = await Promise.all([
      fetchRecommendPool(supabase, profile, 500),
      loadInteractions,
    ]);
    const purchasableIds = purchasableFrom(products);

    if (products.length === 0) {
      return NextResponse.json({
        recommendations: [],
        profileLabels: getProfileLabels(profile),
        total: 0,
        message: "조건에 맞는 제품이 없습니다.",
      });
    }

    // 리뷰 통계 + 협업 필터링 로드 (병렬) + 시간대별 부스트
    const allProductIds = products.map((p) => p.id as string);
    const [reviewStats, cfBoosts] = await Promise.all([
      loadProductReviewStats(supabase, allProductIds),
      userId ? getCFBoosts(supabase, userId, {
        goals: profile.goals,
        concerns: profile.concerns,
        age: profile.body.age,
        bmi: profile.body.bmi,
        tastes: profile.tastes,
      }) : Promise.resolve([] as CFBoost[]),
    ]);
    const kstHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
    const scored = scoreAndRank(products, profile, purchasableIds, interactions, reviewStats, kstHour, cfBoosts.length > 0 ? cfBoosts : undefined);

    // 다양성 보장 + 탐색 슬롯
    const diversified = diversifyResults(scored);
    const withExploration = insertExplorationSlots(diversified, interactions);
    const top = withExploration.slice(0, 30);
    const productIds = top.map((p) => p.id as string);

    // 가격 (리뷰 통계는 위에서 불러온 product_reviews 기준)
    const priceMap = await loadPrices(supabase, productIds);

    const recommendations = top.map((p) => ({
      ...p,
      product_prices: (priceMap[p.id as string] || []).sort((a, b) => a.price - b.price),
      review_stats: reviewStats[p.id as string] || null,
    }));

    return NextResponse.json({
      recommendations,
      profileLabels: getProfileLabels(profile),
      total: products.length,
      degraded,
      degradeMessage,
      filters_applied: {
        concerns: profile.concerns,
        conditions: profile.conditions,
        perMeal: profile.perMeal,
        healthRisks: profile.healthRisks,
        bmi: profile.body.bmi,
      },
    });
  } catch (err) {
    console.error("Recommend POST error:", err);
    return NextResponse.json({ error: "추천 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
