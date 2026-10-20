import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * 맛평가 리뷰 API
 *
 * GET  — 제품별 리뷰 목록 + 평균 통계
 * POST — 리뷰 작성/수정 (로그인 필수)
 */

/* ── GET: 제품 리뷰 조회 ── */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");

  if (!productId) {
    return NextResponse.json({ error: "productId 필요" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // 리뷰 목록
  const { data: reviews, error } = await (supabase
    .from("taste_reviews" as any)
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(20)) as { data: any[] | null; error: any };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 통계 계산
  const stats = calculateStats(reviews || []);

  // 현재 유저의 리뷰 (로그인 시)
  let myReview = null;
  const { data: { user } } = await supabase.auth.getUser();
  if (user && reviews) {
    myReview = reviews.find((r: any) => r.user_id === user.id) || null;
  }

  return NextResponse.json({ reviews: reviews || [], stats, myReview });
}

/* ── POST: 리뷰 작성/수정 ── */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const {
    productId,
    consumptionPct,
    easeRating,
    starRating,
    comment,
    isProxyReview,
  } = body;

  if (!productId || starRating == null || consumptionPct == null) {
    return NextResponse.json(
      { error: "필수 항목이 누락되었습니다." },
      { status: 400 }
    );
  }

  // 유저의 페르소나 정보 가져오기
  const { data: userData } = await (supabase
    .from("users") as any)
    .select("persona, orderer_relation")
    .eq("id", user.id)
    .single();

  const { data: review, error } = await ((supabase
    .from("taste_reviews") as any)
    .upsert(
      {
        user_id: user.id,
        product_id: productId,
        consumption_pct: consumptionPct,
        ease_rating: easeRating || null,
        star_rating: starRating,
        comment: comment || null,
        is_proxy_review: isProxyReview || false,
        persona: userData?.persona || null,
        orderer_relation: userData?.orderer_relation || null,
      },
      { onConflict: "user_id,product_id" }
    )
    .select()
    .single()) as { data: any; error: any };

  if (error) {
    console.error("Review save error:", error);
    return NextResponse.json({ error: "리뷰 저장 실패" }, { status: 500 });
  }

  return NextResponse.json({ review });
}

/* ── 통계 헬퍼 ── */
function calculateStats(reviews: any[]) {
  if (reviews.length === 0) {
    return {
      count: 0,
      avgStarRating: 0,
      avgConsumptionPct: 0,
      avgEaseRating: 0,
    };
  }

  const count = reviews.length;
  const avgStarRating =
    reviews.reduce((s, r) => s + (r.star_rating || 0), 0) / count;
  const avgConsumptionPct =
    reviews.reduce((s, r) => s + (r.consumption_pct || 0), 0) / count;

  const withEase = reviews.filter((r) => r.ease_rating != null);
  const avgEaseRating =
    withEase.length > 0
      ? withEase.reduce((s, r) => s + r.ease_rating, 0) / withEase.length
      : 0;

  return {
    count,
    avgStarRating: Math.round(avgStarRating * 10) / 10,
    avgConsumptionPct: Math.round(avgConsumptionPct),
    avgEaseRating: Math.round(avgEaseRating * 10) / 10,
  };
}
