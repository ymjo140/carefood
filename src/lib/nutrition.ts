/**
 * 영양 계산 유틸리티
 * BMI, 기초대사량, 일일 영양 목표 계산
 *
 * ⚠ 의료 행위가 아닌 "성분 정보 + 통계적 매칭" 참고용
 */

// ── 타입 ──

export type HealthGoal =
  | "balanced"       // 균형 잡힌 식단
  | "weight_loss"    // 체중 관리
  | "muscle"         // 근력/체력 강화
  | "gut_health"     // 장 건강
  | "skin"           // 피부 건강
  | "energy"         // 활력 충전
  | "diabetes"       // 당뇨 관심
  | "blood_pressure" // 혈압 관심
  | "kidney";        // 신장 관심

export type Gender = "male" | "female" | "other";

export type DietType = "normal" | "diet" | "exercise" | "vegetarian" | "pregnant";

export type BodyInfo = {
  gender: Gender;
  birthYear: number;
  heightCm: number;
  weightKg: number;
};

export type NutritionGoals = {
  bmi: number;
  bmiCategory: "underweight" | "normal" | "overweight" | "obese";
  bmr: number;                  // 기초대사량 (kcal)
  dailyCalories: number;        // 일일 권장 칼로리
  dailyProteinG: number;        // 일일 권장 단백질 (g)
  carbRatio: number;            // 탄수화물 비율 (%)
  proteinRatio: number;         // 단백질 비율 (%)
  fatRatio: number;             // 지방 비율 (%)
  maxSodiumMg: number;          // 나트륨 상한 (mg/일)
  maxSugarG: number;            // 당류 상한 (g/일)
  minFiberG: number;            // 식이섬유 권장 (g/일)
  // 끼니당 기준
  perMeal: {
    caloriesMin: number;
    caloriesMax: number;
    maxSodiumMg: number;
    maxSugarG: number;
    minProteinG: number;
  };
  // 추천 태그
  strategyTags: string[];
  strategySummary: string;
};

// ── BMI ──

export function calculateBMI(heightCm: number, weightKg: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function getBMICategory(bmi: number): NutritionGoals["bmiCategory"] {
  // 대한비만학회 기준
  if (bmi < 18.5) return "underweight";
  if (bmi < 23) return "normal";
  if (bmi < 25) return "overweight";
  return "obese";
}

export const BMI_LABELS: Record<NutritionGoals["bmiCategory"], string> = {
  underweight: "저체중",
  normal: "정상",
  overweight: "과체중",
  obese: "비만",
};

// ── 기초대사량 (Harris-Benedict) ──

export function calculateBMR(body: BodyInfo): number {
  const age = new Date().getFullYear() - body.birthYear;
  if (body.gender === "male") {
    return Math.round(66.47 + (13.75 * body.weightKg) + (5.003 * body.heightCm) - (6.755 * age));
  }
  // female 및 other는 여성 공식 사용 (보수적)
  return Math.round(655.1 + (9.563 * body.weightKg) + (1.85 * body.heightCm) - (4.676 * age));
}

// ── 활동계수 ──

function getActivityMultiplier(dietType: DietType): number {
  switch (dietType) {
    case "exercise": return 1.55;    // 중간 활동
    case "diet": return 1.2;         // 좌식
    case "pregnant": return 1.4;     // 약간 활동적
    default: return 1.375;           // 가벼운 활동
  }
}

// ── 일일 권장 칼로리 ──

export function calculateDailyCalories(bmr: number, dietType: DietType, goals: HealthGoal[]): number {
  let cal = bmr * getActivityMultiplier(dietType);

  // 체중 관리 시 칼로리 제한
  if (goals.includes("weight_loss") || dietType === "diet") {
    cal -= 500; // 주당 ~0.5kg 감량 페이스
  }
  // 근육 증량 시 약간 증가
  if (goals.includes("muscle")) {
    cal += 200;
  }
  // 임산부
  if (dietType === "pregnant") {
    cal += 300;
  }

  return Math.round(Math.max(cal, 1200)); // 최소 1200kcal
}

// ── 일일 단백질 ──

export function calculateDailyProtein(weightKg: number, goals: HealthGoal[], dietType: DietType): number {
  let ratio = 0.8; // g per kg (기본)

  if (goals.includes("muscle") || dietType === "exercise") {
    ratio = 1.2;
  } else if (goals.includes("weight_loss") || dietType === "diet") {
    ratio = 1.0; // 근손실 방지
  } else if (goals.includes("kidney")) {
    ratio = 0.6; // 신장 보호
  } else if (dietType === "pregnant") {
    ratio = 1.1;
  }

  return Math.round(weightKg * ratio);
}

// ── 매크로 비율 ──

function getMacroRatios(goals: HealthGoal[]): { carb: number; protein: number; fat: number } {
  if (goals.includes("muscle")) {
    return { carb: 50, protein: 25, fat: 25 };
  }
  if (goals.includes("weight_loss")) {
    return { carb: 45, protein: 25, fat: 30 };
  }
  if (goals.includes("diabetes")) {
    return { carb: 45, protein: 20, fat: 35 };
  }
  // 기본 (한국형 지중해식 참고)
  return { carb: 55, protein: 15, fat: 30 };
}

// ── 건강 목표별 영양 전략 ──

type MealLimits = NutritionGoals["perMeal"];

function getMealLimits(goals: HealthGoal[], dailyCal: number, dailyProtein: number): MealLimits {
  const mealsPerDay = 3;
  const baseCal = Math.round(dailyCal / mealsPerDay);
  const baseProtein = Math.round(dailyProtein / mealsPerDay);

  // 기본값
  let maxSodium = 800;
  let maxSugar = 15;
  let calMin = baseCal - 100;
  let calMax = baseCal + 100;

  // 목표별 조정
  if (goals.includes("weight_loss")) {
    calMax = Math.min(calMax, 550);
    calMin = Math.max(calMin - 50, 250);
    maxSugar = 10;
  }
  if (goals.includes("gut_health")) {
    maxSodium = Math.min(maxSodium, 600);
    maxSugar = Math.min(maxSugar, 10);
  }
  if (goals.includes("blood_pressure")) {
    maxSodium = Math.min(maxSodium, 500);
  }
  if (goals.includes("diabetes")) {
    maxSugar = Math.min(maxSugar, 8);
  }
  if (goals.includes("kidney")) {
    maxSodium = Math.min(maxSodium, 500);
  }

  return {
    caloriesMin: Math.max(calMin, 200),
    caloriesMax: Math.max(calMax, 350),
    maxSodiumMg: maxSodium,
    maxSugarG: maxSugar,
    minProteinG: baseProtein,
  };
}

// ── 전략 태그 생성 ──

function getStrategyTags(goals: HealthGoal[]): string[] {
  const tags: string[] = [];
  if (goals.includes("weight_loss")) tags.push("저칼로리", "고단백");
  if (goals.includes("muscle")) tags.push("고단백", "근력강화");
  if (goals.includes("gut_health")) tags.push("저나트륨", "고식이섬유", "장건강");
  if (goals.includes("skin")) tags.push("항산화", "비타민", "피부건강");
  if (goals.includes("energy")) tags.push("영양균형", "활력");
  if (goals.includes("balanced")) tags.push("균형식단");
  if (goals.includes("diabetes")) tags.push("저당", "혈당관리");
  if (goals.includes("blood_pressure")) tags.push("저나트륨", "혈압관리");
  if (goals.includes("kidney")) tags.push("저나트륨", "저단백", "신장보호");
  return [...new Set(tags)];
}

function getStrategySummary(goals: HealthGoal[], bmiCat: NutritionGoals["bmiCategory"]): string {
  const parts: string[] = [];

  if (goals.includes("weight_loss") && (bmiCat === "overweight" || bmiCat === "obese")) {
    parts.push("칼로리를 조절하면서 단백질을 충분히 섭취해 건강하게 체중을 관리합니다");
  } else if (goals.includes("weight_loss")) {
    parts.push("균형 잡힌 식사로 건강한 체중을 유지합니다");
  }
  if (goals.includes("muscle")) {
    parts.push("단백질 섭취를 강화해 근육 성장을 돕습니다");
  }
  if (goals.includes("gut_health")) {
    parts.push("나트륨과 당류를 줄이고 식이섬유를 늘려 소화 건강을 돕습니다");
  }
  if (goals.includes("diabetes")) {
    parts.push("당류 섭취를 제한해 혈당 변동을 줄이는 데 초점을 둡니다");
  }
  if (goals.includes("blood_pressure")) {
    parts.push("나트륨 섭취를 줄여 혈압 관리에 도움을 줍니다");
  }
  if (parts.length === 0) {
    parts.push("탄수화물, 단백질, 지방의 균형과 충분한 식이섬유를 챙깁니다");
  }

  return parts.join(". ") + ".";
}

// ── 메인: 전체 영양 목표 계산 ──

export function calculateNutritionGoals(
  body: BodyInfo,
  goals: HealthGoal[],
  dietType: DietType,
): NutritionGoals {
  const bmi = calculateBMI(body.heightCm, body.weightKg);
  const bmiCategory = getBMICategory(bmi);
  const bmr = calculateBMR(body);
  const dailyCalories = calculateDailyCalories(bmr, dietType, goals);
  const dailyProteinG = calculateDailyProtein(body.weightKg, goals, dietType);
  const macros = getMacroRatios(goals);

  // 일일 상한
  let maxSodiumMg = 2300; // WHO 기준
  let maxSugarG = 50;     // WHO 기준 (하루 에너지의 10%)
  let minFiberG = body.gender === "male" ? 25 : 20;

  if (goals.includes("blood_pressure") || goals.includes("kidney")) {
    maxSodiumMg = 1500;
  }
  if (goals.includes("gut_health")) {
    maxSodiumMg = Math.min(maxSodiumMg, 2000);
    minFiberG += 5;
  }
  if (goals.includes("diabetes")) {
    maxSugarG = 25;
  }

  const perMeal = getMealLimits(goals, dailyCalories, dailyProteinG);
  const strategyTags = getStrategyTags(goals);
  const strategySummary = getStrategySummary(goals, bmiCategory);

  return {
    bmi,
    bmiCategory,
    bmr,
    dailyCalories,
    dailyProteinG,
    carbRatio: macros.carb,
    proteinRatio: macros.protein,
    fatRatio: macros.fat,
    maxSodiumMg,
    maxSugarG,
    minFiberG,
    perMeal,
    strategyTags,
    strategySummary,
  };
}

// ── 건강 목표 레이블 ──

export const HEALTH_GOAL_LABELS: Record<HealthGoal, { label: string; desc: string; emoji: string }> = {
  balanced: { label: "균형 잡힌 식단", desc: "전반적 건강 관리", emoji: "⚖️" },
  weight_loss: { label: "체중 관리", desc: "건강한 다이어트", emoji: "📉" },
  muscle: { label: "근력/체력 강화", desc: "고단백 식단", emoji: "💪" },
  gut_health: { label: "장 건강", desc: "소화가 편한 식품", emoji: "🫧" },
  skin: { label: "피부 건강", desc: "속부터 관리", emoji: "✨" },
  energy: { label: "활력 충전", desc: "영양 골고루", emoji: "⚡" },
  diabetes: { label: "당뇨 관심", desc: "혈당 관리가 필요한 분", emoji: "💧" },
  blood_pressure: { label: "혈압 관심", desc: "나트륨 관리가 필요한 분", emoji: "❤️" },
  kidney: { label: "신장 관심", desc: "신장 기능 보호가 필요한 분", emoji: "🫘" },
};
