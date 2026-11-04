import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * 화면 틀 — 모든 페이지는 Page 로 감쌉니다.
 * width: "narrow"(430, 식단·커뮤니티 등 한 줄 흐름) / "default"(720, 상세) / "wide"(1120, 탐색·관리)
 * 넓은 모니터에서도 가운데 정렬됩니다.
 */
export function Page({ width = "default", children, className }: { width?: "narrow" | "default" | "wide"; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto w-full pt-5 pb-24 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
        width === "narrow" && "max-w-[462px]",
        width === "default" && "max-w-[752px]",
        width === "wide" && "max-w-[1152px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 페이지 제목 — 화면마다 하나 */
export function PageHeader({ title, description, actions, className }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 mb-5 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-title font-bold text-ink text-balance">{title}</h1>
        {description && <p className="text-label text-ink-2 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 shrink-0 flex-wrap">{actions}</div>}
    </header>
  );
}

/** 구역 제목 */
export function SectionHeader({ title, description, action, className }: {
  title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3 mb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-body font-bold text-ink">{title}</h2>
        {description && <p className="text-caption text-ink-2 mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** 비어 있음 — 이유 한 줄 + 다음 행동 하나 */
export function EmptyState({ title, description, action, className }: {
  title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center gap-1 py-10 px-6 rounded-lg border border-dashed border-line", className)}>
      <p className="text-body font-bold text-ink">{title}</p>
      {description && <p className="text-label text-ink-2 max-w-[32ch]">{description}</p>}
      {action && <div className="mt-3 flex gap-2 flex-wrap justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="불러오는 중"
      className={cn("inline-block rounded-full border-2 border-line border-t-brand animate-spin", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** 페이지 전체 로딩 */
export function PageLoading() {
  return <div className="min-h-[50vh] flex items-center justify-center"><Spinner /></div>;
}

/** 하단 고정 행동 줄 — 합계 + 주 버튼 */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <div className="mx-auto max-w-[430px] flex items-center gap-3">{children}</div>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line my-4", className)} />;
}
