import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { perServing } from "@/lib/nutrition";
import { ALLERGEN_KEYWORDS } from "@/lib/recommend/constants";
import { budgetReason, pickMenus, type MealKey, type Menu } from "@/lib/menu-pick";
import { seedOf } from "@/lib/buddy";
import { loadAccess } from "@/lib/subscription";
import { hasPerk } from "@/lib/plans";
import { todayKst } from "@/lib/day";

/**
 * GET /api/diary/next?meal=dinner&kcal=650&protein=25&sodium=800&exclude=id,id
 * 기록 직후 '다음 끼니' — 일반 메뉴 2개(대표 메뉴 common_foods, lib/menu-pick.ts) + 제품 1개(메뉴가 없으면 제품 3개).
 * 오늘 남은 칼로리·단백질·나트륨에 맞춰 (1회 제공량 기준). 순서는 영양 기준뿐 — 광고비로 바꾸지 않는다.
 * 구독을 연 뒤 매 끼니 추천(recs)이 없는 무료는 메뉴 1개 + 제품 1개.
 * 남은 값 계산은 화면이 이미 가진 오늘 합계·목표로 한다. 알레르기는 서버의 내 프로필로 거른다.
 * "성분 정보 + 통계적 매칭" — 처방이 아니다.
 */
type Row = {
  id: string; name: string; manufacturer: string | null; calories: number | null; protein_g: number | null;
  sodium_mg: number | null; serving_size_g: number | null; nutrient_base_g: number | null; dish_category: string | null;
  image_url: string | null;
};

const MEALS = new Set(["breakfast", "lunch", "dinner", "snack"]);
// 한 끼로 먹는 종류만 (원물 식재료·소스·영양제·분말은 빼고). 간식은 그 반대쪽만 뺀다
const MEAL_CATS = ["rice", "soup", "noodle", "grill", "salad", "set", "bread", "side"];
const NOT_SNACK = ["supplement", "powder", "sauce", "ingredient", "seafood", "rice", "soup", "noodle", "set"];

export async function GET(request: NextRequest) {
  await connection();
  const me = await getActorId();
  if (!me) return noActor();

  const sp = request.nextUrl.searchParams;
  const meal = sp.get("meal") || "dinner";
  if (!MEALS.has(meal)) return NextResponse.json({ error: "meal 이 올바르지 않아요" }, { status: 400 });
  const kcal = Math.max(0, Number(sp.get("kcal")) || 0);
  const protein = Math.max(0, Number(sp.get("protein")) || 0);
  const sodium = Math.max(0, Number(sp.get("sodium")) || 0);
  const exclude = new Set((sp.get("exclude") || "").split(",").filter(Boolean));

  // 남은 칼로리가 거의 없으면 제안하지 않는다
  if (kcal < 120) return NextResponse.json({ items: [], menus: [], reason: null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const [{ data: rows, error }, { data: prof }, { data: foods, error: fErr }, access] = await Promise.all([
    sb.from("products")
      .select("id, name, manufacturer, calories, protein_g, sodium_mg, serving_size_g, nutrient_base_g, meal_role, dish_category, image_url")
      .eq("is_purchasable", true).is("nutrition_flag", null).is("rec_hold", null).gt("calories", 0).gte("protein_g", meal === "snack" ? 3 : 6)
      // 1회 제공량이 포장 전체로 잘못 들어간 제품이 많아 350g 이하만
      .gt("serving_size_g", 0).lte("serving_size_g", 350)
      .order("health_score", { ascending: false, nullsFirst: false }).limit(400),
    sb.from("user_profiles").select("allergies").eq("user_id", me).maybeSingle(),
    sb.from("common_foods").select("id, name, category, serving_desc, serving_size_g, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g"),
    loadAccess(sb, me),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  const allergyWords = ((prof?.allergies as string[] | null) || []).flatMap((a) => ALLERGEN_KEYWORDS[a] || []);
  const minKcal = meal === "snack" ? 60 : 200;
  const maxKcal = Math.max(minKcal + 50, kcal * 1.05);

  const picks = ((rows || []) as Row[])
    .filter((r) => !exclude.has(r.id))
    .filter((r) => meal === "snack" ? !NOT_SNACK.includes(r.dish_category || "") : MEAL_CATS.includes(r.dish_category || ""))
    .filter((r) => !allergyWords.some((w) => (r.name || "").includes(w)))
    .map((r) => perServing(r))
    .filter((r) => (r.calories || 0) >= minKcal && (r.calories || 0) <= maxKcal)
    .filter((r) => !sodium || (r.sodium_mg || 0) <= sodium)
    .filter((r) => (r.protein_g || 0) <= 60) // 한 끼 단백질이 이보다 많으면 데이터 오류일 가능성
    .map((r) => {
      const c = r.calories || 1, p = r.protein_g || 0;
      // 남은 단백질을 많이 채우면서 칼로리 예산 안에서 — 단백질 충족 비율 + kcal 당 단백질
      const fill = protein > 0 ? Math.min(1, p / protein) : 0;
      return { r, score: fill * 2 + (p * 4) / c };
    })
    .sort((a, b) => b.score - a.score);

  // 같은 제조사가 줄줄이 나오지 않게
  const seen = new Set<string>();
  const items = [];
  for (const { r } of picks) {
    const key = r.manufacturer || r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: r.id, name: r.name, manufacturer: r.manufacturer, image_url: r.image_url,
      calories: Math.round(r.calories || 0), protein_g: Math.round((r.protein_g || 0) * 10) / 10,
      sodium_mg: Math.round(r.sodium_mg || 0), serving_size_g: r.serving_size_g, nutrient_base_g: r.nutrient_base_g,
    });
    if (items.length >= 3) break;
  }
  const recs = hasPerk(access, "recs");
  // 날마다·끼니마다 조금씩 다른 메뉴가 위로 오게 (같은 날 같은 끼니는 같은 결과)
  const menus = pickMenus((foods || []) as Menu[], { meal: meal as MealKey, kcal, protein, sodium, avoid: allergyWords }, recs ? 2 : 1, seedOf(me, todayKst(), meal));
  return NextResponse.json({
    menus, items: menus.length ? items.slice(0, 1) : items,
    reason: budgetReason({ kcal, protein, sodium }),
  });
}
