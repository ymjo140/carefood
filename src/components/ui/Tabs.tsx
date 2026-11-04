"use client";

import { cn } from "./cn";

export type TabItem<T extends string> = { value: T; label: string; count?: number };

/**
 * 탭
 * - variant="pill": 화면 상단의 보기 전환 (추천 / 팔로잉 / 내 관심사)
 * - variant="line": 카드·시트 안의 입력 방법 전환 (검색 / 즐겨찾기 / 직접 입력)
 */
export function Tabs<T extends string>({
  items, value, onChange, variant = "pill", className, label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  variant?: "pill" | "line";
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(variant === "pill" ? "flex gap-1.5 scroll-row" : "flex border-b border-line", className)}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors shrink-0",
              variant === "pill" && "h-9 px-4 rounded-full text-label",
              variant === "pill" && (active ? "bg-ink text-canvas font-bold" : "text-ink-2 font-medium hover:bg-sunken hover:text-ink"),
              variant === "line" && "flex-1 h-11 px-2 text-label border-b-2 -mb-px",
              variant === "line" && (active ? "border-brand text-ink font-bold" : "border-transparent text-ink-2 font-medium hover:text-ink"),
            )}
          >
            {it.label}
            {typeof it.count === "number" && it.count > 0 && <span className="num text-caption text-ink-3">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
