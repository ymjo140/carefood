import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

/**
 * 선택 카드 — 칩보다 큰 선택지 (건강 목표 · 식단 유형 · 성별 · 끼니 수).
 * 고르면 brand 테두리 + 옅은 앰버 바탕. align="start" 는 오른쪽에 체크 표시.
 */
export function ChoiceCard({
  selected = false, onClick, title, description, align = "start", size = "md", className,
}: {
  selected?: boolean;
  onClick?: () => void;
  title: ReactNode;
  description?: ReactNode;
  align?: "start" | "center";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "press w-full rounded-lg border",
        selected ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
        align === "center" ? "flex flex-col items-center justify-center text-center" : "flex items-center gap-3 text-left",
        size === "sm" ? "min-h-11 px-3 py-2" : "min-h-14 px-4 py-3",
        className,
      )}
    >
      <span className={cn("min-w-0", align === "start" && "flex-1")}>
        <span className={cn("block text-ink", size === "sm" ? "text-label" : "text-body", selected ? "font-bold" : "font-medium")}>{title}</span>
        {description && <span className="block text-caption text-ink-2 mt-0.5">{description}</span>}
      </span>
      {align === "start" && (
        <span
          aria-hidden="true"
          className={cn(
            "size-6 rounded-full border flex items-center justify-center shrink-0 transition-colors",
            selected ? "bg-brand border-brand text-on-brand" : "border-line-strong text-transparent",
          )}
        >
          <Icon name="check" size={14} />
        </span>
      )}
    </button>
  );
}
