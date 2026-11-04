"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

/**
 * 완료 알림 (suta toast-stack)
 * - 버튼 동사의 과거형으로 씁니다: "저장하기" → "저장했어요", "따라하기" → "식단 리스트에 담았어요"
 * - 알림만 합니다. "보러 가기" 같은 이동 버튼을 달지 않습니다 — 어디로 갔는지는 문구로 말하고,
 *   그곳으로 가는 길은 하단 탭 바·머리가 맡습니다.
 * - 화면이 바뀌면 남은 알림을 비웁니다.
 * - 화면 읽기 프로그램에 읽힙니다(role=status / alert).
 */
type ToastTone = "default" | "danger";
type ToastItem = { id: number; message: string; tone: ToastTone; leaving: boolean };

const ToastCtx = createContext<{ show: (message: string, opts?: { tone?: ToastTone; duration?: number }) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const pathname = usePathname();

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 190);
  }, []);

  const show = useCallback((message: string, opts?: { tone?: ToastTone; duration?: number }) => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-2), { id, message, tone: opts?.tone || "default", leaving: false }]);
    setTimeout(() => dismiss(id), opts?.duration ?? (opts?.tone === "danger" ? 4000 : 2500));
  }, [dismiss]);

  // 화면이 바뀌면 앞 화면의 알림을 비운다 — 렌더 중에 경로 변화를 보고 비운다
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setItems([]);
  }

  // 값이 렌더마다 새로 생기면 useToast() 를 의존성에 넣은 곳이 매번 다시 돈다 → 고정
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed z-[60] left-1/2 -translate-x-1/2 above-nav flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "danger" ? "alert" : "status"}
            className={`pointer-events-auto flex items-center gap-3 rounded-md border border-line bg-surface text-ink px-4 min-h-12 shadow-overlay ${t.leaving ? "animate-fade-out" : "animate-rise-in"}`}>
            {t.tone === "danger"
              ? <Icon name="alert" size={18} className="text-danger shrink-0" />
              : <Icon name="check" size={18} className="text-positive shrink-0" />}
            <span className="flex-1 text-label py-3">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const NO_PROVIDER = { show: (m: string) => { if (typeof console !== "undefined") console.warn("[toast] provider 없음:", m); } };

/** 늘 같은 객체를 돌려주므로 effect·useCallback 의존성에 넣어도 됩니다 */
export function useToast() {
  return useContext(ToastCtx) ?? NO_PROVIDER;
}
