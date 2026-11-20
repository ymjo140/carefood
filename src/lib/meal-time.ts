/**
 * 끼니 때에 맞는 음식인가 — 아침에 보쌈·족발·치킨을 권하지 않는다. 점심·저녁은 가르지 않는다.
 * 이름으로 본다 (제품·대표 메뉴 공통). 시험: tests/meal-time.test.ts
 *   아침에 빼는 것: 술안주·야식으로 먹는 고기 요리, 기름에 튀긴 것, 맵고 무거운 국물·볶음
 *   아침에 먼저 권하는 것: 죽·샌드위치·토스트·요거트·달걀·김밥·주먹밥·가벼운 국 (+0.6)
 * "성분 정보 + 통계적 매칭" — 처방이 아니다. 끼니 때 습관에 맞추는 것뿐이다.
 */

const NOT_BREAKFAST = new RegExp([
  "보쌈", "족발", "삼겹", "오겹", "목살구이", "항정", "갈비살", "LA갈비", "양념갈비", "곱창", "막창", "대창", "양꼬치", "닭발", "닭갈비",
  "치킨", "닭강정", "후라이드", "윙봉", "탕수육", "깐풍", "라조기", "유린기", "꿔바로우",
  "피자", "마라", "훠궈", "짬뽕", "부대찌개", "감자탕", "아구찜", "해물찜", "찜닭", "전골", "곱도리", "닭볶음탕",
  "회덮밥", "모둠회", "사시미", "육회", "스테이크", "안주", "야식", "맥주", "소주",
].join("|"));

const BREAKFAST_LIKE = new RegExp([
  "죽", "오트밀", "그래놀라", "시리얼", "요거트", "요구르트", "토스트", "샌드위치", "베이글", "머핀", "모닝빵", "식빵",
  "달걀", "계란", "스크램블", "오믈렛", "김밥", "주먹밥", "오니기리", "유부초밥", "두유", "우유", "누룽지",
  "미역국", "북엇국", "황태", "콩나물국", "된장국", "떡국", "바나나", "사과", "고구마", "샐러드",
].join("|"));

/** 이 끼니에 권하지 않는가 */
export function offMeal(name: string | null | undefined, meal: string) {
  return meal === "breakfast" && NOT_BREAKFAST.test(name || "");
}

/** 이 끼니에 맞으면 더하는 점수 (아침에 아침다운 음식 +0.6, 그 밖 0) */
export function mealTimeBonus(name: string | null | undefined, meal: string) {
  return meal === "breakfast" && BREAKFAST_LIKE.test(name || "") ? 0.6 : 0;
}

/**
 * DB 칸이 있으면 그것을 먼저 (products·common_foods 의 meal_times · breakfast_pref · dish_role, 마이그레이션 20261120c).
 *   meal_times: 국민건강영양조사 2024 식품섭취조사의 끼니별 섭취 비율(아침 비중 8% 미만은 아침 빼기, 19% 이상은 아침 우선)
 *               + 조사에 없는 음식은 정해 둔 묶음 규칙. 칸이 비어 있으면 위의 이름 규칙으로.
 *   dish_role:  main(그것만으로 한 끼) · rice(밥) · soup(국·찌개) · side(반찬) · snack(간식) · ingredient(원재료) · condiment(소스·육수) — 재료·소스는 권하지 않는다
 *   반찬이면서 간식도 되는 것(구운란·반숙란·소시지·부어스트·닭꼬치)은 역할 side + meal_times 에 snack — 간식 자리에도 나온다
 */
export type MealClass = { name?: string | null; meal_times?: string[] | null; breakfast_pref?: boolean | null; dish_role?: string | null };

/** 이 끼니에 권해도 되는가 */
export function fitsMeal(x: MealClass, meal: string) {
  if (x.meal_times && x.meal_times.length) return x.meal_times.includes(meal);
  return !offMeal(x.name, meal);
}

/** 이 끼니에 맞으면 더하는 점수 — 아침 우선이면 +0.6 */
export function timeBonus(x: MealClass, meal: string) {
  if (x.meal_times && x.meal_times.length) return meal === "breakfast" && x.breakfast_pref ? 0.6 : 0;
  return mealTimeBonus(x.name, meal);
}

/** 혼자서 한 끼로 권해도 되는가 — 밥·국·반찬·간식·재료·소스는 한 끼 하나로 권하지 않는다 (역할을 모르면 지금처럼) */
export const isMain = (x: MealClass) => !x.dish_role || x.dish_role === "main";
