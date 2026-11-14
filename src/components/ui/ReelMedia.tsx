"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { ProductImage } from "./ProductImage";

/**
 * 숏폼 보기 위쪽 — 사진을 옆으로 넘기고(스냅), 위 띠에 몇 번째 사진인지 · 올린 사람 · 닫기.
 * 사진이 없으면 제품 사진 한 장(fallback). 화면 폭을 꽉 채우도록 부모의 좌우 여백만큼 바깥으로 나간다(-mx-4).
 */
export function ReelMedia({ urls, fallback, alt, header, closeHref, className }: {
  urls: string[]; fallback?: string | null; alt: string;
  /** 위 띠의 올린 사람 줄 */
  header: ReactNode;
  closeHref: string;
  className?: string;
}) {
  const list = urls.length ? urls : [fallback ?? null];
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = box.current;
    if (el) setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  return (
    <div className={cn("relative -mx-4 -mt-5 bg-sunken", className)}>
      <div ref={box} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory scroll-row" aria-label={`${alt} 사진 ${list.length}장`}>
        {list.map((u, i) => (
          <div key={`${u}-${i}`} className="snap-start shrink-0 w-full aspect-square">
            <ProductImage src={u} alt={list.length > 1 ? `${alt} ${i + 1}/${list.length}` : alt} iconSize={56} />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 top-0 px-4 pt-3 pb-3 bg-media-scrim text-on-media flex flex-col gap-3">
        {list.length > 1 && (
          <div className="flex gap-1" aria-hidden="true">
            {list.map((_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full bg-on-media transition-opacity duration-150", i === at ? "opacity-100" : "opacity-40")} />)}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">{header}</div>
          <Link href={closeHref} aria-label="닫기" className="press size-11 -mr-2.5 flex items-center justify-center text-on-media">
            <Icon name="close" size={22} />
          </Link>
        </div>
      </div>
    </div>
  );
}
