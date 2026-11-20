import { perServing } from "@/lib/nutrition";
import { ALLERGEN_KEYWORDS } from "@/lib/recommend/constants";
import { mealBudget, pickMenus, type MealKey, type Menu } from "@/lib/menu-pick";
import { budgetFit, known, sodiumTerm } from "@/lib/rec-fit";

/**
 * 다음 끼니 후보 — 일반 메뉴(대표 메뉴 common_foods) + 살 수 있는 제품. 서버 전용.
 *   /api/diary/next(내 다음 끼니)와 /api/family/links/[id]/picks(가족에게 보낼 끼니)가 같은 규칙을 쓴다.
 *   남은 칼로리·단백질·나트륨에 맞춰 (1회 제공량 기준). 순서는 영양 기준뿐 — 광고비로 바꾸지 않는다.
 *   점수 = 몫 맞춤×3 (lib/rec-fit) + 단백질 채움×2 + kcal 당 단백질(최대 1.5) + 나트륨(아는 값만).
 *   후보는 DB 에서 끼니 종류로 먼저 거른 뒤 자른다 — 전에는 모든 종류 상위 400개를 자른 뒤 걸러 한 끼 후보가 100개 남짓, 몫 근처는 7개뿐이었다.
 *   알레르기는 그 사람(person)의 서버 프로필로 거른다 — 같이 먹기는 두 사람 것을 모두. "성분 정보 + 통계적 매칭" — 처방이 아니다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = {
  id: string; name: string; manufacturer: string | null; calories: number | null; protein_g: number | null;
  sodium_mg: number | null; serving_size_g: number | null; nutrient_base_g: number | null; dish_category: string | null;
  image_url: string | null;
};
export type PickItem = {
  id: string; name: string; manufacturer: string | null; image_url: string | null;
  /** 나트륨을 모르면 null — 0 으로 바꾸지 않는다 */
  calories: number; protein_g: number; sodium_mg: number | null; serving_size_g: number | null; nutrient_base_g: number | null;
};
export const PICK_MEALS = new Set(["breakfast", "lunch", "dinner", "snack"]);

// 한 끼로 먹는 종류만 (원물 식재료·소스·영양제·분말은 빼고). 간식은 그 반대쪽만 뺀다
const MEAL_CATS = ["rice", "soup", "noodle", "grill", "salad", "set", "bread", "side"];
const NOT_SNACK = ["supplement", "powder", "sauce", "ingredient", "seafood", "rice", "soup", "noodle", "set"];
const NOT_MEAL_ROLES = ["ingredient", "condiment", "supplement", "drink"];
// 간식으로 권하는 제품 종류 — 분류가 없는 것(생선 원물이 많다)·빵 재료·면은 뺀다
const SNACK_PRODUCT_CATS = ["snack", "dairy", "side", "salad", "grill"];

/** 그 사람 오늘 이 끼니 예산 — 목표에서 먹은 만큼 빼고 남은 끼니로 나눈다. 오늘 많이 먹었어도 한 끼 후보는 보여 준다(하루 목표의 30%)
 *  가족 추천 보내기·같이 먹기가 같은 규칙. 예산 자체는 화면에 내보내지 않는다 */
export async function personMealBudget(sb: Sb, person: string, meal: "breakfast" | "lunch" | "dinner", today: string) {
  const [{ data: goal, error: gErr }, { data: rows, error: dErr }] = await Promise.all([
    sb.from("daily_nutrition_goals").select("daily_calories, daily_protein_g, max_sodium_mg").eq("user_id", person).maybeSingle(),
    sb.from("meal_diary").select("meal_type, calories, protein_g, sodium_mg").eq("user_id", person).eq("date", today).limit(500),
  ]);
  if (gErr) throw new Error(gErr.message);
  if (dErr) throw new Error(dErr.message);
  const ate = (rows || []) as { meal_type: string; calories: number | null; protein_g: number | null; sodium_mg: number | null }[];
  const sum = (k: "calories" | "protein_g" | "sodium_mg") => ate.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const goalKcal = Number(goal?.daily_calories) || 2000;
  const recorded = new Set(ate.map((r) => r.meal_type));
  const mainLeft = (["breakfast", "lunch", "dinner"] as const).filter((m) => m === meal || !recorded.has(m)).length;
  const b = mealBudget({
    meal, mainLeft, goalKcal, remainKcal: goalKcal - sum("calories"),
    remainProtein: (Number(goal?.daily_protein_g) || 60) - sum("protein_g"), remainSodium: (Number(goal?.max_sodium_mg) || 2000) - sum("sodium_mg"),
  });
  const budget = b.kcal >= 120 ? b : { kcal: Math.round(goalKcal * 0.3), protein: b.protein, sodium: b.sodium };
  return { ...budget, recorded: recorded.has(meal) };
}

export async function loadNextPicks(sb: Sb, person: string | string[], o: { meal: MealKey; kcal: number; protein: number; sodium: number; exclude?: Set<string>; menus: number; seed: number }) {
  const { meal, kcal, protein, sodium } = o;
  const exclude = o.exclude || new Set<string>();
  const [{ data: rows, error }, { data: prof, error: pErr }, { data: foods, error: fErr }] = await Promise.all([
    candidateQuery(sb, meal),
    sb.from("user_profiles").select("allergies").in("user_id", Array.isArray(person) ? person : [person]),
    sb.from("common_foods").select("id, name, category, serving_desc, serving_size_g, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g"),
  ]);
  if (error) throw new Error(error.message);
  if (pErr) throw new Error(pErr.message);
  if (fErr) throw new Error(fErr.message);

  const allergies = new Set(((prof || []) as { allergies: string[] | null }[]).flatMap((p) => p.allergies || []));
  const allergyWords = [...allergies].flatMap((a) => ALLERGEN_KEYWORDS[a] || []);
  const minKcal = meal === "snack" ? 60 : 200;
  const maxKcal = Math.max(minKcal + 50, kcal * 1.05);

  const picks = ((rows || []) as Row[])
    .filter((r) => !exclude.has(r.id))
    .filter((r) => meal === "snack" ? !NOT_SNACK.includes(r.dish_category || "") : MEAL_CATS.includes(r.dish_category || ""))
    .filter((r) => !allergyWords.some((w) => (r.name || "").includes(w)))
    .map((r) => perServing(r))
    .filter((r) => (r.calories || 0) >= minKcal && (r.calories || 0) <= maxKcal)
    // 나트륨을 아는 것만 몫과 견준다 — 모르는 것은 남기되 점수에서 아는 것(몫 안)보다 뒤로
    .filter((r) => !sodium || known(r.sodium_mg) == null || Number(r.sodium_mg) <= sodium)
    .filter((r) => (r.protein_g || 0) <= 60) // 한 끼 단백질이 이보다 많으면 데이터 오류일 가능성
    .map((r) => ({ r, score: pickScore(r, { kcal, protein, sodium }) }))
    .sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));

  // 같은 제조사가 줄줄이 나오지 않게
  const seen = new Set<string>();
  const items: PickItem[] = [];
  for (const { r } of picks) {
    const key = r.manufacturer || r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: r.id, name: r.name, manufacturer: r.manufacturer, image_url: r.image_url,
      calories: Math.round(r.calories || 0), protein_g: Math.round((r.protein_g || 0) * 10) / 10,
      sodium_mg: known(r.sodium_mg) == null ? null : Math.round(Number(r.sodium_mg)), serving_size_g: r.serving_size_g, nutrient_base_g: r.nutrient_base_g,
    });
    if (items.length >= 3) break;
  }
  // 날마다·끼니마다 조금씩 다른 메뉴가 위로 오게 (같은 날 같은 끼니는 같은 결과)
  const menus = pickMenus((foods || []) as Menu[], { meal, kcal, protein, sodium, avoid: allergyWords }, o.menus, o.seed);
  return { menus, items };
}

/** 후보 읽기 — 끼니 종류를 DB 에서 먼저 거른 뒤 건강 점수 순으로 자른다 (자른 뒤 거르면 한 끼 후보가 거의 남지 않는다) */
function candidateQuery(sb: Sb, meal: MealKey) {
  let q = sb.from("products")
    .select("id, name, manufacturer, calories, protein_g, sodium_mg, serving_size_g, nutrient_base_g, meal_role, dish_category, image_url")
    .eq("is_purchasable", true).is("nutrition_flag", null).is("rec_hold", null).gt("calories", 0).gte("protein_g", meal === "snack" ? 3 : 6)
    // 1회 제공량이 포장 전체로 잘못 들어간 제품이 많아 350g 이하만
    .gt("serving_size_g", 0).lte("serving_size_g", 350);
  // 끼니 역할(products.meal_role, scripts/build_taste_profile.py)로도 거른다 — 간식은 간식으로 먹는 것만,
  //   한 끼는 원물 재료·양념·영양제·음료를 뺀다 (예: 간식 자리에 생선 원물·콜라겐 분말이 오던 것)
  q = meal === "snack"
    ? q.eq("meal_role", "snack").in("dish_category", SNACK_PRODUCT_CATS)
    : q.in("dish_category", MEAL_CATS).not("meal_role", "in", `(${NOT_MEAL_ROLES.join(",")})`);
  return q.order("health_score", { ascending: false, nullsFirst: false }).limit(1000);
}

/** 한 후보의 점수 — 몫 맞춤×3 + 단백질 채움×2 + kcal 당 단백질(최대 1.5) + 나트륨 (lib/rec-fit). 시험: tests/rec-fit.test.ts */
export function pickScore(r: { calories: number | null; protein_g: number | null; sodium_mg: number | null }, b: { kcal: number; protein: number; sodium: number }) {
  const c = Number(r.calories) || 1, p = Number(r.protein_g) || 0;
  const fill = b.protein > 0 ? Math.min(1, p / b.protein) : 0;
  return budgetFit(c, b.kcal) * 3 + fill * 2 + Math.min(1.5, (p * 4) / c) + sodiumTerm(known(r.sodium_mg), b.sodium);
}
