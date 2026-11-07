import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

/**
 * 버튼
 * - 문구는 동작으로: "확인" ✕ → "저장하기", "삭제하기", "기록하기"
 * - 한 화면에 primary 는 하나만
 * - md 44px(기본, 손가락 크기) / sm 36px(카드 안 보조 동작)
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const base =
  "press inline-flex items-center justify-center gap-1.5 rounded-md font-bold whitespace-nowrap " +
  "disabled:opacity-40 disabled:pointer-events-none select-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong",
  ghost: "text-ink-2 hover:text-ink hover:bg-sunken",
  danger: "bg-surface text-danger border border-line hover:border-danger",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-label",
  md: "h-11 px-4 text-label",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], block && "w-full", className);
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  children?: ReactNode;
};

export function Button({
  variant, size, block, icon, iconRight, loading, className, children, disabled, type = "button", ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 16 : 18} />}
    </button>
  );
}

export function LinkButton({
  variant, size, block, icon, iconRight, className, children, ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass({ variant, size, block, className })} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 16 : 18} />}
    </Link>
  );
}

/** 아이콘만 있는 버튼 — label 은 화면 읽기용으로 반드시 넣습니다 */
export function IconButton({
  icon, label, size = "md", tone = "ghost", active = false, className, ...rest
}: {
  icon: IconName;
  label: string;
  size?: ButtonSize;
  tone?: "ghost" | "secondary";
  active?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "press inline-flex items-center justify-center rounded-full shrink-0",
        size === "sm" ? "size-9" : "size-11",
        tone === "secondary" ? "bg-surface border border-line" : "",
        active ? "text-brand-ink" : "text-ink-2 hover:text-ink hover:bg-sunken",
        className,
      )}
      {...rest}
    >
      <Icon key={active ? "on" : "off"} name={icon} size={size === "sm" ? 18 : 20} filled={active && (icon === "heart" || icon === "bookmark")}
        className={active && icon === "heart" ? "animate-pop" : undefined} />
    </button>
  );
}

/** 아이콘만 있는 링크 — 머리 줄의 알림·마이페이지처럼 화면을 옮기는 것. dot 은 새 소식 표시(앰버 점) */
export function IconLink({
  icon, label, dot = false, active = false, className, ...rest
}: { icon: IconName; label: string; dot?: boolean; active?: boolean } & Omit<ComponentProps<typeof Link>, "children">) {
  return (
    <Link
      aria-label={dot ? `${label} — 새 소식 있음` : label}
      title={label}
      className={cn(
        "press relative inline-flex items-center justify-center rounded-full shrink-0 size-11",
        active ? "text-brand-ink" : "text-ink-2 hover:text-ink hover:bg-sunken",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={22} />
      {dot && <span aria-hidden="true" className="absolute top-2.5 right-2.5 size-2 rounded-full bg-brand ring-2 ring-canvas" />}
    </Link>
  );
}

/** 글자 링크 — 카드 안 "전체 보기 →" 같은 보조 이동 */
export function TextLink({ className, children, ...rest }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn("inline-flex items-center gap-0.5 min-h-8 text-label font-medium text-brand-ink hover:underline underline-offset-4", className)}
      {...rest}
    >
      {children}
    </Link>
  );
}
