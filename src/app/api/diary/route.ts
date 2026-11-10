import { NextRequest, NextResponse } from "next/server";
import { isDay, todayKst } from "@/lib/day";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

// GET: 특정 날짜의 식단 기록 조회 (+ recent=true 모드)
export async function GET(req: NextRequest) {
  const userId = await getActorId();
  if (!userId) return noActor();

  const supabase = createServiceRoleClient();
  const sb = supabase as any;

  // ── "다시 먹기" 모드: 최근 기록한 음식 10개 (중복 제거) ──
  if (req.nextUrl.searchParams.get("recent") === "true") {
    const { data: recent } = await sb
      .from("meal_diary")
      .select("food_name, product_id, serving_g, calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g, serving_multiplier")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    // 음식 이름으로 중복 제거, 최근 10개
    const seen = new Set<string>();
    const unique = [];
    for (const r of recent || []) {
      if (!seen.has(r.food_name)) {
        seen.add(r.food_name);
        unique.push(r);
      }
      if (unique.length >= 10) break;
    }
    return NextResponse.json({ recent: unique });
  }

  // ── 기본 모드: 특정 날짜 식단 조회 ──
  const qd = req.nextUrl.searchParams.get("date");
  const date = isDay(qd) ? qd : todayKst();

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
  const {
    date, meal_type, product_id, food_name,
    serving_g, calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g,
    serving_multiplier: rawMultiplier, memo,
  } = body;

  const user_id = await getActorId();
  if (!user_id) return noActor();
  if (!meal_type || !food_name) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  // 섭취량 배수 (0.5, 1, 1.5, 2)
  const multiplier = [0.5, 1, 1.5, 2].includes(Number(rawMultiplier)) ? Number(rawMultiplier) : 1;

  const supabase = createServiceRoleClient();
  const sb = supabase as any;

  // product_id가 있으면 제품 DB에서 영양 정보 자동 채우기
  let nutrition = { calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g };

  if (product_id && (!calories || calories === 0)) {
    const { data: product } = await sb
      .from("products")
      .select("calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g, serving_size_g, nutrient_base_g")
      .eq("id", product_id)
      .single();

    if (product) {
      // nutrient_base_g 보정: DB값은 baseG 기준, servingG로 환산 후 multiplier 적용
      const baseG = product.nutrient_base_g || 100;
      const servG = serving_g || product.serving_size_g || baseG;
      const ratio = (servG / baseG) * multiplier;

      const round1 = (v: number | null) => v != null ? Math.round(v * ratio * 10) / 10 : null;
      nutrition = {
        calories: product.calories != null ? Math.round(product.calories * ratio) : null,
        protein_g: round1(product.protein_g),
        fat_g: round1(product.fat_g),
        carbs_g: round1(product.carbs_g),
        sugar_g: round1(product.sugar_g),
        sodium_mg: product.sodium_mg != null ? Math.round(product.sodium_mg * ratio) : null,
        fiber_g: round1(product.fiber_g),
      };
    }
  } else if (multiplier !== 1 && calories) {
    // 직접 입력 or common_food인데 multiplier가 있으면 적용
    const m = multiplier;
    nutrition = {
      calories: calories ? Math.round(calories * m) : null,
      protein_g: protein_g ? Math.round(protein_g * m * 10) / 10 : null,
      fat_g: fat_g ? Math.round(fat_g * m * 10) / 10 : null,
      carbs_g: carbs_g ? Math.round(carbs_g * m * 10) / 10 : null,
      sugar_g: sugar_g ? Math.round(sugar_g * m * 10) / 10 : null,
      sodium_mg: sodium_mg ? Math.round(sodium_mg * m) : null,
      fiber_g: fiber_g ? Math.round(fiber_g * m * 10) / 10 : null,
    };
  }

  const { data, error } = await sb
    .from("meal_diary")
    .insert({
      user_id,
      date: isDay(date) ? date : todayKst(),
      meal_type,
      product_id: product_id || null,
      food_name,
      serving_g: serving_g || null,
      serving_multiplier: multiplier,
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

// DELETE: 식단 기록 삭제 (소유자 검증)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const userId = await getActorId();

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!userId) return noActor();

  const supabase = createServiceRoleClient();
  const sb = supabase as any;

  // 소유자 확인 후 삭제 (user_id 일치해야만 삭제)
  const { data, error } = await sb
    .from("meal_diary")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "삭제 권한이 없거나 기록을 찾을 수 없습니다." }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
