import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * 배지 — 상태·출처·분류를 나타내는 작은 라벨 (누를 수 없음)
 * 같은 의미는 어느 화면에서든 같은 tone: 승인 대기·주의 = caution, 완료·적합 = positive
 */
export type BadgeTone =
  | "neutral" | "brand" | "positive" | "caution" | "danger"
  | "protein" | "carbs" | "fat" | "sodium";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-2",
  brand: "bg-brand-soft text-brand-ink",
  positive: "bg-positive-soft text-positive",
  caution: "bg-caution-soft text-caution",
  danger: "bg-danger-soft text-danger",
  protein: "bg-protein-soft text-protein",
  carbs: "bg-carbs-soft text-carbs",
  fat: "bg-fat-soft text-fat",
  sodium: "bg-sodium-soft text-sodium",
};

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-sm text-caption font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}
