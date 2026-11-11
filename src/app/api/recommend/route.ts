import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
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
  loadFeedback,
  dedupeFamilies,
  EMPTY_FEEDBACK,
} from "@/lib/recommend";
import { fetchColdPool } from "@/lib/recommend/query-builder";
import type { CFBoost } from "@/lib/recommend";

/**
 * POST /api/recommend — 프로필(목표·입맛·검진 수치) 기반 추천 (홈 · 검진 리포트)
 *   body: { profile, health } — 브라우저의 carefood_profile · carefood_health 그대로
 *   후보: lib/recommend/query-builder (거르기 + 단계적 완화) → 점수: lib/recommend/scoring (탐색 추천순과 같은 식)
 *   → 내 맛 평가로 입맛 보정·싫어한 제품 빼기(feedback.ts) → 같은 묶음 하나로(family.ts) → 다양성 섞기 + 탐색 칸 → 상위 30개
 *   프로필이 없으면(첫 방문) cold: 살 수 있는 한 끼·반찬 중 건강 점수 높은 것 — 적합도 없이
 * (예전 GET — 묶음·쪽 나누기 탐색 — 은 부르는 곳이 없어 지웠다. 탐색은 /api/products)
 */

/** 구매 가능 제품 id — 이미 불러온 제품 행의 is_purchasable 로 */
function purchasableFrom(rows: Record<string, unknown>[]): Set<string> {
  return new Set(rows.filter((p) => p.is_purchasable).map((p) => p.id as string));
}

export async function POST(request: NextRequest) {
  const limited = await limitRequest(request, "recommend");
  if (limited) return limited;
  try {
    const body = await request.json();

    // v2 호환: concerns/tastes 직접 전달 → v4 프로필로 변환
    const profileRaw = body.profile || body;
    const healthRaw = body.health || null;
    const userId = (await getActorId()) || "";
    const cold = !profileRaw || typeof profileRaw !== "object" || Object.keys(profileRaw).length === 0 || body.cold === true;

    const profile = parseProfile(cold ? {} : profileRaw, cold ? null : healthRaw);

    const supabase = createServiceRoleClient();

    // 내 맛 평가 → 입맛 보정 (고른 입맛에서 최대 50%까지)
    const feedback = userId ? await loadFeedback(supabase, userId, profile.tastes) : EMPTY_FEEDBACK;
    if (!cold) Object.assign(profile.tastes, feedback.learned);

    // 3계층 필터 + Graceful Degradation + 인터랙션 (병렬)
    const loadInteractions = userId
      ? loadUserInteractions(supabase, userId)
      : Promise.resolve(undefined);

    const [{ products, degraded, degradeMessage }, interactions] = await Promise.all([
      cold ? fetchColdPool(supabase, 300).then((products) => ({ products, degraded: false, degradeMessage: undefined })) : fetchRecommendPool(supabase, profile, 500),
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
    const scored = scoreAndRank(products, profile, purchasableIds, interactions, reviewStats, kstHour, cfBoosts.length > 0 ? cfBoosts : undefined, feedback);

    // 같은 묶음(맛·용량만 다른 같은 제품)은 하나만 → 다양성 보장 + 탐색 슬롯
    const diversified = diversifyResults(dedupeFamilies(scored));
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
      cold,
      // 평가로 맞춘 입맛 — 화면에 "맛 평가 N개로 입맛을 맞췄어요"
      learned: { samples: feedback.samples, tastes: feedback.learned },
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
