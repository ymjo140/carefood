import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// 업체 대시보드 데이터 — vendor slug 기반
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const sb = supabase as any;

  // 업체 정보
  const { data: vendor, error } = await sb
    .from("vendors")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !vendor) {
    return NextResponse.json({ error: "업체를 찾을 수 없습니다" }, { status: 404 });
  }

  // 업체 제품 목록
  const { data: products } = await sb
    .from("vendor_products")
    .select("*")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: false });

  const vendorProducts = products || [];

  // 매칭 분석: 이 업체 제품이 어떤 건강 목표 사용자에게 적합한지
  const matchAnalysis = {
    low_sugar: 0,
    low_sodium: 0,
    high_protein: 0,
    low_calorie: 0,
    high_fiber: 0,
  };

  for (const p of vendorProducts) {
    if (p.sugar_g != null && p.sugar_g < 5) matchAnalysis.low_sugar++;
    if (p.sodium_mg != null && p.sodium_mg < 500) matchAnalysis.low_sodium++;
    if (p.protein_g != null && p.protein_g >= 20) matchAnalysis.high_protein++;
    if (p.calories != null && p.calories > 0 && p.calories <= 350) matchAnalysis.low_calorie++;
    if (p.fiber_g != null && p.fiber_g >= 3) matchAnalysis.high_fiber++;
  }

  // 시장 내 포지션: 같은 카테고리의 다른 업체와 비교
  const { data: allHM } = await sb
    .from("products")
    .select("manufacturer, health_score")
    .eq("category_large", "건강식단서비스");

  const marketAvgScore = allHM && allHM.length > 0
    ? Math.round(allHM.reduce((a: number, b: any) => a + (b.health_score || 0), 0) / allHM.length * 10) / 10
    : 0;

  const vendorAvgScore = vendorProducts.length > 0
    ? Math.round(
        vendorProducts
          .filter((p: any) => p.calories != null)
          .reduce((a: number, p: any) => {
            // 간이 건강점수 계산
            let s = 50;
            if (p.sodium_mg != null && p.sodium_mg < 500) s += 15;
            if (p.sugar_g != null && p.sugar_g < 5) s += 10;
            if (p.protein_g != null && p.protein_g >= 15) s += 15;
            if (p.fiber_g != null && p.fiber_g >= 3) s += 5;
            if (p.calories != null && p.calories <= 400) s += 5;
            return a + Math.min(s, 100);
          }, 0) / Math.max(vendorProducts.filter((p: any) => p.calories != null).length, 1) * 10
      ) / 10
    : 0;

  return NextResponse.json({
    vendor: {
      id: vendor.id,
      name: vendor.name,
      slug: vendor.slug,
      description: vendor.description,
      status: vendor.status,
    },
    stats: {
      total_products: vendorProducts.length,
      available_products: vendorProducts.filter((p: any) => p.is_available).length,
      avg_price: vendorProducts.length > 0
        ? Math.round(vendorProducts.filter((p: any) => p.price).reduce((a: number, p: any) => a + p.price, 0) / Math.max(vendorProducts.filter((p: any) => p.price).length, 1))
        : 0,
      categories: [...new Set(vendorProducts.map((p: any) => p.category).filter(Boolean))],
    },
    matchAnalysis,
    marketPosition: {
      vendor_score: vendorAvgScore,
      market_avg: marketAvgScore,
    },
    products: vendorProducts.slice(0, 50),
  });
}
