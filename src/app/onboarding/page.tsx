"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TasteLevel } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { saveProfile } from "@/app/auth/actions";

// ── 타입 ─────────────────────────────────────────────
type Persona = "elderly" | "patient" | "pregnant" | "general";
type OrdererRelation = "self" | "guardian" | "caregiver" | "spouse";

type OnboardingState = {
  persona: Persona | null;
  ordererRelation: OrdererRelation;
  conditions: string[];
  allergies: string[];
  pregnancyStage: string | null;
  healthGoal: string | null;
  tastes: { salty: TasteLevel; sweet: TasteLevel; spicy: TasteLevel; fatty: TasteLevel };
};

// ── 상수 ─────────────────────────────────────────────
const PERSONAS: { key: Persona; emoji: string; label: string; desc: string; color: string }[] = [
  { key: "elderly", emoji: "👴", label: "어르신", desc: "고령의 부모님을 위해", color: "border-amber-300 bg-amber-50 dark:bg-amber-950" },
  { key: "patient", emoji: "🏥", label: "환자", desc: "건강 관리가 필요한 분을 위해", color: "border-blue-300 bg-blue-50 dark:bg-blue-950" },
  { key: "pregnant", emoji: "🤰", label: "산모", desc: "임산부·산후 관리를 위해", color: "border-pink-300 bg-pink-50 dark:bg-pink-950" },
  { key: "general", emoji: "🥗", label: "일반", desc: "건강한 식생활을 위해", color: "border-green-300 bg-green-50 dark:bg-green-950" },
];

const CONDITIONS = [
  { key: "diabetes", label: "당뇨", emoji: "🩸" },
  { key: "hypertension", label: "고혈압", emoji: "❤️" },
  { key: "kidney", label: "신장질환", emoji: "🫘" },
  { key: "gout", label: "통풍", emoji: "🦶" },
  { key: "hyperlipidemia", label: "고지혈증", emoji: "🧪" },
  { key: "elderly_soft", label: "연하곤란 (부드러운 음식 필요)", emoji: "🥄" },
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

const PREGNANCY_STAGES = [
  { key: "early", label: "임신 초기 (1~3개월)", emoji: "🌱" },
  { key: "mid", label: "임신 중기 (4~6개월)", emoji: "🌿" },
  { key: "late", label: "임신 후기 (7~9개월)", emoji: "🌳" },
  { key: "postpartum", label: "산후 조리", emoji: "🤱" },
];

const HEALTH_GOALS = [
  { key: "weight_loss", label: "체중 관리", emoji: "⚖️" },
  { key: "muscle_gain", label: "근육 증가", emoji: "💪" },
  { key: "balanced", label: "균형 잡힌 식단", emoji: "🥗" },
  { key: "recovery", label: "회복 식단", emoji: "🩹" },
];

const ORDERER_OPTIONS: Record<Persona, { key: OrdererRelation; label: string }[]> = {
  elderly: [
    { key: "guardian", label: "자녀로서 부모님을 위해 주문해요" },
    { key: "self", label: "본인이 직접 주문해요" },
    { key: "caregiver", label: "간병인/도우미로서 주문해요" },
  ],
  patient: [
    { key: "self", label: "본인이 직접 주문해요" },
    { key: "caregiver", label: "간병인/보호자로서 주문해요" },
    { key: "guardian", label: "가족으로서 주문해요" },
  ],
  pregnant: [
    { key: "self", label: "본인이 직접 주문해요" },
    { key: "spouse", label: "배우자로서 주문해요" },
  ],
  general: [
    { key: "self", label: "본인이 직접 주문해요" },
  ],
};

const TASTE_CONFIG = [
  { key: "salty" as const, label: "짠맛", emoji: "🧂" },
  { key: "sweet" as const, label: "단맛", emoji: "🍬" },
  { key: "spicy" as const, label: "매운맛", emoji: "🌶️" },
  { key: "fatty" as const, label: "기름진맛", emoji: "🧈" },
];

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

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>({
    persona: null,
    ordererRelation: "self",
    conditions: [],
    allergies: [],
    pregnancyStage: null,
    healthGoal: null,
    tastes: { salty: 3, sweet: 3, spicy: 3, fatty: 3 },
  });

  // URL 파라미터로 페르소나 프리셋
  useEffect(() => {
    const p = searchParams.get("persona") as Persona | null;
    if (p && PERSONAS.some((pp) => pp.key === p)) {
      setState((prev) => ({ ...prev, persona: p }));
      setStep(1);
    }
  }, [searchParams]);

  // 스텝 구성 (페르소나에 따라 다름)
  const steps = getSteps(state.persona);
  const totalSteps = steps.length;
  const currentStepKey = steps[step] || "persona";

  const canProceed = (): boolean => {
    switch (currentStepKey) {
      case "persona": return state.persona !== null;
      case "orderer": return true;
      case "conditions": return true;
      case "pregnancy": return state.pregnancyStage !== null;
      case "goal": return state.healthGoal !== null;
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
      persona: state.persona,
      ordererRelation: state.ordererRelation,
      conditions: state.conditions,
      allergies: state.allergies,
      pregnancyStage: state.pregnancyStage,
      healthGoal: state.healthGoal,
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
          {steps.map((_, i) => (
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
          {currentStepKey === "persona" && (
            <StepPersona
              selected={state.persona}
              onSelect={(p) => setState((prev) => ({ ...prev, persona: p }))}
            />
          )}
          {currentStepKey === "orderer" && state.persona && (
            <StepOrderer
              persona={state.persona}
              selected={state.ordererRelation}
              onSelect={(r) => setState((prev) => ({ ...prev, ordererRelation: r }))}
            />
          )}
          {currentStepKey === "conditions" && (
            <StepConditions
              persona={state.persona!}
              selected={state.conditions}
              onToggle={(c) =>
                setState((prev) => ({
                  ...prev,
                  conditions: prev.conditions.includes(c)
                    ? prev.conditions.filter((x) => x !== c)
                    : [...prev.conditions, c],
                }))
              }
            />
          )}
          {currentStepKey === "pregnancy" && (
            <StepPregnancy
              selected={state.pregnancyStage}
              onSelect={(s) => setState((prev) => ({ ...prev, pregnancyStage: s }))}
            />
          )}
          {currentStepKey === "goal" && (
            <StepGoal
              selected={state.healthGoal}
              onSelect={(g) => setState((prev) => ({ ...prev, healthGoal: g }))}
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
              className="flex-1 border border-border py-3 rounded-xl font-medium hover:bg-card transition-colors"
            >
              이전
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex-1 bg-primary text-white py-3 rounded-xl font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === totalSteps - 1 ? "추천 받기" : "다음"}
          </button>
        </div>

        {/* 건너뛰기 */}
        {(currentStepKey === "allergies" || currentStepKey === "conditions") && (
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

// ── 스텝 정의 ────────────────────────────────────────
function getSteps(persona: Persona | null): string[] {
  const base = ["persona"];
  if (!persona) return base;

  // 일반은 주문자 관계 건너뜀 (무조건 self)
  if (persona !== "general") base.push("orderer");

  // 페르소나별 질문
  if (persona === "elderly" || persona === "patient") base.push("conditions");
  if (persona === "pregnant") base.push("pregnancy");
  if (persona === "general") base.push("goal");

  base.push("allergies", "tastes");
  return base;
}

// ── 서브 컴포넌트들 ──────────────────────────────────
function StepPersona({
  selected,
  onSelect,
}: {
  selected: Persona | null;
  onSelect: (p: Persona) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">
        누구를 위해 식품을 찾으시나요?
      </h1>
      <p className="text-muted text-sm mb-6">
        상황에 맞는 맞춤 추천을 해드립니다.
      </p>
      <div className="space-y-3">
        {PERSONAS.map((p) => (
          <button
            key={p.key}
            onClick={() => onSelect(p.key)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              selected === p.key
                ? `${p.color} border-primary scale-[1.01]`
                : "border-border hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{p.emoji}</span>
              <div>
                <div className="font-bold">{p.label}</div>
                <div className="text-sm text-muted">{p.desc}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepOrderer({
  persona,
  selected,
  onSelect,
}: {
  persona: Persona;
  selected: OrdererRelation;
  onSelect: (r: OrdererRelation) => void;
}) {
  const options = ORDERER_OPTIONS[persona] || [];
  const personaLabel = PERSONAS.find((p) => p.key === persona)?.label || "";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">
        주문하시는 분은 누구신가요?
      </h1>
      <p className="text-muted text-sm mb-6">
        {personaLabel}을 위한 주문 — 주문자에 따라 안내를 맞춤화합니다.
      </p>
      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              selected === opt.key
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            }`}
          >
            <span className="font-medium">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepConditions({
  persona,
  selected,
  onToggle,
}: {
  persona: Persona;
  selected: string[];
  onToggle: (c: string) => void;
}) {
  // 어르신용이면 연하곤란 포함, 환자용이면 전부
  const items =
    persona === "elderly"
      ? CONDITIONS
      : CONDITIONS.filter((c) => c.key !== "elderly_soft");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">
        해당되는 건강 상태를 선택하세요
      </h1>
      <p className="text-muted text-sm mb-6">
        선택하신 조건에 맞지 않는 식품을 자동으로 걸러드립니다.
        <br />
        <span className="text-xs">복수 선택 가능 · 없으면 건너뛰기</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        {items.map((c) => (
          <button
            key={c.key}
            onClick={() => onToggle(c.key)}
            className={`text-left p-3 rounded-xl border-2 transition-all ${
              selected.includes(c.key)
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            }`}
          >
            <span className="text-lg mr-1">{c.emoji}</span>
            <span className="text-sm font-medium">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepPregnancy({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (s: string) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">현재 어느 단계인가요?</h1>
      <p className="text-muted text-sm mb-6">
        시기에 따라 필요한 영양소가 달라집니다.
      </p>
      <div className="space-y-3">
        {PREGNANCY_STAGES.map((s) => (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              selected === s.key
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            }`}
          >
            <span className="text-xl mr-2">{s.emoji}</span>
            <span className="font-medium">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepGoal({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (g: string) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">건강 목표를 알려주세요</h1>
      <p className="text-muted text-sm mb-6">
        목표에 맞는 영양 기준으로 추천합니다.
      </p>
      <div className="space-y-3">
        {HEALTH_GOALS.map((g) => (
          <button
            key={g.key}
            onClick={() => onSelect(g.key)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              selected === g.key
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            }`}
          >
            <span className="text-xl mr-2">{g.emoji}</span>
            <span className="font-medium">{g.label}</span>
          </button>
        ))}
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
      <h1 className="text-2xl font-bold mb-2">알레르기가 있으신가요?</h1>
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
      <h1 className="text-2xl font-bold mb-2">맛 선호도를 알려주세요</h1>
      <p className="text-muted text-sm mb-6">
        영양성분 데이터 기반으로 입맛에 맞는 식품을 찾습니다.
      </p>
      <div className="space-y-6">
        {TASTE_CONFIG.map((t) => (
          <div key={t.key}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">
                {t.emoji} {t.label}
              </span>
              <span className="text-sm text-primary font-bold">
                {tastes[t.key]}단계
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={tastes[t.key]}
              onChange={(e) =>
                onChange(t.key, Number(e.target.value) as TasteLevel)
              }
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
    </div>
  );
}
