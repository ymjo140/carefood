"use client";

import Link from "@/components/ui/AppLink";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconLink, NAV_TABS, cn } from "@/components/ui";

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
 * ds-wiring-drop: /weekly-box — 식단 탭 안의 하루·일주일 전환(DIET_VIEWS)으로 간다
 *
 * 주 메뉴는 휴대폰 하단 탭과 같은 목록(NAV_TABS) — 홈 · 공구 · 식단 · AI · 커뮤니티
 */

export default function Header() {
  const pathname = usePathname();
  const [latest, setLatest] = useState<number | null>(null);
  const [seen, setSeen] = useState(0);

  // 새 소식 점 — 처음 열 때, 다시 이 창으로 돌아올 때 확인. 본 시각은 서버가 사람 기준으로 기억한다
  // 5분 안에 확인했으면 이 브라우저에 남긴 값을 쓴다 — 전에는 페이지를 열 때마다 확인해 서버 조회의 83%가 이 점이었다(11/15)
  useEffect(() => {
    let alive = true;
    const KEY = "carefood_notif_latest", TTL = 5 * 60_000;
    const apply = (d: { latest_at: string | null; seen_at: string | null }) => {
      setLatest(d.latest_at ? Date.parse(d.latest_at) : null);
      setSeen(d.seen_at ? Date.parse(d.seen_at) : 0);
    };
    const check = () => {
      try {
        const c = JSON.parse(localStorage.getItem(KEY) || "null");
        if (c && Date.now() - c.at < TTL) { apply(c); return; }
      } catch { /* 저장소를 못 읽으면 서버에 묻는다 */ } // ds-allow: 저장소는 덤 — 못 읽으면 서버에 묻는다
      fetch("/api/notifications?latest=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d) return;
          apply(d);
          try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), latest_at: d.latest_at ?? null, seen_at: d.seen_at ?? null })); } catch { /* */ } // ds-allow: 저장 못 하면 다음에 다시 묻는다
        })
        .catch(() => {}); // ds-allow: 점 표시는 보조 — 못 불러오면 점 없이 둔다
    };
    const onSeen = (e: Event) => {
      const at = (e as CustomEvent<number>).detail || Date.now();
      setSeen(at);
      // 다 봤으면 남긴 값도 고친다 (5분 동안 점이 다시 뜨지 않게)
      try {
        const c = JSON.parse(localStorage.getItem(KEY) || "null");
        if (c) localStorage.setItem(KEY, JSON.stringify({ ...c, seen_at: new Date(at).toISOString() }));
      } catch { /* */ } // ds-allow: 저장 못 하면 다음 확인 때 서버 값으로 맞는다
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("cf-notif-seen", onSeen);
    return () => { alive = false; window.removeEventListener("focus", check); window.removeEventListener("cf-notif-seen", onSeen); };
  }, []);

  // 홈은 제품 탐색까지, 식단은 일주일 보기(also)까지 켜진다
  const under = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const isActive = (t: (typeof NAV_TABS)[number]) => (t.href === "/" ? pathname === "/" || pathname === "/products" : under(t.href) || !!t.also?.some(under));
  const hasNew = latest != null && latest > seen && pathname !== "/notifications";

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas">
      <div className="mx-auto max-w-[1152px] h-14 flex items-center justify-between gap-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
        <Link href="/" className="shrink-0 inline-flex items-center h-11 text-body font-bold text-ink whitespace-nowrap">
          오늘끼록
        </Link>

        {/* 넓은 화면 주 메뉴 — 휴대폰은 하단 탭 바 */}
        <nav className="hidden sm:flex items-center gap-1 flex-1 justify-center" aria-label="주 메뉴">
          {NAV_TABS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className={cn(
                "h-9 px-3 inline-flex items-center rounded-md text-label whitespace-nowrap transition-colors",
                isActive(item) ? "text-ink font-bold bg-sunken" : "text-ink-2 hover:text-ink hover:bg-sunken",
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
