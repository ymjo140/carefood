"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { logout } from "@/app/auth/actions";

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/products", label: "제품 탐색" },
  { href: "/diary", label: "식단 기록" },
  { href: "/weekly-box", label: "주간 박스" },
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

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  // 페이지 이동 시 메뉴 닫기
  useEffect(() => {
    setMobileNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    setMenuOpen(false);
    setMobileNavOpen(false);
    startTransition(async () => {
      await logout();
      setUser(null);
      router.refresh();
    });
  };

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* 로고 */}
        <Link href="/" className="shrink-0">
          <span className="text-lg font-extrabold text-foreground tracking-tight whitespace-nowrap">케어푸드</span>
        </Link>

        {/* 데스크톱 네비 (sm 이상) */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                pathname === item.href
                  ? "font-semibold text-foreground bg-primary/5"
                  : "text-muted hover:text-foreground hover:bg-card"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {user ? (
            <div className="relative ml-2">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-sm hover:border-primary/30 transition-colors"
              >
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {user.email.charAt(0).toUpperCase()}
                </span>
                <span className="text-muted max-w-[100px] truncate text-xs">
                  {user.email}
                </span>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-xs text-muted truncate">{user.email}</p>
                    </div>
                    {USER_MENU_ITEMS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <button
                      onClick={handleLogout}
                      disabled={isPending}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors border-t border-border"
                    >
                      {isPending ? "로그아웃 중..." : "로그아웃"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="ml-1 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-foreground transition-colors whitespace-nowrap"
              >
                로그인
              </Link>
              <Link
                href="/onboarding"
                className="ml-1 bg-primary text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-primary-dark transition-colors whitespace-nowrap"
              >
                시작하기
              </Link>
            </>
          )}
        </nav>

        {/* 모바일 햄버거 (sm 미만) */}
        <div className="flex sm:hidden items-center gap-2">
          {!user && (
            <Link
              href="/onboarding"
              className="bg-primary text-white px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            >
              시작하기
            </Link>
          )}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-card transition-colors"
            aria-label="메뉴"
          >
            {mobileNavOpen ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {mobileNavOpen && (
        <div className="sm:hidden border-t border-border bg-background">
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 py-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  pathname === item.href
                    ? "font-semibold text-foreground bg-primary/5"
                    : "text-muted hover:text-foreground hover:bg-card"
                }`}
              >
                {item.label}
              </Link>
            ))}

            <Link
              href="/vendor/apply"
              className="block px-3 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-card transition-colors"
            >
              🤝 입점 문의
            </Link>

            <div className="border-t border-border pt-2 mt-2">
              {user ? (
                <>
                  <div className="px-3 py-2 text-xs text-muted truncate">{user.email}</div>
                  {USER_MENU_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        pathname === item.href
                          ? "font-semibold text-foreground bg-primary/5"
                          : "text-muted hover:text-foreground hover:bg-card"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <button
                    onClick={handleLogout}
                    disabled={isPending}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors mt-1"
                  >
                    {isPending ? "로그아웃 중..." : "로그아웃"}
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="block px-3 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-card transition-colors"
                >
                  로그인
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
