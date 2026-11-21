"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { cn } from "./cn";

/**
 * 접고 펴는 묶음 — 필터처럼 고를 것이 많은 곳에서 묶음마다 한 줄로 접어 둔다.
 * 제목 아래 summary 에 지금 고른 값을 한 줄로 (고른 게 있으면 active → brand-ink, 없으면 "전체" 같은 회색).
 * 누르는 줄 전체가 버튼(높이 56)이고 aria-expanded 로 열림을 알린다. 펼칠 때는 내용만 fade-in — 높이를 움직이지 않는다.
 * 묶음끼리는 아래 선(line)으로 나눈다 — 카드·그림자 없음.
 */
export function Disclosure({ title, summary, active = false, defaultOpen = false, children, className }: {
  title: string;
  summary?: ReactNode;
  active?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={cn("border-b border-line", className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="w-full min-h-14 py-3 flex items-center justify-between gap-3 text-left rounded-md focus-visible:outline-2 focus-visible:outline-brand-ink">
        <span className="min-w-0">
          <span className="block text-label font-bold text-ink">{title}</span>
          {summary != null && (
            <span className={cn("block text-caption mt-0.5 truncate", active ? "text-brand-ink font-medium" : "text-ink-2")}>{summary}</span>
          )}
        </span>
        <Icon name="chevron-down" size={20} className={cn("shrink-0 text-ink-2 transition-transform duration-150 ease-out", open && "rotate-180")} />
      </button>
      {open && <div id={id} className="pb-4 animate-fade-in">{children}</div>}
    </section>
  );
}
