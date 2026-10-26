import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * 제품 리뷰 API v2
 * - 건강 프로필 연동 (작성자 연령대/성별/관심사 자동 첨부)
 * - 별점 + 재구매의향 + 맛 체감 평가
 * - 같은 건강 조건 사람의 리뷰만 필터 가능
 */

/* ── GET: 제품 리뷰 조회 ── */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const productId = searchParams.get("productId") || searchParams.get("product_id");

  if (!productId) {
    return NextResponse.json({ error: "product_id 필요" }, { status: 400 });
  }

  const filterConcern = searchParams.get("filter_concern");
  const filterAge = searchParams.get("filter_age");
  const page = Number(searchParams.get("page") || 1);
  const limit = 20;

  const supabase = createServiceRoleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("product_reviews")
    .select("*", { count: "exact" })
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (filterConcern) {
    query = query.contains("reviewer_concerns", [filterConcern]);
  }
  if (filterAge) {
    query = query.eq("reviewer_age_group", filterAge);
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reviews, error, count } = await query as { data: any[] | null; error: any; count: number | null };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 전체 통계
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allReviews } = await (supabase as any)
    .from("product_reviews")
    .select("rating, would_rebuy, taste_salty_feel, taste_sweet_feel, taste_spicy_feel")
    .eq("product_id", productId) as { data: any[] | null };

  const rr = allReviews || [];
  const stats = rr.length > 0 ? {
    count: rr.length,
    avgRating: Math.round(rr.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / rr.length * 10) / 10,
    rebuyRate: Math.round(rr.filter((r: { would_rebuy: boolean | null }) => r.would_rebuy === true).length / rr.length * 100),
    avgTaste: {
      salty: avg(rr, "taste_salty_feel"),
      sweet: avg(rr, "taste_sweet_feel"),
      spicy: avg(rr, "taste_spicy_feel"),
    },
  } : {
    count: 0, avgRating: 0, rebuyRate: 0,
    avgTaste: { salty: null, sweet: null, spicy: null },
  };

  return NextResponse.json({
    reviews: reviews || [],
    stats,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function avg(arr: any[], key: string): number | null {
  const valid = arr.filter(r => r[key] != null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s: number, r: Record<string, number>) => s + r[key], 0) / valid.length * 10) / 10;
}

/* ── POST: 리뷰 작성/수정 ── */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, product_id, rating, would_rebuy,
            taste_salty_feel, taste_sweet_feel, taste_spicy_feel, comment } = body;

    if (!user_id || !product_id || !rating) {
      return NextResponse.json({ error: "user_id, product_id, rating 필수" }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating은 1~5" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // 작성자 프로필
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from("user_profiles")
      .select("age_group, gender, concerns, conditions")
      .eq("user_id", user_id)
      .maybeSingle();

    const reviewData = {
      user_id,
      product_id,
      rating,
      would_rebuy: would_rebuy ?? null,
      taste_salty_feel: taste_salty_feel ?? null,
      taste_sweet_feel: taste_sweet_feel ?? null,
      taste_spicy_feel: taste_spicy_feel ?? null,
      comment: comment || null,
      reviewer_age_group: profile?.age_group || null,
      reviewer_gender: profile?.gender || null,
      reviewer_concerns: profile?.concerns || [],
      reviewer_conditions: profile?.conditions || [],
      updated_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("product_reviews")
      .upsert(reviewData, { onConflict: "user_id,product_id", ignoreDuplicates: false });

    if (error) {
      console.error("Review save error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
