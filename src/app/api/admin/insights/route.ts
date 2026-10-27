import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceRoleClient();
  const sb = supabase as any;

  // ── 1. 전체 현황 ──
  const [totalR, purchR, hmR, profileR] = await Promise.all([
    sb.from("products").select("id", { count: "exact", head: true }),
    sb.from("products").select("id", { count: "exact", head: true }).eq("is_purchasable", true),
    sb.from("products").select("id", { count: "exact", head: true }).eq("category_large", "건강식단서비스"),
    sb.from("user_profiles").select("id", { count: "exact", head: true }),
  ]);

  const overview = {
    total_products: totalR.count ?? 0,
    purchasable: purchR.count ?? 0,
    health_meal_products: hmR.count ?? 0,
    total_profiles: profileR.count ?? 0,
  };

  // ── 2. 카테고리별 건강 점수 (구매 가능 상용제품만) ──
  const { data: allProducts } = await sb
    .from("products")
    .select("dish_category, health_score, calories, protein_g, sodium_mg, sugar_g, fiber_g, fat_g")
    .eq("is_purchasable", true)
    .eq("category_large", "상용제품")
    .limit(1000);

  // 서버사이드 집계
  const catMap = new Map<string, { count: number; scores: number[]; cals: number[]; proteins: number[]; sodiums: number[]; sugars: number[] }>();
  for (const p of allProducts || []) {
    const cat = p.dish_category || "other";
    if (!catMap.has(cat)) catMap.set(cat, { count: 0, scores: [], cals: [], proteins: [], sodiums: [], sugars: [] });
    const m = catMap.get(cat)!;
    m.count++;
    if (p.health_score != null) m.scores.push(p.health_score);
    if (p.calories != null) m.cals.push(p.calories);
    if (p.protein_g != null) m.proteins.push(p.protein_g);
    if (p.sodium_mg != null) m.sodiums.push(p.sodium_mg);
    if (p.sugar_g != null) m.sugars.push(p.sugar_g);
  }

  const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
  const categoryHealth = [...catMap.entries()]
    .filter(([, m]) => m.count > 10)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([category, m]) => ({
      category,
      count: m.count,
      avg_score: avg(m.scores),
      avg_cal: avg(m.cals) ? Math.round(avg(m.cals)!) : null,
      avg_protein: avg(m.proteins),
      avg_sodium: avg(m.sodiums) ? Math.round(avg(m.sodiums)!) : null,
      avg_sugar: avg(m.sugars),
    }));

  // ── 3. 건강 목표별 공급 갭 ──
  const supplyGap = [
    { segment: "low_sugar", label: "저당", desc: "당류 5g 미만", supply: 0 },
    { segment: "very_low_sugar", label: "극저당", desc: "당류 2g 미만", supply: 0 },
    { segment: "low_sodium", label: "저나트륨", desc: "500mg 미만", supply: 0 },
    { segment: "very_low_sodium", label: "극저나트륨", desc: "300mg 미만", supply: 0 },
    { segment: "high_protein", label: "고단백", desc: "단백질 20g 이상", supply: 0 },
    { segment: "very_high_protein", label: "초고단백", desc: "단백질 30g 이상", supply: 0 },
    { segment: "low_calorie", label: "저칼로리", desc: "350kcal 이하", supply: 0 },
    { segment: "high_fiber", label: "고식이섬유", desc: "식이섬유 3g 이상", supply: 0 },
    { segment: "low_fat", label: "저지방", desc: "지방 5g 미만", supply: 0 },
  ];

  for (const p of allProducts || []) {
    if (p.sugar_g != null && p.sugar_g < 5) supplyGap[0].supply++;
    if (p.sugar_g != null && p.sugar_g < 2) supplyGap[1].supply++;
    if (p.sodium_mg != null && p.sodium_mg < 500) supplyGap[2].supply++;
    if (p.sodium_mg != null && p.sodium_mg < 300) supplyGap[3].supply++;
    if (p.protein_g != null && p.protein_g >= 20) supplyGap[4].supply++;
    if (p.protein_g != null && p.protein_g >= 30) supplyGap[5].supply++;
    if (p.calories != null && p.calories > 0 && p.calories <= 350) supplyGap[6].supply++;
    if (p.fiber_g != null && p.fiber_g >= 3) supplyGap[7].supply++;
    if (p.fat_g != null && p.fat_g < 5) supplyGap[8].supply++;
  }

  // ── 4. 건강식단 서비스 비교 ──
  const { data: hmProducts } = await sb
    .from("products")
    .select("manufacturer, health_score, dish_category")
    .eq("category_large", "건강식단서비스");

  const { data: hmPrices } = await sb
    .from("product_prices")
    .select("product_id, price")
    .in("product_id", (hmProducts || []).map((p: any) => p.id));

  // product_id가 없으니 다른 방식으로
  const { data: hmWithPrices } = await sb
    .from("products")
    .select("id, name, manufacturer, health_score, dish_category")
    .eq("category_large", "건강식단서비스")
    .limit(300);

  const hmIds = (hmWithPrices || []).map((p: any) => p.id);
  // 배치로 가격 조회 (100개씩)
  const priceMap = new Map<string, number[]>();
  for (let i = 0; i < hmIds.length; i += 100) {
    const batch = hmIds.slice(i, i + 100);
    const { data: batchPrices } = await sb
      .from("product_prices")
      .select("product_id, price")
      .in("product_id", batch);
    for (const pp of batchPrices || []) {
      if (!priceMap.has(pp.product_id)) priceMap.set(pp.product_id, []);
      priceMap.get(pp.product_id)!.push(pp.price);
    }
  }

  const SOURCE_LABELS: Record<string, string> = {
    greating: "그리팅",
    yundiet: "윤식단",
    sixmeal: "식스밀",
    designmeal: "디자인밀",
    makesalad: "메이크샐러드",
  };

  const svcMap = new Map<string, { count: number; scores: number[]; prices: number[]; cats: Set<string> }>();
  for (const p of hmWithPrices || []) {
    const src = p.manufacturer;
    if (!svcMap.has(src)) svcMap.set(src, { count: 0, scores: [], prices: [], cats: new Set() });
    const m = svcMap.get(src)!;
    m.count++;
    if (p.health_score != null) m.scores.push(p.health_score);
    if (p.dish_category) m.cats.add(p.dish_category);
    const pp = priceMap.get(p.id);
    if (pp) m.prices.push(...pp);
  }

  const serviceCompare = [...svcMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([source, m]) => ({
      source,
      name: SOURCE_LABELS[source] || source,
      product_count: m.count,
      avg_health_score: avg(m.scores),
      min_price: m.prices.length ? Math.min(...m.prices) : null,
      avg_price: m.prices.length ? Math.round(m.prices.reduce((a, b) => a + b, 0) / m.prices.length) : null,
      max_price: m.prices.length ? Math.max(...m.prices) : null,
      dish_types: m.cats.size,
    }));

  // ── 5. 음식 종류별 분포 (차트용) ──
  const dishDistribution = [...catMap.entries()]
    .filter(([, m]) => m.count > 10)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([category, m]) => ({ category, count: m.count }));

  // ── 6. 기회 영역 (건강점수 높은데 제품 적은 카테고리) ──
  const opportunity = [...catMap.entries()]
    .filter(([, m]) => m.count > 5 && m.scores.length > 0)
    .map(([category, m]) => ({
      category,
      supply: m.count,
      avg_score: avg(m.scores)!,
      opportunity: Math.round((avg(m.scores)! / Math.max(Math.log(m.count + 1), 0.1)) * 10) / 10,
    }))
    .sort((a, b) => b.opportunity - a.opportunity)
    .slice(0, 8);

  // ── 7. 구매 전환 클릭 통계 ──
  const { data: recentClicks } = await sb
    .from("product_clicks")
    .select("platform, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const clicksByPlatform: Record<string, number> = {};
  for (const c of (recentClicks || [])) {
    clicksByPlatform[c.platform] = (clicksByPlatform[c.platform] || 0) + 1;
  }

  const clickStats = {
    total: recentClicks?.length || 0,
    byPlatform: clicksByPlatform,
    recentDays: 30,
  };

  return NextResponse.json({
    overview,
    categoryHealth,
    supplyGap,
    serviceCompare,
    opportunity,
    dishDistribution,
    clickStats,
  });
}
