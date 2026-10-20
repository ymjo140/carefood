"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { logout } from "@/app/auth/actions";

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/products", label: "제품 탐색" },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();

    // 현재 세션 체크
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUser({ email: user.email });
    });

    // 인증 상태 변화 리스닝
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

  const handleLogout = () => {
    setMenuOpen(false);
    startTransition(async () => {
      await logout();
      setUser(null);
      router.refresh();
    });
  };

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">케어푸드</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                pathname === item.href
                  ? "font-semibold text-foreground bg-primary/5"
                  : "text-muted hover:text-foreground hover:bg-card"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {user ? (
            /* 로그인 상태 */
            <div className="relative ml-2">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-sm hover:border-primary/30 transition-colors"
              >
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {user.email.charAt(0).toUpperCase()}
                </span>
                <span className="text-muted max-w-[100px] truncate hidden sm:inline text-xs">
                  {user.email}
                </span>
              </button>

              {menuOpen && (
                <>
                  {/* 오버레이 */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  {/* 드롭다운 */}
                  <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-xs text-muted truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/onboarding"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors"
                    >
                      프로필 수정
                    </Link>
                    <button
                      onClick={handleLogout}
                      disabled={isPending}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    >
                      {isPending ? "로그아웃 중..." : "로그아웃"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* 비로그인 상태 */
            <>
              <Link
                href="/login"
                className="ml-1 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-foreground transition-colors"
              >
                로그인
              </Link>
              <Link
                href="/onboarding"
                className="ml-1 bg-primary text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-primary-dark transition-colors"
              >
                시작하기
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
