"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconLink, cn } from "@/components/ui";

/**
 * 머리 줄 — 왼쪽 로고 · (넓은 화면) 주 메뉴 · 오른쪽 알림 → 마이페이지
 * 로그인·로그아웃·프로필 수정·관리자 메뉴는 마이페이지(/me)가 맡는다.
 * ds-wiring-drop: /login — 마이페이지의 로그인 버튼
 * ds-wiring-drop: /onboarding — 홈 '목표 알려 주기'·마이페이지
 * ds-wiring-drop: /vendor/apply — 마이페이지·푸터
 * ds-wiring-drop: /health — 마이페이지
 * ds-wiring-drop: /health/report — 마이페이지
 * ds-wiring-drop: /family — 마이페이지
 * ds-wiring-drop: /admin — 마이페이지 관리자 묶음
 * ds-wiring-drop: /admin/orders — 같은 이유
 * ds-wiring-drop: /admin/insights — 같은 이유
 * ds-wiring-drop: /admin/odm — 같은 이유
 * ds-wiring-drop: /design-system — 같은 이유
 */
const NAV_ITEMS = [
  { href: "/", label: "홈" }, // 홈 = 추천 + 제품 탐색
  { href: "/diary", label: "식단 기록" },
  { href: "/weekly-box", label: "식단 리스트" },
  { href: "/group-buy", label: "공구" },
  { href: "/community", label: "커뮤니티" },
];

export default function Header() {
  const pathname = usePathname();
  const [latest, setLatest] = useState<number | null>(null);
  const [seen, setSeen] = useState(0);

  // 새 소식 점 — 처음 열 때, 다시 이 창으로 돌아올 때 확인. 본 시각은 서버가 사람 기준으로 기억한다
  useEffect(() => {
    let alive = true;
    const check = () => fetch("/api/notifications?latest=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setLatest(d.latest_at ? Date.parse(d.latest_at) : null);
        setSeen(d.seen_at ? Date.parse(d.seen_at) : 0);
      })
      .catch(() => {}); // ds-allow: 점 표시는 보조 — 못 불러오면 점 없이 둔다
    const onSeen = (e: Event) => setSeen((e as CustomEvent<number>).detail || Date.now());
    check();
    window.addEventListener("focus", check);
    window.addEventListener("cf-notif-seen", onSeen);
    return () => { alive = false; window.removeEventListener("focus", check); window.removeEventListener("cf-notif-seen", onSeen); };
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname === "/products" : pathname === href || pathname.startsWith(href + "/"));
  const hasNew = latest != null && latest > seen && pathname !== "/notifications";

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas">
      <div className="mx-auto max-w-[1152px] h-14 flex items-center justify-between gap-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
        <Link href="/" className="shrink-0 inline-flex items-center h-11 text-body font-bold text-ink whitespace-nowrap">
          케어푸드
        </Link>

        {/* 넓은 화면 주 메뉴 — 휴대폰은 하단 탭 바 */}
        <nav className="hidden sm:flex items-center gap-1 flex-1 justify-center" aria-label="주 메뉴">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "h-9 px-3 inline-flex items-center rounded-md text-label whitespace-nowrap transition-colors",
                isActive(item.href) ? "text-ink font-bold bg-sunken" : "text-ink-2 hover:text-ink hover:bg-sunken",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-0.5 shrink-0">
          <IconLink href="/notifications" icon="bell" label="알림" dot={hasNew} active={pathname === "/notifications"} />
          <IconLink href="/me" icon="user" label="마이페이지" active={pathname === "/me" || pathname.startsWith("/me/")} />
        </div>
      </div>
    </header>
  );
}
