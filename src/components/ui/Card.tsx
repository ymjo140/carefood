import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
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

/**
 * 눌러서 다른 곳으로 가는 카드 — 카드 모양의 button. 숫자 카드에서 해당 탭으로 갈 때처럼 카드 전체가 하나의 동작일 때만.
 * 카드 안에 다른 버튼이 있으면 쓰지 않는다 (버튼 안 버튼).
 */
export function CardButton({ className, children, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cn("press block w-full text-left rounded-lg border border-line bg-surface p-4 hover:border-line-strong transition-colors", className)} {...rest}>
      {children}
    </button>
  );
}

/** 카드 아래쪽 동작 줄 (이름 변경 · 삭제 등) */
export function CardActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-1 border-t border-line -mx-4 -mb-4 mt-3 px-2 py-1", className)}>{children}</div>;
}
