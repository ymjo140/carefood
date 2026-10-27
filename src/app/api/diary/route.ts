import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

function getUserId(req: NextRequest): string | null {
  // 쿠키에서 또는 헤더에서 user_id 추출
  try {
    const cookie = req.cookies.get("carefood_user_id");
    if (cookie?.value) return cookie.value;
  } catch { /* */ }
  return null;
}

// GET: 특정 날짜의 식단 기록 조회
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const userId = req.nextUrl.searchParams.get("user_id") || getUserId(req);

  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const sb = supabase as any;

  // 해당 날짜 식단 기록
  const { data: entries, error } = await sb
    .from("meal_diary")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 일일 영양 합계
  const totals = {
    calories: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
    fiber_g: 0,
  };

  for (const e of entries || []) {
    if (e.calories) totals.calories += Number(e.calories);
    if (e.protein_g) totals.protein_g += Number(e.protein_g);
    if (e.fat_g) totals.fat_g += Number(e.fat_g);
    if (e.carbs_g) totals.carbs_g += Number(e.carbs_g);
    if (e.sugar_g) totals.sugar_g += Number(e.sugar_g);
    if (e.sodium_mg) totals.sodium_mg += Number(e.sodium_mg);
    if (e.fiber_g) totals.fiber_g += Number(e.fiber_g);
  }

  // 영양 목표
  const { data: goals } = await sb
    .from("daily_nutrition_goals")
    .select("*")
    .eq("user_id", userId)
    .single();

  // 끼니별 그룹핑
  const byMeal: Record<string, typeof entries> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const e of entries || []) {
    if (byMeal[e.meal_type]) byMeal[e.meal_type].push(e);
    else byMeal.snack.push(e);
  }

  return NextResponse.json({
    date,
    entries: entries || [],
    byMeal,
    totals: {
      calories: Math.round(totals.calories),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      fat_g: Math.round(totals.fat_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      sugar_g: Math.round(totals.sugar_g * 10) / 10,
      sodium_mg: Math.round(totals.sodium_mg),
      fiber_g: Math.round(totals.fiber_g * 10) / 10,
    },
    goals: goals || null,
    mealCount: (entries || []).length,
  });
}

// POST: 식단 기록 추가
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, date, meal_type, product_id, food_name, serving_g, calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g, memo } = body;

  if (!user_id || !meal_type || !food_name) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const sb = supabase as any;

  // product_id가 있으면 제품 DB에서 영양 정보 자동 채우기
  let nutrition = { calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g };

  if (product_id && (!calories || calories === 0)) {
    const { data: product } = await sb
      .from("products")
      .select("calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g, serving_size_g")
      .eq("id", product_id)
      .single();

    if (product) {
      // DB의 영양 정보는 100g 기준. serving_g로 환산
      const ratio = (serving_g || product.serving_size_g || 100) / 100;
      nutrition = {
        calories: product.calories ? Math.round(product.calories * ratio) : null,
        protein_g: product.protein_g ? Math.round(product.protein_g * ratio * 10) / 10 : null,
        fat_g: product.fat_g ? Math.round(product.fat_g * ratio * 10) / 10 : null,
        carbs_g: product.carbs_g ? Math.round(product.carbs_g * ratio * 10) / 10 : null,
        sugar_g: product.sugar_g ? Math.round(product.sugar_g * ratio * 10) / 10 : null,
        sodium_mg: product.sodium_mg ? Math.round(product.sodium_mg * ratio) : null,
        fiber_g: product.fiber_g ? Math.round(product.fiber_g * ratio * 10) / 10 : null,
      };
    }
  }

  const { data, error } = await sb
    .from("meal_diary")
    .insert({
      user_id,
      date: date || new Date().toISOString().slice(0, 10),
      meal_type,
      product_id: product_id || null,
      food_name,
      serving_g: serving_g || null,
      ...nutrition,
      memo: memo || null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}

// DELETE: 식단 기록 삭제
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { error } = await (supabase as any)
    .from("meal_diary")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
