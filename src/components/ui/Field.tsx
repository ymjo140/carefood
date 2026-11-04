import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-md border border-line bg-surface text-body text-ink px-3 transition-colors " +
  "hover:border-line-strong focus:border-brand focus:outline-none disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, "py-2.5 resize-none", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-11 pr-8", className)} {...rest}>{children}</select>;
}

/** 라벨 + 입력 + 도움말 묶음 */
export function Field({ label, hint, error, children, className }: {
  label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      {label && <span className="text-label font-medium text-ink">{label}</span>}
      {children}
      {error ? <span className="text-caption text-danger">{error}</span>
        : hint ? <span className="text-caption text-ink-3">{hint}</span> : null}
    </label>
  );
}

/** 검색 줄 — 입력 + 버튼 */
export function SearchField({ value, onChange, onSubmit, placeholder = "검색", buttonLabel = "검색하기", autoFocus }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder?: string; buttonLabel?: string; autoFocus?: boolean;
}) {
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onSubmit(); }} role="search">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} />
      <button type="submit" className="h-11 px-4 shrink-0 rounded-md bg-brand text-on-brand text-label font-bold hover:bg-brand-hover">{buttonLabel}</button>
    </form>
  );
}
