"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { HealthConcern, SensitivityLevel, TasteLevel } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { saveProfile } from "@/app/auth/actions";
import {
  calculateNutritionGoals,
  calculateBMI,
  getBMICategory,
  BMI_LABELS,
  HEALTH_GOAL_LABELS,
  type HealthGoal,
  type Gender,
  type DietType,
  type BodyInfo,
  type NutritionGoals,
} from "@/lib/nutrition";

/* ════════════════════════════════════════════
   타입 & 상수
   ════════════════════════════════════════════ */

type OnboardingState = {
  // Step 1: 건강 목표
  goals: HealthGoal[];
  showDiseaseGoals: boolean;
  // Step 2: 신체 정보
  gender: Gender;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  // Step 3: 식사 패턴
  mealsPerDay: number;
  eatingOutFreq: string;
  dietType: DietType;
  // Step 4: 알레르기
  allergies: string[];
  // Step 5: 맛 선호도 + 민감도
  sensitivity: { digestive: SensitivityLevel; additive: SensitivityLevel };
  tastes: { salty: TasteLevel; sweet: TasteLevel; spicy: TasteLevel; fatty: TasteLevel };
};

const STEPS = ["goals", "body", "pattern", "allergies", "tastes", "result"] as const;
type StepKey = (typeof STEPS)[number];

const MAIN_GOALS: HealthGoal[] = ["balanced", "weight_loss", "muscle", "gut_health", "skin", "energy"];
const DISEASE_GOALS: HealthGoal[] = ["diabetes", "blood_pressure", "kidney"];

const ALLERGIES = [
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

const TASTE_CONFIG = [
  { key: "salty" as const, label: "짠맛" },
  { key: "sweet" as const, label: "단맛" },
  { key: "spicy" as const, label: "매운맛" },
  { key: "fatty" as const, label: "기름진맛" },
];

const EATING_OUT_OPTIONS = [
  { key: "daily", label: "거의 매일" },
  { key: "3_4", label: "주 3~4회" },
  { key: "1_2", label: "주 1~2회" },
  { key: "rarely", label: "거의 안 함" },
];

const DIET_OPTIONS: { key: DietType; label: string; desc: string }[] = [
  { key: "normal", label: "일반 식사", desc: "특별한 식단 제한 없음" },
  { key: "diet", label: "다이어트 중", desc: "칼로리 조절 중이에요" },
  { key: "exercise", label: "운동 병행", desc: "근력 운동이나 유산소를 해요" },
  { key: "vegetarian", label: "채식 위주", desc: "채식 또는 반채식 식단" },
  { key: "pregnant", label: "임산부·수유부", desc: "임신 중이거나 수유 중이에요" },
];

const SENSITIVITY_LABELS: Record<number, string> = {
  1: "둔감한 편",
  2: "보통",
  3: "예민한 편",
};

/* ════════════════════════════════════════════
   메인 (Suspense 래퍼)
   ════════════════════════════════════════════ */

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
          <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}

/* ════════════════════════════════════════════
   콘텐츠
   ════════════════════════════════════════════ */

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>({
    goals: [],
    showDiseaseGoals: false,
    gender: "other",
    birthYear: 1995,
    heightCm: 170,
    weightKg: 65,
    mealsPerDay: 3,
    eatingOutFreq: "1_2",
    dietType: "normal",
    allergies: [],
    sensitivity: { digestive: 2, additive: 2 },
    tastes: { salty: 5, sweet: 5, spicy: 5, fatty: 5 },
  });

  // URL 파라미터로 관심사 프리셋
  useEffect(() => {
    const c = searchParams.get("concern");
    const goalMap: Record<string, HealthGoal> = {
      gut_health: "gut_health",
      skin: "skin",
      weight: "weight_loss",
      energy: "energy",
    };
    const mapped = goalMap[c || ""];
    if (mapped) {
      setState((prev) => ({
        ...prev,
        goals: prev.goals.includes(mapped) ? prev.goals : [...prev.goals, mapped],
      }));
    }
  }, [searchParams]);

  const totalSteps = STEPS.length;
  const currentStepKey: StepKey = STEPS[step] || "goals";

  // 신체 정보가 유효한지
  const hasBodyInfo =
    state.gender !== "other" &&
    state.birthYear > 1920 &&
    state.heightCm >= 100 &&
    state.heightCm <= 250 &&
    state.weightKg >= 20 &&
    state.weightKg <= 300;

  // 영양 분석 결과
  const nutritionGoals = useMemo<NutritionGoals | null>(() => {
    if (!hasBodyInfo) return null;
    const body: BodyInfo = {
      gender: state.gender as Gender,
      birthYear: state.birthYear,
      heightCm: state.heightCm,
      weightKg: state.weightKg,
    };
    return calculateNutritionGoals(body, state.goals.length > 0 ? state.goals : ["balanced"], state.dietType);
  }, [hasBodyInfo, state.gender, state.birthYear, state.heightCm, state.weightKg, state.goals, state.dietType]);

  const canProceed = (): boolean => {
    switch (currentStepKey) {
      case "goals":
        return state.goals.length > 0;
      case "body":
        return true; // 건너뛰기 가능
      case "pattern":
        return true;
      case "allergies":
        return true;
      case "tastes":
        return true;
      case "result":
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const handleComplete = async () => {
    // 하위호환: goals → concerns 매핑
    const concernMap: Record<string, HealthConcern> = {
      gut_health: "gut_health",
      skin: "skin",
      weight_loss: "weight",
      energy: "energy",
    };
    const concerns: HealthConcern[] = state.goals
      .map((g) => concernMap[g])
      .filter(Boolean) as HealthConcern[];
    if (concerns.length === 0) concerns.push("energy"); // 최소 1개

    // 영양 목표 캐시
    const nutritionCache = nutritionGoals
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

    const profile = {
      // v3 신규
      goals: state.goals,
      gender: state.gender,
      birthYear: state.birthYear,
      heightCm: state.heightCm,
      weightKg: state.weightKg,
      diet_type: state.dietType,
      meals_per_day: state.mealsPerDay,
      eating_out_freq: state.eatingOutFreq,
      nutrition_goals: nutritionCache,
      // 하위호환 (v2)
      concerns,
      conditions: state.goals.filter((g) => DISEASE_GOALS.includes(g)),
      sensitivity: state.sensitivity,
      allergies: state.allergies,
      tastes: state.tastes,
    };

    // localStorage 저장
    try {
      localStorage.setItem("carefood_profile", JSON.stringify(profile));
    } catch {
      /* silent */
    }

    // Supabase 저장
    try {
      let userId: string | null = null;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        await saveProfile(JSON.stringify(profile));
      } else {
        userId = localStorage.getItem("carefood_anon_id");
        if (!userId) {
          userId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          localStorage.setItem("carefood_anon_id", userId);
        }
      }
      if (userId) {
        await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, ...profile }),
        });
      }
    } catch {
      /* DB 저장 실패해도 localStorage가 있으니 진행 */
    }

    router.push("/products");
  };

  // 결과 단계의 CTA
  const isResultStep = currentStepKey === "result";

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* ── 진행 바 ── */}
        {!isResultStep && (
          <div className="flex gap-1.5 mb-8">
            {STEPS.slice(0, -1).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  i <= step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        )}

        {/* ── 스텝 콘텐츠 ── */}
        <div className={isResultStep ? "" : "min-h-[400px]"}>
          {currentStepKey === "goals" && (
            <StepGoals
              selected={state.goals}
              showDisease={state.showDiseaseGoals}
              onToggle={(g) =>
                setState((prev) => ({
                  ...prev,
                  goals: prev.goals.includes(g) ? prev.goals.filter((x) => x !== g) : [...prev.goals, g],
                }))
              }
              onToggleDisease={() =>
                setState((prev) => ({ ...prev, showDiseaseGoals: !prev.showDiseaseGoals }))
              }
            />
          )}
          {currentStepKey === "body" && (
            <StepBody
              gender={state.gender}
              birthYear={state.birthYear}
              heightCm={state.heightCm}
              weightKg={state.weightKg}
              onChange={(key, val) =>
                setState((prev) => ({ ...prev, [key]: val }))
              }
            />
          )}
          {currentStepKey === "pattern" && (
            <StepPattern
              mealsPerDay={state.mealsPerDay}
              eatingOutFreq={state.eatingOutFreq}
              dietType={state.dietType}
              onChange={(key, val) =>
                setState((prev) => ({ ...prev, [key]: val }))
              }
            />
          )}
          {currentStepKey === "allergies" && (
            <StepAllergies
              selected={state.allergies}
              onToggle={(a) =>
                setState((prev) => ({
                  ...prev,
                  allergies: prev.allergies.includes(a)
                    ? prev.allergies.filter((x) => x !== a)
                    : [...prev.allergies, a],
                }))
              }
            />
          )}
          {currentStepKey === "tastes" && (
            <StepTastes
              tastes={state.tastes}
              sensitivity={state.sensitivity}
              onTasteChange={(key, val) =>
                setState((prev) => ({
                  ...prev,
                  tastes: { ...prev.tastes, [key]: val },
                }))
              }
              onSensitivityChange={(key, val) =>
                setState((prev) => ({
                  ...prev,
                  sensitivity: { ...prev.sensitivity, [key]: val },
                }))
              }
            />
          )}
          {currentStepKey === "result" && (
            <StepResult
              goals={state.goals}
              nutritionGoals={nutritionGoals}
              hasBodyInfo={hasBodyInfo}
              bodyInfo={{
                gender: state.gender,
                birthYear: state.birthYear,
                heightCm: state.heightCm,
                weightKg: state.weightKg,
              }}
            />
          )}
        </div>

        {/* ── 네비게이션 ── */}
        <div className="flex gap-3 mt-8">
          {step > 0 && !isResultStep && (
            <button
              onClick={handleBack}
              className="flex-1 border border-border py-3 rounded-full font-medium hover:bg-card transition-colors"
            >
              이전
            </button>
          )}
          <button
            onClick={isResultStep ? handleComplete : handleNext}
            disabled={!canProceed()}
            className="flex-1 bg-primary text-white py-3.5 rounded-full font-bold hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-base"
          >
            {isResultStep
              ? "이 전략으로 시작하기 →"
              : step === totalSteps - 2
                ? "영양 분석 보기"
                : "다음"}
          </button>
        </div>

        {/* ── 건너뛰기 ── */}
        {(currentStepKey === "body" ||
          currentStepKey === "allergies" ||
          currentStepKey === "pattern") && (
          <button
            onClick={() => {
              if (currentStepKey === "body") {
                setState((prev) => ({ ...prev, gender: "other" }));
              }
              handleNext();
            }}
            className="w-full mt-3 text-sm text-muted hover:text-foreground transition-colors"
          >
            건너뛰기
          </button>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Step 1: 건강 목표
   ════════════════════════════════════════════ */

function StepGoals({
  selected,
  showDisease,
  onToggle,
  onToggleDisease,
}: {
  selected: HealthGoal[];
  showDisease: boolean;
  onToggle: (g: HealthGoal) => void;
  onToggleDisease: () => void;
}) {
  const hasDiseaseGoal = selected.some((g) => DISEASE_GOALS.includes(g));

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">어떤 건강 목표가 있으세요?</h1>
      <p className="text-muted text-sm mb-6">
        목표에 맞는 식품을 성분 기반으로 매칭해드려요
        <span className="text-xs ml-1">(복수 선택)</span>
      </p>

      <div className="space-y-2.5">
        {MAIN_GOALS.map((g) => {
          const info = HEALTH_GOAL_LABELS[g];
          const isSelected = selected.includes(g);
          return (
            <button
              key={g}
              onClick={() => onToggle(g)}
              className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl shrink-0">{info.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{info.label}</div>
                  <div className="text-xs text-muted">{info.desc}</div>
                </div>
                {isSelected && (
                  <svg className="w-5 h-5 text-primary shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 질환 관심 섹션 */}
      <div className="mt-4">
        <button
          onClick={onToggleDisease}
          className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all ${
            hasDiseaseGoal
              ? "border-accent/50 bg-accent/5"
              : "border-border hover:border-accent/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🏥</span>
              <div>
                <div className="font-bold text-sm">질환 관심</div>
                <div className="text-xs text-muted">성분 정보 기반 참고용</div>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-muted transition-transform ${showDisease ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {showDisease && (
          <div className="mt-2 ml-2 space-y-2">
            {DISEASE_GOALS.map((g) => {
              const info = HEALTH_GOAL_LABELS[g];
              const isSelected = selected.includes(g);
              return (
                <button
                  key={g}
                  onClick={() => onToggle(g)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-accent/60 bg-accent/5"
                      : "border-border hover:border-accent/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{info.emoji}</span>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{info.label}</span>
                      <span className="text-xs text-muted ml-2">{info.desc}</span>
                    </div>
                    {isSelected && (
                      <svg className="w-4 h-4 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
            {hasDiseaseGoal && (
              <p className="text-xs text-accent/80 px-2 pt-1">
                ⚠ 의료 행위가 아닌, 성분 정보 기반 참고용입니다
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Step 2: 신체 정보
   ════════════════════════════════════════════ */

function StepBody({
  gender,
  birthYear,
  heightCm,
  weightKg,
  onChange,
}: {
  gender: Gender;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  onChange: (key: string, val: number | string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  const hasFull =
    gender !== "other" &&
    birthYear > 1920 &&
    heightCm >= 100 &&
    heightCm <= 250 &&
    weightKg >= 20 &&
    weightKg <= 300;

  const bmi = hasFull ? calculateBMI(heightCm, weightKg) : null;
  const bmiCat = bmi ? getBMICategory(bmi) : null;

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">신체 정보를 알려주세요</h1>
      <p className="text-muted text-sm mb-6">맞춤 영양 분석에 활용해요</p>

      <div className="space-y-5">
        {/* 성별 */}
        <div>
          <h3 className="text-sm font-bold mb-2">성별</h3>
          <div className="flex gap-2">
            {(
              [
                { key: "male" as const, label: "남성" },
                { key: "female" as const, label: "여성" },
                { key: "other" as const, label: "선택 안 함" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => onChange("gender", opt.key)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  gender === opt.key
                    ? "bg-primary text-white"
                    : "bg-surface text-foreground/70 hover:bg-border"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 출생연도 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold">출생연도</h3>
            {birthYear > 1920 && (
              <span className="text-xs text-primary font-medium">만 {age}세</span>
            )}
          </div>
          <input
            type="number"
            min={1920}
            max={currentYear - 10}
            value={birthYear}
            onChange={(e) => onChange("birthYear", parseInt(e.target.value) || 1995)}
            className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-center text-lg font-bold focus:border-primary focus:outline-none transition-colors"
            placeholder="1995"
          />
        </div>

        {/* 키 & 체중 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <h3 className="text-sm font-bold mb-2">키 (cm)</h3>
            <input
              type="number"
              min={100}
              max={250}
              value={heightCm}
              onChange={(e) => onChange("heightCm", parseInt(e.target.value) || 170)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-center text-lg font-bold focus:border-primary focus:outline-none transition-colors"
              placeholder="170"
            />
          </div>
          <div>
            <h3 className="text-sm font-bold mb-2">체중 (kg)</h3>
            <input
              type="number"
              min={20}
              max={300}
              value={weightKg}
              onChange={(e) => onChange("weightKg", parseInt(e.target.value) || 65)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-center text-lg font-bold focus:border-primary focus:outline-none transition-colors"
              placeholder="65"
            />
          </div>
        </div>

        {/* BMI 표시 */}
        {bmi !== null && bmiCat !== null && (
          <div className="bg-surface rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold">체질량 분석</span>
              <span className="text-sm">
                <span className="font-extrabold text-lg">{bmi}</span>
                <span className="text-muted ml-1">kg/m²</span>
                <span
                  className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${
                    bmiCat === "normal"
                      ? "bg-emerald-100 text-emerald-700"
                      : bmiCat === "underweight"
                        ? "bg-blue-100 text-blue-700"
                        : bmiCat === "overweight"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                  }`}
                >
                  {BMI_LABELS[bmiCat]}
                </span>
              </span>
            </div>
            <BMIBar bmi={bmi} />
          </div>
        )}
      </div>
    </div>
  );
}

function BMIBar({ bmi }: { bmi: number }) {
  // 범위: 15~40 에 매핑
  const pct = Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100));
  return (
    <div className="relative h-3 rounded-full overflow-hidden flex">
      <div className="flex-1 bg-blue-300" />    {/* 저체중 <18.5 → 14% */}
      <div className="flex-[1.8] bg-emerald-400" /> {/* 정상 18.5~23 → 18% */}
      <div className="flex-[0.8] bg-amber-400" />   {/* 과체중 23~25 → 8% */}
      <div className="flex-[6] bg-red-400" />        {/* 비만 25~40 → 60% */}
      <div
        className="absolute top-0 h-full w-0.5 bg-foreground"
        style={{ left: `${pct}%` }}
      >
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-foreground border-2 border-card" />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Step 3: 식사 패턴
   ════════════════════════════════════════════ */

function StepPattern({
  mealsPerDay,
  eatingOutFreq,
  dietType,
  onChange,
}: {
  mealsPerDay: number;
  eatingOutFreq: string;
  dietType: DietType;
  onChange: (key: string, val: string | number) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">평소 식사 패턴은?</h1>
      <p className="text-muted text-sm mb-6">식단 추천 개수와 구성을 조절해요</p>

      <div className="space-y-6">
        {/* 끼니 수 */}
        <div>
          <h3 className="text-sm font-bold mb-2">하루 몇 끼 드시나요?</h3>
          <div className="flex gap-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => onChange("mealsPerDay", n)}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                  mealsPerDay === n
                    ? "bg-primary text-white"
                    : "bg-surface text-foreground/70 hover:bg-border"
                }`}
              >
                {n}끼
              </button>
            ))}
          </div>
        </div>

        {/* 외식 빈도 */}
        <div>
          <h3 className="text-sm font-bold mb-2">외식 빈도</h3>
          <div className="grid grid-cols-2 gap-2">
            {EATING_OUT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => onChange("eatingOutFreq", opt.key)}
                className={`py-2.5 rounded-xl text-sm transition-all ${
                  eatingOutFreq === opt.key
                    ? "bg-foreground text-card font-medium"
                    : "bg-surface text-foreground/70 hover:bg-border"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 식단 유형 */}
        <div>
          <h3 className="text-sm font-bold mb-2">식단 유형</h3>
          <div className="space-y-2">
            {DIET_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => onChange("dietType", opt.key)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  dietType === opt.key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="text-xs text-muted ml-2">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Step 4: 알레르기
   ════════════════════════════════════════════ */

function StepAllergies({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (a: string) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">알레르기가 있으신가요?</h1>
      <p className="text-muted text-sm mb-6">
        해당 원재료가 포함된 식품을 제외합니다
        <span className="text-xs ml-1">(복수 선택 · 없으면 건너뛰기)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {ALLERGIES.map((a) => (
          <button
            key={a.key}
            onClick={() => onToggle(a.key)}
            className={`px-4 py-2.5 rounded-full border-2 text-sm transition-all ${
              selected.includes(a.key)
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border hover:border-primary/30"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Step 5: 맛 선호도 + 민감도
   ════════════════════════════════════════════ */

function StepTastes({
  tastes,
  sensitivity,
  onTasteChange,
  onSensitivityChange,
}: {
  tastes: Record<string, TasteLevel>;
  sensitivity: { digestive: SensitivityLevel; additive: SensitivityLevel };
  onTasteChange: (key: string, val: TasteLevel) => void;
  onSensitivityChange: (key: "digestive" | "additive", val: SensitivityLevel) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">맛 선호도를 알려주세요</h1>
      <p className="text-muted text-sm mb-6">영양성분 데이터 기반으로 입맛에 맞는 식품을 찾아요</p>

      <div className="space-y-5">
        {TASTE_CONFIG.map((t) => (
          <div key={t.key}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium text-sm">{t.label}</span>
              <span className="text-sm text-primary font-bold">{tastes[t.key]}단계</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={tastes[t.key]}
              onChange={(e) => onTasteChange(t.key, Number(e.target.value) as TasteLevel)}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted mt-0.5">
              <span>약하게</span>
              <span>보통</span>
              <span>강하게</span>
            </div>
          </div>
        ))}
      </div>

      {/* 민감도 (접힌 상태로) */}
      <div className="mt-8 pt-6 border-t border-border">
        <h2 className="text-sm font-bold mb-4">민감도</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted mb-2">소화 민감도 — 배가 예민한 편인가요?</p>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as SensitivityLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => onSensitivityChange("digestive", level)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    sensitivity.digestive === level
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {SENSITIVITY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted mb-2">첨가물 민감도 — 식품첨가물에 신경 쓰는 편인가요?</p>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as SensitivityLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => onSensitivityChange("additive", level)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    sensitivity.additive === level
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {SENSITIVITY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Step 6: 영양 분석 결과
   ════════════════════════════════════════════ */

function StepResult({
  goals,
  nutritionGoals,
  hasBodyInfo,
  bodyInfo,
}: {
  goals: HealthGoal[];
  nutritionGoals: NutritionGoals | null;
  hasBodyInfo: boolean;
  bodyInfo: BodyInfo;
}) {
  const currentYear = new Date().getFullYear();
  const age = currentYear - bodyInfo.birthYear;

  const genderLabel = bodyInfo.gender === "male" ? "남성" : bodyInfo.gender === "female" ? "여성" : "";
  const effectiveGoals = goals.length > 0 ? goals : (["balanced"] as HealthGoal[]);

  return (
    <div>
      {/* 헤더 */}
      <div className="text-center mb-6">
        <p className="text-xs font-medium text-primary mb-1 tracking-wider">CAREFOOD 맞춤 영양 분석</p>
        <h1 className="text-2xl font-extrabold">나의 영양 분석 결과</h1>
        {hasBodyInfo && (
          <p className="text-sm text-muted mt-2">
            {genderLabel} · 만 {age}세 · {bodyInfo.heightCm}cm · {bodyInfo.weightKg}kg 기준
          </p>
        )}
      </div>

      {hasBodyInfo && nutritionGoals ? (
        <div className="space-y-4">
          {/* BMI 카드 */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold">체질량 분석 (BMI)</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-extrabold">{nutritionGoals.bmi}</span>
                <span className="text-xs text-muted">kg/m²</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    nutritionGoals.bmiCategory === "normal"
                      ? "bg-emerald-100 text-emerald-700"
                      : nutritionGoals.bmiCategory === "underweight"
                        ? "bg-blue-100 text-blue-700"
                        : nutritionGoals.bmiCategory === "overweight"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                  }`}
                >
                  {BMI_LABELS[nutritionGoals.bmiCategory]}
                </span>
              </div>
            </div>
            <BMIBar bmi={nutritionGoals.bmi} />
            <div className="flex justify-between text-[10px] text-muted mt-1">
              <span>저체중</span>
              <span>정상</span>
              <span>과체중</span>
              <span>비만</span>
            </div>
          </div>

          {/* 하루 필요 영양 카드 */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-3">하루 필요 영양소</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="text-center bg-surface rounded-xl py-3">
                <div className="text-2xl font-extrabold text-primary">
                  {nutritionGoals.dailyCalories.toLocaleString()}
                </div>
                <div className="text-xs text-muted">kcal / 일</div>
              </div>
              <div className="text-center bg-surface rounded-xl py-3">
                <div className="text-2xl font-extrabold text-primary">{nutritionGoals.dailyProteinG}</div>
                <div className="text-xs text-muted">g 단백질 / 일</div>
              </div>
            </div>

            {/* 매크로 비율 바 */}
            <div className="mb-2">
              <div className="text-xs font-medium text-muted mb-1">3대 영양소 비율</div>
              <div className="flex h-6 rounded-full overflow-hidden text-[10px] font-bold text-white">
                <div
                  className="flex items-center justify-center bg-amber-500"
                  style={{ width: `${nutritionGoals.carbRatio}%` }}
                >
                  {nutritionGoals.carbRatio}%
                </div>
                <div
                  className="flex items-center justify-center bg-red-400"
                  style={{ width: `${nutritionGoals.proteinRatio}%` }}
                >
                  {nutritionGoals.proteinRatio}%
                </div>
                <div
                  className="flex items-center justify-center bg-blue-400"
                  style={{ width: `${nutritionGoals.fatRatio}%` }}
                >
                  {nutritionGoals.fatRatio}%
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-muted mt-1">
                <span>탄수화물</span>
                <span>단백질</span>
                <span>지방</span>
              </div>
            </div>

            {/* 주요 기준 */}
            <div className="mt-3 pt-3 border-t border-border space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted">나트륨 상한</span>
                <span className="font-bold">{nutritionGoals.maxSodiumMg.toLocaleString()}mg 이하/일</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">당류 상한</span>
                <span className="font-bold">{nutritionGoals.maxSugarG}g 이하/일</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">식이섬유 권장</span>
                <span className="font-bold">{nutritionGoals.minFiberG}g 이상/일</span>
              </div>
            </div>
          </div>

          {/* 맞춤 전략 카드 */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-3">맞춤 케어 전략</h3>
            <p className="text-sm text-muted mb-3">{nutritionGoals.strategySummary}</p>
            <div className="flex flex-wrap gap-1.5">
              {nutritionGoals.strategyTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* 끼니당 기준 요약 */}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-2 text-primary">끼니당 추천 기준</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-extrabold">{nutritionGoals.perMeal.caloriesMax}</div>
                <div className="text-[10px] text-muted">kcal 이하</div>
              </div>
              <div>
                <div className="text-lg font-extrabold">{nutritionGoals.perMeal.maxSodiumMg}</div>
                <div className="text-[10px] text-muted">mg 나트륨</div>
              </div>
              <div>
                <div className="text-lg font-extrabold">{nutritionGoals.perMeal.minProteinG}g+</div>
                <div className="text-[10px] text-muted">단백질</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 신체 정보 없을 때 간소화 버전 */
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 text-center">
            <div className="text-4xl mb-3">🎯</div>
            <h3 className="font-bold mb-2">선택한 건강 목표</h3>
            <div className="flex flex-wrap gap-2 justify-center mb-4">
              {effectiveGoals.map((g) => (
                <span key={g} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  {HEALTH_GOAL_LABELS[g].emoji} {HEALTH_GOAL_LABELS[g].label}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted">
              신체 정보를 입력하면 더 정확한 영양 분석을 받을 수 있어요
            </p>
          </div>

          {/* 전략 태그 */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-3">맞춤 케어 전략</h3>
            <div className="flex flex-wrap gap-1.5">
              {effectiveGoals
                .flatMap((g) => {
                  const labels = HEALTH_GOAL_LABELS[g];
                  return [labels.label];
                })
                .map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                  >
                    #{tag}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 하단 문구 */}
      <div className="text-center mt-6">
        <p className="text-xs text-muted leading-relaxed">
          이 분석은 성분 정보와 통계 데이터에 기반한 참고용이며,
          <br />
          의학적 진단이나 처방을 대체하지 않습니다.
        </p>
      </div>
    </div>
  );
}
