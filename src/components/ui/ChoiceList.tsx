"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

/**
 * 세로 선택 목록 — 한 화면 한 질문 폼에서 하나 고르기 ("다 드셨나요?")
 * 고른 줄은 brand 테두리 + 옅은 앰버 바탕 + 체크.
 * 짧은 선택지 여러 개를 가로로 고를 땐 Chip 을 씁니다.
 */
export type ChoiceTone = "positive" | "caution" | "danger" | "neutral";

const DOT: Record<ChoiceTone, string> = {
  positive: "bg-positive",
  caution: "bg-brand",
  danger: "bg-danger",
  neutral: "bg-line-strong",
};

export function ChoiceList<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: ReactNode; tone?: ChoiceTone }[];
  value: T | null;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={label}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button key={String(opt.value)} type="button" role="radio" aria-checked={on} onClick={() => onChange(opt.value)}
            className={cn(
              "press w-full flex items-center gap-3 min-h-12 px-4 py-2 rounded-md border text-left",
              on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
            )}>
            {opt.tone && <span className={cn("size-2.5 rounded-full shrink-0", DOT[opt.tone])} aria-hidden="true" />}
            <span className={cn("flex-1 text-body", on ? "font-bold text-ink" : "font-medium text-ink")}>{opt.label}</span>
            {on && <Icon name="check" size={18} className="text-brand-ink shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
