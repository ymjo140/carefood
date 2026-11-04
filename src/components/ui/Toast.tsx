"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./Icon";

/**
 * 완료 알림 — 버튼 동사의 과거형으로 씁니다.
 *   "저장하기" → "저장했어요",  "따라하기" → "식단 리스트에 담았어요"
 * 이동이 필요하면 action 으로 링크를 붙입니다.
 */
type ToastAction = { label: string; href?: string; onClick?: () => void };
type ToastItem = { id: number; message: string; tone: "default" | "danger"; action?: ToastAction };

const ToastCtx = createContext<{ show: (message: string, opts?: { tone?: "default" | "danger"; action?: ToastAction; duration?: number }) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const show = useCallback((message: string, opts?: { tone?: "default" | "danger"; action?: ToastAction; duration?: number }) => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-2), { id, message, tone: opts?.tone || "default", action: opts?.action }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), opts?.duration ?? (opts?.action ? 4000 : 2500));
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none"
      >
        {items.map((t) => (
          <div key={t.id} role="status"
            className="pointer-events-auto flex items-center gap-3 rounded-md border border-line bg-surface text-ink pl-4 pr-2 min-h-12 shadow-overlay">
            {t.tone === "danger" ? <Icon name="alert" size={18} className="text-danger shrink-0" /> : <Icon name="check" size={18} className="text-positive shrink-0" />}
            <span className="flex-1 text-label py-3">{t.message}</span>
            {t.action && (t.action.href ? (
              <Link href={t.action.href} onClick={t.action.onClick} className="shrink-0 h-9 px-3 inline-flex items-center rounded-md text-label font-bold text-brand-ink hover:bg-sunken">
                {t.action.label}
              </Link>
            ) : (
              <button type="button" onClick={t.action.onClick} className="shrink-0 h-9 px-3 rounded-md text-label font-bold text-brand-ink hover:bg-sunken">
                {t.action.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) return { show: (m: string) => { if (typeof console !== "undefined") console.warn("[toast] provider 없음:", m); } };
  return ctx;
}
