import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

/**
 * 배지 — 상태·출처·분류를 나타내는 작은 라벨 (누를 수 없음)
 *
 * 색 알약을 쓰지 않습니다 (suta: 상태마다 색 바탕은 AI 티).
 * 옅은 테두리 + 글자색으로만 구분하고, 주의는 색 대신 아이콘 모양으로 보입니다.
 *   neutral  분류·태그          brand   우리 서비스 출처(따라하기 등)
 *   positive 완료·적합          danger  경고·알레르기·실패
 *   caution  주의 (회색 + 경고 아이콘)
 *   protein/carbs/fat/sodium  영양소 (데이터 색)
 */
export type BadgeTone =
  | "neutral" | "brand" | "positive" | "caution" | "danger"
  | "protein" | "carbs" | "fat" | "sodium";

const tones: Record<BadgeTone, string> = {
  neutral: "text-ink-2",
  brand: "text-brand-ink",
  positive: "text-positive",
  caution: "text-ink-2",
  danger: "text-danger",
  protein: "text-protein",
  carbs: "text-carbs",
  fat: "text-fat",
  sodium: "text-sodium",
};

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-sm border border-line text-caption font-medium whitespace-nowrap", tones[tone], className)}>
      {(tone === "caution" || tone === "danger") && <Icon name="alert" size={12} />}
      {children}
    </span>
  );
}
