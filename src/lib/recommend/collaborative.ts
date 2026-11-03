/**
 * 협업 필터링 + 사용자 임베딩
 * 비슷한 사용자가 좋아한 제품을 추천
 *
 * 설계 원칙:
 * - 프로필은 클라이언트(localStorage)에만 있으므로, 서버에서는 행동 데이터만 사용
 * - 클라이언트가 프로필을 함께 보내면 프로필+행동 하이브리드로 전환
 * - 사용자 5명 미만이면 자동 비활성화 (기존 스코어링만 사용)
 * - CF 실패 시 non-fatal (기존 추천에 영향 없음)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// ═══════════════════════════════════════════════════════
//  타입
// ═══════════════════════════════════════════════════════

/** 사용자 행동 벡터 — DB에서 자동 생성 가능 */
export type UserVector = {
  userId: string;
  interactionCount: number; // 총 인터랙션 수 (벡터 신뢰도 지표)

  // ── 행동 기반 (DB에서 자동 추출) ──
  categoryPrefs: Record<string, number>; // 정규화된 카테고리 분포 (합=1)
  nutritionAvg: {
    cal: number; // 평균 칼로리 (0~1 정규화)
    pro: number; // 평균 단백질
    fat: number; // 평균 지방
    sod: number; // 평균 나트륨
  };
  favoriteIds: string[]; // 즐겨찾기 제품 ID
  clickedIds: string[];  // 가격 클릭 제품 ID (구매 의향)

  // ── 프로필 기반 (클라이언트에서 전달 시에만) ──
  goals?: string[];
  concerns?: string[];
  ageGroup?: string;    // "20s" | "30s" | "40s" | "50s" | "60+"
  bmiGroup?: string;    // "under" | "normal" | "over" | "obese"
  tastePrefs?: { salty: number; sweet: number; spicy: number; fatty: number };
};

/** CF 추천 결과 */
export type CFRecommendation = {
  productId: string;
  cfScore: number;   // 0~1 (유사도 × 추천 강도)
  fromUsers: number; // 추천한 유사 사용자 수
};

/** 스코어링에 전달할 CF 부스트 */
export type CFBoost = {
  productId: string;
  cfScore: number;
};

// ═══════════════════════════════════════════════════════
//  상수
// ═══════════════════════════════════════════════════════

export const MIN_USERS_FOR_CF = 5;       // CF 활성화 최소 사용자 수
const MIN_INTERACTIONS = 3;               // 벡터 생성 최소 인터랙션 수
const TOP_SIMILAR_USERS = 5;              // 유사 사용자 수
const CF_TOP_K = 20;                      // CF 추천 최대 제품 수
const CACHE_TTL = 3600 * 1000;            // 벡터 캐시 TTL (1시간)

// 영양소 정규화 범위 (0~1 스케일링용)
const NORM = {
  cal: 800,   // 800kcal = 1.0
  pro: 40,    // 40g = 1.0
  fat: 30,    // 30g = 1.0
  sod: 2000,  // 2000mg = 1.0
};

// ═══════════════════════════════════════════════════════
//  유사도 계산
// ═══════════════════════════════════════════════════════

/** 코사인 유사도 (카테고리 분포 비교용) */
function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const key of allKeys) {
    const va = a[key] || 0;
    const vb = b[key] || 0;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Jaccard 유사도 (목표/관심사 비교용) */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 유클리드 거리 → 유사도 변환 (0~1) */
function euclideanSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    sumSq += (a[i] - b[i]) ** 2;
  }
  return 1 / (1 + Math.sqrt(sumSq));
}

/**
 * 두 사용자 벡터의 유사도를 계산한다 (0~1).
 * 프로필 유사도(40%) + 행동 유사도(60%) 가중 합산.
 * 행동 데이터만 있으면 행동 100%, 프로필만 있으면 프로필 100%.
 */
export function userSimilarity(a: UserVector, b: UserVector): number {
  const hasBehaviorA = a.interactionCount >= MIN_INTERACTIONS;
  const hasBehaviorB = b.interactionCount >= MIN_INTERACTIONS;
  const hasProfileA = !!a.goals && a.goals.length > 0;
  const hasProfileB = !!b.goals && b.goals.length > 0;

  // 행동 유사도
  let behaviorSim = 0;
  if (hasBehaviorA && hasBehaviorB) {
    const catSim = cosineSimilarity(a.categoryPrefs, b.categoryPrefs);
    const nutSim = euclideanSimilarity(
      [a.nutritionAvg.cal, a.nutritionAvg.pro, a.nutritionAvg.fat, a.nutritionAvg.sod],
      [b.nutritionAvg.cal, b.nutritionAvg.pro, b.nutritionAvg.fat, b.nutritionAvg.sod],
    );
    // 맛 선호 유사도 (있으면)
    let tasteSim = 0.5; // 기본값
    if (a.tastePrefs && b.tastePrefs) {
      tasteSim = euclideanSimilarity(
        [a.tastePrefs.salty / 10, a.tastePrefs.sweet / 10, a.tastePrefs.spicy / 10, a.tastePrefs.fatty / 10],
        [b.tastePrefs.salty / 10, b.tastePrefs.sweet / 10, b.tastePrefs.spicy / 10, b.tastePrefs.fatty / 10],
      );
    }
    behaviorSim = catSim * 0.4 + nutSim * 0.3 + tasteSim * 0.3;
  }

  // 프로필 유사도
  let profileSim = 0;
  if (hasProfileA && hasProfileB) {
    const goalSim = jaccardSimilarity(a.goals!, b.goals!);
    const concernSim = jaccardSimilarity(a.concerns || [], b.concerns || []);
    const ageSim = (a.ageGroup && b.ageGroup && a.ageGroup === b.ageGroup) ? 1 : 0;
    const bmiSim = (a.bmiGroup && b.bmiGroup && a.bmiGroup === b.bmiGroup) ? 1 : 0;
    profileSim = goalSim * 0.35 + concernSim * 0.35 + ageSim * 0.15 + bmiSim * 0.15;
  }

  // 가중 합산
  const hasBoth = (hasBehaviorA && hasBehaviorB) && (hasProfileA && hasProfileB);
  const hasBehaviorOnly = (hasBehaviorA && hasBehaviorB) && !(hasProfileA && hasProfileB);
  const hasProfileOnly = !(hasBehaviorA && hasBehaviorB) && (hasProfileA && hasProfileB);

  if (hasBoth) return profileSim * 0.4 + behaviorSim * 0.6;
  if (hasBehaviorOnly) return behaviorSim;
  if (hasProfileOnly) return profileSim;
  return 0;
}

// ═══════════════════════════════════════════════════════
//  사용자 벡터 생성
// ═══════════════════════════════════════════════════════

/**
 * 단일 사용자의 행동 벡터를 생성한다.
 * DB의 인터랙션 + 제품 영양 데이터로 자동 구축.
 */
export async function buildUserVector(
  supabase: SupabaseClient,
  userId: string,
  profileHint?: {
    goals?: string[];
    concerns?: string[];
    age?: number;
    bmi?: number;
    tastes?: { salty: number; sweet: number; spicy: number; fatty: number };
  },
): Promise<UserVector> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();

  // 인터랙션 + 즐겨찾기 병렬 로드
  const [interactionsRes, favoritesRes] = await Promise.all([
    supabase
      .from("user_interactions")
      .select("product_id, action")
      .eq("user_id", userId)
      .gte("created_at", ninetyDaysAgo)
      .limit(500),
    supabase
      .from("user_favorites")
      .select("product_id")
      .eq("user_id", userId)
      .limit(200),
  ]);

  const interactions: { product_id: string; action: string }[] = interactionsRes.data || [];
  const favorites: { product_id: string }[] = favoritesRes.data || [];

  const viewedIds: string[] = [];
  const clickedIds: string[] = [];
  for (const i of interactions) {
    if (!i.product_id) continue;
    if (i.action === "view") viewedIds.push(i.product_id);
    if (i.action === "click_price") clickedIds.push(i.product_id);
  }
  const favoriteIds = favorites.map(f => f.product_id).filter(Boolean);

  // 인터랙션한 제품들의 영양 정보 + 카테고리 로드
  const allProductIds = [...new Set([...viewedIds, ...clickedIds, ...favoriteIds])];

  let categoryPrefs: Record<string, number> = {};
  let nutritionAvg = { cal: 0.5, pro: 0.5, fat: 0.5, sod: 0.5 };

  if (allProductIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, dish_category, calories, protein_g, fat_g, sodium_mg")
      .in("id", allProductIds.slice(0, 200));

    if (products && products.length > 0) {
      // 카테고리 분포 (가중: click×3, favorite×2, view×1)
      const catCounts: Record<string, number> = {};
      let totalWeight = 0;
      for (const p of products as { id: string; dish_category: string | null; calories: number | null; protein_g: number | null; fat_g: number | null; sodium_mg: number | null }[]) {
        if (!p.dish_category) continue;
        let w = 0;
        if (viewedIds.includes(p.id)) w += 1;
        if (clickedIds.includes(p.id)) w += 3;
        if (favoriteIds.includes(p.id)) w += 2;
        catCounts[p.dish_category] = (catCounts[p.dish_category] || 0) + w;
        totalWeight += w;
      }
      // 정규화 (합=1)
      if (totalWeight > 0) {
        for (const key of Object.keys(catCounts)) {
          categoryPrefs[key] = catCounts[key] / totalWeight;
        }
      }

      // 영양 평균 (정규화)
      let calSum = 0, proSum = 0, fatSum = 0, sodSum = 0, cnt = 0;
      for (const p of products as { calories: number | null; protein_g: number | null; fat_g: number | null; sodium_mg: number | null }[]) {
        if (p.calories == null) continue;
        calSum += (p.calories || 0);
        proSum += (p.protein_g || 0);
        fatSum += (p.fat_g || 0);
        sodSum += (p.sodium_mg || 0);
        cnt++;
      }
      if (cnt > 0) {
        nutritionAvg = {
          cal: Math.min(1, (calSum / cnt) / NORM.cal),
          pro: Math.min(1, (proSum / cnt) / NORM.pro),
          fat: Math.min(1, (fatSum / cnt) / NORM.fat),
          sod: Math.min(1, (sodSum / cnt) / NORM.sod),
        };
      }
    }
  }

  // 프로필 정보 (클라이언트에서 전달된 경우)
  let ageGroup: string | undefined;
  let bmiGroup: string | undefined;
  if (profileHint?.age) {
    const age = profileHint.age;
    if (age < 30) ageGroup = "20s";
    else if (age < 40) ageGroup = "30s";
    else if (age < 50) ageGroup = "40s";
    else if (age < 60) ageGroup = "50s";
    else ageGroup = "60+";
  }
  if (profileHint?.bmi) {
    const bmi = profileHint.bmi;
    if (bmi < 18.5) bmiGroup = "under";
    else if (bmi < 25) bmiGroup = "normal";
    else if (bmi < 30) bmiGroup = "over";
    else bmiGroup = "obese";
  }

  return {
    userId,
    interactionCount: interactions.length,
    categoryPrefs,
    nutritionAvg,
    favoriteIds,
    clickedIds,
    goals: profileHint?.goals,
    concerns: profileHint?.concerns as string[] | undefined,
    ageGroup,
    bmiGroup,
    tastePrefs: profileHint?.tastes,
  };
}

// ═══════════════════════════════════════════════════════
//  벡터 캐시 + 전체 사용자 로드
// ═══════════════════════════════════════════════════════

let vectorCache: { vectors: UserVector[]; cachedAt: number } | null = null;

/**
 * 모든 활성 사용자의 행동 벡터를 로드한다.
 * 1시간 캐시로 DB 부하 최소화.
 */
export async function loadAllUserVectors(supabase: SupabaseClient): Promise<UserVector[]> {
  // 캐시 확인
  if (vectorCache && Date.now() - vectorCache.cachedAt < CACHE_TTL) {
    return vectorCache.vectors;
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();

  // 최근 90일 내 인터랙션 있는 사용자 목록
  const { data: userRows } = await supabase
    .from("user_interactions")
    .select("user_id")
    .gte("created_at", ninetyDaysAgo);

  if (!userRows || userRows.length === 0) {
    vectorCache = { vectors: [], cachedAt: Date.now() };
    return [];
  }

  // 사용자별 인터랙션 수 집계
  const userCounts: Record<string, number> = {};
  for (const row of userRows as { user_id: string }[]) {
    if (!row.user_id) continue;
    userCounts[row.user_id] = (userCounts[row.user_id] || 0) + 1;
  }

  // 최소 인터랙션 수 이상인 사용자만 선택
  const activeUserIds = Object.entries(userCounts)
    .filter(([, count]) => count >= MIN_INTERACTIONS)
    .map(([userId]) => userId);

  if (activeUserIds.length === 0) {
    vectorCache = { vectors: [], cachedAt: Date.now() };
    return [];
  }

  // 각 사용자의 벡터 생성 (프로필 없이, 행동만)
  // 병렬이지만 최대 50명까지만 (DB 부하 제한)
  const targetUsers = activeUserIds.slice(0, 50);
  const vectors = await Promise.all(
    targetUsers.map(userId => buildUserVector(supabase, userId))
  );

  // 유효한 벡터만 캐시
  const validVectors = vectors.filter(v => v.interactionCount >= MIN_INTERACTIONS);
  vectorCache = { vectors: validVectors, cachedAt: Date.now() };
  return validVectors;
}

// ═══════════════════════════════════════════════════════
//  협업 필터링 추천
// ═══════════════════════════════════════════════════════

/**
 * 비슷한 사용자가 좋아한 제품을 추천한다.
 * 현재 사용자의 벡터와 모든 사용자의 벡터를 비교하여
 * 유사 사용자들의 즐겨찾기/클릭 제품을 추천.
 */
export async function getCollaborativeRecommendations(
  supabase: SupabaseClient,
  currentUser: UserVector,
  allUserVectors: UserVector[],
  topK: number = CF_TOP_K,
): Promise<CFRecommendation[]> {
  // 자기 자신 제외
  const otherUsers = allUserVectors.filter(v => v.userId !== currentUser.userId);
  if (otherUsers.length === 0) return [];

  // 유사도 계산 + 상위 K명 선택
  const similarities = otherUsers
    .map(v => ({ vector: v, similarity: userSimilarity(currentUser, v) }))
    .filter(s => s.similarity > 0.1) // 최소 유사도 임계값
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOP_SIMILAR_USERS);

  if (similarities.length === 0) return [];

  // 유사 사용자들의 즐겨찾기 + 클릭 제품 수집
  const currentViewedOrFaved = new Set([
    ...currentUser.favoriteIds,
    ...currentUser.clickedIds,
  ]);

  const productScores: Record<string, { totalSim: number; count: number }> = {};

  for (const { vector, similarity } of similarities) {
    // 즐겨찾기 (강한 시그널)
    for (const pid of vector.favoriteIds) {
      if (currentViewedOrFaved.has(pid)) continue; // 이미 본/좋아한 제품 제외
      if (!productScores[pid]) productScores[pid] = { totalSim: 0, count: 0 };
      productScores[pid].totalSim += similarity * 1.0;
      productScores[pid].count++;
    }
    // 가격 클릭 (중간 시그널)
    for (const pid of vector.clickedIds) {
      if (currentViewedOrFaved.has(pid)) continue;
      if (!productScores[pid]) productScores[pid] = { totalSim: 0, count: 0 };
      productScores[pid].totalSim += similarity * 0.6;
      productScores[pid].count++;
    }
  }

  // 점수 산출: 평균 유사도 × log(추천 사용자 수 + 1)
  const recommendations: CFRecommendation[] = Object.entries(productScores)
    .map(([productId, { totalSim, count }]) => ({
      productId,
      cfScore: Math.min(1, (totalSim / count) * Math.log2(count + 1)),
      fromUsers: count,
    }))
    .sort((a, b) => b.cfScore - a.cfScore)
    .slice(0, topK);

  return recommendations;
}

/**
 * CF 부스트를 생성한다 — 스코어링에 전달할 형태.
 * MIN_USERS_FOR_CF 미만이면 빈 배열 반환 (CF 비활성).
 */
export async function getCFBoosts(
  supabase: SupabaseClient,
  userId: string,
  profileHint?: {
    goals?: string[];
    concerns?: string[];
    age?: number;
    bmi?: number;
    tastes?: { salty: number; sweet: number; spicy: number; fatty: number };
  },
): Promise<CFBoost[]> {
  try {
    const allVectors = await loadAllUserVectors(supabase);
    if (allVectors.length < MIN_USERS_FOR_CF) return [];

    const currentVector = await buildUserVector(supabase, userId, profileHint);
    const cfResults = await getCollaborativeRecommendations(
      supabase, currentVector, allVectors,
    );

    return cfResults.map(r => ({
      productId: r.productId,
      cfScore: r.cfScore,
    }));
  } catch (e) {
    // CF 실패는 non-fatal
    console.warn("[CF] Collaborative filtering failed:", e);
    return [];
  }
}
