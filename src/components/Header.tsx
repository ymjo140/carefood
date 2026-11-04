"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { logout } from "@/app/auth/actions";
import { Avatar, IconButton, LinkButton, cn } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/products", label: "제품 탐색" },
  { href: "/diary", label: "식단 기록" },
  { href: "/weekly-box", label: "식단 리스트" },
  { href: "/community", label: "커뮤니티" },
];

const USER_MENU_ITEMS = [
  { href: "/products", label: "제품 탐색" },
  { href: "/health", label: "건강검진 정보" },
  { href: "/health/report", label: "영양 리포트" },
  { href: "/diary", label: "식단 기록" },
  { href: "/family", label: "가족 건강 관리" },
  { href: "/onboarding", label: "프로필 수정" },
];

const ADMIN_EMAILS = ["ymjo9907@gmail.com"];

const ADMIN_MENU_ITEMS = [
  { href: "/admin", label: "데이터 현황" },
  { href: "/admin/orders", label: "발주 관리" },
  { href: "/admin/insights", label: "시장 인사이트" },
  { href: "/admin/odm", label: "ODM 수요 분석" },
  { href: "/design-system", label: "디자인 시스템" },
];

/* 메뉴 한 줄 — 드롭다운·모바일 메뉴 공용 */
function MenuLink({ href, label, active, onClick }: { href: string; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center h-11 px-3 rounded-md text-label transition-colors",
        active ? "bg-sunken text-ink font-bold" : "text-ink-2 hover:bg-sunken hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}

function MenuGroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pt-2 pb-1 text-caption text-ink-3">{children}</p>;
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // 메뉴를 열 때 하단 탭 바가 떠 있는지 본다 (탭 첫 화면 + 휴대폰 폭)
  const [bottomNavShown, setBottomNavShown] = useState(false);
  const toggleMobileNav = () => {
    if (!mobileNavOpen) setBottomNavShown(document.documentElement.hasAttribute("data-bottom-nav"));
    setMobileNavOpen(!mobileNavOpen);
  };
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUser({ email: user.email });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user?.email) {
          setUser({ email: session.user.email });
        } else {
          setUser(null);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // 페이지 이동 시 메뉴 닫기 — 렌더 중에 경로가 바뀐 걸 보고 닫는다 (effect 안 setState 대신)
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setMobileNavOpen(false);
    setMenuOpen(false);
  }

  const handleLogout = () => {
    setMenuOpen(false);
    setMobileNavOpen(false);
    startTransition(async () => {
      await logout();
      setUser(null);
      router.refresh();
    });
  };

  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas">
      <div className="mx-auto max-w-[1152px] h-14 flex items-center justify-between gap-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        {/* 로고 */}
        <Link href="/" className="shrink-0 inline-flex items-center h-11 text-body font-bold text-ink whitespace-nowrap">
          케어푸드
        </Link>

        {/* 데스크톱 네비 (sm 이상) */}
        <nav className="hidden sm:flex items-center gap-1" aria-label="주 메뉴">
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

          {user ? (
            <div className="relative ml-2">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="h-10 flex items-center gap-2 pl-1 pr-3 rounded-full border border-line hover:border-line-strong transition-colors"
              >
                <Avatar name={user.email} size="sm" />
                <span className="text-caption text-ink-2 max-w-[120px] truncate">{user.email}</span>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <div role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-line bg-surface shadow-overlay z-50 p-1.5">
                    <p className="px-3 py-2 text-caption text-ink-3 truncate border-b border-line mb-1">{user.email}</p>
                    {USER_MENU_ITEMS.map((item) => (
                      <MenuLink key={item.href} href={item.href} label={item.label} onClick={() => setMenuOpen(false)} />
                    ))}
                    {isAdmin && (
                      <div className="border-t border-line mt-1 pt-1">
                        <MenuGroupLabel>관리자</MenuGroupLabel>
                        {ADMIN_MENU_ITEMS.map((item) => (
                          <MenuLink key={item.href} href={item.href} label={item.label} onClick={() => setMenuOpen(false)} />
                        ))}
                      </div>
                    )}
                    <div className="border-t border-line mt-1 pt-1">
                      <button
                        type="button"
                        onClick={handleLogout}
                        disabled={isPending}
                        className="w-full flex items-center h-11 px-3 rounded-md text-label text-danger hover:bg-sunken transition-colors disabled:opacity-50"
                      >
                        {isPending ? "로그아웃하고 있어요" : "로그아웃"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="ml-1 h-9 px-3 inline-flex items-center rounded-md text-label text-ink-2 hover:text-ink hover:bg-sunken transition-colors whitespace-nowrap"
              >
                로그인
              </Link>
              <LinkButton href="/onboarding" size="sm" className="ml-1">시작하기</LinkButton>
            </>
          )}
        </nav>

        {/* 모바일 (sm 미만) */}
        <div className="flex sm:hidden items-center gap-1">
          {!user && <LinkButton href="/onboarding" size="sm">시작하기</LinkButton>}
          <IconButton
            icon={mobileNavOpen ? "close" : "menu"}
            label={mobileNavOpen ? "메뉴 닫기" : "메뉴 열기"}
            onClick={toggleMobileNav}
            aria-expanded={mobileNavOpen}
          />
        </div>
      </div>

      {/* 모바일 메뉴 */}
      {mobileNavOpen && (
        <div className="sm:hidden border-t border-line bg-canvas max-h-[calc(100dvh-3.5rem)] overflow-y-auto">
          <nav className="flex flex-col gap-0.5 py-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]" aria-label="모바일 메뉴">
            {/* 하단 탭 바가 떠 있으면 같은 메뉴를 되풀이하지 않는다 (suta: 같은 행동의 입구는 하나) */}
            {!bottomNavShown && NAV_ITEMS.map((item) => (
              <MenuLink key={item.href} href={item.href} label={item.label} active={isActive(item.href)} />
            ))}
            <MenuLink href="/vendor/apply" label="입점 문의" active={isActive("/vendor/apply")} />

            <div className="border-t border-line mt-2 pt-2 flex flex-col gap-0.5">
              {user ? (
                <>
                  <p className="px-3 py-2 text-caption text-ink-3 truncate">{user.email}</p>
                  {USER_MENU_ITEMS.map((item) => (
                    <MenuLink key={item.href} href={item.href} label={item.label} active={pathname === item.href} />
                  ))}
                  {isAdmin && (
                    <div className="border-t border-line mt-2 pt-2 flex flex-col gap-0.5">
                      <MenuGroupLabel>관리자</MenuGroupLabel>
                      {ADMIN_MENU_ITEMS.map((item) => (
                        <MenuLink key={item.href} href={item.href} label={item.label} active={pathname === item.href} />
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isPending}
                    className="w-full flex items-center h-11 px-3 mt-1 rounded-md text-label text-danger hover:bg-sunken transition-colors disabled:opacity-50"
                  >
                    {isPending ? "로그아웃하고 있어요" : "로그아웃"}
                  </button>
                </>
              ) : (
                <MenuLink href="/login" label="로그인" active={pathname === "/login"} />
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
