"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

/**
 * 하단 탭 바 (suta bottom-nav)
 * - 휴대폰(640px 미만)에서만, 탭의 첫 화면에만 보입니다. 상세·작성 화면에는 없습니다.
 * - 하단 고정 바(BottomBar)가 있는 화면에서는 숨깁니다 — 두 줄을 쌓지 않습니다.
 * - 입력칸에 포커스가 있는 동안(키보드가 올라온 동안) 숨깁니다.
 * - 높이 56 + 안전 영역. 지금 탭만 앰버 아이콘 + 굵은 라벨.
 * - 보이는 동안 <html data-bottom-nav> 를 달아, 떠 있는 버튼·알림이 그 위로 올라가게 합니다(.above-nav).
 */
export const NAV_TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "홈", icon: "home" },
  { href: "/products", label: "탐색", icon: "search" },
  { href: "/diary", label: "기록", icon: "notebook" },
  { href: "/weekly-box", label: "식단", icon: "list" },
  { href: "/community", label: "피드", icon: "feed" },
];

export function BottomNav() {
  const pathname = usePathname();
  const [typing, setTyping] = useState(false);
  const [hasBar, setHasBar] = useState(false);
  const isTabRoot = NAV_TABS.some((t) => t.href === pathname);
  const visible = isTabRoot && !typing && !hasBar;

  useEffect(() => {
    const isField = (el: EventTarget | null) => el instanceof HTMLElement && el.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable=true]");
    const onIn = (e: FocusEvent) => { if (isField(e.target)) setTyping(true); };
    const onOut = (e: FocusEvent) => { if (isField(e.target)) setTyping(false); };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    // BottomBar 가 붙었는지 지켜본다
    const check = () => setHasBar(document.documentElement.hasAttribute("data-bottom-bar"));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bottom-bar"] });
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); mo.disconnect(); };
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (visible) el.setAttribute("data-bottom-nav", ""); else el.removeAttribute("data-bottom-nav");
    return () => el.removeAttribute("data-bottom-nav");
  }, [visible]);

  if (!visible) return null;

  return (
    <nav aria-label="주요 메뉴"
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <BottomNavItems current={pathname} />
    </nav>
  );
}

/** 탭 줄 그리기 — 기준 페이지 미리보기도 같은 것을 씁니다 */
export function BottomNavItems({ current }: { current: string }) {
  return (
    <ul className="grid grid-cols-5 h-14">
      {NAV_TABS.map((t) => {
        const active = t.href === current;
        return (
          <li key={t.href}>
            <Link href={t.href} aria-current={active ? "page" : undefined}
              className={cn("press h-full flex flex-col items-center justify-center gap-0.5 text-caption",
                active ? "text-brand-ink font-bold" : "text-ink-2 font-medium")}>
              <Icon name={t.icon} size={24} className={active ? "text-brand" : undefined} strokeWidth={active ? 2.25 : 1.75} />
              {t.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
