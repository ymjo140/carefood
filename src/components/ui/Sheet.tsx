"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { IconButton, Button } from "./Button";

/**
 * 시트 — 모달·바텀시트·확인창 공용 (suta bottom-sheet · modal-dialog)
 * - 휴대폰에서는 아래에서 올라오고(350ms drawer), 넓은 화면에서는 가운데 뜹니다.
 * - 닫을 때는 진입의 3/4 시간으로 내려가고 나서 사라집니다.
 * - Esc·바깥 누르기로 닫히고, 열면 포커스를 시트로 옮기고 닫으면 원래 자리로 돌려줍니다.
 * - 동작 줄이기 설정이면 짧은 페이드만.
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
  const returnFocus = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  // 열림/닫힘이 바뀐 걸 렌더 중에 보고, 닫힐 때는 퇴장 애니메이션(260ms) 뒤에 내린다
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setMounted(true); setLeaving(false); }
    else if (mounted) setLeaving(true);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => { setMounted(false); setLeaving(false); }, 260);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className={cn("absolute inset-0 bg-scrim", leaving ? "animate-fade-out" : "animate-fade-in")} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-surface shadow-overlay flex flex-col max-h-[88dvh] outline-none",
          "rounded-t-xl sm:rounded-xl",
          leaving ? "animate-sheet-out sm:animate-fade-out" : "animate-sheet-in sm:animate-rise-in",
          size === "sm" && "sm:max-w-sm",
          size === "md" && "sm:max-w-md",
          size === "lg" && "sm:max-w-xl",
        )}
      >
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
        {(title || description) && (
          <div className="flex items-start gap-2 px-5 pt-3 pb-3 border-b border-line">
            <div className="flex-1 min-w-0 pt-2">
              {title && <h2 id={titleId} className="text-body font-bold text-ink">{title}</h2>}
              {description && <p className="text-label text-ink-2 mt-0.5">{description}</p>}
            </div>
            <IconButton icon="close" label="닫기" onClick={onClose} className="-mr-2" />
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="flex gap-2 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-line">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** 확인창 — window.confirm 대신. 버튼은 "취소" + 행동 이름 ("삭제하기") */
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
