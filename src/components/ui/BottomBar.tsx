"use client";

import { useEffect, type ReactNode } from "react";

/**
 * 하단 고정 행동 줄 — 합계 + 주 버튼 (상세·폼·주문처럼 주 행동이 있는 화면)
 * 떠 있는 동안 <html data-bottom-bar> 를 달아 하단 탭 바를 숨깁니다 — 두 줄을 쌓지 않습니다.
 */
export function BottomBar({ children }: { children: ReactNode }) {
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-bottom-bar", "");
    return () => el.removeAttribute("data-bottom-bar");
  }, []);
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <div className="mx-auto max-w-[430px] flex items-center gap-3">{children}</div>
    </div>
  );
}
