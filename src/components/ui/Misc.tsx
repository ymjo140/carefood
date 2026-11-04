import type { ReactNode } from "react";
import { cn } from "./cn";

/** 프로필 동그라미 — 이름 첫 글자 */
export function Avatar({ name, size = "md", className }: { name?: string | null; size?: "sm" | "md"; className?: string }) {
  const ch = (name || "?").trim().charAt(0) || "?";
  return (
    <span aria-hidden="true"
      className={cn("inline-flex items-center justify-center rounded-full bg-sunken text-ink-2 font-bold shrink-0",
        size === "sm" ? "size-8 text-caption" : "size-10 text-label", className)}>
      {ch}
    </span>
  );
}

/** 목록 한 줄 — 썸네일 · 제목 · 보조 정보 · 오른쪽 값 */
export function ListRow({ leading, title, meta, trailing, onClick, href, className }: {
  leading?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode;
  onClick?: () => void; href?: string; className?: string;
}) {
  const inner = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-body font-medium text-ink line-clamp-1">{title}</div>
        {meta && <div className="text-caption text-ink-2 mt-0.5">{meta}</div>}
      </div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
    </>
  );
  const cls = cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors", (onClick || href) && "hover:bg-sunken", className);
  if (href) return <a href={href} className={cls}>{inner}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** 썸네일 자리 — 이미지 없을 때 */
export function Thumb({ src, alt = "", size = 48, className }: { src?: string | null; alt?: string; size?: number; className?: string }) {
  return (
    <span className={cn("block rounded-md bg-sunken overflow-hidden shrink-0", className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" /> : null}
    </span>
  );
}

/** 안내 상자 — 의료 면책·알레르기 경고 등 */
export function Notice({ tone = "neutral", title, children, className }: {
  tone?: "neutral" | "caution" | "danger" | "brand"; title?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div role={tone === "danger" ? "alert" : undefined}
      className={cn("rounded-md px-4 py-3 text-label",
        tone === "neutral" && "bg-sunken text-ink-2",
        tone === "caution" && "bg-caution-soft text-caution",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "brand" && "bg-brand-soft text-brand-ink",
        className)}>
      {title && <p className="font-bold mb-0.5">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

/** 단계 표시 (온보딩) */
export function Steps({ total, current, className }: { total: number; current: number; className?: string }) {
  return (
    <div className={cn("flex gap-1.5", className)} aria-label={`${total}단계 중 ${current + 1}단계`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-1 flex-1 rounded-full", i <= current ? "bg-brand" : "bg-sunken")} />
      ))}
    </div>
  );
}
