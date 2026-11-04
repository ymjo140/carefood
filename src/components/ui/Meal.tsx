import type { ReactNode } from "react";
import { cn } from "./cn";

/** 끼니 — 색은 점·세로줄로만 표시합니다 (글자는 기본 잉크) */
export type MealKey = "breakfast" | "lunch" | "dinner" | "snack" | "supplement";

export const MEAL_META: Record<MealKey, { label: string; dot: string; stripe: string }> = {
  breakfast: { label: "아침", dot: "bg-meal-breakfast", stripe: "border-l-meal-breakfast" },
  lunch: { label: "점심", dot: "bg-meal-lunch", stripe: "border-l-meal-lunch" },
  dinner: { label: "저녁", dot: "bg-meal-dinner", stripe: "border-l-meal-dinner" },
  snack: { label: "간식", dot: "bg-meal-snack", stripe: "border-l-meal-snack" },
  supplement: { label: "간식", dot: "bg-meal-snack", stripe: "border-l-meal-snack" },
};

export function mealMeta(key: string | null | undefined) {
  return MEAL_META[(key as MealKey) in MEAL_META ? (key as MealKey) : "snack"];
}

export function MealTag({ meal, className }: { meal: string; className?: string }) {
  const m = mealMeta(meal);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-label font-bold text-ink", className)}>
      <span className={cn("size-2 rounded-full", m.dot)} aria-hidden="true" />
      {m.label}
    </span>
  );
}

/** 끼니 칸 — 왼쪽 세로줄 + 내용. 비어 있으면 점선 + 추가 동작 */
export function MealSlot({ meal, right, children, empty = false, onAdd, addLabel = "음식 추가하기" }: {
  meal: string; right?: ReactNode; children?: ReactNode; empty?: boolean; onAdd?: () => void; addLabel?: string;
}) {
  const m = mealMeta(meal);
  if (empty) {
    return (
      <button type="button" onClick={onAdd}
        className="w-full flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-4 h-14 text-left hover:border-line-strong transition-colors">
        <MealTag meal={meal} />
        <span className="text-label text-ink-3">+ {addLabel}</span>
      </button>
    );
  }
  return (
    <div className={cn("rounded-lg border border-line bg-surface border-l-4 px-4 py-3", m.stripe)}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <MealTag meal={meal} />
        {right}
      </div>
      {children}
    </div>
  );
}
