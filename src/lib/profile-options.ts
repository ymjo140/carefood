"use client";

import type { HealthConcern, SensitivityLevel, TasteLevel } from "@/types/database";
import { saveProfile } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { getClientActorId } from "@/lib/actor-client";
import type { DietType, Gender, HealthGoal, NutritionGoals } from "@/lib/nutrition";

/**
 * 프로필 선택지와 저장 — 온보딩과 마이페이지(관심사·건강정보 고치기)가 같이 쓴다.
 * 저장 위치: 이 기기(localStorage carefood_profile) + 서버(user_profiles, 로그인했으면 users) + 식단 기록 목표(daily_nutrition_goals)
 */

export const MAIN_GOALS: HealthGoal[] = ["balanced", "weight_loss", "muscle", "gut_health", "skin", "energy"];
export const DISEASE_GOALS: HealthGoal[] = ["diabetes", "blood_pressure", "kidney"];

export const ALLERGIES = [
  { key: "egg", label: "계란" },
  { key: "milk", label: "우유" },
  { key: "wheat", label: "밀" },
  { key: "soybean", label: "대두" },
  { key: "peanut", label: "땅콩" },
  { key: "treenut", label: "견과류" },
  { key: "shellfish", label: "갑각류" },
  { key: "fish", label: "생선" },
  { key: "buckwheat", label: "메밀" },
  { key: "peach", label: "복숭아" },
  { key: "sulfite", label: "아황산류" },
];

export const TASTE_CONFIG = [
  { key: "salty" as const, label: "짠맛",
    benchmarks: [{ lv: 2, name: "흰밥" }, { lv: 4, name: "계란찜" }, { lv: 6, name: "김치찌개" }, { lv: 8, name: "라면" }, { lv: 10, name: "간장게장" }] },
  { key: "sweet" as const, label: "단맛",
    benchmarks: [{ lv: 2, name: "우유" }, { lv: 4, name: "식빵" }, { lv: 6, name: "콜라" }, { lv: 8, name: "아이스크림" }, { lv: 10, name: "초콜릿" }] },
  { key: "spicy" as const, label: "매운맛",
    benchmarks: [{ lv: 2, name: "짜장면" }, { lv: 4, name: "김치" }, { lv: 6, name: "떡볶이" }, { lv: 8, name: "신라면" }, { lv: 10, name: "불닭볶음면" }] },
  { key: "fatty" as const, label: "고소한맛",
    benchmarks: [{ lv: 2, name: "닭가슴살" }, { lv: 4, name: "두부" }, { lv: 6, name: "계란찜" }, { lv: 8, name: "삼겹살" }, { lv: 10, name: "버터" }] },
];

/** 맛 단계 → 가장 가까운 기준 음식 */
export function tasteBenchmark(key: (typeof TASTE_CONFIG)[number]["key"], lv: number) {
  const b = TASTE_CONFIG.find((t) => t.key === key)!.benchmarks;
  return b.reduce((best, x) => (Math.abs(x.lv - lv) < Math.abs(best.lv - lv) ? x : best), b[0]).name;
}

export const EATING_OUT_OPTIONS = [
  { key: "daily", label: "거의 매일" },
  { key: "3_4", label: "주 3~4회" },
  { key: "1_2", label: "주 1~2회" },
  { key: "rarely", label: "거의 안 함" },
];

export const DIET_OPTIONS: { key: DietType; label: string; desc: string }[] = [
  { key: "normal", label: "일반 식사", desc: "특별한 식단 제한 없음" },
  { key: "diet", label: "다이어트 중", desc: "칼로리 조절 중이에요" },
  { key: "exercise", label: "운동 병행", desc: "근력 운동이나 유산소를 해요" },
  { key: "vegetarian", label: "채식 위주", desc: "채식 또는 반채식 식단" },
  { key: "pregnant", label: "임산부·수유부", desc: "임신 중이거나 수유 중이에요" },
];

export type ProfileInput = {
  goals: HealthGoal[];
  gender: Gender;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  mealsPerDay: number;
  eatingOutFreq: string;
  dietType: DietType;
  allergies: string[];
  sensitivity: { digestive: SensitivityLevel; additive: SensitivityLevel };
  tastes: { salty: TasteLevel; sweet: TasteLevel; spicy: TasteLevel; fatty: TasteLevel };
};

const CONCERN_MAP: Record<string, HealthConcern> = {
  gut_health: "gut_health", skin: "skin", weight_loss: "weight", energy: "energy",
};

/** 화면의 선택 → 저장할 프로필 (온보딩 결과와 같은 모양). 닉네임 같은 다른 키는 base 에서 이어받는다 */
export function buildProfile(input: ProfileInput, nutritionGoals: NutritionGoals | null, base: Record<string, unknown> = {}) {
  const concerns = input.goals.map((g) => CONCERN_MAP[g]).filter(Boolean) as HealthConcern[];
  if (concerns.length === 0) concerns.push("energy");
  const nutrition_goals = nutritionGoals
    ? {
        bmi: nutritionGoals.bmi,
        dailyCalories: nutritionGoals.dailyCalories,
        dailyProteinG: nutritionGoals.dailyProteinG,
        maxSodiumMg: nutritionGoals.maxSodiumMg,
        maxSugarG: nutritionGoals.maxSugarG,
        perMealCalMax: nutritionGoals.perMeal.caloriesMax,
        perMealSodiumMax: nutritionGoals.perMeal.maxSodiumMg,
        perMealSugarMax: nutritionGoals.perMeal.maxSugarG,
        strategyTags: nutritionGoals.strategyTags,
      }
    : undefined;
  return {
    ...base,
    goals: input.goals,
    gender: input.gender,
    birthYear: input.birthYear,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    diet_type: input.dietType,
    meals_per_day: input.mealsPerDay,
    eating_out_freq: input.eatingOutFreq,
    nutrition_goals,
    concerns,
    conditions: input.goals.filter((g) => DISEASE_GOALS.includes(g)),
    sensitivity: input.sensitivity,
    allergies: input.allergies,
    tastes: input.tastes,
  };
}

/**
 * 프로필 저장 — 이 기기 + 서버. 서버 저장이 실패하면 throw (이 기기에는 이미 저장됨)
 * syncDiaryGoals: 식단 기록의 하루 목표도 새 값으로 바꾼다 (마이페이지에서 고칠 때)
 */
export async function persistProfile(profile: ReturnType<typeof buildProfile>, { syncDiaryGoals = false } = {}) {
  try {
    localStorage.setItem("carefood_profile", JSON.stringify(profile));
  } catch { /* 저장소를 못 쓰는 브라우저 — 서버 저장은 계속 */ } // ds-allow: 서버 저장이 이어진다

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await saveProfile(JSON.stringify(profile));
  if (!user && !getClientActorId()) return; // 쿠키가 아직 없음 — 다음 방문 때 서버에 맞춘다

  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error("프로필을 서버에 저장하지 못했어요");

  if (syncDiaryGoals && profile.nutrition_goals) {
    const g = profile.nutrition_goals;
    const r = await fetch("/api/diary/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_calories: g.dailyCalories, daily_protein_g: g.dailyProteinG, max_sodium_mg: g.maxSodiumMg, max_sugar_g: g.maxSugarG }),
    });
    if (!r.ok) throw new Error("식단 기록 목표를 바꾸지 못했어요");
  }
}

/** 이 기기에 저장된 프로필 (없으면 null) */
export function readLocalProfile(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem("carefood_profile");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // ds-allow: 저장소를 못 읽으면 프로필 없음으로 본다
  }
}
