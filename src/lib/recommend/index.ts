/**
 * 추천 유형화 시스템 — 메인 엔트리
 * 5축 복합 프로필 기반 추천
 */

export { parseProfile, getProfileLabels } from "./profile";
export { scoreProduct, scoreAndRank, normalizeScores } from "./scoring";
export { fetchRecommendPool, loadPurchasableIds, loadPrices } from "./query-builder";
export type { UserProfile, ScoredProduct, HealthConcern, HealthGoal, RiskLevel } from "./types";
export type { PriceInfo } from "./query-builder";
export { TASTE_RANGES, CONCERN_TAG_BOOSTS, CONCERN_RULES } from "./constants";
