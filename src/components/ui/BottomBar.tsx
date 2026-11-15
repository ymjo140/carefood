"use client";

import { useEffect, type ReactNode } from "react";

/**
 * 하단 고정 행동 줄 — 합계 + 주 버튼 (상세·폼·주문처럼 주 행동이 있는 화면)
 * 떠 있는 동안 <html data-bottom-bar> 를 달아 하단 탭 바를 숨깁니다 — 두 줄을 쌓지 않습니다.
 * overNav: 탭의 첫 화면이라 탭 바를 남겨야 할 때(AI 탭의 입력 줄) — 탭 바 바로 위에 붙고, 입력 중(탭 바가 숨으면) 맨 아래로 내려갑니다.
 */
export function BottomBar({ children, overNav = false }: { children: ReactNode; overNav?: boolean }) {
  useEffect(() => {
    if (overNav) return;
    const el = document.documentElement;
    el.setAttribute("data-bottom-bar", "");
    return () => el.removeAttribute("data-bottom-bar");
  }, [overNav]);
  return (
    <div className={overNav
      ? "fixed inset-x-0 over-nav z-40 border-t border-line bg-canvas pt-3 pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
      : "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"}>
      <div className="mx-auto max-w-[430px] flex items-center gap-3">{children}</div>
    </div>
  );
}
