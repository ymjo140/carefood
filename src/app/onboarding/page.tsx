"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TasteLevel, HealthConcern, SensitivityLevel } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { saveProfile } from "@/app/auth/actions";

// ── 타입 ─────────────────────────────────────────────
type OnboardingState = {
  concerns: HealthConcern[];
  sensitivity: {
    digestive: SensitivityLevel;
    additive: SensitivityLevel;
  };
  allergies: string[];
  tastes: { salty: TasteLevel; sweet: TasteLevel; spicy: TasteLevel; fatty: TasteLevel };
};

// ── 상수 ─────────────────────────────────────────────

/* SVG 아이콘 */
function IconGut({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm4 0h-2v-2h2v2zm1-4H8c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1h8c.55 0 1 .45 1 1v3c0 .55-.45 1-1 1z" />
    </svg>
  );
}
function IconLeaf({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66C7.72 17.14 9.23 12 17 10V8z" />
      <path d="M20.08 3.47L18.5 5.06C14.83 8.72 12.05 12.21 10.29 16.13l1.83.79C13.77 13.35 16.38 10.05 19.87 6.58l1.59-1.59-1.38-1.52z" />
    </svg>
  );
}
function IconScale({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z" />
    </svg>
  );
}
function IconBolt({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z" />
    </svg>
  );
}

const CONCERNS: { key: HealthConcern; icon: typeof IconGut; label: string; desc: string; iconBg: string }[] = [
  { key: "gut_health", icon: IconGut, label: "장건강", desc: "소화가 예민하거나, 속이 편한 식품을 찾고 있어요", iconBg: "bg-emerald-500" },
  { key: "skin", icon: IconLeaf, label: "피부건강", desc: "속부터 관리해서 피부 컨디션을 챙기고 싶어요", iconBg: "bg-pink-500" },
  { key: "weight", icon: IconScale, label: "체중관리", desc: "가볍지만 든든한 식품을 찾고 있어요", iconBg: "bg-blue-500" },
  { key: "energy", icon: IconBolt, label: "활력충전", desc: "하루에 필요한 영양을 골고루 채우고 싶어요", iconBg: "bg-amber-500" },
];

const ALLERGIES = [
  { key: "egg", label: "계란" },
  { key: "milk", label: "우유" },
  { key: "wheat", label: "밀" },
  { key: "soybean", label: "대두" },
  { key: "peanut", label: "땅콩" },
  { key: "treenut", label: "견과류" },
  { key: "shellfish", label: "갑각류(새우·게)" },
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

const SENSITIVITY_LABELS: Record<number, string> = {
  1: "둔감한 편",
  2: "보통",
  3: "예민한 편",
};

// ── 메인 컴포넌트 (Suspense 래퍼) ────────────────────
export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}

const STEPS = ["concerns", "sensitivity", "allergies", "tastes"] as const;
type StepKey = typeof STEPS[number];

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>({
    concerns: [],
    sensitivity: { digestive: 2, additive: 2 },
    allergies: [],
    tastes: { salty: 5, sweet: 5, spicy: 5, fatty: 5 },
  });

  // URL 파라미터로 관심사 프리셋
  useEffect(() => {
    const c = searchParams.get("concern") as HealthConcern | null;
    if (c && CONCERNS.some((cc) => cc.key === c)) {
      setState((prev) => ({
        ...prev,
        concerns: prev.concerns.includes(c) ? prev.concerns : [...prev.concerns, c],
      }));
      setStep(1); // 관심사 이미 선택됨 → 민감도 단계로
    }
  }, [searchParams]);

  const totalSteps = STEPS.length;
  const currentStepKey: StepKey = STEPS[step] || "concerns";

  const canProceed = (): boolean => {
    switch (currentStepKey) {
      case "concerns": return state.concerns.length > 0;
      case "sensitivity": return true;
      case "allergies": return true;
      case "tastes": return true;
      default: return true;
    }
  };

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    const profile = {
      concerns: state.concerns,
      sensitivity: state.sensitivity,
      allergies: state.allergies,
      tastes: state.tastes,
    };

    // 항상 localStorage에 저장 (빠른 복원 + 비로그인 체험용)
    try {
      localStorage.setItem("carefood_profile", JSON.stringify(profile));
    } catch { /* silent */ }

    // 로그인 상태면 Supabase에도 저장
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await saveProfile(JSON.stringify(profile));
      }
    } catch {
      // DB 저장 실패해도 localStorage가 있으니 진행
    }

    router.push("/recommend");
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* 진행 바 */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= step ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* 스텝 콘텐츠 */}
        <div className="min-h-[360px]">
          {currentStepKey === "concerns" && (
            <StepConcerns
              selected={state.concerns}
              onToggle={(c) =>
                setState((prev) => ({
                  ...prev,
                  concerns: prev.concerns.includes(c)
                    ? prev.concerns.filter((x) => x !== c)
                    : [...prev.concerns, c],
                }))
              }
            />
          )}
          {currentStepKey === "sensitivity" && (
            <StepSensitivity
              sensitivity={state.sensitivity}
              onChange={(key, val) =>
                setState((prev) => ({
                  ...prev,
                  sensitivity: { ...prev.sensitivity, [key]: val },
                }))
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
              onChange={(key, val) =>
                setState((prev) => ({
                  ...prev,
                  tastes: { ...prev.tastes, [key]: val },
                }))
              }
            />
          )}
        </div>

        {/* 네비게이션 버튼 */}
        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 border border-border py-3 rounded-full font-medium hover:bg-card transition-colors"
            >
              이전
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex-1 bg-primary text-white py-3 rounded-full font-bold hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === totalSteps - 1 ? "추천 받기" : "다음"}
          </button>
        </div>

        {/* 건너뛰기 */}
        {currentStepKey === "allergies" && (
          <button
            onClick={handleNext}
            className="w-full mt-3 text-sm text-muted hover:text-foreground transition-colors"
          >
            건너뛰기
          </button>
        )}
      </div>
    </div>
  );
}

// ── 서브 컴포넌트들 ──────────────────────────────────

function StepConcerns({
  selected,
  onToggle,
}: {
  selected: HealthConcern[];
  onToggle: (c: HealthConcern) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-2">
        어떤 건강이 궁금하세요?
      </h1>
      <p className="text-muted text-sm mb-6">
        관심 있는 건강 영역을 선택하면, 성분 기반으로 식품을 매칭해드려요.
        <br />
        <span className="text-xs">복수 선택 가능</span>
      </p>
      <div className="space-y-3">
        {CONCERNS.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => onToggle(c.key)}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                selected.includes(c.key)
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`${c.iconBg} w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-bold">{c.label}</div>
                  <div className="text-sm text-muted">{c.desc}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepSensitivity({
  sensitivity,
  onChange,
}: {
  sensitivity: { digestive: SensitivityLevel; additive: SensitivityLevel };
  onChange: (key: "digestive" | "additive", val: SensitivityLevel) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-2">
        민감도를 알려주세요
      </h1>
      <p className="text-muted text-sm mb-8">
        평소 체질에 맞게 식품을 걸러드려요. 의학적 진단이 아닌, 체감 기준으로 편하게 선택하세요.
      </p>

      <div className="space-y-8">
        {/* 소화 민감도 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <IconGut className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm">소화 민감도</h3>
              <p className="text-xs text-muted">평소 배가 예민한 편인가요?</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as SensitivityLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => onChange("digestive", level)}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
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

        {/* 첨가물 민감도 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 2v11h3v9l7-12h-4l4-8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm">첨가물 민감도</h3>
              <p className="text-xs text-muted">식품첨가물에 신경 쓰는 편인가요?</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as SensitivityLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => onChange("additive", level)}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
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
  );
}

function StepAllergies({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (a: string) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-2">알레르기가 있으신가요?</h1>
      <p className="text-muted text-sm mb-6">
        해당 원재료가 포함된 식품을 제외합니다.
        <br />
        <span className="text-xs">복수 선택 가능 · 없으면 건너뛰기</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {ALLERGIES.map((a) => (
          <button
            key={a.key}
            onClick={() => onToggle(a.key)}
            className={`px-3 py-2 rounded-full border-2 text-sm transition-all ${
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

function StepTastes({
  tastes,
  onChange,
}: {
  tastes: Record<string, TasteLevel>;
  onChange: (key: string, val: TasteLevel) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-2">맛 선호도를 알려주세요</h1>
      <p className="text-muted text-sm mb-6">
        영양성분 데이터 기반으로 입맛에 맞는 식품을 찾습니다.
      </p>
      <div className="space-y-6">
        {TASTE_CONFIG.map((t) => (
          <div key={t.key}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">
                {t.label}
              </span>
              <span className="text-sm text-primary font-bold">
                {tastes[t.key]}단계
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={tastes[t.key]}
              onChange={(e) =>
                onChange(t.key, Number(e.target.value) as TasteLevel)
              }
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted mt-0.5">
              <span>약하게</span>
              <span>3</span>
              <span>보통</span>
              <span>7</span>
              <span>강하게</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
