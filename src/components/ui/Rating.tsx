"use client";

import { cn } from "./cn";

/**
 * 별점 · 단계 입력
 * - RatingStars: 읽기 전용 별점 (평균은 반올림)
 * - RatingInput: 별점 고르기 (한 칸 44px)
 * - ScaleInput: 1~5 단계 고르기 (맛 체감·만족도 등), 칸을 똑같이 나눔
 * 별 문자(★ ⭐)를 쓰지 않고 여기 SVG 를 씁니다.
 */
const STAR = "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z";

function Star({ on, size }: { on: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      className={on ? "text-brand" : "text-line-strong"} fill="currentColor">
      <path d={STAR} />
    </svg>
  );
}

export function RatingStars({ value, size = 16, className }: { value: number; size?: number; className?: string }) {
  const r = Math.round(value);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`5점 만점에 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} on={n <= r} size={size} />)}
    </span>
  );
}

export function RatingInput({ value, onChange, label = "별점" }: { value: number; onChange: (v: number) => void; label?: string }) {
  return (
    <div className="flex" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n}점`}
          onClick={() => onChange(n)}
          className="size-11 inline-flex items-center justify-center rounded-md hover:bg-sunken transition-colors">
          <Star on={n <= value} size={28} />
        </button>
      ))}
    </div>
  );
}

export function ScaleInput({ value, onChange, min = 1, max = 5, label }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string;
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {steps.map((n) => {
        const on = n === value;
        return (
          <button key={n} type="button" role="radio" aria-checked={on} onClick={() => onChange(n)}
            className={cn(
              "flex-1 h-9 rounded-md text-label num transition-colors",
              on ? "bg-brand text-on-brand font-bold" : "bg-sunken text-ink-2 font-medium hover:text-ink",
            )}>
            {n}
          </button>
        );
      })}
    </div>
  );
}
