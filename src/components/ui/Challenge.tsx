import { cn } from "./cn";
import { Icon } from "./Icon";

export type DayDot = { date: string; state: "done" | "missed" | "today" | "future" | "before" };

const STATE_LABEL: Record<DayDot["state"], string> = { done: "해냈어요", missed: "못 했어요", today: "오늘", future: "아직", before: "들어오기 전" };

/**
 * 챌린지 날짜 줄 — 해낸 날은 채운 동그라미, 못 한 날은 옅은 선, 오늘은 진한 테두리, 남은 날은 점선.
 * 색만으로 구분하지 않도록 해낸 날에는 체크, 나머지는 몇째 날인지 숫자를 쓴다. 늦게 들어온 사람의 앞 날(before)은 빈 칸.
 * size="sm" 은 묶음 진행표처럼 한 줄에 사람 이름과 같이 놓을 때 (24px).
 */
export function DayDots({ days, size = "md", className, label = "날짜별 진행" }: { days: DayDot[]; size?: "sm" | "md"; className?: string; label?: string }) {
  return (
    <ol className={cn("flex flex-wrap", size === "sm" ? "gap-1" : "gap-1.5", className)} aria-label={label}>
      {days.map((d, i) => (
        <li key={d.date} aria-label={`${i + 1}일째 ${STATE_LABEL[d.state]}`}
          className={cn(
            "rounded-full flex items-center justify-center shrink-0 text-caption num",
            size === "sm" ? "size-6" : "size-8",
            d.state === "done" && "bg-brand text-on-brand",
            d.state === "missed" && "bg-sunken text-ink-3",
            d.state === "today" && "border-2 border-brand-ink text-brand-ink font-bold",
            d.state === "future" && "border border-dashed border-line-strong text-ink-3",
            d.state === "before" && "text-ink-3",
          )}>
          {d.state === "done" ? <Icon name="check" size={size === "sm" ? 14 : 16} /> : d.state === "before" ? "·" : size === "sm" ? null : i + 1}
        </li>
      ))}
    </ol>
  );
}
