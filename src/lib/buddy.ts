/**
 * 재료 캐릭터(버디) — 재료 30종 × 성격 8 = 240가지. 화면·서버·시험이 같이 쓰는 규칙 (그림은 components/ui/Buddy.tsx, 말은 lib/buddy-lines.ts).
 * 기획: claude/캐릭터-가족관리-기획.md · Claude Doc '오늘끼록 캐릭터 기획'
 *  - 처음엔 보자기 하나(가입). 풀면 재료·성격이 랜덤. 제철 재료는 그 계절 시즌 보자기에서만, 드문 재료는 연속 30일 보자기에서 잘 나온다.
 *  - 새 보자기는 기록으로만 받는다(연속 30일마다, 시즌 참여). 돈으로 사는 랜덤 뽑기는 없다.
 *  - 자라기는 같이 기록한 날 수로만 — 먹은 양으로 몸이 바뀌지 않는다.
 *  - 끼록이는 브랜드 마스코트로만 남는다(앱 아이콘·공지).
 */

export type FoodGroup = "carb" | "protein" | "fat" | "veg" | "fruit";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Rarity = "common" | "rare" | "season";

export const INGREDIENT_KEYS = [
  "sweetpotato", "potato", "pumpkin", "chestnut", "riceball", "mochi",
  "tofu", "egg", "quail", "pea", "yogurt", "cheese", "yolk",
  "avocado", "walnut", "peanut", "olive", "almond",
  "tomato", "cabbage", "mushroom", "radish", "lotus", "corn",
  "tangerine", "blueberry", "peach", "kiwi", "strawberry", "fig",
] as const;
export type IngredientKey = (typeof INGREDIENT_KEYS)[number];

export type Ingredient = { key: IngredientKey; name: string; group: FoodGroup; rarity: Rarity; season?: Season; words: [string, string] };

const I = (key: IngredientKey, name: string, group: FoodGroup, words: [string, string], rarity: Rarity = "common", season?: Season): Ingredient =>
  ({ key, name, group, rarity, season, words });

/** words: 이름 앞에 붙는 꾸밈말 ("포슬포슬한 고구마") — 맛·식감만, 효능 말 없음 */
export const INGREDIENTS: Ingredient[] = [
  I("sweetpotato", "고구마", "carb", ["포슬포슬한", "달큰한"]),
  I("potato", "감자", "carb", ["포근포근한", "동글동글한"]),
  I("pumpkin", "단호박", "carb", ["달콤한", "단단한"]),
  I("chestnut", "밤", "carb", ["고소한", "알이 꽉 찬"], "season", "autumn"),
  I("riceball", "주먹밥", "carb", ["꼭꼭 뭉친", "든든한"]),
  I("mochi", "찹쌀떡", "carb", ["쫀득한", "말랑한"]),
  I("tofu", "두부", "protein", ["말랑한", "보들보들한"]),
  I("egg", "달걀", "protein", ["동그란", "반질반질한"]),
  I("quail", "메추리알", "protein", ["콩알만 한", "동글동글한"]),
  I("pea", "완두콩", "protein", ["통통한", "초록초록한"]),
  I("yogurt", "그릭요거트", "protein", ["꾸덕한", "새하얀"]),
  I("cheese", "치즈", "protein", ["쭉 늘어나는", "고소한"]),
  I("yolk", "노른자", "protein", ["노란", "반짝이는"], "rare"),
  I("avocado", "아보카도", "fat", ["크리미한", "부드러운"]),
  I("walnut", "호두", "fat", ["오독오독한", "고소한"]),
  I("peanut", "땅콩", "fat", ["고소한", "땅땅한"]),
  I("olive", "올리브", "fat", ["동그란", "반들반들한"]),
  I("almond", "아몬드", "fat", ["바삭한", "고소한"]),
  I("tomato", "방울토마토", "veg", ["톡 터지는", "동글동글한"]),
  I("cabbage", "양배추", "veg", ["아삭한", "겹겹이 싸인"]),
  I("mushroom", "양송이", "veg", ["몽실몽실한", "통통한"]),
  I("radish", "래디시", "veg", ["아삭한", "볼이 빨간"]),
  I("lotus", "연근", "veg", ["구멍 숭숭 난", "아삭한"]),
  I("corn", "옥수수", "veg", ["톡톡 튀는", "노란"]),
  I("tangerine", "귤", "fruit", ["새콤달콤한", "말랑한"], "season", "winter"),
  I("blueberry", "블루베리", "fruit", ["톡 터지는", "보랏빛"]),
  I("peach", "복숭아", "fruit", ["말랑한", "보송보송한"], "season", "summer"),
  I("kiwi", "키위", "fruit", ["새콤한", "보송한"]),
  I("strawberry", "딸기", "fruit", ["새콤달콤한", "빨간"], "season", "spring"),
  I("fig", "무화과", "fruit", ["달콤한", "보랏빛"], "rare"),
];
const BY_KEY = new Map(INGREDIENTS.map((i) => [i.key, i]));
export const ingredientOf = (key: string) => BY_KEY.get(key as IngredientKey) ?? null;
export const GROUP_NAME: Record<FoodGroup, string> = { carb: "탄수화물", protein: "단백질", fat: "지방", veg: "채소", fruit: "과일" };
export const SEASON_NAME: Record<Season, string> = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };

export const PERSONALITY_KEYS = ["kind", "picky", "prim", "calm", "chatty", "brave", "shy", "odd"] as const;
export type PersonalityKey = (typeof PERSONALITY_KEYS)[number];
export const PERSONALITIES: { key: PersonalityKey; adj: string; how: string }[] = [
  { key: "kind", adj: "다정한", how: "따뜻하게 받아 줘요" },
  { key: "picky", adj: "까다로운", how: "맛·식감에 투정하지만 기록은 칭찬해요" },
  { key: "prim", adj: "새침한", how: "안 그런 척 좋아해요" },
  { key: "calm", adj: "느긋한", how: "천천히, 서두르지 않아요" },
  { key: "chatty", adj: "수다스러운", how: "말이 많고 신나요" },
  { key: "brave", adj: "씩씩한", how: "응원단장이에요" },
  { key: "shy", adj: "수줍은", how: "조용히 고마워해요" },
  { key: "odd", adj: "엉뚱한", how: "딴 데로 새는 상상을 해요" },
];
const P_BY_KEY = new Map(PERSONALITIES.map((p) => [p.key, p]));
export const personalityOf = (key: string) => P_BY_KEY.get(key as PersonalityKey) ?? null;

export const buddyName = (ingredient: string, personality: string) =>
  `${personalityOf(personality)?.adj ?? ""} ${ingredientOf(ingredient)?.name ?? ""}`.trim();

/** 자라기 — 같이 기록한 날 수로만 */
export const STAGES = [
  { key: "sprout", name: "새싹", from: 0, scale: 0.78 },
  { key: "kid", name: "꼬마", from: 7, scale: 0.86 },
  { key: "grown", name: "어른", from: 30, scale: 0.94 },
  { key: "best", name: "으뜸", from: 100, scale: 1 },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];
export function stageOf(days: number) {
  let s: (typeof STAGES)[number] = STAGES[0];
  for (const x of STAGES) if (days >= x.from) s = x;
  const next = STAGES.find((x) => x.from > days) ?? null;
  return { ...s, next: next ? { name: next.name, left: next.from - days } : null };
}

export function seasonOfMonth(month: number): Season {
  return month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
}

/** 보자기 종류 — start: 가입 · streak: 연속 30일마다 · season: 시즌 참여 */
export type WrapKind = "start" | "streak" | "season";
export const STREAK_WRAP_DAYS = 30;
const RARE_IN_STREAK = 0.4;

/** 보자기에서 나올 재료 (rand: 0 이상 1 미만) */
export function pickIngredient(kind: WrapKind, month: number, rand: () => number): IngredientKey {
  const commons = INGREDIENTS.filter((i) => i.rarity === "common");
  const any = (list: Ingredient[]) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))].key;
  if (kind === "season") {
    const s = seasonOfMonth(month);
    return INGREDIENTS.find((i) => i.season === s)!.key;
  }
  if (kind === "streak" && rand() < RARE_IN_STREAK) return any(INGREDIENTS.filter((i) => i.rarity === "rare"));
  return any(commons);
}
export function pickPersonality(rand: () => number): PersonalityKey {
  return PERSONALITY_KEYS[Math.min(PERSONALITY_KEYS.length - 1, Math.floor(rand() * PERSONALITY_KEYS.length))];
}

/** 보자기 열쇠 — 같은 보자기를 두 번 받지 않게 (사용자마다 고유) */
export const wrapKey = {
  start: () => "start",
  /** 연속 30일이 된 날 */
  streak: (markDay: string) => `streak:${markDay}`,
  season: (slug: string) => `season:${slug}`,
};

/** 받침 있으면 a, 없으면 b — "고구마가" / "단호박이" */
export function josa(word: string, withFinal: string, withoutFinal: string) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return withoutFinal;
  return (c - 0xac00) % 28 ? withFinal : withoutFinal;
}

/** 하루·상황마다 고정되는 작은 난수 (같은 날 같은 말) */
export function seedOf(...parts: (string | number)[]) {
  let h = 2166136261;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
