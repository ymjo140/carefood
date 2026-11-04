import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * 카드 — 흰 면 + 얇은 테두리. 그림자는 쓰지 않습니다.
 * 강조가 필요하면 tone="brand"(앰버 테두리) 한 곳만. 옅은 색 면은 쓰지 않습니다.
 */
export function Card({
  padding = "md", tone = "default", interactive = false, className, children, ...rest
}: {
  padding?: "none" | "sm" | "md";
  tone?: "default" | "sunken" | "brand";
  interactive?: boolean;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border",
        tone === "default" && "bg-surface border-line",
        tone === "sunken" && "bg-sunken border-transparent",
        tone === "brand" && "bg-surface border-brand",
        padding === "sm" && "p-3",
        padding === "md" && "p-4",
        interactive && "press hover:border-line-strong cursor-pointer",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** 카드 아래쪽 동작 줄 (이름 변경 · 삭제 등) */
export function CardActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-1 border-t border-line -mx-4 -mb-4 mt-3 px-2 py-1", className)}>{children}</div>;
}
