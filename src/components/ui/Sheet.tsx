"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";
import { IconButton, Button } from "./Button";

/**
 * 시트 — 모달·바텀시트·확인창 공용.
 * 휴대폰에서는 아래에서 올라오고, 넓은 화면에서는 가운데 뜹니다.
 * Esc·바깥 누르기로 닫힙니다.
 */
export function Sheet({
  open, onClose, title, description, children, footer, size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-surface shadow-overlay flex flex-col max-h-[88dvh] outline-none",
          "rounded-t-xl sm:rounded-xl",
          size === "sm" && "sm:max-w-sm",
          size === "md" && "sm:max-w-md",
          size === "lg" && "sm:max-w-xl",
        )}
      >
        {(title || description) && (
          <div className="flex items-start gap-2 px-5 pt-4 pb-3 border-b border-line">
            <div className="flex-1 min-w-0 pt-2">
              {title && <h2 id={titleId} className="text-body font-bold text-ink">{title}</h2>}
              {description && <p className="text-label text-ink-2 mt-0.5">{description}</p>}
            </div>
            <IconButton icon="close" label="닫기" onClick={onClose} className="-mr-2" />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex gap-2 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-line">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** 확인창 — window.confirm 대신. 버튼 문구는 동작으로 ("삭제하기") */
export function ConfirmSheet({
  open, onClose, onConfirm, title, description, confirmLabel, tone = "danger", loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>취소</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} block onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      {description && <p className="text-body text-ink-2">{description}</p>}
    </Sheet>
  );
}
