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
  sensitiveDataConsent: boolean;
  goals: HealthGoal[];
  showDiseaseGoals: boolean;
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

const STEPS = ["consent", "goals", "body", "pattern", "allergies", "tastes", "result"] as const;
type StepKey = (typeof STEPS)[number];

const STEP_META: Record<StepKey, { title: string; sub: string; icon: string }> = {
  consent: { title: "시작하기 전에", sub: "맞춤 추천을 위한 동의", icon: "🔐" },
  goals: { title: "건강 목표", sub: "어떤 건강을 관리할까요?", icon: "🎯" },
  body: { title: "신체 정보", sub: "맞춤 영양 분석에 활용해요", icon: "📏" },
  pattern: { title: "식사 패턴", sub: "추천 구성을 조절해요", icon: "🍽" },
  allergies: { title: "알레르기", sub: "해당 식품을 제외해요", icon: "⚠️" },
  tastes: { title: "맛 선호", sub: "입맛에 맞는 식품을 찾아요", icon: "👅" },
  result: { title: "분석 결과", sub: "나만의 영양 전략", icon: "📊" },
};

const MAIN_GOALS: HealthGoal[] = ["balanced", "weight_loss", "muscle", "gut_health", "skin", "energy"];
const DISEASE_GOALS: HealthGoal[] = ["diabetes", "blood_pressure", "kidney"];

const GOAL_COLORS: Record<string, string> = {
  balanced: "#2EA860",
  weight_loss: "#E06030",
  muscle: "#4A8FD4",
  gut_health: "#8A6EBF",
  skin: "#D4968A",
  energy: "#D4960A",
  diabetes: "#D46A3A",
  blood_pressure: "#C44040",
  kidney: "#6870C8",
};

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
  { key: "salty" as const, label: "짠맛", color: "var(--macro-sodium)" },
  { key: "sweet" as const, label: "단맛", color: "var(--macro-carbs)" },
  { key: "spicy" as const, label: "매운맛", color: "var(--macro-fat)" },
  { key: "fatty" as const, label: "기름진맛", color: "var(--macro-protein)" },
];

const EATING_OUT_OPTIONS = [
  { key: "daily", label: "거의 매일", icon: "🏪" },
  { key: "3_4", label: "주 3~4회", icon: "🍜" },
  { key: "1_2", label: "주 1~2회", icon: "🏠" },
  { key: "rarely", label: "거의 안 함", icon: "🍳" },
];

const DIET_OPTIONS: { key: DietType; label: string; desc: string; icon: string }[] = [
  { key: "normal", label: "일반 식사", desc: "특별한 식단 제한 없음", icon: "🍚" },
  { key: "diet", label: "다이어트 중", desc: "칼로리 조절 중이에요", icon: "🥗" },
  { key: "exercise", label: "운동 병행", desc: "근력 운동이나 유산소를 해요", icon: "💪" },
  { key: "vegetarian", label: "채식 위주", desc: "채식 또는 반채식 식단", icon: "🌿" },
  { key: "pregnant", label: "임산부·수유부", desc: "임신 중이거나 수유 중이에요", icon: "🤰" },
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
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center bg-background">
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
    sensitiveDataConsent: false,
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

  const hasBodyInfo =
    state.gender !== "other" &&
    state.birthYear > 1920 &&
    state.heightCm >= 100 &&
    state.heightCm <= 250 &&
    state.weightKg >= 20 &&
    state.weightKg <= 300;

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
      case "consent":
        return state.sensitiveDataConsent;
      case "goals":
        return state.goals.length > 0;
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
    const concernMap: Record<string, HealthConcern> = {
      gut_health: "gut_health",
      skin: "skin",
      weight_loss: "weight",
      energy: "energy",
    };
    const concerns: HealthConcern[] = state.goals
      .map((g) => concernMap[g])
      .filter(Boolean) as HealthConcern[];
    if (concerns.length === 0) concerns.push("energy");

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
      goals: state.goals,
      gender: state.gender,
      birthYear: state.birthYear,
      heightCm: state.heightCm,
      weightKg: state.weightKg,
      diet_type: state.dietType,
      meals_per_day: state.mealsPerDay,
      eating_out_freq: state.eatingOutFreq,
      nutrition_goals: nutritionCache,
      concerns,
      conditions: state.goals.filter((g) => DISEASE_GOALS.includes(g)),
      sensitivity: state.sensitivity,
      allergies: state.allergies,
      tastes: state.tastes,
    };

    try {
      localStorage.setItem("carefood_profile", JSON.stringify(profile));
    } catch { /* silent */ }

    try {
      let userId: string | null = null;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
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
        // 프로필 저장
        await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, ...profile }),
        });

        // 맛 선호를 user_taste_preferences 테이블에도 저장 (차트 연동)
        await fetch("/api/taste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_preference",
            user_id: userId,
            pref_spicy: Math.max(1, Math.min(5, Math.round(state.tastes.spicy / 2))),
            pref_sweet: Math.max(1, Math.min(5, Math.round(state.tastes.sweet / 2))),
            pref_salty: Math.max(1, Math.min(5, Math.round(state.tastes.salty / 2))),
            pref_umami: 3,
            pref_sour: 3,
          }),
        }).catch(() => {});
      }
    } catch { /* DB 저장 실패해도 localStorage가 있으니 진행 */ }

    router.push("/products");
  };

  const isResultStep = currentStepKey === "result";
  const isConsentStep = currentStepKey === "consent";

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background flex flex-col">
      {/* ── 헤더 영역: 진행 바 + 스텝 제목 ── */}
      <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-lg border-b border-border/50 px-4 pt-4 pb-3">
        {/* 진행 바 */}
        {!isConsentStep && (
          <div className="flex items-center gap-1 mb-3">
            {STEPS.slice(1).map((s, i) => {
              const isActive = i === step - 1;
              const isDone = i < step - 1;
              return (
                <div key={s} className="flex-1 relative">
                  <div
                    className={`h-1 rounded-full transition-all duration-500 ${
                      isDone
                        ? "bg-primary"
                        : isActive
                          ? "bg-primary animate-pulse"
                          : "bg-border"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* 스텝 라벨 */}
        {!isResultStep && (
          <div className="flex items-center gap-2">
            {!isConsentStep && (
              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full font-[family-name:var(--font-display)]">
                {step}/{totalSteps - 2}
              </span>
            )}
            <span className="text-xs text-muted">{STEP_META[currentStepKey].sub}</span>
          </div>
        )}
      </div>

      {/* ── 스텝 콘텐츠 ── */}
      <div className="flex-1 px-4 pt-6 pb-32 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          {currentStepKey === "consent" && (
            <StepConsent
              agreed={state.sensitiveDataConsent}
              onToggle={() =>
                setState((prev) => ({ ...prev, sensitiveDataConsent: !prev.sensitiveDataConsent }))
              }
            />
          )}
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
      </div>

      {/* ── 하단 고정 네비게이션 ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-lg border-t border-border/50 px-4 py-4 z-40">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 0 && !isResultStep && (
            <button
              onClick={handleBack}
              className="w-14 h-14 flex items-center justify-center border border-border rounded-2xl hover:bg-card transition-colors shrink-0"
            >
              <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <button
            onClick={isResultStep ? handleComplete : handleNext}
            disabled={!canProceed()}
            className="flex-1 bg-primary text-white h-14 rounded-2xl font-bold hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-base flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            {isResultStep ? (
              <>이 전략으로 시작하기<span className="text-lg">→</span></>
            ) : step === totalSteps - 2 ? (
              <>영양 분석 보기<span className="text-lg">📊</span></>
            ) : (
              "다음"
            )}
          </button>
        </div>
        {/* 건너뛰기 */}
        {(currentStepKey === "body" ||
          currentStepKey === "allergies" ||
          currentStepKey === "pattern") && (
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => {
                if (currentStepKey === "body") {
                  setState((prev) => ({ ...prev, gender: "other" }));
                }
                handleNext();
              }}
              className="w-full mt-2 text-sm text-muted hover:text-foreground transition-colors py-1"
            >
              건너뛰기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Step 0: 민감정보 수집 동의
   ════════════════════════════════════════════ */

function StepConsent({ agreed, onToggle }: { agreed: boolean; onToggle: () => void }) {
  return (
    <div>
      {/* 큰 제목 */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <span className="text-3xl">🔐</span>
        </div>
        <h1 className="text-2xl font-extrabold mb-1">시작하기 전에</h1>
        <p className="text-muted text-sm">맞춤 식품 추천을 위해 아래 정보 수집에 동의해주세요</p>
      </div>

      {/* 수집 정보 카드 */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4 space-y-4">
        <div>
          <p className="text-sm font-bold text-foreground mb-2">수집하는 정보</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: "🎯", label: "건강 목표" },
              { icon: "📏", label: "신체 정보 (선택)" },
              { icon: "🍽", label: "식사 패턴" },
              { icon: "⚠️", label: "알레르기·맛 선호" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 bg-surface rounded-xl px-3 py-2.5">
                <span className="text-base">{item.icon}</span>
                <span className="text-xs font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-start gap-2.5">
            <span className="text-base mt-0.5">🎯</span>
            <div>
              <p className="text-xs font-bold text-foreground">이용 목적</p>
              <p className="text-xs text-muted">식품 영양성분 기반 맞춤 추천 및 영양 분석 제공</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-start gap-2.5">
            <span className="text-base mt-0.5">🗂</span>
            <div>
              <p className="text-xs font-bold text-foreground">보관 및 파기</p>
              <p className="text-xs text-muted">기기 내 로컬 저장 · 회원가입 시 서버 저장 · 탈퇴 시 즉시 파기</p>
            </div>
          </div>
        </div>
      </div>

      {/* 민감정보 경고 */}
      <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 mb-4 text-xs leading-relaxed">
        <p className="font-bold text-accent mb-1">민감정보(건강정보) 수집 안내</p>
        <p className="text-accent/80">
          건강 목표·질환 관심사·신체 정보는 개인정보보호법 제23조에 따른 민감정보에 해당합니다.
          해당 정보는 식품 성분 매칭에만 사용되며, 제3자에게 제공되지 않습니다.
        </p>
      </div>

      {/* 면책 */}
      <div className="bg-surface rounded-xl p-3 mb-5 text-[11px] text-muted leading-relaxed">
        본 서비스는 식약처 영양성분 데이터베이스 기반 정보 제공 서비스이며,
        의학적 진단·치료·처방을 대체하지 않습니다.
      </div>

      {/* 동의 토글 */}
      <button
        onClick={onToggle}
        className={`w-full text-left px-4 py-4 rounded-2xl border-2 transition-all ${
          agreed
            ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
            : "border-border hover:border-primary/30"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
              agreed ? "bg-primary border-primary" : "border-muted/50"
            }`}
          >
            {agreed && (
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <span className="text-sm font-bold">민감정보(건강정보) 수집·이용에 동의합니다</span>
        </div>
      </button>
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
        <span className="text-xs text-primary ml-1 font-medium">(복수 선택)</span>
      </p>

      <div className="space-y-2.5">
        {MAIN_GOALS.map((g) => {
          const info = HEALTH_GOAL_LABELS[g];
          const isSelected = selected.includes(g);
          const color = GOAL_COLORS[g] || "#C4870A";
          return (
            <button
              key={g}
              onClick={() => onToggle(g)}
              className={`w-full text-left rounded-2xl border-2 transition-all overflow-hidden ${
                isSelected
                  ? "border-primary/60 shadow-sm"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="flex items-stretch">
                {/* 왼쪽 컬러 스트라이프 */}
                <div
                  className="w-1.5 shrink-0 transition-opacity"
                  style={{
                    backgroundColor: color,
                    opacity: isSelected ? 1 : 0.25,
                  }}
                />
                <div className="flex items-center gap-3 px-4 py-3.5 flex-1">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    {info.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{info.label}</div>
                    <div className="text-xs text-muted">{info.desc}</div>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 질환 관심 섹션 */}
      <div className="mt-5">
        <button
          onClick={onToggleDisease}
          className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all ${
            hasDiseaseGoal
              ? "border-accent/50 bg-accent/5"
              : "border-dashed border-border hover:border-accent/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <span className="text-xl">🏥</span>
              </div>
              <div>
                <div className="font-bold text-sm">질환 관심</div>
                <div className="text-xs text-muted">성분 정보 기반 참고용</div>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-muted transition-transform ${showDisease ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {showDisease && (
          <div className="mt-2 space-y-2">
            {DISEASE_GOALS.map((g) => {
              const info = HEALTH_GOAL_LABELS[g];
              const isSelected = selected.includes(g);
              const color = GOAL_COLORS[g] || "#C44040";
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
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: `${color}15` }}>
                      {info.emoji}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{info.label}</span>
                      <span className="text-xs text-muted ml-2">{info.desc}</span>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {hasDiseaseGoal && (
              <p className="text-xs text-accent/80 px-2 pt-1">
                의료 행위가 아닌, 성분 정보 기반 참고용입니다
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
    heightCm >= 100 && heightCm <= 250 &&
    weightKg >= 20 && weightKg <= 300;

  const bmi = hasFull ? calculateBMI(heightCm, weightKg) : null;
  const bmiCat = bmi ? getBMICategory(bmi) : null;

  const GENDER_OPTIONS = [
    { key: "male" as const, label: "남성", icon: "♂" },
    { key: "female" as const, label: "여성", icon: "♀" },
    { key: "other" as const, label: "선택 안 함", icon: "–" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">신체 정보를 알려주세요</h1>
      <p className="text-muted text-sm mb-6">맞춤 영양 분석에 활용해요</p>

      <div className="space-y-5">
        {/* 성별 — 큰 카드 */}
        <div>
          <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">성별</h3>
          <div className="grid grid-cols-3 gap-2">
            {GENDER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => onChange("gender", opt.key)}
                className={`flex flex-col items-center py-4 rounded-2xl border-2 transition-all ${
                  gender === opt.key
                    ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <span className={`text-2xl mb-1 ${gender === opt.key ? "text-primary" : "text-muted"}`}>
                  {opt.icon}
                </span>
                <span className={`text-sm ${gender === opt.key ? "font-bold text-primary" : "font-medium"}`}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 출생연도 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider">출생연도</h3>
            {birthYear > 1920 && (
              <span className="text-sm text-primary font-bold font-[family-name:var(--font-display)]">만 {age}세</span>
            )}
          </div>
          <input
            type="number"
            min={1920}
            max={currentYear - 10}
            value={birthYear}
            onChange={(e) => onChange("birthYear", parseInt(e.target.value) || 1995)}
            className="w-full px-4 py-3.5 rounded-2xl border-2 border-border bg-card text-foreground text-center text-xl font-bold font-[family-name:var(--font-display)] focus:border-primary focus:outline-none transition-colors"
            placeholder="1995"
          />
        </div>

        {/* 키 & 체중 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">키</h3>
            <div className="relative">
              <input
                type="number"
                min={100} max={250}
                value={heightCm}
                onChange={(e) => onChange("heightCm", parseInt(e.target.value) || 170)}
                className="w-full px-4 py-3.5 rounded-2xl border-2 border-border bg-card text-foreground text-center text-xl font-bold font-[family-name:var(--font-display)] focus:border-primary focus:outline-none transition-colors pr-12"
                placeholder="170"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted font-medium">cm</span>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">체중</h3>
            <div className="relative">
              <input
                type="number"
                min={20} max={300}
                value={weightKg}
                onChange={(e) => onChange("weightKg", parseInt(e.target.value) || 65)}
                className="w-full px-4 py-3.5 rounded-2xl border-2 border-border bg-card text-foreground text-center text-xl font-bold font-[family-name:var(--font-display)] focus:border-primary focus:outline-none transition-colors pr-12"
                placeholder="65"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted font-medium">kg</span>
            </div>
          </div>
        </div>

        {/* BMI 게이지 */}
        {bmi !== null && bmiCat !== null && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-muted uppercase tracking-wider">체질량 분석</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-extrabold font-[family-name:var(--font-display)]">{bmi}</span>
                <span className="text-xs text-muted">kg/m²</span>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    bmiCat === "normal"
                      ? "bg-[var(--success)]/10 text-[var(--success)]"
                      : bmiCat === "underweight"
                        ? "bg-[var(--macro-protein)]/10 text-[var(--macro-protein)]"
                        : bmiCat === "overweight"
                          ? "bg-[var(--macro-carbs)]/10 text-[var(--macro-carbs)]"
                          : "bg-[var(--macro-fat)]/10 text-[var(--macro-fat)]"
                  }`}
                >
                  {BMI_LABELS[bmiCat]}
                </span>
              </div>
            </div>
            <BMIBar bmi={bmi} />
            <div className="flex justify-between text-[10px] text-muted mt-1.5">
              <span>저체중</span>
              <span>정상</span>
              <span>과체중</span>
              <span>비만</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BMIBar({ bmi }: { bmi: number }) {
  const pct = Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100));
  return (
    <div className="relative h-3 rounded-full overflow-hidden flex">
      <div className="flex-1" style={{ backgroundColor: "var(--macro-protein)" }} />
      <div className="flex-[1.8]" style={{ backgroundColor: "var(--success)" }} />
      <div className="flex-[0.8]" style={{ backgroundColor: "var(--macro-carbs)" }} />
      <div className="flex-[6]" style={{ backgroundColor: "var(--macro-fat)" }} />
      <div className="absolute top-0 h-full w-0.5 bg-foreground" style={{ left: `${pct}%` }}>
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-foreground border-2 border-card" />
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
        {/* 끼니 수 — 큰 숫자 카드 */}
        <div>
          <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">하루 끼니 수</h3>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => onChange("mealsPerDay", n)}
                className={`flex flex-col items-center py-4 rounded-2xl border-2 transition-all ${
                  mealsPerDay === n
                    ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <span className={`text-3xl font-extrabold font-[family-name:var(--font-display)] ${mealsPerDay === n ? "text-primary" : "text-foreground/60"}`}>
                  {n}
                </span>
                <span className="text-xs text-muted mt-1">끼</span>
              </button>
            ))}
          </div>
        </div>

        {/* 외식 빈도 */}
        <div>
          <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">외식 빈도</h3>
          <div className="grid grid-cols-2 gap-2">
            {EATING_OUT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => onChange("eatingOutFreq", opt.key)}
                className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all ${
                  eatingOutFreq === opt.key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <span className="text-lg">{opt.icon}</span>
                <span className={`text-sm ${eatingOutFreq === opt.key ? "font-bold text-primary" : ""}`}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 식단 유형 */}
        <div>
          <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">식단 유형</h3>
          <div className="space-y-2">
            {DIET_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => onChange("dietType", opt.key)}
                className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${
                  dietType === opt.key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <div>
                  <span className={`text-sm ${dietType === opt.key ? "font-bold" : "font-medium"}`}>{opt.label}</span>
                  <span className="text-xs text-muted ml-2">{opt.desc}</span>
                </div>
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
        <span className="text-xs text-primary ml-1 font-medium">(복수 선택)</span>
      </p>

      <div className="flex flex-wrap gap-2.5">
        {ALLERGIES.map((a) => {
          const isSelected = selected.includes(a.key);
          return (
            <button
              key={a.key}
              onClick={() => onToggle(a.key)}
              className={`px-5 py-3 rounded-2xl border-2 text-sm transition-all ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary font-bold shadow-sm shadow-primary/10"
                  : "border-border hover:border-primary/30"
              }`}
            >
              {isSelected && <span className="mr-1">✓</span>}
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 bg-surface rounded-xl p-3 text-xs text-muted">
        없으면 아래 &quot;건너뛰기&quot;를 눌러주세요
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
          <div key={t.key} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">{t.label}</span>
              <span
                className="text-sm font-extrabold font-[family-name:var(--font-display)] px-2 py-0.5 rounded-lg"
                style={{ color: t.color, backgroundColor: `${t.color}15` }}
              >
                {tastes[t.key]}
              </span>
            </div>
            <input
              type="range"
              min={1} max={10} step={1}
              value={tastes[t.key]}
              onChange={(e) => onTasteChange(t.key, Number(e.target.value) as TasteLevel)}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${t.color} 0%, ${t.color} ${((tastes[t.key] - 1) / 9) * 100}%, var(--border) ${((tastes[t.key] - 1) / 9) * 100}%, var(--border) 100%)`,
                accentColor: t.color,
              }}
            />
            <div className="flex justify-between text-[10px] text-muted mt-1">
              <span>약하게</span>
              <span>보통</span>
              <span>강하게</span>
            </div>
          </div>
        ))}
      </div>

      {/* 민감도 */}
      <div className="mt-8 pt-6 border-t border-border">
        <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">민감도</h2>
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-sm font-bold mb-2">소화 민감도</p>
            <p className="text-xs text-muted mb-3">배가 예민한 편인가요?</p>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as SensitivityLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => onSensitivityChange("digestive", level)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    sensitivity.digestive === level
                      ? "border-primary bg-primary/5 text-primary font-bold"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {SENSITIVITY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-sm font-bold mb-2">첨가물 민감도</p>
            <p className="text-xs text-muted mb-3">식품첨가물에 신경 쓰는 편인가요?</p>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as SensitivityLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => onSensitivityChange("additive", level)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    sensitivity.additive === level
                      ? "border-primary bg-primary/5 text-primary font-bold"
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

function CalorieRing({ calories, size = 160 }: { calories: number; size?: number }) {
  const r = (size - 16) / 2;
  const circumference = 2 * Math.PI * r;
  // fill 80% as visual
  const fill = circumference * 0.8;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="onb-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--ring-start)" />
            <stop offset="100%" stopColor="var(--ring-end)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--ring-track)" strokeWidth={10}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="url(#onb-ring-grad)" strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold font-[family-name:var(--font-display)] text-foreground">
          {calories.toLocaleString()}
        </span>
        <span className="text-xs text-muted -mt-0.5">kcal/일</span>
      </div>
    </div>
  );
}

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
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
          <span className="text-2xl">📊</span>
        </div>
        <p className="text-xs font-bold text-primary tracking-widest mb-1">CAREFOOD 맞춤 영양 분석</p>
        <h1 className="text-2xl font-extrabold">나의 영양 분석 결과</h1>
        {hasBodyInfo && (
          <p className="text-sm text-muted mt-1.5">
            {genderLabel} · 만 {age}세 · {bodyInfo.heightCm}cm · {bodyInfo.weightKg}kg 기준
          </p>
        )}
      </div>

      {hasBodyInfo && nutritionGoals ? (
        <div className="space-y-4">
          {/* 칼로리 링 + 매크로 그리드 */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex justify-center mb-4">
              <CalorieRing calories={nutritionGoals.dailyCalories} />
            </div>

            {/* 매크로 4-cell 그리드 */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "단백질", value: `${nutritionGoals.dailyProteinG}g`, color: "var(--macro-protein)", bg: "var(--macro-protein-bg)" },
                { label: "탄수화물", value: `${nutritionGoals.carbRatio}%`, color: "var(--macro-carbs)", bg: "var(--macro-carbs-bg)" },
                { label: "지방", value: `${nutritionGoals.fatRatio}%`, color: "var(--macro-fat)", bg: "var(--macro-fat-bg)" },
                { label: "나트륨", value: `${(nutritionGoals.maxSodiumMg / 1000).toFixed(1)}g`, color: "var(--macro-sodium)", bg: "var(--macro-sodium-bg)" },
              ].map((m) => (
                <div key={m.label} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: m.bg }}>
                  <div className="text-lg font-extrabold font-[family-name:var(--font-display)]" style={{ color: m.color }}>
                    {m.value}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* BMI 카드 */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-muted uppercase tracking-wider">BMI</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-extrabold font-[family-name:var(--font-display)]">{nutritionGoals.bmi}</span>
                <span className="text-xs text-muted">kg/m²</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    nutritionGoals.bmiCategory === "normal"
                      ? "bg-[var(--success)]/10 text-[var(--success)]"
                      : nutritionGoals.bmiCategory === "underweight"
                        ? "bg-[var(--macro-protein)]/10 text-[var(--macro-protein)]"
                        : nutritionGoals.bmiCategory === "overweight"
                          ? "bg-[var(--macro-carbs)]/10 text-[var(--macro-carbs)]"
                          : "bg-[var(--macro-fat)]/10 text-[var(--macro-fat)]"
                  }`}
                >
                  {BMI_LABELS[nutritionGoals.bmiCategory]}
                </span>
              </div>
            </div>
            <BMIBar bmi={nutritionGoals.bmi} />
            <div className="flex justify-between text-[10px] text-muted mt-1.5">
              <span>저체중</span><span>정상</span><span>과체중</span><span>비만</span>
            </div>
          </div>

          {/* 매크로 비율 바 */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">3대 영양소 비율</span>
            <div className="flex h-7 rounded-full overflow-hidden text-[10px] font-bold text-white mt-3">
              <div className="flex items-center justify-center" style={{ width: `${nutritionGoals.carbRatio}%`, backgroundColor: "var(--macro-carbs)" }}>
                {nutritionGoals.carbRatio}%
              </div>
              <div className="flex items-center justify-center" style={{ width: `${nutritionGoals.proteinRatio}%`, backgroundColor: "var(--macro-protein)" }}>
                {nutritionGoals.proteinRatio}%
              </div>
              <div className="flex items-center justify-center" style={{ width: `${nutritionGoals.fatRatio}%`, backgroundColor: "var(--macro-fat)" }}>
                {nutritionGoals.fatRatio}%
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-muted mt-1.5">
              <span style={{ color: "var(--macro-carbs)" }}>탄수화물</span>
              <span style={{ color: "var(--macro-protein)" }}>단백질</span>
              <span style={{ color: "var(--macro-fat)" }}>지방</span>
            </div>
          </div>

          {/* 영양 기준 */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">주요 기준</span>
            <div className="mt-3 space-y-2">
              {[
                { label: "나트륨 상한", value: `${nutritionGoals.maxSodiumMg.toLocaleString()}mg 이하/일`, color: "var(--macro-sodium)" },
                { label: "당류 상한", value: `${nutritionGoals.maxSugarG}g 이하/일`, color: "var(--macro-carbs)" },
                { label: "식이섬유 권장", value: `${nutritionGoals.minFiberG}g 이상/일`, color: "var(--success)" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center text-sm">
                  <span className="text-muted flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                  <span className="font-bold font-[family-name:var(--font-display)]">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 맞춤 전략 */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">맞춤 케어 전략</span>
            <p className="text-sm text-foreground/80 mt-2 mb-3">{nutritionGoals.strategySummary}</p>
            <div className="flex flex-wrap gap-1.5">
              {nutritionGoals.strategyTags.map((tag) => (
                <span key={tag} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* 끼니당 기준 */}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <span className="text-xs font-bold text-primary uppercase tracking-wider">끼니당 추천 기준</span>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div>
                <div className="text-xl font-extrabold font-[family-name:var(--font-display)]">{nutritionGoals.perMeal.caloriesMax}</div>
                <div className="text-[10px] text-muted">kcal 이하</div>
              </div>
              <div>
                <div className="text-xl font-extrabold font-[family-name:var(--font-display)]">{nutritionGoals.perMeal.maxSodiumMg}</div>
                <div className="text-[10px] text-muted">mg 나트륨</div>
              </div>
              <div>
                <div className="text-xl font-extrabold font-[family-name:var(--font-display)]">{nutritionGoals.perMeal.minProteinG}g+</div>
                <div className="text-[10px] text-muted">단백질</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 신체 정보 없을 때 간소화 버전 */
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <span className="text-3xl">🎯</span>
            </div>
            <h3 className="font-bold mb-3">선택한 건강 목표</h3>
            <div className="flex flex-wrap gap-2 justify-center mb-4">
              {effectiveGoals.map((g) => {
                const color = GOAL_COLORS[g] || "#C4870A";
                return (
                  <span
                    key={g}
                    className="px-3 py-1.5 rounded-full text-sm font-medium text-white"
                    style={{ backgroundColor: color }}
                  >
                    {HEALTH_GOAL_LABELS[g].emoji} {HEALTH_GOAL_LABELS[g].label}
                  </span>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              신체 정보를 입력하면 더 정확한 영양 분석을 받을 수 있어요
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">맞춤 케어 전략</span>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {effectiveGoals
                .flatMap((g) => [HEALTH_GOAL_LABELS[g].label])
                .map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    #{tag}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 하단 면책 */}
      <div className="text-center mt-6">
        <p className="text-[11px] text-muted leading-relaxed">
          이 분석은 성분 정보와 통계 데이터에 기반한 참고용이며,
          <br />
          의학적 진단이나 처방을 대체하지 않습니다.
        </p>
      </div>
    </div>
  );
}
