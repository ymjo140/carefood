"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/products", label: "제품 탐색" },
];

export default function Header() {
  const pathname = usePathname();

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
          <Link
            href="/onboarding"
            className="ml-2 bg-primary text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            시작하기
          </Link>
        </nav>
      </div>
    </header>
  );
}
