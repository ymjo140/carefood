import { cn } from "./cn";

/**
 * 스켈레톤 (suta skeleton) — 스피너 대신 올 내용의 자리를 잡아 둡니다.
 * 동작 줄이기 설정이면 깜빡이지 않습니다.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block rounded-md bg-sunken animate-skeleton", className)} />;
}

/** 목록 자리 — ListRow / 제품 카드 모양 */
export function SkeletonList({ rows = 4, thumb = true, className }: { rows?: number; thumb?: boolean; className?: string }) {
  return (
    <div role="status" aria-label="불러오는 중" className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
          {thumb && <Skeleton className="size-14 shrink-0" />}
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 글 카드 자리 — 커뮤니티 피드 */
export function SkeletonPost({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="불러오는 중" className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 flex flex-col gap-1.5"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
          </div>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}
