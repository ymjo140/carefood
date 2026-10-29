import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * 맛 프로필 API
 *
 * GET  /api/taste?product_id=xxx — 제품 맛 프로필 조회
 * GET  /api/taste?user_id=xxx    — 사용자 맛 선호 조회
 * POST /api/taste                — 맛 리뷰 제출 + 프로필 재집계
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sb(): any {
  return createServiceRoleClient() as any;
}

export async function GET(request: NextRequest) {
  await connection();
  const productId = request.nextUrl.searchParams.get("product_id");
  const userId = request.nextUrl.searchParams.get("user_id");

  // 제품 맛 프로필 조회
  if (productId) {
    const { data: profile } = await sb()
      .from("taste_profiles")
      .select("*")
      .eq("product_id", productId)
      .single();

    // 프로필 없으면 카테고리 기본값 반환
    if (!profile) {
      return NextResponse.json({
        taste_profile: {
          spicy: 2.5, sweet: 2.5, salty: 2.5, umami: 2.5, sour: 2.5,
          review_count: 0, avg_rating: 0,
          source: "default",
        },
      });
    }

    return NextResponse.json({ taste_profile: { ...profile, source: "reviews" } });
  }

  // 사용자 맛 선호 조회
  if (userId) {
    const { data: pref } = await sb()
      .from("user_taste_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!pref) {
      return NextResponse.json({
        preferences: {
          pref_spicy: 3, pref_sweet: 3, pref_salty: 3,
          pref_umami: 3, pref_sour: 3,
          source: "default",
        },
      });
    }

    return NextResponse.json({ preferences: { ...pref, source: "saved" } });
  }

  return NextResponse.json({ error: "product_id 또는 user_id 필수" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // ─── 맛 리뷰 제출 ───
    if (action === "review") {
      const { user_id, product_id, spicy, sweet, salty, umami, sour, overall_rating, comment, would_rebuy } = body;

      if (!user_id || !product_id) {
        return NextResponse.json({ error: "user_id, product_id 필수" }, { status: 400 });
      }

      // 리뷰 저장 (upsert)
      const { error: reviewErr } = await sb()
        .from("taste_reviews")
        .upsert({
          user_id,
          product_id,
          taste_spicy: spicy,
          taste_sweet: sweet,
          taste_salty: salty,
          taste_umami: umami,
          taste_sour: sour,
          star_rating: overall_rating,
          comment,
          would_rebuy,
          created_at: new Date().toISOString(),
        }, { onConflict: "user_id,product_id" });

      if (reviewErr) {
        return NextResponse.json({ error: reviewErr.message }, { status: 500 });
      }

      // 해당 제품 맛 프로필 재집계
      const { data: reviews } = await sb()
        .from("taste_reviews")
        .select("taste_spicy, taste_sweet, taste_salty, taste_umami, taste_sour, star_rating")
        .eq("product_id", product_id)
        .not("taste_spicy", "is", null);

      if (reviews && reviews.length > 0) {
        const count = reviews.length;
        const avg = (key: string) =>
          +(reviews.reduce((s: number, r: Record<string, number>) => s + (r[key] || 0), 0) / count).toFixed(2);

        await sb()
          .from("taste_profiles")
          .upsert({
            product_id,
            spicy: avg("taste_spicy"),
            sweet: avg("taste_sweet"),
            salty: avg("taste_salty"),
            umami: avg("taste_umami"),
            sour: avg("taste_sour"),
            review_count: count,
            avg_rating: avg("star_rating"),
            updated_at: new Date().toISOString(),
          }, { onConflict: "product_id" });
      }

      return NextResponse.json({ ok: true, message: "맛 리뷰가 등록되었습니다" });
    }

    // ─── 사용자 맛 선호 저장 ───
    if (action === "save_preference") {
      const { user_id, pref_spicy, pref_sweet, pref_salty, pref_umami, pref_sour, dislike_tags, allergy_tags, dietary_tags } = body;

      if (!user_id) {
        return NextResponse.json({ error: "user_id 필수" }, { status: 400 });
      }

      await sb()
        .from("user_taste_preferences")
        .upsert({
          user_id,
          pref_spicy: pref_spicy ?? 3,
          pref_sweet: pref_sweet ?? 3,
          pref_salty: pref_salty ?? 3,
          pref_umami: pref_umami ?? 3,
          pref_sour: pref_sour ?? 3,
          dislike_tags: dislike_tags || [],
          allergy_tags: allergy_tags || [],
          dietary_tags: dietary_tags || [],
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      return NextResponse.json({ ok: true, message: "맛 선호가 저장되었습니다" });
    }

    return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
