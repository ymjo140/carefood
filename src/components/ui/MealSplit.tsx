import { cn } from "./cn";

/**
 * 끼니별 열량 막대 — 하루 목표 열량을 한 줄로, 먹은 끼니는 채운 칸(brand), 아직 안 먹은 계획 끼니는 점선 칸.
 * 끼니는 색으로 나누지 않고 아래 글자로 (DESIGN.md: 끼니는 색 없이 글자로). 목표를 넘은 만큼은 그리지 않고 글로 말한다.
 */
export type MealSplitPart = { key: string; label: string; kcal: number; planned?: boolean };

export function MealSplit({ parts, goal, className }: { parts: MealSplitPart[]; goal: number; className?: string }) {
  const shown = parts.filter((p) => p.kcal > 0);
  const total = shown.reduce((a, p) => a + p.kcal, 0);
  const scale = goal > 0 ? Math.max(goal, total) : total || 1;
  const eaten = shown.filter((p) => !p.planned).reduce((a, p) => a + p.kcal, 0);
  const label = shown.length === 0
    ? "아직 기록한 끼니가 없어요"
    : shown.map((p) => `${p.label}${p.planned ? " 계획" : ""} ${Math.round(p.kcal)}kcal`).join(", ");
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex gap-0.5 h-2.5 rounded-full bg-sunken overflow-hidden" role="img" aria-label={`끼니별 열량: ${label}`}>
        {shown.map((p) => (
          <div key={p.key} style={{ width: `${(p.kcal / scale) * 100}%` }}
            className={cn("h-full first:rounded-l-full last:rounded-r-full",
              p.planned ? "border-2 border-dashed border-brand-ink bg-surface" : "bg-brand")} />
        ))}
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-ink-2">
          {shown.map((p) => (
            <span key={p.key} className="whitespace-nowrap">
              {p.label}{p.planned ? " 계획" : ""} <span className={cn("num", p.planned ? "text-ink-2" : "text-ink font-bold")}>{Math.round(p.kcal).toLocaleString("ko-KR")}</span>
            </span>
          ))}
          {total > goal && goal > 0 && <span className="whitespace-nowrap">목표보다 <span className="num">{Math.round(total - goal).toLocaleString("ko-KR")}</span> kcal 많아요</span>}
          {eaten === 0 && <span className="whitespace-nowrap">점선은 아직 안 먹은 계획</span>}
        </div>
      )}
    </div>
  );
}
