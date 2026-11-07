import Link from "next/link";
import { cn } from "./cn";

/**
 * 링크 탭 — 페이지 사이를 오가는 pill 탭 (Tabs variant="pill" 과 같은 모양, 링크로 동작)
 * 예: 관리자 화면의 데이터 현황 / 시장 인사이트 / ODM / 발주
 */
export function LinkTabs({ items, current, label, className }: {
  items: { href: string; label: string }[];
  current: string;
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex gap-1.5 scroll-row", className)}>
      {items.map((it) => {
        const active = it.href === current;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center justify-center h-9 px-4 rounded-full text-label whitespace-nowrap transition-colors shrink-0",
              active ? "bg-ink text-canvas font-bold" : "text-ink-2 font-medium hover:bg-sunken hover:text-ink",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const ADMIN_TABS = [
  { href: "/admin/metrics", label: "지표" },
  { href: "/admin", label: "데이터 현황" },
  { href: "/admin/insights", label: "시장 인사이트" },
  { href: "/admin/odm", label: "ODM 수요 분석" },
  { href: "/admin/orders", label: "발주 관리" },
  { href: "/admin/reports", label: "신고" },
];
