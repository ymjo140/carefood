"use client";

import { cn } from "./cn";

/**
 * 켜고 끄기 — role="switch". 켜면 앰버 바탕(고른 상태), 끄면 진한 선 바탕.
 * 글자(label)와 보조 줄(description)을 같이 받아 한 줄 전체를 누를 수 있게 한다.
 */
export function Switch({ checked, onChange, label, description, disabled = false, className }: {
  checked: boolean; onChange: (next: boolean) => void; label: string; description?: string; disabled?: boolean; className?: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn("press w-full flex items-center gap-3 min-h-12 py-2 text-left disabled:opacity-50 disabled:cursor-default", className)}>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-body text-ink">{label}</span>
        {description && <span className="text-caption text-ink-2">{description}</span>}
      </span>
      <span aria-hidden="true" className={cn("relative shrink-0 w-11 h-7 rounded-full transition-colors duration-150", checked ? "bg-brand" : "bg-line-strong")}>
        <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-full bg-surface transition-transform duration-150 ease-out", checked && "translate-x-4")} />
      </span>
    </button>
  );
}
