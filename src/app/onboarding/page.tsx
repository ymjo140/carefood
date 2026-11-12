"use client";

import { useState, useEffect, useMemo, Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SensitivityLevel, TasteLevel } from "@/types/database";
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
import {
  Badge, BottomBar, Button, Card, Chip, EmptyState, Field, Icon, Input, MacroGrid, Notice, Page, PageLoading, SectionHeader, Skeleton, Stat, Steps, TextLink, cn,
  type BadgeTone,
} from "@/components/ui";
import { ChoiceCard } from "@/components/ui/ChoiceCard";
import { ProductCards, pickSlots, type QuickProduct } from "@/components/HomePersonalized";
import { getClientActorId } from "@/lib/actor-client";
import { ALLERGIES, DIET_OPTIONS, DISEASE_GOALS, EATING_OUT_OPTIONS, MAIN_GOALS, TASTE_CONFIG, buildProfile, persistProfile, readLocalProfile } from "@/lib/profile-options";

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

// 동의는 첫 화면이 아니라, 질환 관심을 고를 때 그 자리에서 받는다 (마이페이지 > 관심사와 같은 방식)
const STEPS = ["goals", "body", "pattern", "allergies", "tastes", "result"] as const;
type StepKey = (typeof STEPS)[number];

const STEP_META: Record<StepKey, { title: string; sub: string }> = {
  goals: { title: "건강 목표", sub: "어떤 건강을 관리할까요?" },
  body: { title: "신체 정보", sub: "맞춤 영양 분석에 활용해요" },
  pattern: { title: "식사 패턴", sub: "추천 구성을 조절해요" },
  allergies: { title: "알레르기", sub: "해당 식품을 제외해요" },
  tastes: { title: "맛 선호", sub: "입맛에 맞는 식품을 찾아요" },
  result: { title: "분석 결과", sub: "나만의 영양 전략" },
};

const SENSITIVITY_LABELS: Record<number, string> = {
  1: "둔감한 편",
  2: "보통",
  3: "예민한 편",
};

/** BMI 구간 — 같은 의미는 같은 색 */
const BMI_TONE: Record<NutritionGoals["bmiCategory"], BadgeTone> = {
  underweight: "protein",
  normal: "positive",
  overweight: "caution",
  obese: "danger",
};

/* ════════════════════════════════════════════
   메인 (Suspense 래퍼)
   ════════════════════════════════════════════ */

export default function OnboardingPage() {
  return (
    <Suspense fallback={<PageLoading />}>
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
    // 비워서 시작한다 — 전에는 1995·170·65 가 들어 있어 입력한 것처럼 보였는데, 성별을 안 고르면 분석이 비어 나왔다
    birthYear: 0,
    heightCm: 0,
    weightKg: 0,
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

  // 성별은 '선택 안 함'이어도 된다 (기초대사량은 남녀 공식의 평균 — lib/nutrition.ts)
  const hasBodyInfo =
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
      case "goals":
        // 질환 관심을 골랐으면 그 자리의 동의가 있어야 한다
        return state.goals.length > 0 && (!state.goals.some((g) => DISEASE_GOALS.includes(g)) || state.sensitiveDataConsent);
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

  // ds-wiring-drop: /api/profile — 저장은 src/lib/profile-options.ts persistProfile (마이페이지와 같이 씀)
  const handleComplete = async () => {
    // 닉네임 같은 다른 키는 이어받는다
    const profile = buildProfile(state, nutritionGoals, readLocalProfile() || {});
    try {
      await persistProfile(profile);
      const userId = getClientActorId();
      if (userId) {
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
        }).catch(() => {}); // ds-allow: 로컬 저장이 있어 진행
      }
    } catch { /* DB 저장 실패해도 localStorage가 있으니 진행 */ } // ds-allow: 로컬 저장이 있어 진행

    // 결과를 본 다음 행동: 내 기준으로 이번 주 식단을 바로 채워 보여 준다
    router.push("/weekly-box?fill=1");
  };

  const isResultStep = currentStepKey === "result";
  const canSkip = currentStepKey === "body" || currentStepKey === "allergies" || currentStepKey === "pattern";

  return (
    <Page width="narrow">
      {/* ── 진행 표시 ── */}
      {!isResultStep && (
        <div className="sticky top-14 z-30 -mx-4 px-4 pt-4 pb-3 mb-6 bg-canvas border-b border-line">
          <Steps total={totalSteps - 1} current={step} className="mb-2.5" />
          <p className="text-caption text-ink-2">
            <span className="num font-bold text-brand-ink mr-1.5">{step + 1}/{totalSteps - 1}</span>
            {STEP_META[currentStepKey].sub}
          </p>
        </div>
      )}
      {isResultStep && <div className="h-6" />}

      {/* ── 단계 내용 ── */}
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
          consent={state.sensitiveDataConsent}
          onConsent={(v) => setState((prev) => ({ ...prev, sensitiveDataConsent: v }))}
        />
      )}
      {currentStepKey === "body" && (
        <StepBody
          gender={state.gender}
          birthYear={state.birthYear}
          heightCm={state.heightCm}
          weightKg={state.weightKg}
          onChange={(key, val) => setState((prev) => ({ ...prev, [key]: val }))}
        />
      )}
      {currentStepKey === "pattern" && (
        <StepPattern
          mealsPerDay={state.mealsPerDay}
          eatingOutFreq={state.eatingOutFreq}
          dietType={state.dietType}
          onChange={(key, val) => setState((prev) => ({ ...prev, [key]: val }))}
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
            setState((prev) => ({ ...prev, tastes: { ...prev.tastes, [key]: val } }))
          }
          onSensitivityChange={(key, val) =>
            setState((prev) => ({ ...prev, sensitivity: { ...prev.sensitivity, [key]: val } }))
          }
        />
      )}
      {currentStepKey === "result" && (
        <StepResult
          goals={state.goals}
          nutritionGoals={nutritionGoals}
          hasBodyInfo={hasBodyInfo}
          makeProfile={() => buildProfile(state, nutritionGoals, readLocalProfile() || {})}
          onEditBody={() => setStep(STEPS.indexOf("body"))}
          bodyInfo={{
            gender: state.gender,
            birthYear: state.birthYear,
            heightCm: state.heightCm,
            weightKg: state.weightKg,
          }}
        />
      )}

      {/* 하단 고정 줄에 가리지 않도록 */}
      <div className={canSkip ? "h-32" : "h-20"} aria-hidden="true" />

      {/* ── 하단 고정 이동 ── */}
      <BottomBar>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex gap-2">
            {step > 0 && !isResultStep && (
              <Button variant="secondary" icon="chevron-left" onClick={handleBack} className="shrink-0">
                이전
              </Button>
            )}
            <Button
              block
              onClick={isResultStep ? handleComplete : handleNext}
              disabled={!canProceed()}
              iconRight={isResultStep ? "arrow-right" : undefined}
            >
              {isResultStep ? "이번 주 식단 채우기" : step === totalSteps - 2 ? "영양 분석 보기" : "다음"}
            </Button>
          </div>
          {canSkip && (
            <Button
              variant="ghost"
              size="sm"
              block
              onClick={() => {
                if (currentStepKey === "body") {
                  setState((prev) => ({ ...prev, gender: "other" }));
                }
                handleNext();
              }}
            >
              건너뛰기
            </Button>
          )}
        </div>
      </BottomBar>
    </Page>
  );
}

/* ════════════════════════════════════════════
   공통 조각
   ════════════════════════════════════════════ */

function StepTitle({ title, description, note }: { title: ReactNode; description?: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-title font-bold text-ink text-balance">{title}</h1>
      {description && (
        <p className="text-label text-ink-2 mt-1">
          {description}
          {note && <span className="text-brand-ink font-medium ml-1">{note}</span>}
        </p>
      )}
    </div>
  );
}

function GroupLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2">
      <h3 className="text-label font-bold text-ink">{children}</h3>
      {right}
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
  consent,
  onConsent,
}: {
  selected: HealthGoal[];
  showDisease: boolean;
  onToggle: (g: HealthGoal) => void;
  onToggleDisease: () => void;
  consent: boolean;
  onConsent: (v: boolean) => void;
}) {
  const hasDiseaseGoal = selected.some((g) => DISEASE_GOALS.includes(g));

  return (
    <div>
      <StepTitle
        title="어떤 건강 목표가 있으세요?"
        description="목표에 맞는 식품을 성분 기반으로 매칭해 드려요"
        note="(여러 개 고를 수 있어요)"
      />

      <div className="flex flex-col gap-2">
        {MAIN_GOALS.map((g) => {
          const info = HEALTH_GOAL_LABELS[g];
          return (
            <ChoiceCard
              key={g}
              selected={selected.includes(g)}
              onClick={() => onToggle(g)}
              title={info.label}
              description={info.desc}
            />
          );
        })}
      </div>

      {/* 질환 관심 */}
      <div className="mt-5">
        <button
          type="button"
          onClick={onToggleDisease}
          aria-expanded={showDisease}
          className={cn(
            "w-full flex items-center justify-between gap-3 rounded-lg border px-4 min-h-14 py-3 text-left transition-colors",
            hasDiseaseGoal ? "border-brand bg-brand-soft" : "border-dashed border-line hover:border-line-strong",
          )}
        >
          <span>
            <span className="block text-body font-bold text-ink">질환 관심</span>
            <span className="block text-caption text-ink-2">성분 정보 기반 참고용</span>
          </span>
          <Icon
            name="chevron-down"
            className={cn("text-ink-2 shrink-0 transition-transform", showDisease && "rotate-180")}
          />
        </button>

        {showDisease && (
          <div className="mt-2 flex flex-col gap-2">
            {DISEASE_GOALS.map((g) => {
              const info = HEALTH_GOAL_LABELS[g];
              return (
                <ChoiceCard
                  key={g}
                  selected={selected.includes(g)}
                  onClick={() => onToggle(g)}
                  title={info.label}
                  description={info.desc}
                />
              );
            })}
            {hasDiseaseGoal && (
              <>
                <Notice tone="caution">의료 행위가 아닌, 성분 정보 기반 참고용이에요</Notice>
                {/* 질환 관심은 민감정보 — 고른 그 자리에서 동의를 받는다 */}
                <label className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 cursor-pointer">
                  <input type="checkbox" className="ds-check shrink-0 mt-0.5" checked={consent} onChange={(e) => onConsent(e.target.checked)} />
                  <span className="text-label text-ink">
                    질환 관심(민감정보)을 맞춤 추천에만 쓰는 데 동의해요. 진단이 아니라 성분 정보로 고르는 데 쓰고, 다른 곳에 주지 않아요{" "}
                    <TextLink href="/privacy">개인정보처리방침</TextLink>
                  </span>
                </label>
              </>
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
    birthYear > 1920 &&
    heightCm >= 100 && heightCm <= 250 &&
    weightKg >= 20 && weightKg <= 300;

  const bmi = hasFull ? calculateBMI(heightCm, weightKg) : null;
  const bmiCat = bmi ? getBMICategory(bmi) : null;

  const GENDER_OPTIONS = [
    { key: "male" as const, label: "남성" },
    { key: "female" as const, label: "여성" },
    { key: "other" as const, label: "선택 안 함" },
  ];

  return (
    <div>
      <StepTitle title="신체 정보를 알려주세요" description="출생연도·키·몸무게를 넣으면 하루 열량과 단백질 목표를 계산해요" />

      <div className="flex flex-col gap-5">
        <div>
          <GroupLabel>성별</GroupLabel>
          <div className="grid grid-cols-3 gap-2">
            {GENDER_OPTIONS.map((opt) => (
              <ChoiceCard
                key={opt.key}
                align="center"
                selected={gender === opt.key}
                onClick={() => onChange("gender", opt.key)}
                title={opt.label}
              />
            ))}
          </div>
        </div>

        <Field
          label={
            <span className="flex items-center justify-between gap-3">
              출생연도
              {birthYear > 1920 && <span className="num text-label font-bold text-brand-ink">만 {age}세</span>}
            </span>
          }
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1920}
            max={currentYear - 10}
            value={birthYear || ""}
            onChange={(e) => onChange("birthYear", parseInt(e.target.value) || 0)}
            className="num font-bold text-center"
            placeholder="예: 1995"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="키 (cm)">
            <Input
              type="number"
              inputMode="numeric"
              min={100}
              max={250}
              value={heightCm || ""}
              onChange={(e) => onChange("heightCm", parseInt(e.target.value) || 0)}
              className="num font-bold text-center"
              placeholder="예: 170"
            />
          </Field>
          <Field label="체중 (kg)">
            <Input
              type="number"
              inputMode="numeric"
              min={20}
              max={300}
              value={weightKg || ""}
              onChange={(e) => onChange("weightKg", parseInt(e.target.value) || 0)}
              className="num font-bold text-center"
              placeholder="예: 65"
            />
          </Field>
        </div>

        {bmi !== null && bmiCat !== null && <BmiCard bmi={bmi} category={bmiCat} title="체질량 분석" />}
      </div>
    </div>
  );
}

function BmiCard({ bmi, category, title }: { bmi: number; category: NutritionGoals["bmiCategory"]; title: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-label font-bold text-ink">{title}</span>
        <div className="flex items-center gap-2">
          <span className="num text-title font-bold text-ink">{bmi}</span>
          <span className="text-caption text-ink-2">kg/m²</span>
          <Badge tone={BMI_TONE[category]}>{BMI_LABELS[category]}</Badge>
        </div>
      </div>
      <BMIBar bmi={bmi} />
      <div className="flex justify-between text-caption text-ink-2 mt-1.5">
        <span>저체중</span>
        <span>정상</span>
        <span>과체중</span>
        <span>비만</span>
      </div>
    </Card>
  );
}

function BMIBar({ bmi }: { bmi: number }) {
  const pct = Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100));
  return (
    <div className="relative h-3">
      <div className="absolute inset-0 rounded-full overflow-hidden flex">
        <div className="flex-1 bg-protein" />
        <div className="flex-[1.8] bg-positive" />
        <div className="flex-[0.8] bg-brand" />
        <div className="flex-[6] bg-danger" />
      </div>
      <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${pct}%` }}>
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 size-3 rounded-full bg-ink border-2 border-surface" />
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
      <StepTitle title="평소 식사 패턴은?" description="식단 추천 개수와 구성을 조절해요" />

      <div className="flex flex-col gap-6">
        <div>
          <GroupLabel>하루 끼니 수</GroupLabel>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <ChoiceCard
                key={n}
                align="center"
                selected={mealsPerDay === n}
                onClick={() => onChange("mealsPerDay", n)}
                title={<span className="num text-title font-bold">{n}</span>}
                description="끼"
                className="py-3"
              />
            ))}
          </div>
        </div>

        <div>
          <GroupLabel>외식 빈도</GroupLabel>
          <div className="grid grid-cols-2 gap-2">
            {EATING_OUT_OPTIONS.map((opt) => (
              <ChoiceCard
                key={opt.key}
                align="center"
                size="sm"
                selected={eatingOutFreq === opt.key}
                onClick={() => onChange("eatingOutFreq", opt.key)}
                title={opt.label}
              />
            ))}
          </div>
        </div>

        <div>
          <GroupLabel>식단 유형</GroupLabel>
          <div className="flex flex-col gap-2">
            {DIET_OPTIONS.map((opt) => (
              <ChoiceCard
                key={opt.key}
                selected={dietType === opt.key}
                onClick={() => onChange("dietType", opt.key)}
                title={opt.label}
                description={opt.desc}
              />
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
      <StepTitle
        title="알레르기가 있으신가요?"
        description="해당 원재료가 포함된 식품을 제외합니다"
        note="(여러 개 고를 수 있어요)"
      />

      <div className="flex flex-wrap gap-2">
        {ALLERGIES.map((a) => {
          const isSelected = selected.includes(a.key);
          return (
            <Chip key={a.key} selected={isSelected} onClick={() => onToggle(a.key)}>
              {isSelected && <Icon name="check" size={16} />}
              {a.label}
            </Chip>
          );
        })}
      </div>

      <Notice className="mt-6">없으면 아래 &quot;건너뛰기&quot;를 눌러 주세요</Notice>
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
  const SENSITIVITY_ROWS: { key: "digestive" | "additive"; title: string; desc: string }[] = [
    { key: "digestive", title: "소화 민감도", desc: "배가 예민한 편인가요?" },
    { key: "additive", title: "첨가물 민감도", desc: "식품첨가물에 신경 쓰는 편인가요?" },
  ];

  return (
    <div>
      <StepTitle title="맛 선호도를 알려주세요" description="영양성분 데이터 기반으로 입맛에 맞는 식품을 찾아요" />

      <div className="flex flex-col gap-3">
        {TASTE_CONFIG.map((t) => {
          const value = tastes[t.key];
          const last = t.benchmarks.length - 1;
          return (
            <Card key={t.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-body font-bold text-ink">{t.label}</span>
                <span className="num text-body font-bold text-brand-ink">{value}</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={value}
                onChange={(e) => onTasteChange(t.key, Number(e.target.value) as TasteLevel)}
                className="ds-range"
                aria-label={`${t.label} 선호도`}
              />
              <div className="relative h-5 mt-1">
                {t.benchmarks.map((b, i) => (
                  <span
                    key={b.lv}
                    className={cn(
                      "absolute top-0 whitespace-nowrap text-caption",
                      i === last ? "-translate-x-full" : "-translate-x-1/2",
                      value === b.lv ? "text-ink font-bold" : "text-ink-3",
                    )}
                    style={{ left: `${((b.lv - 1) / 9) * 100}%` }}
                  >
                    {b.name}
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 민감도 */}
      <div className="mt-8 pt-6 border-t border-line">
        <h2 className="text-body font-bold text-ink mb-3">민감도</h2>
        <div className="flex flex-col gap-3">
          {SENSITIVITY_ROWS.map((row) => (
            <Card key={row.key}>
              <p className="text-body font-bold text-ink">{row.title}</p>
              <p className="text-label text-ink-2 mb-3">{row.desc}</p>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 3] as SensitivityLevel[]).map((level) => (
                  <ChoiceCard
                    key={level}
                    align="center"
                    size="sm"
                    selected={sensitivity[row.key] === level}
                    onClick={() => onSensitivityChange(row.key, level)}
                    title={SENSITIVITY_LABELS[level]}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   결과 화면의 제품 미리보기 — 방금 고른 목표·입맛으로 추천 API 를 불러 세 개만
   ════════════════════════════════════════════ */

function ResultPreview({ makeProfile }: { makeProfile: () => ReturnType<typeof buildProfile> }) {
  // 결과 화면에 들어온 순간의 답으로 한 번만 만든다 (렌더마다 만들면 요청이 되풀이된다)
  const [profile] = useState(makeProfile);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [items, setItems] = useState<QuickProduct[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        if (!alive) return;
        setItems(pickSlots(data.recommendations || []));
        setStatus("ready");
      })
      .catch(() => { if (alive) setStatus("error"); });
    return () => { alive = false; };
  }, [profile, reload]);

  // 제품을 눌러 나가도 답이 남게 — 휴대폰 저장은 바로, 서버 저장은 이어서 (식단 채우기를 누르면 한 번 더 저장한다)
  const keep = () => {
    persistProfile(profile).catch(() => {}); // ds-allow: 휴대폰에는 이미 저장됐다
  };

  return (
    <section className="mt-8">
      <SectionHeader title="이 기준으로 고른 제품" />
      {status === "loading" && (
        <div className="flex gap-3 overflow-hidden -mx-4 px-4 pb-2" aria-label="추천 제품을 불러오는 중">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="w-44 h-60 shrink-0 rounded-lg" />)}
        </div>
      )}
      {status === "error" && (
        <EmptyState
          title="추천 제품을 불러오지 못했어요"
          description="연결이 잠깐 끊겼을 수 있어요. 식단 채우기는 그대로 할 수 있어요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setStatus("loading"); setReload((k) => k + 1); }}>다시 불러오기</Button>}
        />
      )}
      {status === "ready" && items.length === 0 && (
        <EmptyState
          title="조건에 맞는 제품이 아직 없어요"
          description="알레르기·식단 조건이 겹치면 고를 제품이 적어요. 식단 리스트에서 직접 찾아 담을 수 있어요"
        />
      )}
      {status === "ready" && items.length > 0 && (
        <>
          <ProductCards products={items} showMatch onOpen={keep} placement="onboarding_preview" />
          <p className="text-caption text-ink-2 mt-1">아래 버튼을 누르면 이런 제품으로 이번 주 끼니를 채워요</p>
        </>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════
   Step 6: 영양 분석 결과
   ════════════════════════════════════════════ */

function StepResult({
  goals,
  nutritionGoals,
  hasBodyInfo,
  makeProfile,
  onEditBody,
  bodyInfo,
}: {
  goals: HealthGoal[];
  nutritionGoals: NutritionGoals | null;
  hasBodyInfo: boolean;
  makeProfile: () => ReturnType<typeof buildProfile>;
  onEditBody: () => void;
  bodyInfo: BodyInfo;
}) {
  const currentYear = new Date().getFullYear();
  const age = currentYear - bodyInfo.birthYear;
  const genderLabel = bodyInfo.gender === "male" ? "남성" : bodyInfo.gender === "female" ? "여성" : "";
  const effectiveGoals = goals.length > 0 ? goals : (["balanced"] as HealthGoal[]);

  return (
    <div>
      {/* 머리 */}
      <div className="text-center mb-6">
        <p className="text-caption font-bold text-brand-ink mb-1">케어푸드 맞춤 영양 분석</p>
        <h1 className="text-title font-bold text-ink">나의 영양 분석 결과</h1>
        {hasBodyInfo && (
          <p className="text-label text-ink-2 mt-1">
            {[genderLabel, `만 ${age}세`, `${bodyInfo.heightCm}cm`, `${bodyInfo.weightKg}kg`].filter(Boolean).join(" · ")} 기준
          </p>
        )}
      </div>

      {hasBodyInfo && nutritionGoals ? (
        <div className="flex flex-col gap-3">
          {/* 하루 칼로리 + 영양소 */}
          <Card>
            <div className="flex justify-center py-2 mb-3">
              <Stat
                size="lg"
                emphasis
                label="하루 권장 칼로리"
                value={nutritionGoals.dailyCalories.toLocaleString()}
                unit="kcal"
                className="items-center"
              />
            </div>
            <MacroGrid
              values={{
                protein: nutritionGoals.dailyProteinG,
                carbs: (nutritionGoals.dailyCalories * nutritionGoals.carbRatio) / 100 / 4,
                fat: (nutritionGoals.dailyCalories * nutritionGoals.fatRatio) / 100 / 9,
                sodium: nutritionGoals.maxSodiumMg,
              }}
            />
            <p className="text-caption text-ink-3 mt-2">하루 기준 · 나트륨은 상한</p>
          </Card>

          <BmiCard bmi={nutritionGoals.bmi} category={nutritionGoals.bmiCategory} title="BMI" />

          {/* 3대 영양소 비율 */}
          <Card>
            <p className="text-label font-bold text-ink">3대 영양소 비율</p>
            <div className="flex h-7 rounded-full overflow-hidden text-caption font-bold text-surface mt-3">
              <div className="flex items-center justify-center bg-carbs" style={{ width: `${nutritionGoals.carbRatio}%` }}>
                <span className="num">{nutritionGoals.carbRatio}%</span>
              </div>
              <div className="flex items-center justify-center bg-protein" style={{ width: `${nutritionGoals.proteinRatio}%` }}>
                <span className="num">{nutritionGoals.proteinRatio}%</span>
              </div>
              <div className="flex items-center justify-center bg-fat" style={{ width: `${nutritionGoals.fatRatio}%` }}>
                <span className="num">{nutritionGoals.fatRatio}%</span>
              </div>
            </div>
            <div className="flex justify-between text-caption text-ink-2 mt-1.5">
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-carbs" aria-hidden="true" />탄수화물</span>
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-protein" aria-hidden="true" />단백질</span>
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-fat" aria-hidden="true" />지방</span>
            </div>
          </Card>

          {/* 주요 기준 */}
          <Card>
            <p className="text-label font-bold text-ink">주요 기준</p>
            <div className="mt-3 flex flex-col gap-2">
              {[
                { label: "나트륨 상한", value: `${nutritionGoals.maxSodiumMg.toLocaleString()}mg 이하/일`, dot: "bg-sodium" },
                { label: "당류 상한", value: `${nutritionGoals.maxSugarG}g 이하/일`, dot: "bg-carbs" },
                { label: "식이섬유 권장", value: `${nutritionGoals.minFiberG}g 이상/일`, dot: "bg-positive" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center gap-3 text-label">
                  <span className="text-ink-2 flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", item.dot)} aria-hidden="true" />
                    {item.label}
                  </span>
                  <span className="num font-bold text-ink">{item.value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 맞춤 전략 */}
          <Card>
            <p className="text-label font-bold text-ink">맞춤 케어 전략</p>
            <p className="text-label text-ink mt-2 mb-3">{nutritionGoals.strategySummary}</p>
            <div className="flex flex-wrap gap-1.5">
              {nutritionGoals.strategyTags.map((tag) => (
                <Badge key={tag} tone="brand">#{tag}</Badge>
              ))}
            </div>
          </Card>

          {/* 끼니당 기준 */}
          <Card tone="brand">
            <p className="text-label font-bold text-brand-ink">끼니당 추천 기준</p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <Stat value={nutritionGoals.perMeal.caloriesMax} unit="kcal" label="이하" />
              <Stat value={nutritionGoals.perMeal.maxSodiumMg} unit="mg" label="나트륨 이하" />
              <Stat value={`${nutritionGoals.perMeal.minProteinG}+`} unit="g" label="단백질 이상" />
            </div>
          </Card>
        </div>
      ) : (
        /* 신체 정보 없을 때 — 고른 목표 + 신체 정보를 넣으러 가는 길 (전에는 같은 목표 배지를 두 카드에 되풀이했다) */
        <Card>
          <p className="text-label font-bold text-ink">고른 목표</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {effectiveGoals.map((g) => (
              <Badge key={g} tone="brand">{HEALTH_GOAL_LABELS[g].label}</Badge>
            ))}
          </div>
          <p className="text-label text-ink-2 mt-4">
            출생연도·키·몸무게를 넣으면 하루 열량과 단백질 목표를 계산하고, 그 기준으로 끼니 양을 맞춰요
          </p>
          <Button variant="secondary" size="sm" icon="chevron-left" className="mt-3" onClick={onEditBody}>
            신체 정보 넣기
          </Button>
        </Card>
      )}

      <ResultPreview makeProfile={makeProfile} />

      {/* 면책 */}
      <Notice className="mt-6 text-center">
        이 분석은 성분 정보와 통계 데이터에 기반한 참고용이며, 의학적 진단이나 처방을 대체하지 않습니다.
      </Notice>
    </div>
  );
}
