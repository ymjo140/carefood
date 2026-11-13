import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * 영양 표시 — 단백질·탄수화물·지방·나트륨은 어느 화면이든 같은 색입니다.
 */
export type Macro = "protein" | "carbs" | "fat" | "sodium";

/** 영양소 색은 숫자·막대·점에만. 타일 바탕은 늘 회색(sunken) */
export const MACRO_META: Record<Macro, { label: string; unit: string; text: string; bg: string; fill: string }> = {
  protein: { label: "단백질", unit: "g", text: "text-protein", bg: "bg-sunken", fill: "bg-protein" },
  carbs: { label: "탄수화물", unit: "g", text: "text-carbs", bg: "bg-sunken", fill: "bg-carbs" },
  fat: { label: "지방", unit: "g", text: "text-fat", bg: "bg-sunken", fill: "bg-fat" },
  sodium: { label: "나트륨", unit: "mg", text: "text-sodium", bg: "bg-sunken", fill: "bg-sodium" },
};

function fmt(v: number | null | undefined, digits = 0) {
  if (v == null || Number.isNaN(v)) return "–";
  const r = digits > 0 ? Math.round(v * 10 ** digits) / 10 ** digits : Math.round(v);
  return r.toLocaleString("ko-KR");
}

/** 진행 막대 */
export function ProgressBar({ value, max = 100, tone = "brand", className, label }: {
  value: number; max?: number; tone?: Macro | "brand" | "positive" | "caution" | "danger"; className?: string; label?: string;
}) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const fill = tone in MACRO_META ? MACRO_META[tone as Macro].fill
    : tone === "positive" ? "bg-positive" : tone === "caution" ? "bg-ink-2" : tone === "danger" ? "bg-danger" : "bg-brand";
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-sunken overflow-hidden", className)}
      role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full w-full rounded-full origin-left transition-transform duration-420 ease-out", fill)} style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

/** 영양 타일 — 4칸 격자로 씀 (MacroGrid) */
export function MacroStat({ macro, value, target, digits = 0 }: { macro: Macro; value: number | null | undefined; target?: number; digits?: number }) {
  const m = MACRO_META[macro];
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-md p-2.5 min-w-0", m.bg)}>
      <span className="text-caption text-ink-2">{m.label}</span>
      <span className={cn("num text-body font-bold leading-none", m.text)}>
        {/* 단위는 통째로 — 좁은 칸에서 'mg' 가 'm / g' 로 쪼개지지 않게 */}
        {fmt(value, digits)}<span className="inline-block text-caption font-medium ml-0.5">{m.unit}</span>
      </span>
      {target != null && <ProgressBar value={value || 0} max={target} tone={macro} label={`${m.label} 목표 대비`} />}
    </div>
  );
}

export function MacroGrid({ values, targets, className }: {
  values: Partial<Record<Macro, number | null | undefined>>;
  targets?: Partial<Record<Macro, number>>;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {(Object.keys(MACRO_META) as Macro[]).map((k) => (
        <MacroStat key={k} macro={k} value={values[k]} target={targets?.[k]} />
      ))}
    </div>
  );
}

/** 한 줄 영양 요약 — 카드·목록 안에서 (점 + 숫자) */
export function MacroInline({ values, className }: { values: Partial<Record<Macro, number | null | undefined>>; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1", className)}>
      {(Object.keys(MACRO_META) as Macro[]).filter((k) => values[k] != null && values[k] !== 0).map((k) => {
        const m = MACRO_META[k];
        return (
          <span key={k} className="inline-flex items-center gap-1 text-caption text-ink-2">
            <span className={cn("size-1.5 rounded-full", m.fill)} aria-hidden="true" />
            {m.label} <span className={cn("num font-bold", m.text)}>{fmt(values[k])}{m.unit}</span>
          </span>
        );
      })}
    </div>
  );
}

/** 핵심 숫자 — emphasis 는 한 화면에 하나 (형광펜) */
export function Stat({ label, value, unit, emphasis = false, size = "md", className }: {
  label: ReactNode; value: ReactNode; unit?: string; emphasis?: boolean; size?: "md" | "lg"; className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
      <span className={cn("num font-bold text-ink leading-none", size === "lg" ? "text-display" : "text-title")}>
        <span className={cn(emphasis && "highlight")}>{value}</span>
        {unit && <span className="text-label font-medium text-ink-2 ml-0.5">{unit}</span>}
      </span>
      <span className="text-caption text-ink-2">{label}</span>
    </div>
  );
}

/** 칼로리 표기 */
export function Kcal({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn("num font-bold text-ink", className)}>{fmt(value)}<span className="text-caption font-medium text-ink-2 ml-0.5">kcal</span></span>;
}

/** 가격 표기 */
export function Price({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null) return null;
  return <span className={cn("num font-bold text-ink", className)}>{fmt(value)}<span className="text-caption font-medium text-ink-2 ml-0.5">원</span></span>;
}
