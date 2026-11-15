import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/recommend/similar-users?age_group=30s&gender=female&concern=gut_health
 * 비슷한 프로필 사용자들이 많이 본 제품 추천 (협업 필터링)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const ageGroup = searchParams.get("age_group");
  const gender = searchParams.get("gender");
  const concern = searchParams.get("concern");
  const limit = Math.min(Number(searchParams.get("limit") || 6), 20);

  if (!ageGroup && !gender && !concern) {
    return NextResponse.json({ products: [], message: "프로필 정보 필요" });
  }

  const supabase = createServiceRoleClient();

  // 1. 비슷한 프로필의 유저 ID 찾기
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let profileQuery = (supabase as any)
    .from("user_profiles")
    .select("user_id");

  if (ageGroup) profileQuery = profileQuery.eq("age_group", ageGroup);
  if (gender && gender !== "other") profileQuery = profileQuery.eq("gender", gender);
  if (concern) profileQuery = profileQuery.contains("concerns", [concern]);

  profileQuery = profileQuery.limit(100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: similarUsers } = await profileQuery as { data: { user_id: string }[] | null };

  if (!similarUsers || similarUsers.length === 0) {
    return NextResponse.json({ products: [], segment_size: 0 });
  }

  const userIds = similarUsers.map(u => u.user_id);

  // 2. 이 유저들이 가장 많이 조회/클릭한 제품 집계
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: interactions } = await (supabase as any)
    .from("user_interactions")
    .select("product_id, action")
    .in("user_id", userIds)
    .in("action", ["view", "click_price"])
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
    .limit(1000) as { data: { product_id: string; action: string }[] | null };

  if (!interactions || interactions.length === 0) {
    return NextResponse.json({ products: [], segment_size: similarUsers.length });
  }

  // 제품별 가중 점수 (click=3, view=1)
  const productScores: Record<string, number> = {};
  for (const i of interactions) {
    if (!i.product_id) continue;
    const weight = i.action === "click_price" ? 3 : 1;
    productScores[i.product_id] = (productScores[i.product_id] || 0) + weight;
  }

  // 상위 N개
  const topProductIds = Object.entries(productScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topProductIds.length === 0) {
    return NextResponse.json({ products: [], segment_size: similarUsers.length });
  }

  // 3. 제품 정보 로드
  const { data: products } = await supabase
    .from("products")
    .select("id, name, manufacturer, calories, protein_g, sodium_mg, sugar_g, functional_tags")
    .in("id", topProductIds)
    .eq("is_active", true);

  // 4. 가격 로드
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prices } = await supabase
    .from("v_all_prices" as any)
    .select("product_id, platform, price, url, image_url")
    .in("product_id", topProductIds) as { data: any[] | null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceMap: Record<string, any[]> = {};
  if (prices) {
    for (const p of prices) {
      if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
      priceMap[p.product_id].push(p);
    }
  }

  // 점수 순 정렬 + 가격 합치기
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = ((products || []) as any[])
    .map(p => ({
      ...p,
      popularity_score: productScores[p.id] || 0,
      product_prices: (priceMap[p.id] || []).sort((a: { price: number }, b: { price: number }) => a.price - b.price),
    }))
    .sort((a, b) => b.popularity_score - a.popularity_score);

  // 세그먼트 라벨
  const segmentLabel = [
    ageGroup ? `${ageGroup === "60plus" ? "60대+" : ageGroup.replace("s", "대")}` : null,
    gender === "male" ? "남성" : gender === "female" ? "여성" : null,
    concern ? ({ gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전" }[concern] || concern) : null,
  ].filter(Boolean).join(" · ");

  return NextResponse.json({
    products: result,
    segment_size: similarUsers.length,
    segment_label: segmentLabel,
  });
}
