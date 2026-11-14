import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";
import { ProductImage } from "./ProductImage";

/** 프로필 동그라미 — 이름 첫 글자 */
export function Avatar({ name, size = "md", className }: { name?: string | null; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const ch = (name || "?").trim().charAt(0) || "?";
  return (
    <span aria-hidden="true"
      className={cn("inline-flex items-center justify-center rounded-full bg-sunken text-ink-2 font-bold shrink-0",
        size === "xs" ? "size-6 text-caption" : size === "sm" ? "size-8 text-caption" : size === "lg" ? "size-14 text-title" : "size-10 text-label", className)}>
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

/**
 * 추정 표시 — 실제 측정·평가가 아니라 계산으로 짐작한 값일 때 그 옆에 한 줄
 * (예: 리뷰가 모이기 전 영양성분으로 추정한 맛). 숫자·그림이 실제 값처럼 보이지 않게 한다.
 */
export function Estimate({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-start gap-1.5 text-caption text-ink-2", className)}>
      <Icon name="info" size={14} className="shrink-0 mt-0.5 text-ink-3" />
      <span>{children}</span>
    </p>
  );
}

/**
 * 셈 방법 펼치기 — 숫자 옆 "어떻게 셌나요". 어떤 기록을 어떤 기간으로 셌는지 한두 줄. 닫힌 채로 시작한다
 * (해커톤 기획의 "근거 펼치기"). 숫자마다 붙이지 말고 숫자 묶음 하나에 하나.
 */
export function HowCounted({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <details className={cn("text-caption text-ink-2", className)}>
      <summary className="inline-flex items-center gap-1 cursor-pointer list-none min-h-6 hover:text-ink transition-colors [&::-webkit-details-marker]:hidden">
        <Icon name="info" size={14} className="shrink-0 text-ink-3" />어떻게 셌나요
      </summary>
      <div className="mt-2 flex flex-col gap-1 pl-5">{children}</div>
    </details>
  );
}

/** 데이터 기준 시각 — "11월 14일 10:32 기준". 실시간으로 센 값이면 불러온 시각 (한국 시간) */
export function AsOf({ at, className }: { at: Date | string | number; className?: string }) {
  const kst = new Date(new Date(at).getTime() + 9 * 3600e3);
  return <span className={cn("text-caption text-ink-2 num", className)}>{kst.getUTCMonth() + 1}월 {kst.getUTCDate()}일 {kst.toISOString().slice(11, 16)} 기준</span>;
}

/** 썸네일 자리 — 이미지 없을 때 */
export function Thumb({ src, alt = "", size = 48, className }: { src?: string | null; alt?: string; size?: number; className?: string }) {
  return (
    <span className={cn("block rounded-md overflow-hidden shrink-0", className)} style={{ width: size, height: size }}>
      <ProductImage src={src} alt={alt} iconSize={Math.round(size * 0.45)} />
    </span>
  );
}

/**
 * 안내 상자 — 의료 면책·알레르기 경고 등.
 * 바탕은 늘 옅은 회색. 색 상자(분홍·살구)를 쓰지 않고 아이콘 + 제목 색으로 구분합니다.
 *   danger  빨강 아이콘·제목 (알레르기 경고)    caution  회색 + 경고 아이콘
 *   brand   앰버 글자 제목                      neutral  회색
 */
export function Notice({ tone = "neutral", title, icon: iconProp, children, className }: {
  tone?: "neutral" | "caution" | "danger" | "brand"; title?: ReactNode; children: ReactNode; className?: string;
  /** neutral 안내에 뜻을 더하는 아이콘 (예: 잠긴 기능은 lock). 다른 tone 은 정해진 아이콘을 쓴다 */
  icon?: IconName;
}) {
  const icon = tone === "danger" || tone === "caution" ? "alert" : tone === "brand" ? "info" : iconProp ?? null;
  return (
    <div role={tone === "danger" ? "alert" : undefined}
      className={cn("flex gap-2.5 rounded-md bg-sunken px-4 py-3 text-label text-ink-2", className)}>
      {icon && <Icon name={icon} size={18} className={cn("shrink-0 mt-px", tone === "danger" ? "text-danger" : tone === "brand" ? "text-brand-ink" : "text-ink-2")} />}
      <div className="min-w-0">
        {title && <p className={cn("font-bold mb-0.5", tone === "danger" ? "text-danger" : tone === "brand" ? "text-brand-ink" : "text-ink")}>{title}</p>}
        <div>{children}</div>
      </div>
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

/** 코드 예시 — API 요청·응답처럼 그대로 복사할 글. 가로로 넘치면 이 칸만 스크롤된다 */
export function CodeBlock({ children, className }: { children: string; className?: string }) {
  return <pre className={`font-mono text-caption text-ink bg-sunken rounded-md p-3 overflow-x-auto whitespace-pre ${className || ""}`} data-ds-allow-break>{children}</pre>;
}
