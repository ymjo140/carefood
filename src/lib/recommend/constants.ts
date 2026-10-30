/**
 * 추천 시스템 공통 상수
 * recommend API + products API 공용
 */

import type { HealthConcern } from "./types";

// ── 관심사별 기능성 태그 부스트 ──
export const CONCERN_TAG_BOOSTS: Record<HealthConcern, { tag: string; weight: number; reason: string; detail: string }[]> = {
  gut_health: [
    { tag: "probiotics", weight: 1.4, reason: "유산균 함유", detail: "유산균이 포함된 제품이에요" },
    { tag: "prebiotic", weight: 1.35, reason: "식이섬유 함유", detail: "프리바이오틱스(식이섬유)가 포함돼 있어요" },
  ],
  skin: [
    { tag: "collagen", weight: 1.4, reason: "콜라겐 함유", detail: "콜라겐이 포함된 제품이에요" },
    { tag: "vitamin", weight: 1.2, reason: "비타민 함유", detail: "비타민이 포함돼 있어요" },
    { tag: "zinc", weight: 1.15, reason: "아연 함유", detail: "아연이 포함된 제품이에요" },
  ],
  weight: [
    { tag: "protein", weight: 1.3, reason: "프로틴 제품", detail: "단백질 보충용으로 설계된 제품이에요" },
    { tag: "diet", weight: 1.3, reason: "다이어트 설계", detail: "저칼로리/다이어트용으로 설계됐어요" },
    { tag: "sugar_free", weight: 1.2, reason: "무설탕", detail: "설탕 없이 만든 제품이에요" },
  ],
  energy: [
    { tag: "vitamin", weight: 1.25, reason: "비타민 함유", detail: "비타민이 포함돼 있어요" },
    { tag: "iron", weight: 1.2, reason: "철분 함유", detail: "철분이 포함된 제품이에요" },
    { tag: "calcium", weight: 1.15, reason: "칼슘 함유", detail: "칼슘이 포함돼 있어요" },
    { tag: "omega3", weight: 1.15, reason: "오메가3 함유", detail: "오메가3가 포함된 제품이에요" },
  ],
};

// ── 관심사별 영양 적합도 규칙 ──
export type NutrientRule = {
  field: string;
  op: "lt" | "gt" | "gte" | "lte" | "between";
  value: number | [number, number];
  weight: number; // 곱연산 multiplier (1.0~1.3)
  reason: string;
  detail: (v: number) => string;
};

export const CONCERN_RULES: Record<HealthConcern, NutrientRule[]> = {
  gut_health: [
    { field: "fiber_g", op: "gte", value: 3, weight: 1.25, reason: "식이섬유 풍부", detail: (v) => `식이섬유 ${v}g — 고식이섬유 식품` },
    { field: "sugar_g", op: "lt", value: 8, weight: 1.1, reason: "당류 적정", detail: (v) => `당류 ${v}g — 저당 식품` },
    { field: "fat_g", op: "lt", value: 10, weight: 1.05, reason: "저지방", detail: (v) => `지방 ${v}g — 저지방 식품` },
  ],
  skin: [
    { field: "protein_g", op: "gte", value: 10, weight: 1.2, reason: "단백질 풍부", detail: (v) => `단백질 ${v}g — 고단백 식품` },
    { field: "fat_g", op: "between", value: [3, 15], weight: 1.1, reason: "건강한 지방", detail: (v) => `지방 ${v}g — 적정 지방 함유` },
    { field: "sugar_g", op: "lt", value: 5, weight: 1.15, reason: "저당", detail: (v) => `당류 ${v}g — 저당 식품` },
  ],
  weight: [
    { field: "calories", op: "lt", value: 300, weight: 1.25, reason: "저칼로리", detail: (v) => `${v}kcal — 저칼로리 식품` },
    { field: "protein_g", op: "gte", value: 15, weight: 1.2, reason: "고단백", detail: (v) => `단백질 ${v}g — 고단백 식품` },
    { field: "fat_g", op: "lt", value: 8, weight: 1.1, reason: "저지방", detail: (v) => `지방 ${v}g — 저지방 식품` },
    { field: "sugar_g", op: "lt", value: 5, weight: 1.1, reason: "저당", detail: (v) => `당류 ${v}g — 저당 식품` },
  ],
  energy: [
    { field: "calories", op: "between", value: [200, 500], weight: 1.15, reason: "적정 열량", detail: (v) => `${v}kcal — 적정 열량 식품` },
    { field: "protein_g", op: "gte", value: 12, weight: 1.2, reason: "단백질 풍부", detail: (v) => `단백질 ${v}g — 고단백 식품` },
    { field: "carbs_g", op: "gte", value: 20, weight: 1.1, reason: "탄수화물 충분", detail: (v) => `탄수화물 ${v}g — 탄수화물 충분` },
  ],
};

// ── 민감도 규칙 ──
export const SENSITIVITY_RULES = {
  digestive: [
    { sensitivityLevel: 3, field: "fat_g", op: "lt" as const, value: 8, weight: 1.1, reason: "소화 편한" },
    { sensitivityLevel: 3, field: "sodium_mg", op: "lt" as const, value: 500, weight: 1.05, reason: "자극 적은" },
  ],
  additive: [
    { sensitivityLevel: 3, field: "sodium_mg", op: "lt" as const, value: 400, weight: 1.1, reason: "저나트륨" },
  ],
};

// ── 맛 레벨 → 영양성분 범위 (10단계) ──
export const TASTE_RANGES: Record<string, Record<number, [number, number]>> = {
  salty: {
    1: [0, 100], 2: [100, 200], 3: [200, 350], 4: [350, 500], 5: [500, 650],
    6: [650, 800], 7: [800, 1000], 8: [1000, 1200], 9: [1200, 1500], 10: [1500, 9999],
  },
  sweet: {
    1: [0, 1], 2: [1, 2], 3: [2, 4], 4: [4, 6], 5: [6, 9],
    6: [9, 12], 7: [12, 16], 8: [16, 20], 9: [20, 25], 10: [25, 99],
  },
  fatty: {
    1: [0, 1], 2: [1, 3], 3: [3, 5], 4: [5, 7], 5: [7, 10],
    6: [10, 15], 7: [15, 20], 8: [20, 25], 9: [25, 30], 10: [30, 99],
  },
};

// ── 관심사별 선호 카테고리 가중치 ──
export const CONCERN_CATEGORY_WEIGHT: Record<HealthConcern, Record<string, number>> = {
  gut_health: {
    rice: 1.1, soup: 1.15, stew: 1.1, salad: 1.15, side: 1.05, grill: 1.05, seafood: 1.05,
    snack: 0.85, beverage: 0.95, bread: 0.9,
  },
  skin: {
    grill: 1.1, seafood: 1.15, salad: 1.15, dairy: 1.1, soup: 1.05, side: 1.05,
    snack: 0.88, bread: 0.95,
  },
  weight: {
    salad: 1.15, grill: 1.1, seafood: 1.1, soup: 1.1, side: 1.1, rice: 1.0,
    snack: 0.85, bread: 0.9, beverage: 0.95,
  },
  energy: {
    grill: 1.15, rice: 1.1, stew: 1.1, noodle: 1.05, seafood: 1.1, dairy: 1.1, soup: 1.05,
    snack: 0.85, beverage: 0.92,
  },
};

// ── 식단 목적별 정렬 ──
export const DIET_PURPOSE_ORDER: Record<string, { column: string; ascending: boolean }> = {
  weight_loss: { column: "calories", ascending: true },
  diet: { column: "calories", ascending: true },
  muscle: { column: "protein_g", ascending: false },
  exercise: { column: "protein_g", ascending: false },
  gut_health: { column: "fiber_g", ascending: false },
  skin: { column: "protein_g", ascending: false },
  energy: { column: "health_score", ascending: false },
  balanced: { column: "health_score", ascending: false },
  default: { column: "health_score", ascending: false },
};
