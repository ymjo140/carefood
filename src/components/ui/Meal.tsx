import type { ReactNode } from "react";
import { cn } from "./cn";

/** 끼니 — 색을 쓰지 않고 글자로만 구분합니다 (suta: UI 유채색은 강조색 + 오류 빨강) */
export type MealKey = "breakfast" | "lunch" | "dinner" | "snack" | "supplement";

export const MEAL_META: Record<MealKey, { label: string }> = {
  breakfast: { label: "아침" },
  lunch: { label: "점심" },
  dinner: { label: "저녁" },
  snack: { label: "간식" },
  supplement: { label: "간식" },
};

export function mealMeta(key: string | null | undefined) {
  return MEAL_META[(key as MealKey) in MEAL_META ? (key as MealKey) : "snack"];
}

export function MealTag({ meal, className }: { meal: string; className?: string }) {
  const m = mealMeta(meal);
  return (
    <span className={cn("inline-flex items-center text-label font-bold text-ink", className)}>
      {m.label}
    </span>
  );
}

/** 끼니 칸 — 끼니 이름 + 내용. 비어 있으면 점선 + 추가 동작 */
export function MealSlot({ meal, right, children, empty = false, onAdd, addLabel = "음식 추가하기" }: {
  meal: string; right?: ReactNode; children?: ReactNode; empty?: boolean; onAdd?: () => void; addLabel?: string;
}) {
  if (empty) {
    return (
      <button type="button" onClick={onAdd}
        className="press w-full flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-4 h-14 text-left hover:border-line-strong">
        <MealTag meal={meal} />
        <span className="text-label text-ink-3">+ {addLabel}</span>
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <MealTag meal={meal} />
        {right}
      </div>
      {children}
    </div>
  );
}
