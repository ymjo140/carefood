/**
 * 다양성 보장 + 탐색 슬롯 — Phase 3
 * 같은 카테고리/제조사 제품이 연속으로 나오지 않도록 재배열하고,
 * 사용자가 평소 안 보던 카테고리에서 "새로운 발견" 제품을 삽입한다.
 */

import type { ScoredProduct } from "./types";
import type { UserInteractions } from "./interactions";

// ── 3-1. 카테고리 다양성 보장 ──

/**
 * 라운드 로빈 방식으로 카테고리 다양성을 보장한다.
 * 점수 순서를 대체로 유지하되, 같은 카테고리/제조사가 연속되지 않도록 재배열.
 */
export function diversifyResults(
  products: ScoredProduct[],
  maxConsecutiveSameCategory: number = 2,
  maxSameManufacturer: number = 2,
): ScoredProduct[] {
  if (products.length <= 3) return products;

  // 카테고리별 그룹핑 (각 그룹은 점수순 유지)
  const catGroups = new Map<string, ScoredProduct[]>();
  for (const p of products) {
    const cat = (p.dish_category as string) || "other";
    if (!catGroups.has(cat)) catGroups.set(cat, []);
    catGroups.get(cat)!.push(p);
  }

  // 카테고리를 대표 제품 점수순으로 정렬
  const sortedCats = Array.from(catGroups.entries())
    .sort((a, b) => b[1][0].match_score - a[1][0].match_score)
    .map(([cat]) => cat);

  // 각 카테고리의 현재 인덱스 (라운드 로빈용)
  const catIdx = new Map<string, number>();
  for (const cat of sortedCats) catIdx.set(cat, 0);

  const result: ScoredProduct[] = [];
  const totalProducts = products.length;
  let staleRounds = 0; // 무한루프 방지

  while (result.length < totalProducts && staleRounds < totalProducts) {
    let placed = false;

    for (const cat of sortedCats) {
      const group = catGroups.get(cat)!;
      const idx = catIdx.get(cat)!;
      if (idx >= group.length) continue; // 이 카테고리는 다 소진됨

      const candidate = group[idx];
      const candidateCat = (candidate.dish_category as string) || "other";
      const candidateMfr = (candidate.manufacturer as string) || "";

      // 연속 카테고리 체크
      const recentCats = result.slice(-maxConsecutiveSameCategory).map(
        (r) => (r.dish_category as string) || "other"
      );
      if (recentCats.length >= maxConsecutiveSameCategory &&
          recentCats.every((c) => c === candidateCat)) {
        continue; // 이 카테고리는 이번 라운드 스킵
      }

      // 연속 제조사 체크
      if (candidateMfr) {
        const recentMfrs = result.slice(-maxSameManufacturer).map(
          (r) => (r.manufacturer as string) || ""
        );
        if (recentMfrs.length >= maxSameManufacturer &&
            recentMfrs.every((m) => m === candidateMfr)) {
          continue; // 이 제조사는 이번 라운드 스킵
        }
      }

      result.push(candidate);
      catIdx.set(cat, idx + 1);
      placed = true;
    }

    if (!placed) {
      // 제약으로 아무것도 못 넣었으면 → 제약 무시하고 다음 하나 강제 삽입
      staleRounds++;
      for (const cat of sortedCats) {
        const group = catGroups.get(cat)!;
        const idx = catIdx.get(cat)!;
        if (idx < group.length) {
          result.push(group[idx]);
          catIdx.set(cat, idx + 1);
          break;
        }
      }
    } else {
      staleRounds = 0;
    }
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
