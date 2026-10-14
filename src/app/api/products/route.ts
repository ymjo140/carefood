import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// 맛 레벨 → 영양성분 범위 매핑 (기본값)
const TASTE_RANGES: Record<string, Record<number, [number, number]>> = {
  salty: {
    1: [0, 300],
    2: [300, 500],
    3: [500, 800],
    4: [800, 1200],
    5: [1200, 9999],
  },
  sweet: {
    1: [0, 3],
    2: [3, 6],
    3: [6, 12],
    4: [12, 20],
    5: [20, 99],
  },
  fatty: {
    1: [0, 3],
    2: [3, 7],
    3: [7, 15],
    4: [15, 25],
    5: [25, 99],
  },
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const salty = Number(searchParams.get("salty") || 0);
  const sweet = Number(searchParams.get("sweet") || 0);
  const spicy = Number(searchParams.get("spicy") || 0);
  const fatty = Number(searchParams.get("fatty") || 0);
  const category = searchParams.get("category") || null;
  const search = searchParams.get("q") || null;
  const page = Number(searchParams.get("page") || 1);
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("products")
    .select("*, product_prices(*)", { count: "exact" })
    .eq("is_active", true)
    .order("name");

  // 맛 필터 적용
  if (salty >= 1 && salty <= 5) {
    const [min, max] = TASTE_RANGES.salty[salty];
    query = query.gte("sodium_mg", min).lt("sodium_mg", max);
  }
  if (sweet >= 1 && sweet <= 5) {
    const [min, max] = TASTE_RANGES.sweet[sweet];
    query = query.gte("sugar_g", min).lt("sugar_g", max);
  }
  if (fatty >= 1 && fatty <= 5) {
    const [min, max] = TASTE_RANGES.fatty[fatty];
    query = query.gte("fat_g", min).lt("fat_g", max);
  }
  if (spicy >= 1 && spicy <= 5) {
    query = query.eq("spicy_score", spicy);
  }

  // 카테고리 필터
  if (category) {
    query = query.eq("category_large", category);
  }

  // 검색
  if (search) {
    query = query.textSearch("name", search, { type: "plain" });
  }

  // 페이지네이션
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    products: data,
    total: count,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
