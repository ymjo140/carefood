"use client";

import { useState } from "react";
import Link from "next/link";
import type { TasteLevel } from "@/types/database";

type TasteState = {
  salty: TasteLevel;
  sweet: TasteLevel;
  spicy: TasteLevel;
  fatty: TasteLevel;
};

const TASTE_CONFIG = [
  { key: "salty" as const, label: "짠맛", emoji: "🧂", desc: "짠 음식을 얼마나 좋아하세요?" },
  { key: "sweet" as const, label: "단맛", emoji: "🍬", desc: "단 음식을 얼마나 좋아하세요?" },
  { key: "spicy" as const, label: "매운맛", emoji: "🌶️", desc: "매운 음식을 얼마나 좋아하세요?" },
  { key: "fatty" as const, label: "기름진맛", emoji: "🧈", desc: "기름진 음식을 얼마나 좋아하세요?" },
];

const LEVEL_LABELS: Record<number, string> = {
  1: "약하게",
  2: "조금",
  3: "보통",
  4: "강하게",
  5: "매우 강하게",
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [tastes, setTastes] = useState<TasteState>({
    salty: 3,
    sweet: 3,
    spicy: 3,
    fatty: 3,
  });

  const currentTaste = TASTE_CONFIG[step];
  const isLastStep = step === TASTE_CONFIG.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      // TODO: Supabase에 저장
      alert(
        `맛 프로필 설정 완료!\n짠맛: ${tastes.salty} / 단맛: ${tastes.sweet} / 매운맛: ${tastes.spicy} / 기름진맛: ${tastes.fatty}`
      );
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center">
          <Link href="/" className="text-lg font-bold text-primary">
            케어푸드
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* 진행 바 */}
          <div className="flex gap-2 mb-8">
            {TASTE_CONFIG.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>

          {/* 맛 설정 카드 */}
          {currentTaste && (
            <div className="text-center">
              <div className="text-6xl mb-4">{currentTaste.emoji}</div>
              <h1 className="text-2xl font-bold mb-2">{currentTaste.label}</h1>
              <p className="text-muted mb-8">{currentTaste.desc}</p>

              {/* 슬라이더 */}
              <div className="mb-4">
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={tastes[currentTaste.key]}
                  onChange={(e) =>
                    setTastes((prev) => ({
                      ...prev,
                      [currentTaste.key]: Number(e.target.value) as TasteLevel,
                    }))
                  }
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted mt-1">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                </div>
              </div>

              <div className="text-lg font-bold text-primary mb-8">
                {tastes[currentTaste.key]}단계 — {LEVEL_LABELS[tastes[currentTaste.key]]}
              </div>

              {/* 버튼 */}
              <div className="flex gap-3">
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
                  className="flex-1 bg-primary text-white py-3 rounded-xl font-medium hover:bg-primary-dark transition-colors"
                >
                  {isLastStep ? "완료" : "다음"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
