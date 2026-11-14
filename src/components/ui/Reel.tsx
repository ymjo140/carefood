import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { Avatar } from "./Misc";
import { ProductImage } from "./ProductImage";
import { Skeleton } from "./Skeleton";

/**
 * 숏폼 줄 — 피드 맨 위 '스토리'(식단·공구를 나누지 않고 섞어서). 세로로 긴 사진 칸이 가로로 넘어간다 (인스타 릴스·스토리 줄 모양).
 * 칸은 사진이 주인공이라 글자는 아래 띠(media-scrim) 한 곳에만 둔다. 종류 표시(식단·공구)는 왼쪽 위 흰 표.
 */
export function ReelRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <ul aria-label={label} className={cn("flex gap-2 scroll-row -mx-4 px-4", className)}>{children}</ul>;
}

/** 0:24 */
export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 칸 하나 — 누르면 그 글(식단) 또는 공구 보기로 */
export function ReelTile({ href, image, tag, author, line, label, seconds }: {
  href: string; image?: string | null;
  /** 왼쪽 위 작은 표 — 마감 같은 사실만(D-3). 종류(식단·공구)는 적지 않는다. 없으면 안 그림 */
  tag?: string | null; author: string; line: ReactNode;
  /** 영상이면 길이(초) — 오른쪽 위에 재생 표시(길이는 읽어 주는 이름과 보기 화면에) */
  seconds?: number | null;
  /** 읽어 주는 이름 — "민지의 공구: 닭가슴살 현미 볶음밥, 관심 23명" */
  label: string;
}) {
  return (
    <li className="shrink-0">
      <Link href={href} aria-label={label} className="press relative block w-28 h-50 rounded-lg overflow-hidden bg-sunken">
        <ProductImage src={image} iconSize={32} />
        {tag && <span className="absolute top-2 left-2 h-6 px-2 rounded-sm bg-surface text-ink text-caption font-bold flex items-center">{tag}</span>}
        {seconds != null && (
          // 칸이 좁아 종류 표(공구 D-14)와 겹치지 않게 재생 표시만 — 길이는 보기 화면에서
          <span className="absolute top-2 right-2 size-6 rounded-sm bg-media-scrim text-on-media flex items-center justify-center" title={clock(seconds)}>
            <Icon name="play" size={12} filled />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 p-2 bg-media-scrim text-on-media flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 min-w-0 text-caption font-bold">
            <Avatar name={author} size="xs" />
            <span className="truncate">{author}</span>
          </span>
          <span className="text-caption truncate">{line}</span>
        </span>
      </Link>
    </li>
  );
}

/** 맨 앞 칸 — 올리기 (피드의 글쓰기 입구는 이것 하나) */
export function ReelAddTile({ onClick, title = "올리기", sub }: { onClick: () => void; title?: string; sub?: string }) {
  return (
    <li className="shrink-0">
      <button type="button" onClick={onClick}
        className="press w-28 h-50 rounded-lg border border-dashed border-line-strong bg-sunken flex flex-col items-center justify-center gap-2 text-ink">
        <span className="size-11 rounded-full bg-brand text-on-brand flex items-center justify-center"><Icon name="plus" size={22} /></span>
        <span className="text-label font-bold">{title}</span>
        {sub && <span className="text-caption text-ink-2">{sub}</span>}
      </button>
    </li>
  );
}

/** 불러오는 중 칸 */
export function ReelSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="shrink-0" aria-hidden="true"><Skeleton className="w-28 h-50 rounded-lg" /></li>
      ))}
    </>
  );
}
