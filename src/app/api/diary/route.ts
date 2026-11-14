import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { isDay, todayKst } from "@/lib/day";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { defaultServingG, scaleNutrient } from "@/lib/serving";
import { photoTokenOk } from "@/lib/photo-token";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // 음식 이름으로 중복 제거, 최근 10개 — 값은 1인분 기준으로 되돌려 준다 (다시 넣을 때 고른 배수를 한 번만 곱하게)
    const seen = new Set<string>();
    const unique = [];
    for (const r of recent || []) {
      if (!seen.has(r.food_name)) {
        seen.add(r.food_name);
        const m = Number(r.serving_multiplier) || 1;
        const one: Record<string, unknown> = { ...r, serving_multiplier: 1 };
        if (m !== 1) for (const k of NUTRIENTS) one[k] = r[k] === null || r[k] === undefined ? null : round(k, Number(r[k]) / m);
        unique.push(one);
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

/* ── 기록 값 ──
 * 제품(product_id)이면 영양값은 늘 서버가 제품 DB 값 × 그램으로 계산한다 (브라우저가 보낸 값은 쓰지 않는다).
 *   그램: 보낸 serving_g(사용자가 직접 바꾼 양, 1~3000g) → 없으면 lib/serving.ts 기본값(포장 무게는 걸러서)
 * 일반 음식·직접 입력이면 보낸 값을 쓰되 범위를 확인한다 (음수·터무니없는 값은 비운다).
 * 배수(0.5·1·1.5·2인분)는 마지막에 한 번만 곱한다.
 */
const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
const MULTS = [0.5, 1, 1.5, 2];
const NUTRIENTS = ["calories", "protein_g", "fat_g", "carbs_g", "sugar_g", "sodium_mg", "fiber_g"] as const;
type Nutrients = Record<(typeof NUTRIENTS)[number], number | null>;
/** 한 번 기록에 들어갈 수 있는 최대값 — 넘으면 잘못 들어온 값으로 보고 비운다 */
const MAX: Record<(typeof NUTRIENTS)[number], number> = { calories: 5000, protein_g: 400, fat_g: 400, carbs_g: 800, sugar_g: 500, sodium_mg: 20000, fiber_g: 200 };

function clean(v: unknown, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
function round(k: (typeof NUTRIENTS)[number], v: number | null): number | null {
  if (v === null) return null;
  return k === "calories" || k === "sodium_mg" ? Math.round(v) : Math.round(v * 10) / 10;
}
const gramsOf = (v: unknown) => { const g = Number(v); return Number.isFinite(g) && g >= 1 && g <= 3000 ? Math.round(g) : null; };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function productNutrients(sb: any, productId: string, wantG: number | null, mult: number): Promise<{ n: Nutrients; grams: number } | null> {
  const { data: p, error } = await sb.from("products")
    .select("name, calories, protein_g, fat_g, carbs_g, sugar_g, sodium_mg, fiber_g, serving_size_g, nutrient_base_g, meal_role")
    .eq("id", productId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return null;
  // 예전 기록(다시 먹기)이 포장 전체 무게를 그대로 들고 오면 기본값으로
  const pkg = wantG !== null && Number(p.serving_size_g) === wantG && defaultServingG(p) !== wantG;
  const grams = wantG !== null && !pkg ? wantG : defaultServingG(p);
  const n = {} as Nutrients;
  for (const k of NUTRIENTS) {
    const v = scaleNutrient(p[k], grams, p.nutrient_base_g);
    n[k] = round(k, v === null ? null : v * mult);
  }
  return { n, grams };
}

function givenNutrients(body: Record<string, unknown>, mult: number): Nutrients {
  const n = {} as Nutrients;
  for (const k of NUTRIENTS) {
    const v = clean(body[k], MAX[k]);
    n[k] = round(k, v === null ? null : v * mult);
  }
  return n;
}

// POST: 식단 기록 추가
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "diary");
  if (limited) return limited;
  const user_id = await getActorId();
  if (!user_id) return noActor();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const meal_type = MEALS.includes(body.meal_type) ? body.meal_type : null;
  const food_name = typeof body.food_name === "string" ? body.food_name.trim().slice(0, 80) : "";
  if (!meal_type || !food_name) return NextResponse.json({ error: "끼니와 음식 이름을 골라 주세요" }, { status: 400 });
  const multiplier = MULTS.includes(Number(body.serving_multiplier)) ? Number(body.serving_multiplier) : 1;
  const product_id = typeof body.product_id === "string" && UUID.test(body.product_id) ? body.product_id : null;

  const supabase = createServiceRoleClient();
  const sb = supabase as any;

  let nutrition: Nutrients;
  let serving_g = gramsOf(body.serving_g);
  if (product_id) {
    let r;
    try { r = await productNutrients(sb, product_id, serving_g, multiplier); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
    if (!r) return NextResponse.json({ error: "제품을 찾을 수 없어요" }, { status: 404 });
    nutrition = r.n; serving_g = r.grams;
  } else {
    nutrition = givenNutrients(body, multiplier);
  }

  const { data, error } = await sb
    .from("meal_diary")
    .insert({
      user_id,
      date: isDay(body.date) ? body.date : todayKst(),
      meal_type,
      product_id,
      food_name,
      serving_g,
      serving_multiplier: multiplier,
      ...nutrition,
      memo: typeof body.memo === "string" && body.memo.trim() ? body.memo.trim().slice(0, 200) : null,
      // 사진으로 찾은 음식 — 사진 분석 때 받은 표가 맞을 때만 ('사진과 함께 기록' 챌린지가 센다)
      ...(photoTokenOk(user_id, body.photo_token) ? { source: "photo" } : {}),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}

/**
 * PATCH: 기록 고치기 { id, serving_multiplier?, serving_g?, meal_type? }
 *   제품 기록은 제품 값 × 새 그램 × 새 배수로 다시 계산, 일반 음식·직접 입력은 지금 값을 (새 배수 ÷ 예전 배수)·(새 그램 ÷ 예전 그램) 만큼
 */
export async function PATCH(req: NextRequest) {
  const limited = await limitRequest(req, "diary");
  if (limited) return limited;
  const userId = await getActorId();
  if (!userId) return noActor();
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ error: "고칠 기록을 골라 주세요" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: cur, error: cErr } = await sb.from("meal_diary").select("*").eq("id", body.id).eq("user_id", userId).maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ error: "내 기록만 고칠 수 있어요" }, { status: 403 });

  const update: Record<string, unknown> = {};
  if (body.meal_type !== undefined) {
    if (!MEALS.includes(body.meal_type)) return NextResponse.json({ error: "끼니를 골라 주세요" }, { status: 400 });
    update.meal_type = body.meal_type;
  }
  const oldMult = Number(cur.serving_multiplier) || 1;
  const mult = body.serving_multiplier !== undefined ? (MULTS.includes(Number(body.serving_multiplier)) ? Number(body.serving_multiplier) : null) : oldMult;
  if (mult === null) return NextResponse.json({ error: "양을 골라 주세요" }, { status: 400 });
  const oldG = Number(cur.serving_g) || null;
  const newG = body.serving_g !== undefined ? gramsOf(body.serving_g) : oldG;
  if (body.serving_g !== undefined && newG === null) return NextResponse.json({ error: "1~3000g 사이로 적어 주세요" }, { status: 400 });

  if (mult !== oldMult || newG !== oldG) {
    if (cur.product_id) {
      let r;
      try { r = await productNutrients(sb, cur.product_id, newG, mult); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
      if (r) { Object.assign(update, r.n); update.serving_g = r.grams; }
    } else {
      const f = (mult / oldMult) * (newG && oldG ? newG / oldG : 1);
      for (const k of NUTRIENTS) update[k] = cur[k] === null || cur[k] === undefined ? null : round(k, Number(cur[k]) * f);
      update.serving_g = newG;
    }
    update.serving_multiplier = mult;
  }
  if (!Object.keys(update).length) return NextResponse.json({ success: true });

  const { error } = await sb.from("meal_diary").update(update).eq("id", body.id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
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
