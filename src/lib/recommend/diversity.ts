/**
 * 다양성 보장 + 탐색 슬롯 — Phase 3
 * 같은 카테고리/제조사 제품이 연속으로 나오지 않도록 재배열하고,
 * 사용자가 평소 안 보던 카테고리에서 "새로운 발견" 제품을 삽입한다.
 */

import type { ScoredProduct } from "./types";
import type { UserInteractions } from "./interactions";

// ── 3-1. 카테고리 다양성 보장 ──

/** 음식 종류 — 이름에 이 말이 있으면 같은 종류. 연속 10개 안에 같은 종류는 3개까지 (닭가슴살만 줄줄이 나오던 것) */
const FOOD_TYPES: [string, RegExp][] = [
  ["닭가슴살", /닭가슴살|닭안심|닭\s?스테이크/],
  ["떡볶이", /떡볶이/],
  ["만두", /만두|교자|딤섬/],
  ["볶음밥", /볶음밥|덮밥|비빔밥|컵밥/],
  ["도시락", /도시락|식단/],
  ["국·탕", /곰탕|국$|국밥|탕$|찌개|전골|해장국/],
  ["면", /라면|우동|국수|냉면|파스타|스파게티|짬뽕|짜장/],
  ["샐러드", /샐러드|포케/],
  ["스테이크·함박", /스테이크|함박|떡갈비|돈까스|돈가스/],
  ["김치", /김치|깍두기/],
  ["두부", /두부/],
  ["어묵", /어묵|오뎅/],
  ["소시지·햄", /소시지|비엔나|후랑크|햄$/],
  ["피자·버거", /피자|버거|샌드위치|토스트/],
];
export function foodType(p: Record<string, unknown>): string | null {
  const name = String(p.name || "");
  for (const [k, re] of FOOD_TYPES) if (re.test(name)) return k;
  return null;
}
const TYPE_WINDOW = 10;
const TYPE_MAX = 3;

/**
 * 점수 순서를 지키며 같은 카테고리·제조사가 잇따르지 않게만 미룬다.
 * 앞에서부터 보며, 바로 앞 N개와 카테고리(또는 제조사)가 모두 같거나, 연속 10개 안에 같은 음식 종류가 이미 3개면
 * 그 제품은 건너뛰고 다음 것을 먼저 놓는다.
 * (전에는 카테고리마다 1등을 돌아가며 놓는 라운드 로빈이라, 점수가 낮은 카테고리의 1등이
 *  점수가 높은 카테고리의 2등보다 앞에 섰다 — 상위 10개에 건강 점수 8점 과자가 끼었다. scripts/eval_recommend.mjs)
 */
export function diversifyResults(
  products: ScoredProduct[],
  maxConsecutiveSameCategory: number = 2,
  maxSameManufacturer: number = 2,
): ScoredProduct[] {
  if (products.length <= 3) return products;
  const catOf = (p: ScoredProduct) => (p.dish_category as string) || "other";
  const mfrOf = (p: ScoredProduct) => (p.manufacturer as string) || "";
  const pool = [...products];
  const result: ScoredProduct[] = [];
  const fits = (c: ScoredProduct) => {
    const t = foodType(c);
    if (t && result.slice(-(TYPE_WINDOW - 1)).filter((r) => foodType(r) === t).length >= TYPE_MAX) return false;
    const cats = result.slice(-maxConsecutiveSameCategory).map(catOf);
    if (cats.length >= maxConsecutiveSameCategory && cats.every((x) => x === catOf(c))) return false;
    const m = mfrOf(c);
    if (!m) return true;
    const mfrs = result.slice(-maxSameManufacturer).map(mfrOf);
    return !(mfrs.length >= maxSameManufacturer && mfrs.every((x) => x === m));
  };
  while (pool.length) {
    const i = pool.findIndex(fits);
    result.push(pool.splice(i < 0 ? 0 : i, 1)[0]); // 맞는 게 없으면 점수 1등을 그대로
  }
  return result;
}

// ── 3-2. Exploration 슬롯 ──

/**
 * 탐색 슬롯 삽입 — 평소 안 보던 카테고리에서 선택하여
 * 추천 피로감을 해소하고 장기 선호 학습 데이터를 확보한다.
 * 삽입된 제품에 is_exploration = true를 마킹한다.
 */
export function insertExplorationSlots(
  products: ScoredProduct[],
  interactions: UserInteractions | undefined,
  explorationRate: number = 0.1,
): ScoredProduct[] {
  if (!interactions || products.length < 10) return products;

  // 사용자가 자주 본 상위 카테고리 (50% 이상의 인터랙션)
  const totalInteractions = Object.values(interactions.preferredCategories)
    .reduce((sum, c) => sum + c, 0);
  if (totalInteractions < 3) return products; // 인터랙션 너무 적으면 탐색 불필요

  const familiarCats = new Set<string>();
  for (const [cat, count] of Object.entries(interactions.preferredCategories)) {
    if (count / totalInteractions >= 0.15) familiarCats.add(cat);
  }
  if (familiarCats.size === 0) return products;

  // 탐색 후보: 상위 카테고리가 아닌 제품 중 health_score가 높은 것
  const explorationCandidates = products.filter((p) => {
    const cat = (p.dish_category as string) || "other";
    return !familiarCats.has(cat) && (p.health_score as number) >= 60;
  });

  if (explorationCandidates.length === 0) return products;

  // health_score 높은 순으로 정렬
  explorationCandidates.sort(
    (a, b) => ((b.health_score as number) || 0) - ((a.health_score as number) || 0)
  );

  // 삽입할 개수와 위치 결정
  const numSlots = Math.max(1, Math.floor(products.length * explorationRate));
  const slotInterval = Math.floor(products.length / (numSlots + 1));

  const result = [...products];
  let inserted = 0;

  for (let i = 0; i < numSlots && inserted < explorationCandidates.length; i++) {
    const insertPos = Math.min(
      (i + 1) * slotInterval + inserted, // 등간격 삽입
      result.length
    );

    const exploration = explorationCandidates[inserted];

    // 이미 결과에 있는 제품이면 스킵
    if (result.some((r) => (r.id as string) === (exploration.id as string))) {
      inserted++;
      continue;
    }

    // 탐색 마킹
    const markedProduct = { ...exploration, is_exploration: true };
    result.splice(insertPos, 0, markedProduct);
    inserted++;
  }

  return result;
}
