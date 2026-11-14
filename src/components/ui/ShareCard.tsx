"use client";

import { cn } from "./cn";
import { Skeleton } from "./Skeleton";

/**
 * 인증 카드 미리 보기 — 9:16 틀 안에 만든 카드 그림. 스티커 모양(투명 바탕)은 옅은 바탕 위에 보인다.
 * 그림이 만들어지는 동안은 같은 크기의 스켈레톤.
 */
export function ShareCardPreview({ src, alt, sticker = false, className }: { src: string | null; alt: string; sticker?: boolean; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-56 aspect-9/16 rounded-lg border border-line bg-sunken overflow-hidden flex items-center justify-center", className)}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt={alt} className={cn("block w-full h-full object-contain", sticker && "p-3")} />
        : <Skeleton className="w-full h-full" />}
    </div>
  );
}

/** 공유 순서 안내 — 번호 + 한 줄씩 */
export function ShareSteps({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-1.5", className)}>
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2 text-label text-ink-2">
          <span className="num shrink-0 size-5 rounded-full border border-line-strong text-caption text-ink flex items-center justify-center">{i + 1}</span>
          <span className="min-w-0">{s}</span>
        </li>
      ))}
    </ol>
  );
}
