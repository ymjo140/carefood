import { perServing } from "@/lib/nutrition";
import { ALLERGEN_KEYWORDS } from "@/lib/recommend/constants";
import { mealBudget, pickMenus, type MealKey, type Menu } from "@/lib/menu-pick";
import { budgetFit, known, sodiumTerm, underCap } from "@/lib/rec-fit";
import { fitsMeal, timeBonus, type MealClass } from "@/lib/meal-time";
import { loadSignals, signalTerm, type Signals } from "@/lib/rec-events";
import { addDays, todayKst } from "@/lib/day";

/**
 * 다음 끼니 후보 — 일반 메뉴(대표 메뉴 common_foods) + 살 수 있는 제품. 서버 전용.
 *   /api/diary/next(내 다음 끼니)와 /api/family/links/[id]/picks(가족에게 보낼 끼니)가 같은 규칙을 쓴다.
 *   남은 칼로리·단백질·나트륨에 맞춰 (1회 제공량 기준). 순서는 영양 기준뿐 — 광고비로 바꾸지 않는다.
 *   점수 = 몫 맞춤×3 (lib/rec-fit) + 단백질 채움×2 + kcal 당 단백질(최대 1.5) + 나트륨(아는 값만, 하루 기준) + 끼니 때(lib/meal-time) + 본인 반응(lib/rec-events).
 *   나트륨은 하루 기준 — 끼니 몫을 넘으면 감점, 남은 끼니를 가볍게 먹어도 하루를 넘는 것(상한)만 뺀다.
 *   끼니 때·역할(products.meal_times·dish_role, lib/meal-time): 그 끼니에 먹지 않는 것은 빼고(아침에 보쌈·족발·치킨), 아침에 많이 먹는 것은 조금 앞으로.
 *   하나로 권하는 것은 '메인'(그것만으로 한 끼)뿐 — 밥·국·반찬은 '한 상'(밥 + 국·찌개 + 반찬 하나)으로 묶어 권한다(combos, AI 추천).
 *   후보는 DB 에서 끼니 종류로 먼저 거른 뒤 자른다 — 전에는 모든 종류 상위 400개를 자른 뒤 걸러 한 끼 후보가 100개 남짓, 몫 근처는 7개뿐이었다.
 *   알레르기는 그 사람(person)의 서버 프로필로 거른다 — 같이 먹기는 두 사람 것을 모두. "성분 정보 + 통계적 매칭" — 처방이 아니다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = MealClass & {
  id: string; name: string; manufacturer: string | null; calories: number | null; protein_g: number | null;
  sodium_mg: number | null; serving_size_g: number | null; nutrient_base_g: number | null; dish_category: string | null;
  image_url: string | null;
};
export type PickItem = {
  id: string; name: string; manufacturer: string | null; image_url: string | null;
  /** 나트륨을 모르면 null — 0 으로 바꾸지 않는다 */
  calories: number; protein_g: number; sodium_mg: number | null; serving_size_g: number | null; nutrient_base_g: number | null;
  /** 고른 점수 (pickScore) — 대표 메뉴 점수(menuScore)와 같은 잣대 */
  score?: number;
  /** 한 상에서 맡은 몫 (밥·국·반찬) — 하나로 권하는 메인은 없음 */
  role?: "rice" | "soup" | "side";
};
/** 한 상 — 밥 + 국·찌개 (+ 반찬 하나). 점수는 합친 영양으로 매긴다 (pickScore 와 같은 잣대) */
export type PickCombo = { foods: PickItem[]; score: number };
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
  return { ...budget, sodiumCap: b.kcal >= 120 ? b.sodiumCap : Math.max(b.sodium, b.sodiumCap), recorded: recorded.has(meal) };
}

export async function loadNextPicks(sb: Sb, person: string | string[], o: { meal: MealKey; kcal: number; protein: number; sodium: number; sodiumCap?: number; exclude?: Set<string>; menus: number; seed: number; combos?: boolean }) {
  const { meal, kcal, protein, sodium, sodiumCap } = o;
  const exclude = o.exclude || new Set<string>();
  const [{ data: rows, error }, { data: prof, error: pErr }, { data: foods, error: fErr }, signals] = await Promise.all([
    candidateQuery(sb, meal),
    sb.from("user_profiles").select("allergies").in("user_id", Array.isArray(person) ? person : [person]),
    sb.from("common_foods").select("id, name, category, serving_desc, serving_size_g, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, meal_times, breakfast_pref, dish_role"),
    loadSignals(sb, person, addDays(todayKst(), -30)),
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
    .filter((r) => fitsMeal(r, meal))
    .map((r) => perServing(r))
    .filter((r) => (r.calories || 0) >= minKcal && (r.calories || 0) <= maxKcal)
    // 나트륨은 하루 기준 상한으로만 거른다 (몫을 넘은 만큼은 점수에서) — 모르는 것은 남기되 아는 것(몫 안)보다 뒤로
    .filter((r) => underCap(r.sodium_mg, sodium, sodiumCap))
    .filter((r) => (r.protein_g || 0) <= 60) // 한 끼 단백질이 이보다 많으면 데이터 오류일 가능성
    .map((r) => ({ r, score: pickScore(r, { meal, kcal, protein, sodium, sodiumCap, signals }) }))
    .sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));

  // 같은 제조사가 줄줄이 나오지 않게
  const seen = new Set<string>();
  const items: PickItem[] = [];
  for (const { r, score } of picks) {
    const key = r.manufacturer || r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: r.id, name: r.name, manufacturer: r.manufacturer, image_url: r.image_url,
      calories: Math.round(r.calories || 0), protein_g: Math.round((r.protein_g || 0) * 10) / 10,
      sodium_mg: known(r.sodium_mg) == null ? null : Math.round(Number(r.sodium_mg)), serving_size_g: r.serving_size_g, nutrient_base_g: r.nutrient_base_g,
      score,
    });
    if (items.length >= 3) break;
  }
  // 날마다·끼니마다 조금씩 다른 메뉴가 위로 오게 (같은 날 같은 끼니는 같은 결과)
  const mb = { meal, kcal, protein, sodium, sodiumCap, avoid: allergyWords, signals };
  const menus = pickMenus((foods || []) as Menu[], mb, o.menus, o.seed);
  const combos = o.combos && meal !== "snack"
    // 밥은 그날 다른 끼니와 같아도 된다(같은 즉석밥을 또 먹는 것은 흔하다) — 국·반찬만 겹치지 않게
    ? await loadCombos(sb, { meal, kcal, protein, sodium, sodiumCap, signals }, (r, role) => (role === "rice" || !exclude.has(r.id)) && !allergyWords.some((w) => (r.name || "").includes(w)))
    : [];
  return { menus, items, menuBudget: mb, combos };
}

const toItem = (r: Row & { calories: number | null }, role?: PickItem["role"]): PickItem => ({
  id: r.id, name: r.name, manufacturer: r.manufacturer, image_url: r.image_url,
  calories: Math.round(r.calories || 0), protein_g: Math.round((r.protein_g || 0) * 10) / 10,
  sodium_mg: known(r.sodium_mg) == null ? null : Math.round(Number(r.sodium_mg)), serving_size_g: r.serving_size_g, nutrient_base_g: r.nutrient_base_g, role,
});

/** 한 상 고르기 — 밥 + 국·찌개 (+ 반찬 하나)를 합친 영양으로 몫에 맞춘다. 같은 국이 두 번 나오지 않게 국마다 가장 좋은 한 상, 높은 순 3개.
 *  계산만 (시험: tests/meal-combo.test.ts) — DB 읽기는 loadCombos */
export function bestCombos(pools: { rice: PickItem[]; soup: PickItem[]; side: PickItem[] }, b: Parameters<typeof pickScore>[1], top = 3): PickCombo[] {
  const sum = (xs: PickItem[]) => ({
    id: xs.map((x) => x.id).join("+"),
    calories: xs.reduce((a, x) => a + (x.calories || 0), 0),
    protein_g: xs.reduce((a, x) => a + (x.protein_g || 0), 0),
    // 하나라도 나트륨을 모르면 합도 모른다 (0 으로 치지 않는다)
    sodium_mg: xs.some((x) => x.sodium_mg == null) ? null : xs.reduce((a, x) => a + (x.sodium_mg || 0), 0),
  });
  const extra = (xs: PickItem[]) => xs.reduce((a, x) => a + signalTerm(b.signals, x.id), 0) / xs.length;
  const bySoup = new Map<string, PickCombo>();
  for (const rice of pools.rice.slice(0, 6)) for (const soup of pools.soup.slice(0, 60)) for (const side of [null, ...pools.side.slice(0, 25)]) {
    const foods = side ? [rice, soup, side] : [rice, soup];
    const t = sum(foods);
    if (!underCap(t.sodium_mg, b.sodium, b.sodiumCap)) continue;
    const score = pickScore({ calories: t.calories, protein_g: t.protein_g, sodium_mg: t.sodium_mg }, { ...b, signals: undefined }) + extra(foods)
      + (b.meal === "breakfast" ? Math.max(...foods.map((x) => (x as PickItem & { pref?: boolean }).pref ? 0.6 : 0)) : 0);
    const prev = bySoup.get(soup.id);
    if (!prev || score > prev.score) bySoup.set(soup.id, { foods, score });
  }
  return [...bySoup.values()].sort((a, z) => z.score - a.score).slice(0, top);
}

/** 한 상 후보 읽기 — 역할(dish_role)이 밥·국·반찬인 살 수 있는 제품, 그 끼니에 먹는 것만 (lib/meal-time) */
async function loadCombos(sb: Sb, b: Parameters<typeof pickScore>[1] & { meal: MealKey }, keep: (r: Row, role: "rice" | "soup" | "side") => boolean): Promise<PickCombo[]> {
  const read = (role: "rice" | "soup" | "side", n: number) => sb.from("products")
    .select("id, name, manufacturer, calories, protein_g, sodium_mg, serving_size_g, nutrient_base_g, dish_category, image_url, meal_times, breakfast_pref, dish_role")
    .eq("is_purchasable", true).is("nutrition_flag", null).is("rec_hold", null).gt("calories", 0)
    .gt("serving_size_g", 0).lte("serving_size_g", 350).eq("dish_role", role)
    .order("health_score", { ascending: false, nullsFirst: false }).limit(n);
  const [r, s, d] = await Promise.all([read("rice", 60), read("soup", 300), read("side", 300)]);
  for (const x of [r, s, d]) if (x.error) throw new Error(x.error.message);
  const pool = (rows: Row[], role: "rice" | "soup" | "side", lo: number, hi: number) => rows
    .filter((x) => keep(x, role) && fitsMeal(x, b.meal))
    .map((x) => perServing(x))
    // 1회 제공량 단백질이 40g 을 넘으면 원물(건멸치 등)이거나 데이터 오류일 가능성
    .filter((x) => (x.calories || 0) >= lo && (x.calories || 0) <= hi && (x.protein_g || 0) <= 40)
    .map((x) => ({ ...toItem(x, role), pref: !!x.breakfast_pref }));
  // 밥은 가벼운 것부터(몫을 국·반찬과 나눈다), 국·반찬은 단백질이 많은 것부터 — 조합 수를 줄이려고 앞쪽만 쓴다
  const rice = pool(r.data || [], "rice", 120, 400).sort((a, z) => (a.calories - z.calories) || a.name.localeCompare(z.name));
  const soup = pool(s.data || [], "soup", 40, Math.max(200, b.kcal * 0.8)).sort((a, z) => z.protein_g - a.protein_g || a.name.localeCompare(z.name));
  const side = pool(d.data || [], "side", 20, Math.max(150, b.kcal * 0.4)).sort((a, z) => z.protein_g - a.protein_g || a.name.localeCompare(z.name));
  // 같은 제조사의 밥만 줄줄이 나오지 않게 — 밥은 제조사마다 하나
  const seen = new Set<string>();
  const riceOne = rice.filter((x) => { const k = x.manufacturer || x.id; if (seen.has(k)) return false; seen.add(k); return true; });
  return bestCombos({ rice: riceOne, soup, side }, b);
}

/** 후보 읽기 — 끼니 종류를 DB 에서 먼저 거른 뒤 건강 점수 순으로 자른다 (자른 뒤 거르면 한 끼 후보가 거의 남지 않는다) */
function candidateQuery(sb: Sb, meal: MealKey) {
  let q = sb.from("products")
    .select("id, name, manufacturer, calories, protein_g, sodium_mg, serving_size_g, nutrient_base_g, meal_role, dish_category, image_url, meal_times, breakfast_pref, dish_role")
    .eq("is_purchasable", true).is("nutrition_flag", null).is("rec_hold", null).gt("calories", 0).gte("protein_g", meal === "snack" ? 3 : 6)
    // 1회 제공량이 포장 전체로 잘못 들어간 제품이 많아 350g 이하만
    .gt("serving_size_g", 0).lte("serving_size_g", 350);
  // 끼니 역할(products.meal_role, scripts/build_taste_profile.py)로도 거른다 — 간식은 간식으로 먹는 것만,
  //   한 끼는 원물 재료·양념·영양제·음료를 뺀다 (예: 간식 자리에 생선 원물·콜라겐 분말이 오던 것)
  q = meal === "snack"
    ? q.eq("meal_role", "snack").in("dish_category", SNACK_PRODUCT_CATS)
    : q.in("dish_category", MEAL_CATS).not("meal_role", "in", `(${NOT_MEAL_ROLES.join(",")})`)
      // 하나로 권하는 것은 메인만 (밥·국·반찬은 한 상으로) — 역할을 아직 모르면(null) 지금처럼
      .or("dish_role.is.null,dish_role.eq.main");
  return q.order("health_score", { ascending: false, nullsFirst: false }).limit(1000);
}

/** 한 후보의 점수 — 몫 맞춤×3 + 단백질 채움×2 + kcal 당 단백질(최대 1.5) + 나트륨(하루 기준, lib/rec-fit) + 끼니 때 + 본인 반응.
 *  시험: tests/rec-fit.test.ts */
export function pickScore(
  r: MealClass & { id?: string; name?: string | null; calories: number | null; protein_g: number | null; sodium_mg: number | null },
  b: { meal?: MealKey; kcal: number; protein: number; sodium: number; sodiumCap?: number; signals?: Signals },
) {
  const c = Number(r.calories) || 1, p = Number(r.protein_g) || 0;
  const fill = b.protein > 0 ? Math.min(1, p / b.protein) : 0;
  return budgetFit(c, b.kcal) * 3 + fill * 2 + Math.min(1.5, (p * 4) / c) + sodiumTerm(known(r.sodium_mg), b.sodium, b.sodiumCap)
    + (b.meal ? timeBonus(r, b.meal) : 0) + (r.id ? signalTerm(b.signals, r.id) : 0);
}
