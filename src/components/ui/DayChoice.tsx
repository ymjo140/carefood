"use client";

import { cn } from "./cn";

/**
 * 날짜 하나 고르기 — 7칸 격자(요일 · 날짜 · 상태 한 줄). 고른 칸은 brand-soft 바탕 + brand 테두리.
 * 고를 수 없는 날(이미 기록한 끼니 등)은 disabled 로 흐리게 — 이유는 sub 글자로.
 * 라디오 묶음(role=radiogroup)이라 화살표가 아니라 Tab 으로 칸을 옮기고 Space·Enter 로 고른다. 누르는 영역 높이 64.
 */
export type DayChoiceItem = { key: string; top: string; mid: string; sub?: string; disabled?: boolean };

export function DayChoice({ items, value, onChange, label, className }: {
  items: DayChoiceItem[];
  value: string | null;
  onChange: (key: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid grid-cols-7 gap-1", className)}>
      {items.map((d) => {
        const on = d.key === value;
        return (
          <button key={d.key} type="button" role="radio" aria-checked={on} disabled={d.disabled}
            aria-label={`${d.mid} ${d.top}${d.sub ? ` · ${d.sub}` : ""}`}
            onClick={() => onChange(d.key)}
            className={cn(
              "press min-w-0 h-16 rounded-md border flex flex-col items-center justify-center gap-0.5 transition-colors duration-100",
              on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}>
            <span className="text-label font-bold text-ink">{d.top}</span>
            <span className="text-caption text-ink num">{d.mid}</span>
            {d.sub && <span className={cn("text-caption truncate max-w-full px-0.5", on ? "text-brand-ink font-medium" : "text-ink-2")}>{d.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
