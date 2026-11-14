"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * 그래프 — 성과·수요·정산 대시보드용 (dataviz 규칙: 축 하나, 가는 선, 범례, 마우스·키보드로 값 보기, 표로도 읽힘)
 * 색: 이번 값은 강조색(brand) 하나, 비교(지난 기간)는 회색 점선. 글자는 늘 ink 계열 — 선 색으로 글자를 칠하지 않는다.
 * 움직임 없음(값이 바뀌어도 그대로 다시 그린다). 위치·너비 계산값만 style 로.
 */

type TrendPoint = { label: string; value: number; prev?: number | null };

/** 하루별 추이 — 이번 기간(선) + 지난 기간(회색 점선). 올리면 그날 값 */
export function TrendChart({ data, format, label, prevLabel = "지난 기간", height = 160 }: {
  data: TrendPoint[]; format: (n: number) => string; label: string; prevLabel?: string; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const W = 600, H = height, PAD = 6;
  const hasPrev = data.some((d) => d.prev !== null && d.prev !== undefined);
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.prev ?? 0)));
  const x = (i: number) => (data.length <= 1 ? W / 2 : (i / (data.length - 1)) * W);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const path = (vals: (number | null | undefined)[]) =>
    vals.map((v, i) => (v === null || v === undefined ? "" : `${i === 0 || vals[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join(" ");
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((e.clientX - r.left) / r.width) * (data.length - 1)))));
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(data.length - 1, (h ?? -1) + 1)); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? data.length) - 1)); }
    if (e.key === "Escape") setHover(null);
  };
  const h = hover !== null ? data[hover] : null;
  const mid = Math.floor((data.length - 1) / 2);

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center gap-4 text-caption text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-brand" aria-hidden />{label}</span>
        {hasPrev && <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-ink-3" aria-hidden />{prevLabel}</span>}
        <span className="ml-auto num">최고 {format(max)}</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-brand-ink rounded-sm" style={{ height }}
          role="img" aria-label={`${label} 하루별 추이. 화살표 키로 날마다 값을 볼 수 있어요`} aria-describedby={`${id}-t`} tabIndex={0}
          onPointerMove={pick} onPointerLeave={() => setHover(null)} onKeyDown={key} onBlur={() => setHover(null)}>
          {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <line x1={0} x2={W} y1={H - PAD} y2={H - PAD} className="stroke-line-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {hasPrev && <path d={path(data.map((d) => d.prev))} fill="none" className="stroke-ink-3" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          <path d={path(data.map((d) => d.value))} fill="none" className="stroke-brand" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="stroke-ink-3" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {h && hover !== null && (
          <>
            <span className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-surface" style={{ left: `${(x(hover) / W) * 100}%`, top: y(h.value) }} aria-hidden />
            <div role="status" className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-surface px-3 py-2 text-caption shadow-overlay whitespace-nowrap"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > data.length / 2 ? "calc(-100% - 8px)" : "8px"})` }}>
              <p className="text-ink-2">{h.label}</p>
              <p className="num font-bold text-ink">{format(h.value)}</p>
              {h.prev !== null && h.prev !== undefined && <p className="num text-ink-2">{prevLabel} {format(h.prev)}</p>}
            </div>
          </>
        )}
      </div>
      <div className="flex justify-between text-caption text-ink-2 num" aria-hidden>
        <span>{data[0]?.label}</span>{data.length > 2 && <span>{data[mid]?.label}</span>}<span>{data[data.length - 1]?.label}</span>
      </div>
      <table id={`${id}-t`} className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>날</th><th>{label}</th>{hasPrev && <th>{prevLabel}</th>}</tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{format(d.value)}</td>{hasPrev && <td>{d.prev == null ? "—" : format(d.prev)}</td>}</tr>)}</tbody>
      </table>
    </figure>
  );
}

/** 가로 막대 목록 — 값이 큰 것 비교·단계별 줄어듦. 숫자는 막대 옆 글자로 (색으로만 말하지 않는다) */
export function BarList({ rows, max, className }: {
  rows: { key: string; label: ReactNode; value: number; display: string; sub?: ReactNode }[]; max?: number; className?: string;
}) {
  const top = Math.max(1, max ?? Math.max(0, ...rows.map((r) => r.value)));
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-label">
            <span className="min-w-0 truncate text-ink">{r.label}</span>
            <span className="num shrink-0 whitespace-nowrap text-ink">{r.display}{r.sub && <span className="ml-1.5 text-caption text-ink-2">{r.sub}</span>}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-sunken overflow-hidden" aria-hidden>
            <div className="h-full w-full rounded-full bg-brand origin-left" style={{ transform: `scaleX(${Math.max(0, Math.min(1, r.value / top))})` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

type GapPoint = { key: string; label: string; x: number; y: number };

/**
 * 빈틈 그림 — 가로: 찾는 사람 비율, 세로: 맞는 제품 수. 오른쪽 아래(많이 찾는데 제품이 적은 곳)를 옅게 칠해 먼저 보이게.
 * 점을 누르거나 Enter 로 고른다. 축은 하나씩(가로·세로가 다른 값이라 두 개의 y축이 아니다)
 */
export function GapChart({ points, selected, onSelect, xLabel, yLabel, xFormat, yFormat }: {
  points: GapPoint[]; selected?: string | null; onSelect?: (key: string) => void;
  xLabel: string; yLabel: string; xFormat: (n: number) => string; yFormat: (n: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 600, H = 300, P = 16;
  const xMax = Math.max(1, ...points.map((p) => p.x)) * 1.1;
  const yMax = Math.max(1, ...points.map((p) => p.y)) * 1.1;
  const xs = [...points.map((p) => p.x)].sort((a, b) => a - b), ys = [...points.map((p) => p.y)].sort((a, b) => a - b);
  const xMid = xs.length ? xs[Math.floor(xs.length / 2)] : xMax / 2, yMid = ys.length ? ys[Math.floor(ys.length / 2)] : yMax / 2;
  const sx = (v: number) => P + (v / xMax) * (W - P * 2);
  const sy = (v: number) => H - P - (v / yMax) * (H - P * 2);
  const gap = (p: GapPoint) => p.x >= xMid && p.y <= yMid;
  const shown = points.find((p) => p.key === (hover ?? selected));

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="group" aria-label={`${yLabel}와 ${xLabel}. 오른쪽 아래가 많이 찾는데 제품이 적은 곳이에요`}>
          <rect x={sx(xMid)} y={sy(yMid)} width={W - P - sx(xMid)} height={H - P - sy(yMid)} className="fill-sunken" rx={8} />
          <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="stroke-line-strong" strokeWidth={1} />
          <line x1={P} x2={P} y1={P} y2={H - P} className="stroke-line-strong" strokeWidth={1} />
          {points.map((p) => {
            const on = p.key === selected, hot = p.key === hover;
            return (
              <circle key={p.key} cx={sx(p.x)} cy={sy(p.y)} r={on || hot ? 9 : 7} tabIndex={onSelect ? 0 : -1} role={onSelect ? "button" : undefined}
                aria-label={`${p.label}: ${xLabel} ${xFormat(p.x)}, ${yLabel} ${yFormat(p.y)}${gap(p) ? " · 빈틈" : ""}`} aria-pressed={onSelect ? on : undefined}
                className={cn(gap(p) ? "fill-brand" : "fill-ink-3", on ? "stroke-brand-ink" : "stroke-surface", onSelect && "cursor-pointer", "outline-none focus-visible:stroke-brand-ink")}
                strokeWidth={on ? 3 : 2}
                onPointerEnter={() => setHover(p.key)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(p.key)} onBlur={() => setHover(null)}
                onClick={() => onSelect?.(p.key)} onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(p.key); } }} />
            );
          })}
        </svg>
        {shown && (
          <div role="status" className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-3 py-2 text-caption shadow-overlay whitespace-nowrap"
            style={{ left: `${(sx(shown.x) / W) * 100}%`, top: `${(sy(shown.y) / H) * 100}%`, transform: `translate(${shown.x > xMax / 2 ? "calc(-100% - 12px)" : "12px"}, -50%)` }}>
            <p className="font-bold text-ink">{shown.label}</p>
            <p className="num text-ink-2">{xLabel} {xFormat(shown.x)} · {yLabel} {yFormat(shown.y)}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-caption text-ink-2">
        <span>↑ {yLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand" aria-hidden />많이 찾는데 제품이 적은 곳 <span className="size-2.5 rounded-full bg-ink-3 ml-2" aria-hidden />그 밖</span>
        <span>{xLabel} →</span>
      </div>
    </figure>
  );
}
