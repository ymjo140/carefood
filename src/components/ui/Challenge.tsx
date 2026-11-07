import { cn } from "./cn";
import { Icon } from "./Icon";

export type DayDot = { date: string; state: "done" | "missed" | "today" | "future" };

const STATE_LABEL: Record<DayDot["state"], string> = { done: "해냈어요", missed: "못 했어요", today: "오늘", future: "아직" };

/**
 * 챌린지 날짜 줄 — 해낸 날은 채운 동그라미, 못 한 날은 옅은 선, 오늘은 진한 테두리, 남은 날은 점선.
 * 색만으로 구분하지 않도록 해낸 날에는 체크, 나머지는 몇째 날인지 숫자를 쓴다.
 */
export function DayDots({ days, className }: { days: DayDot[]; className?: string }) {
  return (
    <ol className={cn("flex gap-1.5", className)} aria-label="날짜별 진행">
      {days.map((d, i) => (
        <li key={d.date} aria-label={`${i + 1}일째 ${STATE_LABEL[d.state]}`}
          className={cn(
            "size-8 rounded-full flex items-center justify-center shrink-0 text-caption num",
            d.state === "done" && "bg-brand text-on-brand",
            d.state === "missed" && "bg-sunken text-ink-3",
            d.state === "today" && "border-2 border-brand-ink text-brand-ink font-bold",
            d.state === "future" && "border border-dashed border-line-strong text-ink-3",
          )}>
          {d.state === "done" ? <Icon name="check" size={16} /> : i + 1}
        </li>
      ))}
    </ol>
  );
}
