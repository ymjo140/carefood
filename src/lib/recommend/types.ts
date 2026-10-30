/**
 * 추천 유형화 시스템 — 타입 정의
 * 5축 복합 프로필 기반
 */

// ── 건강 관심사 (온보딩 goals에서 추출) ──
export type HealthConcern = "gut_health" | "skin" | "weight" | "energy";

// ── 건강 목표 (온보딩 goals 전체) ──
export type HealthGoal =
  | "balanced" | "weight_loss" | "muscle"
  | "gut_health" | "skin" | "energy"
  | "diabetes" | "blood_pressure" | "kidney";

// ── 식단 유형 ──
export type DietType = "normal" | "diet" | "exercise" | "vegetarian" | "pregnant";

// ── 건강 리스크 레벨 ──
export type RiskLevel = "normal" | "borderline" | "warning";

// ── 5축 복합 프로필 ──
export type UserProfile = {
  // 축1: 식단 목적
  goals: HealthGoal[];
  dietType: DietType;

  // 축2: 건강 관심사
  concerns: HealthConcern[];

  // 축3: 건강 리스크 (건강검진 기반)
  healthRisks: {
    glucose: RiskLevel;   // normal / borderline(100-125) / warning(≥126)
    bloodPressure: RiskLevel; // normal / borderline(120-139) / warning(≥140)
    cholesterol: RiskLevel;   // normal / borderline(200-239) / warning(LDL≥160)
    kidney: boolean;
  };
  conditions: string[]; // legacy: ["diabetes", "hypertension", "hyperlipidemia"]

  // 축4: 신체 상태
  body: {
    gender: "male" | "female" | "other";
    birthYear: number;
    heightCm: number;
    weightKg: number;
    bmi: number;
    bmiCategory: "underweight" | "normal" | "overweight" | "obese";
    age: number;
  };

  // 끼니당 영양 기준 (온보딩에서 계산된 값)
  perMeal: {
    caloriesMin: number;
    caloriesMax: number;
    maxSodiumMg: number;
    maxSugarG: number;
    minProteinG: number;
  };

  // 축5: 식습관
  eatingOutFreq: string; // "daily" | "3_4" | "1_2" | "rarely"
  mealsPerDay: number;

  // 기타
  sensitivity: { digestive: number; additive: number };
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
  allergies: string[];
};

// ── 스코어링 결과 ──
export type ScoredProduct = Record<string, unknown> & {
  match_score: number;
  match_reasons: string[];
  reason_detail: string | null;
  dish_keyword: string;
};

// ── 필터 계층 ──
export type FilterTier = "must" | "should" | "nice";

export type QueryFilters = {
  must: Record<string, { op: "lte" | "gte" | "lt" | "gt"; value: number }>;
  should: Record<string, { op: "lte" | "gte" | "between"; value: number | [number, number] }>;
  nice: Record<string, { op: "lte" | "gte" | "between"; value: number | [number, number] }>;
  excludeCategories: string[];
  preferCategories: string[];
  orderBy: { column: string; ascending: boolean };
};
