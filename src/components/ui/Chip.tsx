import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * 칩 — 눌러서 고르는 필터·선택지. 고른 상태는 브랜드 색 테두리 + 옅은 바탕.
 * 누를 수 없는 라벨은 Badge 를 씁니다.
 */
export function Chip({
  selected = false, size = "md", children, className, ...rest
}: { selected?: boolean; size?: "sm" | "md"; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-full border whitespace-nowrap transition-colors shrink-0",
        size === "sm" ? "h-8 px-3 text-caption" : "h-9 px-3.5 text-label",
        selected
          ? "border-brand bg-brand-soft text-brand-ink font-bold"
          : "border-line bg-surface text-ink-2 font-medium hover:border-line-strong hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 칩 줄 — 넘치면 가로 스크롤 */
export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex gap-2 scroll-row -mx-4 px-4", className)}>{children}</div>;
}
