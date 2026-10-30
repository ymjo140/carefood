/**
 * 프로필 파싱 — localStorage/API body에서 UserProfile 구조체로 변환
 */

import type { UserProfile, HealthConcern, HealthGoal, DietType, RiskLevel } from "./types";

/** localStorage carefood_profile + carefood_health → UserProfile */
export function parseProfile(
  profileRaw: Record<string, unknown>,
  healthRaw?: Record<string, unknown> | null,
): UserProfile {
  const goals = (profileRaw.goals as HealthGoal[]) || [];
  const dietType = (profileRaw.diet_type as DietType) || "normal";

  // 관심사 추출
  const concernMap: Record<string, HealthConcern> = {
    gut_health: "gut_health", skin: "skin", weight_loss: "weight", energy: "energy",
  };
  const concerns: HealthConcern[] = goals
    .filter((g) => g in concernMap)
    .map((g) => concernMap[g]);

  // 건강 리스크 (건강검진 기반)
  const glucose = healthRaw?.fasting_glucose as number | null;
  const bpSystolic = healthRaw?.bp_systolic as number | null;
  const ldl = healthRaw?.ldl as number | null;
  const totalCholesterol = healthRaw?.total_cholesterol as number | null;

  const glucoseRisk: RiskLevel =
    glucose && glucose >= 126 ? "warning" :
    glucose && glucose >= 100 ? "borderline" : "normal";

  const bpRisk: RiskLevel =
    bpSystolic && bpSystolic >= 140 ? "warning" :
    bpSystolic && bpSystolic >= 120 ? "borderline" : "normal";

  const cholesterolRisk: RiskLevel =
    (ldl && ldl >= 160) ? "warning" :
    (totalCholesterol && totalCholesterol >= 200) ? "borderline" : "normal";

  // 온보딩에서 직접 선택한 conditions도 반영
  const onboardingConditions = (profileRaw.conditions as string[]) || [];
  const healthConditions = (healthRaw?.conditions as string[]) || [];
  const allConditions = [...new Set([...onboardingConditions, ...healthConditions])];

  // 온보딩 conditions로 risk 상향
  const finalGlucose = allConditions.includes("diabetes") && glucoseRisk === "normal" ? "borderline" : glucoseRisk;
  const finalBP = allConditions.includes("hypertension") && bpRisk === "normal" ? "borderline" : bpRisk;
  const finalCholesterol = allConditions.includes("hyperlipidemia") && cholesterolRisk === "normal" ? "borderline" : cholesterolRisk;

  // 신체 정보
  const birthYear = (profileRaw.birthYear as number) || 1995;
  const heightCm = (profileRaw.heightCm as number) || (healthRaw?.height_cm as number) || 170;
  const weightKg = (profileRaw.weightKg as number) || (healthRaw?.weight_kg as number) || 65;
  const gender = (profileRaw.gender as "male" | "female" | "other") || "other";
  const age = new Date().getFullYear() - birthYear;
  const bmi = Math.round((weightKg / ((heightCm / 100) ** 2)) * 10) / 10;
  const bmiCategory = bmi < 18.5 ? "underweight" : bmi < 23 ? "normal" : bmi < 25 ? "overweight" : "obese" as const;

  // perMeal 기준 (온보딩에서 계산된 값 또는 기본값)
  const ng = profileRaw.nutrition_goals as Record<string, unknown> | undefined;
  const mealsPerDay = (profileRaw.meals_per_day as number) || 3;
  const perMeal = {
    caloriesMin: (ng?.perMealCalMin as number) || Math.round(1600 / mealsPerDay - 100),
    caloriesMax: (ng?.perMealCalMax as number) || Math.round(2200 / mealsPerDay + 100),
    maxSodiumMg: (ng?.perMealSodiumMax as number) || 800,
    maxSugarG: (ng?.perMealSugarMax as number) || 15,
    minProteinG: (ng?.perMealProteinMin as number) || Math.round(60 / mealsPerDay),
  };

  // 축4 BMI 보정
  if (bmiCategory === "obese" && goals.includes("weight_loss")) {
    perMeal.caloriesMax = Math.round(perMeal.caloriesMax * 0.85);
  } else if (bmiCategory === "overweight") {
    perMeal.caloriesMax = Math.round(perMeal.caloriesMax * 0.9);
  } else if (bmiCategory === "underweight") {
    perMeal.caloriesMin = Math.round(perMeal.caloriesMin * 1.15);
  }

  // 축3 건강 리스크 보정
  if (finalGlucose === "warning") perMeal.maxSugarG = Math.min(perMeal.maxSugarG, 8);
  else if (finalGlucose === "borderline") perMeal.maxSugarG = Math.min(perMeal.maxSugarG, 12);

  if (finalBP === "warning") perMeal.maxSodiumMg = Math.min(perMeal.maxSodiumMg, 500);
  else if (finalBP === "borderline") perMeal.maxSodiumMg = Math.min(perMeal.maxSodiumMg, 700);

  // 맛 선호 (5단계→10단계 변환)
  const rawTastes = (profileRaw.tastes as Record<string, number>) || { salty: 5, sweet: 5, spicy: 3, fatty: 5 };
  const tastes = {
    salty: rawTastes.salty <= 5 ? rawTastes.salty * 2 : rawTastes.salty,
    sweet: rawTastes.sweet <= 5 ? rawTastes.sweet * 2 : rawTastes.sweet,
    spicy: rawTastes.spicy,
    fatty: rawTastes.fatty <= 5 ? rawTastes.fatty * 2 : rawTastes.fatty,
  };

  return {
    goals,
    dietType,
    concerns,
    healthRisks: {
      glucose: finalGlucose,
      bloodPressure: finalBP,
      cholesterol: finalCholesterol,
      kidney: goals.includes("kidney"),
    },
    conditions: allConditions,
    body: { gender, birthYear, heightCm, weightKg, bmi, bmiCategory, age },
    perMeal,
    eatingOutFreq: (profileRaw.eating_out_freq as string) || "1_2",
    mealsPerDay,
    sensitivity: (profileRaw.sensitivity as { digestive: number; additive: number }) || { digestive: 2, additive: 2 },
    tastes,
    allergies: (profileRaw.allergies as string[]) || [],
  };
}

/** 프로필 요약 라벨 생성 (사용자 화면용) */
export function getProfileLabels(profile: UserProfile): { emoji: string; label: string; detail: string }[] {
  const labels: { emoji: string; label: string; detail: string }[] = [];

  // 축1: 식단 목적
  if (profile.goals.includes("weight_loss") || profile.dietType === "diet")
    labels.push({ emoji: "🥗", label: "다이어트", detail: `끼니당 ${profile.perMeal.caloriesMax}kcal 이하` });
  else if (profile.goals.includes("muscle") || profile.dietType === "exercise")
    labels.push({ emoji: "💪", label: "근력강화", detail: `단백질 ${profile.perMeal.minProteinG}g 이상 우선` });
  else if (profile.dietType === "pregnant")
    labels.push({ emoji: "🤰", label: "임산부", detail: "엽산·철분 함유 제품 우선" });
  else if (profile.dietType === "vegetarian")
    labels.push({ emoji: "🌿", label: "채식", detail: "식물성 제품 우선" });
  else
    labels.push({ emoji: "⚖️", label: "균형관리", detail: "영양 균형 중심" });

  // 축2: 건강 관심사
  const concernLabels: Record<string, { emoji: string; label: string }> = {
    gut_health: { emoji: "🫧", label: "장건강" },
    skin: { emoji: "✨", label: "피부케어" },
    energy: { emoji: "⚡", label: "활력충전" },
    weight: { emoji: "📉", label: "체중관리" },
  };
  for (const c of profile.concerns) {
    if (concernLabels[c]) labels.push({ ...concernLabels[c], detail: "" });
  }

  // 축3: 건강 리스크
  if (profile.healthRisks.glucose === "warning")
    labels.push({ emoji: "🩸", label: "혈당주의", detail: `당류 ${profile.perMeal.maxSugarG}g 이하 필터` });
  else if (profile.healthRisks.glucose === "borderline")
    labels.push({ emoji: "🩸", label: "혈당경계", detail: `당류 ${profile.perMeal.maxSugarG}g 이하 필터` });

  if (profile.healthRisks.bloodPressure === "warning")
    labels.push({ emoji: "❤️", label: "혈압주의", detail: `나트륨 ${profile.perMeal.maxSodiumMg}mg 이하 필터` });
  else if (profile.healthRisks.bloodPressure === "borderline")
    labels.push({ emoji: "❤️", label: "혈압경계", detail: `나트륨 ${profile.perMeal.maxSodiumMg}mg 이하 필터` });

  if (profile.healthRisks.cholesterol !== "normal")
    labels.push({ emoji: "🧪", label: "콜레스테롤관리", detail: "저지방 제품 우선" });

  // 축4: BMI
  if (profile.body.bmiCategory === "obese")
    labels.push({ emoji: "📊", label: `BMI ${profile.body.bmi}`, detail: "칼로리 15% 하향 조정" });
  else if (profile.body.bmiCategory === "overweight")
    labels.push({ emoji: "📊", label: `BMI ${profile.body.bmi}`, detail: "칼로리 10% 하향 조정" });

  return labels;
}
