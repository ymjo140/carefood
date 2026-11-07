/**
 * 추천 유형화 시스템 — 메인 엔트리
 * 5축 복합 프로필 기반 추천
 */

export { parseProfile, getProfileLabels } from "./profile";
export { scoreProduct, scoreAndRank, displayMatch, byRank } from "./scoring";
export { fetchRecommendPool, loadPurchasableIds, loadPrices } from "./query-builder";
export { loadUserInteractions } from "./interactions";
export { loadProductReviewStats } from "./reviews";
export { diversifyResults, insertExplorationSlots } from "./diversity";
export { getCFBoosts } from "./collaborative";
export type { UserProfile, ScoredProduct, HealthConcern, HealthGoal, RiskLevel } from "./types";
export type { PriceInfo } from "./query-builder";
export type { UserInteractions } from "./interactions";
export type { ProductReviewStats } from "./reviews";
export type { CFBoost } from "./collaborative";
export { TASTE_RANGES, CONCERN_TAG_BOOSTS, CONCERN_RULES } from "./constants";
